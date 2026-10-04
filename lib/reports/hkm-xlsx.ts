/**
 * HKM participant exports: the cumulative roster ("Peserta HKM" / "Belum
 * Target") and the monthly recap ("Rekap" + "Detail").
 *
 * These are 200+ row rosters that coordinators sort, filter and print, so the
 * shared rules in lib/reports/xlsx-style.ts apply: percentages go in as numeric
 * fractions (a filter on "capaian < 80%" is impossible against the string
 * "78.3%"), the header stays frozen and repeats on every printed page, and "-"
 * keeps meaning "no source yet" — never a measured zero.
 */
import ExcelJS from "exceljs";
import type { HkmParticipantRow } from "@/app/[program]/hkm/queries";
import {
  autoFilter,
  autoWidth,
  box,
  freezeHeader,
  noteRow,
  numCell,
  pctCell,
  printSetup,
  textCell,
  zebra,
  DASH,
  NUM_FMT,
  WARN_FILL,
} from "@/lib/reports/xlsx-style";

/** HKM keeps its own green banner — this is the report coordinators recognise. */
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A8C66" } };
const GROUP_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECE0" } };
const HEAD_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

/** Title band across the sheet: carries the period, so it prints on every page. */
function titleBand(ws: ExcelJS.Worksheet, row: number, lastCol: number, text: string): number {
  ws.mergeCells(row, 1, row, lastCol);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  box(cell, { bold: true, fill: HEAD_FILL });
  cell.font = HEAD_FONT;
  ws.getRow(row).height = 24;
  return row + 1;
}

/** Green header band. Not xlsx-style's headerRow(): that one is grey-on-black-text. */
function headBand(ws: ExcelJS.Worksheet, row: number, headers: string[]): number {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    box(cell, { bold: true, fill: HEAD_FILL });
    cell.font = HEAD_FONT;
  });
  ws.getRow(row).height = 30; // two-line headers ("Realisasi (hal)") need the room
  return row + 1;
}

/** "Ikhwan · HKM 07" separator above each block. */
function groupBand(ws: ExcelJS.Worksheet, row: number, lastCol: number, text: string): number {
  ws.mergeCells(row, 1, row, lastCol);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  box(cell, { bold: true, fill: GROUP_FILL, align: "left" });
  return row + 1;
}

/**
 * Freeze + repeat the title AND the header on print. Repeating only the header
 * loses the period on page 2, and these rosters always run past page 1.
 */
function lockHeader(ws: ExcelJS.Worksheet, headerRowIndex: number, xSplit: number) {
  freezeHeader(ws, headerRowIndex, { xSplit });
  printSetup(ws);
  ws.pageSetup = { ...ws.pageSetup, printTitlesRow: `1:${headerRowIndex}` };
}

/** Group rows by a key, preserving the caller's row order inside each group. */
function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const bucket = out.get(k);
    if (bucket) bucket.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export type HkmReportMeta = {
  programName: string;
  startDate: string;
  endDate: string;
  targetPages: number;
};

const HEADERS = [
  "No",
  "Nama",
  "Gender",
  "Halaqah",
  "Pengajar",
  "Mulai Tilawah",
  "Rata²/hari (hal)",
  "Realisasi (hal)",
  "Target (hal)",
  "Juz",
  "Streak (hari)",
  "Kategori",
];

/** The two categories that mean "behind target" — the ones the amber flags. */
const BEHIND = new Set(["Belum Mencapai Target", "Belum Sama Sekali"]);

/**
 * Per-participant HKM recap grouped by gender → halaqah, category-ordered.
 * `onlyBelumTarget` filters to participants still behind target (belum-target report).
 *
 * Halaqah/Pengajar are columns as well as group bands: once the coordinator
 * filters the list, the band above the row scrolls out of the result set.
 */
