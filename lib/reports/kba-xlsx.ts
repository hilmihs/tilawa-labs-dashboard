/**
 * Writer for the KBA (kolaborasi) monthly recap: ONE worksheet with every
 * kolaborasi program stacked as a block, in the order the coordinator's own
 * workbook uses (lib/reports/kba-blocks.ts → KBA_BLOCKS).
 *
 * ONE COLUMN GRID FOR EVERY BLOCK. Nearly 200 stacked rows are only readable if
 * the eye can track a single grid straight down the page, so every table — the
 * observasi tables, the HITS matrix, the rosters, the "di bawah target" lists —
 * lands on the same anchors:
 *
 *   A      "No"
 *   B..D   the subject: label yang diobservasi / nama peserta / nama pengajar,
 *          with the halaqah always in D
 *   E..K   the figures
 *
 * Percentages are NUMBERS carrying a `0.00%` format, never the string "92.86%".
 * The coordinator's own file stores 0.9551, and a text percentage silently kills
 * every sort, average and pivot built on top of the export.
 *
 * Placeholders are the string "-" and never 0: a measured zero (nobody left, no
 * teacher under target) and "we have no source for this yet" have to stay
 * distinguishable, or the coordinator signs off on numbers nobody produced.
 * Every block ends with an empty "Poin Menarik" list — that part is narrative
 * and stays hand-written, so it is drawn as ruled blanks to be filled in.
 */
import ExcelJS from "exceljs";
import { genderLabel } from "@/lib/programs/config";
import {
  autoWidth,
  box,
  DASH,
  freezeHeader,
  HEAD_FILL,
  noteRow,
  numCell,
  pctCell,
  printSetup,
  TITLE_FILL,
  WARN_FILL,
  zebra,
  type Align,
} from "@/lib/reports/xlsx-style";
import type { HitsRow } from "@/lib/reports/queries";
import { KBA_BLOCKS, type KbaBlockSpec } from "@/lib/reports/kba-blocks";
import type {
  KbaMonthly,
  KbaProgram,
  KbaStudent,
  KbaTeacher,
} from "@/lib/reports/kba-monthly";

const NCOLS = 11; // A..K — the HITS matrix is the widest block and sets the grid
const COL_LABEL = 2; // B: first column of the subject span (B..D)
const COL_HALAQAH = 4; // D: halaqah, in the same place in every table that has one
const COL_VAL = 5; // E: first figure column
/** Merges shared by every observasi table: label over B..D, rincian over H..K. */
const OBS_MERGES: Array<[number, number]> = [
  [COL_LABEL, COL_HALAQAH],
  [8, NCOLS],
];
const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "2026-08-27" → "Agustus 2026". The sheet is named for the period's END month. */
export function periodMonthLabel(end: string): string {
  const [y, m] = end.split("-").map(Number);
  return `${MONTHS_ID[(m || 1) - 1]} ${y}`;
}

/**
 * Copies of lib/reports/xlsx.ts's label helpers. Duplicated on purpose: this
 * sheet only needs two pure string maps, and importing them would tie the KBA
 * layout to a module that exists to write entirely different workbooks.
 */
function shortLevel(level: string | null): string {
  if (!level) return DASH;
  if (/dasar/i.test(level)) return "Dasar";
  if (/lanjutan/i.test(level)) return "Lanjutan";
  return level.replace(/^HITS\s+/i, "");
}

function tipeLabel(type: string | null): string {
  if (type === "offline") return "Offline";
  if (type === "online") return "Online";
  if (type === "hybrid") return "Hybrid";
  return "(tanpa tipe)";
}

/** A percentage that must reach the sheet as a number, not as text. */
type Pct = { pct: number | null; warn?: boolean };
type Cell = string | number | Pct;

const asPct = (value: number | null, warn = false): Pct => ({ pct: value, warn });
const ratio = (real: number, ideal: number, warn = false): Pct =>
  asPct(ideal > 0 ? (100 * real) / ideal : null, warn);
const isPct = (v: Cell): v is Pct => typeof v === "object" && v !== null && "pct" in v;

/** Percent inside a composite sentence — one cell of prose can't be numeric. */
const pctText = (v: number | null): string => (v == null ? DASH : `${v.toFixed(2)}%`);
const ratioText = (real: number, ideal: number): string =>
  ideal > 0 ? `${((100 * real) / ideal).toFixed(2)}%` : DASH;

