/**
 * Seed the Q1-2026 scorecard from `CAT, OYP & Weekly Review (1).xlsx`.
 *
 * Bottom-up model (see lib/db/schema.ts):
 *   Workbook sheets → scorecard_workbook_items (the editable line items)
 *     grouped by (kpi, status) → OYP KPI ach/outlook
 *       rolled up by catCode → CAT scorecard.
 *
 * Idempotent: wipes the Q1-2026 period (cascade drops its KPIs + workbook items)
 * and re-seeds. Everything lands as origin='manual'; attaching a synced source
 * to a row is done from /scorecard/kelola.
 *
 * Four things the sheet gets wrong that this script repairs — all verified
 * against the real file, see the plan doc:
 *   1. OYP codes REPEAT within a sheet (HITS LG111-LG114 appear once for the
 *      HITS block and again for the Tahsin Al Quran block; Maahir LG214 and DPQ
 *      LG213 likewise). Linking on the code alone parks every item on whichever
 *      KPI was inserted last. The workbook's own `deskripsi` column carries the
 *      real KPI name on the first row of each group, so items are matched on
 *      (subdivision, code, name) and fall back to the code.
 *   2. Workbook codes with no OYP row become placeholder KPIs; they used to be
 *      created with catCode=null, which hid the largest evidence (3593 peserta
 *      under C21, 3421 under C31) from the CAT rollup. The parent code is the
 *      OYP code minus its last digit — the sheet's own numbering convention.
 *   3. DPQ rows are filed under the Maahir CAT code LG21 although the CAT sheet
 *      has LG22 "Jumlah Lulusan Program DPQ" for them.
 *   4. Mirror rows (oypCode == catCode, holding the same total as their own
 *      siblings) would double-count once (2) is fixed, so they are flagged
 *      countsTowardCat=false.
 *
 * Usage: pnpm tsx scripts/seed-scorecard.ts [path-to-xlsx]
 */
import "./env";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import {
  scorecardPeriods,
  scorecardKpis,
  scorecardWorkbookItems,
} from "../lib/db/schema";
import { periodLabel, periodRange } from "../lib/scorecard/period";

const XLSX_PATH = process.argv[2] ?? "CAT, OYP & Weekly Review (1).xlsx";
const YEAR = 2026;
const KIND = "quarter" as const;
const SEQ = 1;

type Sub = "cat" | "hits" | "kba" | "maahir" | "dpq";
type Perspective = "financial" | "customer" | "ibp" | "learning";

// ── cell helpers ──────────────────────────────────────────────────────────

function cell(ws: XLSX.WorkSheet, col: number, row: number): unknown {
  const ref = XLSX.utils.encode_cell({ c: col, r: row });
  return ws[ref]?.v;
}

/** A number, or a clean numeric string ("625"); anything else (text, #REF!, #DIV/0!) → null. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Weight column: number (0.3) or "%"-string ("7,5%" → 0.075). */
function weight(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const pct = v.includes("%");
    const n = parseFloat(v.replace("%", "").replace(",", ".").trim());
    if (Number.isFinite(n)) return String(pct ? n / 100 : n);
  }
  return null;
}

/** Strip trailing dot / whitespace and uppercase a KPI code ("C11." → "C11"). */
function code(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const c = s.replace(/\.$/, "").trim().toUpperCase();
  return /^[A-Z]{1,4}\d/.test(c) ? c : null;
}

function perspectiveOf(c: string | null): Perspective {
  if (!c) return "learning";
  if (c.startsWith("IBP")) return "ibp";
  if (c.startsWith("LG")) return "learning";
  if (c.startsWith("F")) return "financial";
  if (c.startsWith("C")) return "customer";
  return "learning";
}

const num2str = (v: unknown): string | null => {
  const n = num(v);
  return n == null ? null : String(n);
};