export function buildHkmParticipantWorkbook(
  rows: HkmParticipantRow[],
  meta: HkmReportMeta,
  onlyBelumTarget = false,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(onlyBelumTarget ? "Belum Target" : "Peserta HKM");
  const lastCol = HEADERS.length;

  const data = onlyBelumTarget ? rows.filter((r) => BEHIND.has(r.category)) : rows;

  let r = titleBand(
    ws,
    1,
    lastCol,
    `${onlyBelumTarget ? "Peserta Belum Target" : "Rekap Tilawah"} — ${meta.programName} (${meta.startDate} s/d ${meta.endDate}, target ${meta.targetPages} hal)`,
  );
  const headerRowIndex = r;
  r = headBand(ws, r, HEADERS);

  let no = 1;
  const byGender = groupBy(data, (row) => row.gender || "Lainnya");
  for (const gender of [...byGender.keys()].sort()) {
    const byHalaqah = groupBy(byGender.get(gender)!, (row) => row.halaqah ?? "—");
    for (const halaqah of [...byHalaqah.keys()].sort()) {
      r = groupBand(ws, r, lastCol, `${gender} · ${halaqah}`);
      const blockStart = r;

      const sorted = byHalaqah
        .get(halaqah)!
        .slice()
        .sort((a, b) => a.order - b.order || b.cumulativeJuz - a.cumulativeJuz);
      for (const p of sorted) {
        const behind = BEHIND.has(p.category);
        const flag = behind ? WARN_FILL : undefined;
        numCell(ws.getCell(r, 1), no);
        textCell(ws.getCell(r, 2), p.nama);
        textCell(ws.getCell(r, 3), p.gender, { align: "center" });
        textCell(ws.getCell(r, 4), p.halaqah);
        textCell(ws.getCell(r, 5), p.pengajar);
        textCell(ws.getCell(r, 6), p.firstDate, { align: "center" });
        numCell(ws.getCell(r, 7), p.avgPerDay, { fmt: NUM_FMT.dec2 });
        numCell(ws.getCell(r, 8), p.cumulativePages, { fill: flag });
        numCell(ws.getCell(r, 9), p.targetPages);
        numCell(ws.getCell(r, 10), p.cumulativeJuz, { fmt: NUM_FMT.dec2 });
        numCell(ws.getCell(r, 11), p.streakDays);
        textCell(ws.getCell(r, 12), p.category, { align: "center", fill: flag });
        r += 1;
        no += 1;
      }
      // Stripe per block so the alternation restarts under each band instead of
      // drifting out of phase with it.
      zebra(ws, blockStart, r - 1, lastCol);
    }
  }

  const lastDataRow = r - 1;
  autoFilter(ws, headerRowIndex, lastCol, lastDataRow);
  lockHeader(ws, headerRowIndex, 2);
  autoWidth(ws, { min: 6, max: 34 });
  noteRow(
    ws,
    r + 1,
    lastCol,
    `Periode ${meta.startDate} s/d ${meta.endDate} · target ${meta.targetPages} halaman per peserta. ` +
      `Baris berlatar kuning = kategori "Belum Mencapai Target" atau "Belum Sama Sekali". ` +
      `"${DASH}" berarti belum ada datanya, bukan nol.`,
  );

  return wb;
}

export type HkmMonthlyMeta = {
  programName: string;
  month: string; // YYYY-MM
  monthLabel: string;
  monthTargetPages: number;
};

const MONTHLY_DETAIL_HEADERS = [
  "No",
  "Nama",
  "Gender",
  "Halaqah",
  "Pengajar",
  "Realisasi (hal)",
  "Target (hal)",
  "Capaian %",
  "Hari aktif",
  "Kategori",
];

const RECAP_HEADERS = ["Halaqah", "Jenis", "Peserta", "Rata² capaian %", "Tercapai", "Underperform", "Khatam"];

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Monthly HKM recap workbook — two sheets: "Rekap" (per halaqah × gender) and
 * "Detail" (per participant for the month), grouped gender → halaqah.
 */