/** "Ikhwan 86.67% · Akhwat 95.50%" — the sample's Rincian column, one cell. */
function genderText(rows: HitsRow[], pick: (r: HitsRow) => string): string {
  if (rows.length === 0) return DASH;
  return rows
    .map((r) => `${r.gender == null ? "Tanpa gender" : genderLabel(r.gender)} ${pick(r)}`)
    .join(" · ");
}

export function buildKbaMonthlyWorkbook(data: KbaMonthly): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(periodMonthLabel(data.end));
  let r = 1;

  /**
   * Merged cells never auto-fit their height in Excel, and this sheet is mostly
   * merged label spans — so every merge is recorded and given a height at the
   * end, once autoWidth has decided how many characters actually fit.
   */
  const merges: Array<{ row: number; from: number; to: number; text: string }> = [];
  /** Filled after the blocks are written; the daftar isi rows are reserved up front. */
  const toc: Array<{ title: string; row: number }> = [];

  const remember = (row: number, from: number, to: number, value: unknown) => {
    if (typeof value === "string" && value.length > 0) merges.push({ row, from, to, text: value });
  };

  /** A thin gap between tables — a full-height blank row reads as missing data. */
  const spacer = (height = 6) => {
    ws.getRow(r).height = height;
    r += 1;
  };

  const bandRow = (
    text: string,
    opts: { fill?: ExcelJS.Fill; bold?: boolean; size?: number; height?: number } = {},
  ) => {
    ws.mergeCells(r, 1, r, NCOLS);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    box(cell, { align: "left", bold: opts.bold ?? true, fill: opts.fill });
    if (opts.size) cell.font = { bold: opts.bold ?? true, size: opts.size };
    if (opts.height) ws.getRow(r).height = opts.height;
    remember(r, 1, NCOLS, text);
    r += 1;
  };

  /**
   * The band that opens a program block: a medium rule on top, so the eye finds
   * the seam between two programs while scrolling past a wall of tables.
   */
  const blockTitle = (text: string) => {
    const row = r;
    bandRow(text, { fill: TITLE_FILL, size: 12, height: 22 });
    for (let c = 1; c <= NCOLS; c++) {
      ws.getCell(row, c).border = { ...ws.getCell(row, c).border, top: { style: "medium" } };
    }
    return row;
  };

  /**
   * Labels left, figures right, units centred — the same rule in every table. A
   * placeholder in a figure column is right-aligned too, so the "-" sits in the
   * column of numbers it stands in for instead of drifting to the middle.
   */
  const defaultAlign = (col: number, v: Cell): Align =>
    col === 1
      ? "center"
      : col <= COL_HALAQAH
        ? "left"
        : typeof v === "number" || v === DASH
          ? "right"
          : "center";

  /**
   * A bordered row on the shared grid, padded out to K so the block's frame is
   * unbroken. `merges` widens single cells; `align` overrides a column.
   */
  const gridRow = (
    values: Cell[],
    opts: {
      bold?: boolean;
      fill?: ExcelJS.Fill;
      merges?: Array<[number, number]>;
      align?: Record<number, Align>;
    } = {},
  ) => {
    const row = r;
    for (let i = 0; i < NCOLS; i++) {
      const v = values[i] ?? "";
      const cell = ws.getCell(row, i + 1);
      const align = opts.align?.[i + 1] ?? defaultAlign(i + 1, v);
      if (isPct(v)) {
        pctCell(cell, v.pct, { bold: opts.bold, fill: v.warn ? WARN_FILL : opts.fill });
      } else if (typeof v === "number") {
        numCell(cell, v, { bold: opts.bold, fill: opts.fill });
      } else {
        if (v !== "") cell.value = v;
        box(cell, { bold: opts.bold, fill: opts.fill, align });
      }
    }
    for (const [from, to] of opts.merges ?? []) {
      ws.mergeCells(row, from, row, to);
      const cell = ws.getCell(row, from);
      const v = values[from - 1] ?? "";
      box(cell, {
        bold: opts.bold,
        fill: opts.fill,
        align: opts.align?.[from] ?? (from <= COL_HALAQAH || from >= 8 ? "left" : "center"),
      });
      remember(row, from, to, v);
    }
    r += 1;
    return row;
  };

  // ── observasi table ──────────────────────────────────────────────────────
  // A=No, B..D=Hal yang Diobservasi, E=Aktual, F=Benchmark, G=Notes, H..K=Rincian
  type Obs = { label: string; aktual: Cell; satuan: string; notes: Cell; rincian: Cell };
  const observasi = (rows: Obs[], caption?: string) => {
    if (caption) bandRow(caption, { fill: HEAD_FILL });
    gridRow(["No", "Hal yang Diobservasi", "", "", "Aktual", "Benchmark", "Notes", "Rincian"], {
      bold: true,
      fill: HEAD_FILL,
      merges: OBS_MERGES,
    });
    rows.forEach((o, i) => {
      // On a row measured in "%", Aktual is a fraction — so its benchmark has to
      // be a number too, or the two cells next to each other cannot be compared,
      // sorted, or conditionally formatted. On a row counted in "orang" the very
      // same "70%" is prose naming the threshold ("peserta di bawah 70%"), and
      // turning that into a number would claim the column holds a percentage.
      const notes =
        o.satuan === "%" && typeof o.notes === "string" && /^\d+(\.\d+)?%$/.test(o.notes)
          ? asPct(Number.parseFloat(o.notes))
          : o.notes;
      gridRow([i + 1, o.label, "", "", o.aktual, o.satuan, notes, o.rincian], {
        merges: OBS_MERGES,
      });
    });
    spacer();
  };

  /** Name list under a block — peserta di bawah target, roster, pengajar. */
  const nameTable = (
    headers: Cell[],
    rows: Cell[][],
    opts: { caption?: string; merges?: Array<[number, number]> } = {},
  ) => {
    if (opts.caption) bandRow(opts.caption, { fill: HEAD_FILL });
    gridRow(headers, { bold: true, fill: HEAD_FILL, merges: opts.merges });
    if (rows.length === 0) {
      gridRow(["", "(tidak ada)"], { merges: opts.merges });
    } else {
      const first = r;
      rows.forEach((row) => gridRow(row, { merges: opts.merges }));
      // Striping earns its keep only once a list is long enough to lose your place.
      if (rows.length >= 4) zebra(ws, first + 1, r - 1, NCOLS);
    }
    spacer();
  };

  /** Ruled blanks, not stray text: this is a form the coordinator fills by hand. */
  const poinMenarik = () => {
    bandRow("Poin Menarik:", { fill: HEAD_FILL });
    for (let i = 1; i <= 3; i++) {
      const cell = ws.getCell(r, 1);
      cell.value = `${i}.`;
      cell.alignment = { vertical: "bottom", horizontal: "right" };
      ws.mergeCells(r, 2, r, NCOLS);
      const blank = ws.getCell(r, 2);
      blank.border = { bottom: { style: "hair", color: { argb: "FF999999" } } };
      blank.alignment = { vertical: "bottom", horizontal: "left" };
      ws.getRow(r).height = 18;
      r += 1;
    }
    spacer(10);
  };

  /** Said out loud rather than left as an empty block. */
  const unavailable = (why: string) => {
    bandRow(why, { bold: false });
    spacer();
  };

  // ── sheet header ─────────────────────────────────────────────────────────
  ws.mergeCells(r, 1, r, NCOLS);
  // Same wording as the coordinator's file: "LAPORAN BULAN AGUSTUS TILAWAH KOLABORASI 2026".
  const [monthName, yearText] = periodMonthLabel(data.end).split(" ");
  const title = `LAPORAN BULAN ${monthName.toUpperCase()} TILAWAH KOLABORASI ${yearText}`;
  ws.getCell(r, 1).value = title;
  box(ws.getCell(r, 1), { bold: true, fill: TITLE_FILL });
  ws.getCell(r, 1).font = { bold: true, size: 14 };
  ws.getRow(r).height = 26;
  r += 1;
  ws.mergeCells(r, 1, r, NCOLS);
  ws.getCell(r, 1).value =
    `Periode ${data.start} s/d ${data.end}. Kolom bertanda "${DASH}" belum punya sumber data di dashboard — isi manual.`;
  box(ws.getCell(r, 1), { align: "left" });
  r += 1;
  const headerRows = r - 1; // rows 1..2 stay on screen and on every printed page
  spacer();

  // ── daftar isi ───────────────────────────────────────────────────────────
  // Rows are reserved now and filled once the blocks know their own anchors: the
  // sheet runs past 190 rows, and hunting for "TAHSIN KELUARGA" by scrolling is
  // exactly the friction this file was meant to remove.
  bandRow("DAFTAR ISI", { fill: HEAD_FILL });
  const tocFirstRow = r;
  const tocSlots = KBA_BLOCKS.length + 1; // + the closing "Catatan"
  for (let i = 0; i < tocSlots; i++) {
    for (let c = 1; c <= NCOLS; c++) box(ws.getCell(r, c), { align: "left" });
    ws.mergeCells(r, 2, r, 8);
    ws.mergeCells(r, 9, r, NCOLS);
    r += 1;
  }
  spacer();

  // ── blocks ───────────────────────────────────────────────────────────────
  for (const spec of KBA_BLOCKS) {
    const prog = spec.slug ? data.programs[spec.slug] : null;
    // One program per printed page: without an explicit break, fit-to-width
    // splits a block wherever the page happens to end.
    if (toc.length > 0) ws.getRow(r - 1).addPageBreak();
    const anchor = blockTitle(spec.title.toUpperCase());
    toc.push({ title: spec.title, row: anchor });

    if (spec.kind === "placeholder") {
      bandRow(
        "Belum ada program-nya di dashboard — struktur dicetak, angka diisi manual.",
        { bold: false },
      );
      for (const sub of spec.subTitles ?? []) {
        observasi(
          [
            {
              label: "Akumulasi kehadiran peserta",
              aktual: DASH,
              satuan: "Orang",
              notes: DASH,
              rincian: `Ikhwan ${DASH} · Akhwat ${DASH}`,
            },
            {
              label: "Persentase keberlangsungan kelas",
              aktual: DASH,
              satuan: "%",
              notes: DASH,
              rincian: `Ikhwan ${DASH} · Akhwat ${DASH}`,
            },
          ],
          `${sub} ${periodMonthLabel(data.end)}`,
        );
      }
      poinMenarik();
      continue;
    }

    if (!prog) {
      unavailable(
        `Data ${spec.slug ?? "program"} tidak terbaca (program belum ada atau di luar akses akun ini).`,
      );
      poinMenarik();
      continue;
    }

    bandRow(
      `Periode ${prog.rep.start} s/d ${prog.rep.end} · ambang pengajar ${prog.rep.thresholdPct}%`,
      { bold: false },
    );

    if (spec.kind === "observasi") writeObservasi(spec, prog);
    else if (spec.kind === "hitsMatrix") writeHitsMatrix(prog);
    else if (spec.kind === "roster") writeRoster(prog);
    else if (spec.kind === "laz") writeLaz(prog);

    poinMenarik();
  }

  // ── catatan ──────────────────────────────────────────────────────────────
  // The derived figures are explained next to the numbers, not in a chat
  // message: whoever opens this file next month is not in this conversation.
  ws.getRow(r - 1).addPageBreak();
  toc.push({ title: "Catatan", row: blockTitle("CATATAN") });
  for (const line of [
    "Keberlangsungan kelas = pertemuan terlaksana ÷ pertemuan terjadwal pada periode ini.",
    "Kehadiran peserta = kehadiran ÷ pertemuan yang presensinya terisi (kolom \"Terisi\"), bukan seluruh pertemuan terjadwal.",
    "Kehadiran pengajar = pertemuan yang diampu ÷ pertemuan yang ditugaskan.",
    `Sel bertanda "${DASH}" belum punya sumber data di dashboard dan harus diisi manual; angka 0 berarti nol yang terukur.`,
    "Persentase disimpan sebagai angka dengan format 0.00%, jadi bisa langsung diurutkan, dirata-rata dan dipivot.",
    "Baris \"Poin Menarik\" sengaja dikosongkan — bagian naratif diisi koordinator.",
  ]) {
    r = noteRow(ws, r, NCOLS, `• ${line}`);
  }

  // ── daftar isi, filled now that every anchor is known ─────────────────────
  toc.forEach((entry, i) => {
    const row = tocFirstRow + i;
    ws.getCell(row, 1).value = i + 1;
    box(ws.getCell(row, 1), { align: "center", wrap: false });
    ws.getCell(row, 2).value = entry.title;
    box(ws.getCell(row, 2), { align: "left" });
    remember(row, 2, 8, entry.title);
    // Plain text, not a hyperlink: exceljs writes internal links as external
    // targets, which makes Excel offer to "repair" the file on open.
    ws.getCell(row, 9).value = `Baris ${entry.row}`;
    box(ws.getCell(row, 9), { align: "left", wrap: false });
  });

  // ── widths, panes, print ─────────────────────────────────────────────────
  autoWidth(ws, { min: 10, max: 34 });
  // autoWidth can only measure cells it can see, and it measures headers too:
  // the merged label spans need a floor (their text is invisible to it), while a
  // column of two-digit numbers must not be stretched to fit "Absensi pengajar
  // Di bawah Target" — that header wraps instead.
  const clamp = (col: number, min: number, max: number) => {
    const c = ws.getColumn(col);
    c.width = Math.min(max, Math.max(min, c.width ?? min));
  };
  ws.getColumn(1).width = 5; // "No"
  clamp(COL_LABEL, 26, 34);
  clamp(COL_LABEL + 1, 9, 14);
  clamp(COL_HALAQAH, 24, 34);
  for (let c = COL_VAL; c <= NCOLS; c++) clamp(c, 12, 16);
  freezeHeader(ws, headerRows);
  printSetup(ws, { landscape: true, fitToWidth: 1 });
  ws.pageSetup.printTitlesRow = `1:${headerRows}`;

  // Merged rows do not auto-fit: give each one the height its text needs at the
  // width the columns ended up with. Only when it needs more than one line —
  // pinning a height Excel would have computed itself is what clips the wrapped
  // headers sitting in the same row.
  for (const m of merges) {
    let chars = 0;
    for (let c = m.from; c <= m.to; c++) chars += ws.getColumn(c).width ?? 10;
    const lines = Math.ceil(m.text.length / Math.max(10, chars - 2));
    if (lines <= 1) continue;
    const row = ws.getRow(m.row);
    row.height = Math.max(row.height ?? 0, 15 * lines);
  }
  return wb;

  // ── block writers (closures over ws / r via the helpers above) ───────────

  function writeObservasi(spec: KbaBlockSpec, p: KbaProgram) {
    const o = p.rep.overall;
    const g = p.rep.byGender;
    const rows: Obs[] = [
      {
        label: "Jumlah peserta Aktif",
        aktual: o.aktif,
        satuan: "Orang",
        notes: "N/A",
        rincian: genderText(g, (x) => `${x.aktif} peserta`),
      },
      {
        label: "Kehadiran peserta per bulan",
        aktual: asPct(o.kehadiranPct, o.kehadiranPct != null && o.kehadiranPct < p.rep.thresholdPct),
        satuan: "%",
        notes: `${p.rep.thresholdPct}%`,
        rincian: genderText(g, (x) => pctText(x.kehadiranPct)),
      },
      // No "Akumulasi kehadiran peserta" here. A headcount of attendances only
      // says something where a program has no fixed roster to take a percentage
      // against — that is the Tahsin halaqah at Community Mosque (the
      // placeholder block), whose peserta come and go each session. Everywhere
      // else the roster is enrolled, so "Kehadiran peserta per bulan" is the
      // figure the coordinator reads and the accumulation is noise.
    ];
    if (spec.setoran) {
      rows.push(
        {
          label: "Akumulasi setoran hafalan",
          aktual: DASH,
          satuan: "halaman",
          notes: "N/A",
          rincian: DASH,
        },
        {
          label: "Jumlah peserta dengan setoran Al Qur'an di bawah target",
          aktual: DASH,
          satuan: "orang",
          notes: "N/A",
          rincian: DASH,
        },
      );
    }
    rows.push(
      {
        label: "Jumlah peserta dengan absensi di bawah target",
        aktual: p.belowTarget.length,
        satuan: "orang",
        notes: `${p.rep.thresholdPct}%`,
        rincian: p.belowTarget.length === 0 ? DASH : "lihat daftar di bawah",
      },
      {
        label: "Jumlah peserta yang keluar",
        aktual: o.keluar,
        satuan: "Orang",
        notes: "N/A",
        rincian: genderText(g, (x) => `${x.keluar}`),
      },
      {
        label: "Presentase keberlangsungan kelas",
        aktual: asPct(o.keberlangsunganPct),
        satuan: "%",
        notes: "N/A",
        rincian: genderText(g, (x) => pctText(x.keberlangsunganPct)),
      },
      {
        label: "Kehadiran pengajar perbulan",
        aktual: ratio(o.teacherReal, o.teacherIdeal),
        satuan: "%",
        notes: "100%",
        rincian: genderText(g, (x) => ratioText(x.teacherReal, x.teacherIdeal)),
      },
      {
        label: "Jumlah pengajar dengan absensi di bawah target",
        aktual: o.pengajarDiBawahTarget,
        satuan: "orang",
        notes: `${p.rep.thresholdPct}%`,
        rincian: DASH,
      },
    );
    observasi(rows);
    if (p.belowTarget.length > 0) belowTargetTable(p);
  }

  function belowTargetTable(p: KbaProgram) {
    nameTable(
      ["No", "Peserta di bawah target", "Jenis", "Halaqah", "Hadir", "Terisi", "Kehadiran"],
      p.belowTarget.map((s: KbaStudent, i) => [
        i + 1,
        s.name,
        s.gender == null ? DASH : genderLabel(s.gender),
        s.halaqah ?? DASH,
        s.hadir,
        s.eff,
        // The whole table is under target, so the ratio is the one figure that
        // should catch the eye when the coordinator scans the block.
        asPct(s.pct, true),
      ]),
    );
  }

  function writeHitsMatrix(p: KbaProgram) {
    const HEADERS: Cell[] = [
      "No",
      "Peserta",
      "",
      "",
      "Peserta aktif",
      "Kehadiran Peserta",
      "Peserta Keluar",
      "Keberlangsungan Kelas",
      "Absensi pengajar Di bawah Target",
      "Kehadiran Pengajar",
      "Hasil Kelulusan",
    ];
    const MERGES: Array<[number, number]> = [[COL_LABEL, COL_HALAQAH]];
    const line = (label: string, row: HitsRow, no: Cell): Cell[] => [
      no,
      label,
      "",
      "",
      row.aktif,
      asPct(row.kehadiranPct),
      row.keluar,
      asPct(row.keberlangsunganPct),
      row.pengajarDiBawahTarget,
      row.teacherReal,
      DASH, // kelulusan ujian akhir tidak ada di data presensi
    ];

    for (const b of p.rep.blocks) {
      bandRow(`${tipeLabel(b.type)} · ${shortLevel(b.level)}`, { fill: HEAD_FILL });
      gridRow(HEADERS, { bold: true, fill: HEAD_FILL, merges: MERGES });
      b.rows.forEach((row, i) =>
        gridRow(line(row.gender == null ? "(tanpa peserta terdaftar)" : genderLabel(row.gender), row, i + 1), {
          merges: MERGES,
        }),
      );
      gridRow(line("Total", b.total, ""), { bold: true, fill: HEAD_FILL, merges: MERGES });
      spacer();
    }

    bandRow("KESELURUHAN", { fill: HEAD_FILL });
    gridRow(HEADERS, { bold: true, fill: HEAD_FILL, merges: MERGES });
    gridRow(line("Total", p.rep.overall, ""), { bold: true, fill: HEAD_FILL, merges: MERGES });
    spacer();

    if (p.rep.perBatch.length > 0) {
      bandRow("RINCIAN PER BATCH", { fill: HEAD_FILL });
      gridRow(HEADERS, { bold: true, fill: HEAD_FILL, merges: MERGES });
      p.rep.perBatch.forEach((b, i) => gridRow(line(b.label, b.figures, i + 1), { merges: MERGES }));
      gridRow(line("Gabungan", p.rep.overall, ""), { bold: true, fill: HEAD_FILL, merges: MERGES });
      spacer();
    }

    const o = p.rep.overall;
    observasi(
      [
        {
          label: "Kehadiran peserta perbulan",
          aktual: asPct(o.kehadiranPct, o.kehadiranPct != null && o.kehadiranPct < p.rep.thresholdPct),
          satuan: "%",
          notes: `${p.rep.thresholdPct}%`,
          rincian: genderText(p.rep.byGender, (x) => pctText(x.kehadiranPct)),
        },
        {
          label: "Jumlah peserta dengan absensi di bawah target",
          aktual: p.belowTarget.length,
          satuan: "Orang",
          notes: `${p.rep.thresholdPct}%`,
          rincian: p.belowTarget.length === 0 ? DASH : "lihat daftar di bawah",
        },
        {
          label: "Jumlah peserta yang keluar",
          aktual: o.keluar,
          satuan: "Orang",
          notes: "N/A",
          rincian: genderText(p.rep.byGender, (x) => `${x.keluar}`),
        },
        {
          label: "Presentase keberlangsungan kelas",
          aktual: asPct(o.keberlangsunganPct),
          satuan: "%",
          notes: "N/A",
          rincian: genderText(p.rep.byGender, (x) => pctText(x.keberlangsunganPct)),
        },
        {
          label: "Kehadiran pengajar perbulan",
          aktual: ratio(o.teacherReal, o.teacherIdeal),
          satuan: "%",
          notes: "100%",
          rincian: `${o.teacherReal} dari ${o.teacherIdeal} pertemuan`,
        },
        { label: "Jumlah peserta Aktif", aktual: o.aktif, satuan: "Orang", notes: "N/A", rincian: DASH },
        {
          label: "Jumlah peserta lulus Ujian Akhir HITS",
          aktual: DASH,
          satuan: "%",
          notes: "70%",
          rincian: DASH,
        },
      ],
      "TOTAL",
    );
    if (p.belowTarget.length > 0) belowTargetTable(p);
  }

  function writeRoster(p: KbaProgram) {
    // Nama peserta spans B..C so the halaqah keeps column D, where every other
    // table on this sheet puts it.
    nameTable(
      [
        "No",
        "Nama Peserta",
        "",
        "Halaqah",
        "Jumlah Kehadiran",
        "Kehadiran Ideal per Bulan",
        "Nilai",
        "Keterangan",
        "Tingkat Kehadiran",
      ],
      p.students.map((s: KbaStudent, i) => [
        i + 1,
        s.name,
        "",
        s.halaqah ?? DASH,
        s.hadir,
        s.ideal,
        DASH, // penilaian tidak ada di data presensi
        DASH,
        ratio(s.hadir, s.ideal),
      ]),
      { merges: [[COL_LABEL, COL_LABEL + 1]] },
    );
    nameTable(
      [
        "No",
        "Nama Pengajar",
        "",
        "",
        "Jumlah Kehadiran",
        "Kehadiran Ideal per Bulan",
        "Keterangan",
        "Tingkat Kehadiran",
      ],
      p.teachers.map((t: KbaTeacher, i) => [
        i + 1,
        t.name,
        "",
        "",
        t.real,
        t.ideal,
        DASH,
        ratio(t.real, t.ideal),
      ]),
      { merges: [[COL_LABEL, COL_HALAQAH]] },
    );
  }

  function writeLaz(p: KbaProgram) {
    const o = p.rep.overall;
    // Everyone enrolled in Tahsin al-Fatihah LAZ is assessed, so the assessment
    // headcount IS the roster — read from the same batches, not from the public
    // assessment API. The API keys its records on a free-text `kegiatan` and was
    // returning a different, unreconcilable figure (and an outage there used to
    // blank this block).
    observasi(
      [
        {
          label: "Total peserta yang dinilai Al-Fatihahnya",
          aktual: o.aktif,
          satuan: "Orang",
          notes: "N/A",
          rincian: `${genderText(p.rep.byGender, (x) => `${x.aktif}`)} · sama dengan peserta Tahsin Al-Fatihah LAZ`,
        },
        {
          label: "Persentase peserta yang harus diassessment",
          aktual: DASH,
          satuan: "%",
          notes: "N/A",
          rincian: DASH,
        },
      ],
      `Assessment Al-Fatihah ${periodMonthLabel(data.end)}`,
    );

    observasi(
      [
        {
          label: "Total peserta yang mengikuti Tahsin Al-Fatihah",
          aktual: o.aktif,
          satuan: "Orang",
          notes: "N/A",
          rincian: genderText(p.rep.byGender, (x) => `${x.aktif}`),
        },
        {
          label: "Persentase keberlangsungan kelas",
          aktual: asPct(o.keberlangsunganPct),
          satuan: "%",
          notes: "N/A",
          rincian: genderText(p.rep.byGender, (x) => pctText(x.keberlangsunganPct)),
        },
        {
          label: "Kehadiran pengajar perbulan",
          aktual: ratio(o.teacherReal, o.teacherIdeal),
          satuan: "%",
          notes: "100%",
          rincian: `${o.teacherReal} dari ${o.teacherIdeal} pertemuan`,
        },
      ],
      `Tahsin Al-Fatihah ${periodMonthLabel(data.end)}`,
    );
  }
}