/** Case/space-insensitive key for matching a workbook `deskripsi` to a KPI name. */
function normName(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "C211" → "C21", "IBP141" → "IBP14", "LG211" → "LG21" — the sheet's own numbering. */
function parentCode(c: string | null): string | null {
  if (!c) return null;
  const m = /^([A-Z]+\d+)\d$/.exec(c);
  return m ? m[1] : null;
}

// ── row types ─────────────────────────────────────────────────────────────

type KpiRow = {
  perspective: Perspective;
  subdivision: Sub;
  catCode: string | null;
  oypCode: string | null;
  catName: string | null;
  name: string;
  uom: string | null;
  target: string | null;
  weight: string | null;
  targetPeriod: string | null;
  achSeed: string | null;
  outlookSeed: string | null;
  problem: string | null;
  corrective: string | null;
  pic: string | null;
  sortOrder: number;
};

type WbRow = {
  subdivision: Sub;
  oypCode: string;
  /** The KPI name this group of rows belongs to (carried down the merged cell). */
  groupName: string | null;
  deskripsi: string | null;
  detail: string | null;
  kuantitas: string | null;
  hours: string | null;
  status: "achieved" | "outlook";
  sumber: string | null;
  sortOrder: number;
};

// ── parse: CAT sheet ──────────────────────────────────────────────────────

const CAT_PERSPECTIVE: Record<string, Perspective> = {
  "financial perspective": "financial",
  "customer perspective": "customer",
  "internal business process perspective": "ibp",
  "learning & growth perspective": "learning",
};

function parseCatSheet(ws: XLSX.WorkSheet): KpiRow[] {
  const rows: KpiRow[] = [];
  let persp: Perspective = "financial";
  let stratName: string | null = null;
  let order = 0;
  for (let r = 3; r < 60; r++) {
    const a = str(cell(ws, 0, r)); // strategy code OR perspective band
    const b = str(cell(ws, 1, r)); // strategy objective name
    const c = code(cell(ws, 2, r)); // KPI code
    const d = str(cell(ws, 3, r)); // KPI name
    if (a && CAT_PERSPECTIVE[a.toLowerCase()]) {
      persp = CAT_PERSPECTIVE[a.toLowerCase()];
      continue;
    }
    if (b && !c) stratName = b; // strategy objective spans several KPI rows
    if (b) stratName = b;
    if (!c || !d) continue; // not a KPI row
    rows.push({
      perspective: persp,
      subdivision: "cat",
      catCode: c,
      oypCode: null,
      catName: stratName,
      name: d,
      uom: str(cell(ws, 4, r)),
      target: num2str(cell(ws, 5, r)),
      weight: weight(cell(ws, 6, r)),
      targetPeriod: num2str(cell(ws, 7, r)),
      achSeed: num2str(cell(ws, 8, r)),
      outlookSeed: num2str(cell(ws, 10, r)),
      problem: str(cell(ws, 12, r)),
      corrective: str(cell(ws, 13, r)),
      pic: str(cell(ws, 14, r)),
      sortOrder: order++,
    });
  }
  return rows;
}

// ── parse: OYP sheet ──────────────────────────────────────────────────────
// Columns: A=CAT code, B=CAT name, C=OYP code, D=OYP name, E=UOM, F=Target,
// G=Weight, H=TGT Q1, I=ACH Q1, K=Outlook, M=Problem, N=Corrective, O=PIC.
// `dpqSplit` moves rows whose CAT name mentions DPQ into subdivision 'dpq'
// (the xlsx keeps DPQ inside the Maahir OYP sheet).

function parseOypSheet(ws: XLSX.WorkSheet, sub: Sub, dpqSplit: boolean): KpiRow[] {
  const rows: KpiRow[] = [];
  let catCode: string | null = null;
  let catName: string | null = null;
  let order = 0;
  let blanks = 0;
  for (let r = 3; r < 300 && blanks < 25; r++) {
    const a = code(cell(ws, 0, r));
    const b = str(cell(ws, 1, r));
    const c = code(cell(ws, 2, r));
    const d = str(cell(ws, 3, r));
    if (a) catCode = a;
    if (b && b !== "#REF!") catName = b;
    if (!c || !d || d.startsWith("#REF")) {
      blanks++;
      continue;
    }
    blanks = 0;
    const rowSub: Sub = dpqSplit && /dpq/i.test(catName ?? "") ? "dpq" : sub;
    // The sheet files DPQ under the Maahir CAT code; the CAT sheet has its own
    // LG22 "Jumlah Lulusan Program DPQ" row for them.
    const rowCatCode = rowSub === "dpq" && catCode === "LG21" ? "LG22" : catCode;
    rows.push({
      perspective: perspectiveOf(c || rowCatCode),
      subdivision: rowSub,
      catCode: rowCatCode,
      oypCode: c,
      catName,
      name: d,
      uom: str(cell(ws, 4, r)),
      target: num2str(cell(ws, 5, r)),
      weight: weight(cell(ws, 6, r)),
      targetPeriod: num2str(cell(ws, 7, r)),
      achSeed: num2str(cell(ws, 8, r)),
      outlookSeed: num2str(cell(ws, 10, r)),
      problem: str(cell(ws, 12, r)),
      corrective: str(cell(ws, 13, r)),
      pic: str(cell(ws, 14, r)),
      sortOrder: order++,
    });
  }
  return rows;
}

// ── parse: Workbook sheet ─────────────────────────────────────────────────
// Columns: B=KPI code, C=Deskripsi, D=Detail, E=Kuantitas, F=Hours (KBA only),
// G=Status, H=Sumber. Rows are grouped by the last non-blank code in B;
// 'Total' rows are skipped.

function parseWorkbook(ws: XLSX.WorkSheet, sub: Sub, headerRow: number, dpqSplit: boolean): WbRow[] {
  const rows: WbRow[] = [];
  let curCode: string | null = null;
  // Column C repeats the KPI name once per group (merged cell), which is the
  // only way to tell apart two KPIs sharing an OYP code — carry it down.
  let curName: string | null = null;
  let order = 0;
  let blanks = 0;
  for (let r = headerRow + 1; r < 200 && blanks < 20; r++) {
    const bRaw = str(cell(ws, 1, r));
    const c = code(cell(ws, 1, r));
    const desc = str(cell(ws, 2, r));
    const detail = str(cell(ws, 3, r));
    const qty = num2str(cell(ws, 4, r));
    const hours = num2str(cell(ws, 5, r));
    const status = str(cell(ws, 6, r));
    const sumber = str(cell(ws, 7, r));
    if (c) {
      curCode = c;
      curName = desc; // a new code starts a new group; its name sits on this row
    } else if (desc) {
      curName = desc;
    }
    if (bRaw && /total/i.test(bRaw)) continue; // subtotal row — its qty is a duplicate
    if (qty == null || !curCode) {
      if (!desc && !detail && !qty) blanks++;
      continue;
    }
    blanks = 0;
    const rowSub: Sub =
      dpqSplit && /dpq/i.test(`${desc ?? ""} ${detail ?? ""}`) ? "dpq" : sub;
    rows.push({
      subdivision: rowSub,
      oypCode: curCode,
      groupName: curName,
      deskripsi: desc,
      detail,
      kuantitas: qty,
      hours,
      status: /outlook/i.test(status ?? "") ? "outlook" : "achieved",
      sumber,
      sortOrder: order++,
    });
  }
  return rows;
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  const path = resolve(process.cwd(), XLSX_PATH);
  const wb = XLSX.readFile(path);
  const sheet = (n: string) => {
    const ws = wb.Sheets[n];
    if (!ws) throw new Error(`sheet not found: "${n}"`);
    return ws;
  };

  const kpiRows: KpiRow[] = [
    ...parseCatSheet(sheet("Scorecard Review CAT")),
    ...parseOypSheet(sheet("OYP HITS Review"), "hits", false),
    ...parseOypSheet(sheet("OYP KBA Review"), "kba", false),
    ...parseOypSheet(sheet("OYP Maahir Review"), "maahir", true),
  ];

  const wbRows: WbRow[] = [
    ...parseWorkbook(sheet("Workbook HITS"), "hits", 4, false),
    ...parseWorkbook(sheet("Workbook KBA"), "kba", 5, false),
    ...parseWorkbook(sheet("Workbook Maahir"), "maahir", 3, true),
  ];

  const db = getDb();

  // Idempotent reset: dropping the period cascades to KPIs and workbook items.
  await db
    .delete(scorecardPeriods)
    .where(
      and(
        eq(scorecardPeriods.kind, KIND),
        eq(scorecardPeriods.year, YEAR),
        eq(scorecardPeriods.seq, SEQ),
      ),
    );

  const range = periodRange(KIND, YEAR, SEQ);
  // The partial unique index allows exactly one active period.
  await db.update(scorecardPeriods).set({ active: false }).where(eq(scorecardPeriods.active, true));
  const [period] = await db
    .insert(scorecardPeriods)
    .values({
      label: periodLabel(KIND, YEAR, SEQ),
      kind: KIND,
      year: YEAR,
      seq: SEQ,
      startDate: range.start,
      endDate: range.end,
      active: true,
    })
    .returning();

  // Insert KPIs. A (subdivision|code) can hold SEVERAL KPIs (the sheet reuses
  // codes), so the index keeps every candidate and the workbook picks by name.
  type Candidate = { id: string; row: KpiRow };
  const candidates = new Map<string, Candidate[]>();
  const push = (key: string, c: Candidate) => {
    const arr = candidates.get(key);
    if (arr) arr.push(c);
    else candidates.set(key, [c]);
  };

  for (const k of kpiRows) {
    const [ins] = await db
      .insert(scorecardKpis)
      .values({ periodId: period.id, ...k })
      .returning({ id: scorecardKpis.id });
    push(`${k.subdivision}|${k.oypCode ?? k.catCode}`, { id: ins.id, row: k });
  }

  // Link workbook items. When a workbook code has no matching OYP KPI in the same
  // subdivision, create a placeholder KPI so no data is silently dropped.
  let linked = 0;
  let placeholders = 0;
  let byName = 0;
  const orphanOrder = new Map<string, number>();
  for (const w of wbRows) {
    const key = `${w.subdivision}|${w.oypCode}`;
    const pool = candidates.get(key) ?? [];
    let picked: Candidate | undefined;
    if (pool.length === 1) {
      picked = pool[0];
    } else if (pool.length > 1) {
      const want = normName(w.groupName);
      picked = pool.find((c) => normName(c.row.name) === want);
      if (picked) byName++;
      else picked = pool[0]; // ambiguous — first wins, and /scorecard/kelola flags the duplicate
    }

    if (!picked) {
      const parent = parentCode(w.oypCode);
      const [ph] = await db
        .insert(scorecardKpis)
        .values({
          periodId: period.id,
          perspective: perspectiveOf(w.oypCode),
          subdivision: w.subdivision,
          catCode: parent, // keeps the row visible to the CAT rollup
          oypCode: w.oypCode,
          catName: null,
          name: w.groupName ?? w.deskripsi ?? w.oypCode,
          uom: "#",
          sortOrder: 900 + (orphanOrder.get(w.subdivision) ?? 0),
        })
        .returning({ id: scorecardKpis.id });
      orphanOrder.set(w.subdivision, (orphanOrder.get(w.subdivision) ?? 0) + 1);
      picked = {
        id: ph.id,
        row: {
          perspective: perspectiveOf(w.oypCode),
          subdivision: w.subdivision,
          catCode: parent,
          oypCode: w.oypCode,
          catName: null,
          name: w.groupName ?? w.deskripsi ?? w.oypCode,
          uom: "#",
          target: null,
          weight: null,
          targetPeriod: null,
          achSeed: null,
          outlookSeed: null,
          problem: null,
          corrective: null,
          pic: null,
          sortOrder: 900,
        },
      };
      push(key, picked);
      placeholders++;
    }

    // 'Jam/Minggu' KPIs: the hours column is the real figure where the sheet has
    // one; `kuantitas` there is a class count. See lib/scorecard/rollup.ts.
    const kuantitas =
      picked.row.uom === "Jam/Minggu" ? (w.hours ?? w.kuantitas) : w.kuantitas;

    await db.insert(scorecardWorkbookItems).values({
      kpiId: picked.id,
      deskripsi: w.deskripsi,
      detail: w.detail,
      kuantitas,
      hours: w.hours,
      status: w.status,
      sumber: w.sumber,
      origin: "manual",
      sortOrder: w.sortOrder,
    });
    linked++;
  }

  // Mirror rows: a KPI whose OYP code equals its CAT code while real siblings
  // exist under the same code would double the CAT total. Exclude it.
  const allRows = [...candidates.values()].flat();
  let mirrors = 0;
  for (const c of allRows) {
    const { row } = c;
    if (row.subdivision === "cat" || !row.oypCode || row.oypCode !== row.catCode) continue;
    const siblings = allRows.filter(
      (o) =>
        o.row.subdivision === row.subdivision &&
        o.row.catCode === row.catCode &&
        o.row.oypCode !== row.oypCode,
    );
    if (siblings.length === 0) continue;
    await db
      .update(scorecardKpis)
      .set({ countsTowardCat: false })
      .where(eq(scorecardKpis.id, c.id));
    mirrors++;
  }

  const bySub = (s: Sub) => kpiRows.filter((k) => k.subdivision === s).length;
  console.log(`period ${period.label} (${period.id}) ${range.start}..${range.end}`);
  console.log(
    `KPIs: cat=${bySub("cat")} hits=${bySub("hits")} kba=${bySub("kba")} maahir=${bySub("maahir")} dpq=${bySub("dpq")} (+${placeholders} placeholder)`,
  );
  console.log(`workbook items linked: ${linked} (${byName} disambiguated by name)`);
  console.log(`mirror KPIs excluded from the CAT rollup: ${mirrors}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