export function buildHkmMonthlyWorkbook(rows: HkmParticipantRow[], meta: HkmMonthlyMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  // ── Sheet 1: Rekap per halaqah × gender ──
  const rk = wb.addWorksheet("Rekap");
  const rkLastCol = RECAP_HEADERS.length;
  let rr = titleBand(
    rk,
    1,
    rkLastCol,
    `Rekap Tilawah HKM — ${meta.programName} · ${meta.monthLabel} (target ${meta.monthTargetPages} hal)`,
  );
  const rkHeaderRow = rr;
  rr = headBand(rk, rr, RECAP_HEADERS);

  const groups = groupBy(rows, (r) => `${r.gender || "Lainnya"}||${r.halaqah ?? "—"}`);
  const rkFirstDataRow = rr;
  for (const key of [...groups.keys()].sort()) {
    const arr = groups.get(key)!;
    const [gender, halaqah] = key.split("||");
    const avg = arr.length ? round1(arr.reduce((s, r) => s + r.mCapaian, 0) / arr.length) : 0;
    textCell(rk.getCell(rr, 1), halaqah);
    textCell(rk.getCell(rr, 2), gender);
    numCell(rk.getCell(rr, 3), arr.length);
    // Amber where the halaqah's average is still short of its monthly target.
    pctCell(rk.getCell(rr, 4), avg, avg < 100 ? { fill: WARN_FILL } : {});
    numCell(rk.getCell(rr, 5), arr.filter((r) => r.mCategory === "Tercapai").length);
    numCell(rk.getCell(rr, 6), arr.filter((r) => r.mCategory !== "Tercapai").length);
    numCell(rk.getCell(rr, 7), arr.filter((r) => r.khatamCount >= 1).length);
    rr += 1;
  }
  zebra(rk, rkFirstDataRow, rr - 1, rkLastCol);

  // Total row — the same columns summed over every halaqah, so the recap closes
  // on the program-wide figure instead of leaving it to be added by hand.
  const totalRow = rr;
  textCell(rk.getCell(totalRow, 1), "TOTAL", { bold: true, fill: GROUP_FILL });
  textCell(rk.getCell(totalRow, 2), DASH, { bold: true, fill: GROUP_FILL, align: "center" });
  numCell(rk.getCell(totalRow, 3), rows.length, { bold: true, fill: GROUP_FILL });
  pctCell(rk.getCell(totalRow, 4), rows.length ? round1(rows.reduce((s, r) => s + r.mCapaian, 0) / rows.length) : null, {
    bold: true,
    fill: GROUP_FILL,
  });
  numCell(rk.getCell(totalRow, 5), rows.filter((r) => r.mCategory === "Tercapai").length, {
    bold: true,
    fill: GROUP_FILL,
  });
  numCell(rk.getCell(totalRow, 6), rows.filter((r) => r.mCategory !== "Tercapai").length, {
    bold: true,
    fill: GROUP_FILL,
  });
  numCell(rk.getCell(totalRow, 7), rows.filter((r) => r.khatamCount >= 1).length, { bold: true, fill: GROUP_FILL });
  rr += 1;

  // No autofilter here on purpose: a recap with a TOTAL row is not a list, and a
  // filter would happily hide the total.
  lockHeader(rk, rkHeaderRow, 1);
  autoWidth(rk, { min: 8, max: 34 });
  noteRow(
    rk,
    rr + 1,
    rkLastCol,
    `${meta.monthLabel} · target ${meta.monthTargetPages} halaman per peserta. ` +
      `"Rata² capaian %" = rata-rata capaian peserta di baris tsb (bukan realisasi ÷ target gabungan). ` +
      `Underperform = peserta dengan kategori selain "Tercapai". Khatam = peserta dengan minimal 1x khatam tercatat. ` +
      `Kuning = rata-rata capaian masih di bawah 100%.`,
  );

  // ── Sheet 2: Detail per peserta ──
  const ws = wb.addWorksheet("Detail");
  const lastCol = MONTHLY_DETAIL_HEADERS.length;
  let r = titleBand(ws, 1, lastCol, `Detail Peserta — ${meta.programName} · ${meta.monthLabel}`);
  const headerRowIndex = r;
  r = headBand(ws, r, MONTHLY_DETAIL_HEADERS);

  const byGender = groupBy(rows, (row) => row.gender || "Lainnya");
  const MCAT_ORDER: Record<string, number> = { Tercapai: 1, "Belum Tercapai": 2, "Tidak Aktif": 3 };
  let no = 1;
  for (const gender of [...byGender.keys()].sort()) {
    const byHalaqah = groupBy(byGender.get(gender)!, (row) => row.halaqah ?? "—");
    for (const halaqah of [...byHalaqah.keys()].sort()) {
      r = groupBand(ws, r, lastCol, `${gender} · ${halaqah}`);
      const blockStart = r;

      const sorted = byHalaqah
        .get(halaqah)!
        .slice()
        .sort((a, b) => MCAT_ORDER[a.mCategory] - MCAT_ORDER[b.mCategory] || b.mRealisasi - a.mRealisasi);
      for (const p of sorted) {
        const flag = p.mCategory === "Tercapai" ? undefined : WARN_FILL;
        numCell(ws.getCell(r, 1), no);
        textCell(ws.getCell(r, 2), p.nama);
        textCell(ws.getCell(r, 3), p.gender, { align: "center" });
        textCell(ws.getCell(r, 4), p.halaqah);
        textCell(ws.getCell(r, 5), p.pengajar);
        numCell(ws.getCell(r, 6), p.mRealisasi, { fill: flag });
        numCell(ws.getCell(r, 7), p.mTarget);
        pctCell(ws.getCell(r, 8), p.mCapaian, { fill: flag });
        numCell(ws.getCell(r, 9), p.mActiveDays);
        textCell(ws.getCell(r, 10), p.mCategory, { align: "center", fill: flag });
        r += 1;
        no += 1;
      }
      zebra(ws, blockStart, r - 1, lastCol);
    }
  }

  autoFilter(ws, headerRowIndex, lastCol, r - 1);
  lockHeader(ws, headerRowIndex, 2);
  autoWidth(ws, { min: 6, max: 34 });
  noteRow(
    ws,
    r + 1,
    lastCol,
    `${meta.monthLabel} (${meta.month}) · target ${meta.monthTargetPages} halaman per peserta. ` +
      `Capaian % = realisasi ÷ target bulanan. Kuning = kategori selain "Tercapai". ` +
      `"${DASH}" berarti belum ada datanya, bukan nol.`,
  );

  return wb;
}
