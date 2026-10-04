/**
 * Writer for the combined HKM monthly report (setoran + presensi), laid out like
 * the coordinator's "Laporan Bulanan HKM 2026.xlsx".
 *
 * TWO worksheets, where the coordinator's own file has one. Her file nests the
 * ~160-row under-target roster inside the observasi table (rows 8..160 of column
 * I), and that nesting is the single worst thing about the sheet: the roster
 * cannot be frozen, filtered or sorted, because a worksheet gets exactly ONE
 * autofilter and its columns already mean "Aktual"/"Benchmark" three rows above.
 * Printing is the same story — a 160-row block inside a 5-row recap prints as
 * five pages of unlabelled names. So the roster moves to its own sheet where it
 * can be a real table, and the recap keeps a full-sentence summary (counts,
 * split, and the sheet name) so it still stands alone when read or printed by
 * itself.
 *
 * "-" means "no source for this yet", never a measured zero — same rule as the
 * KBA sheet (lib/reports/kba-xlsx.ts).
 */
import ExcelJS from "exceljs";
import {
  autoFilter,
  autoWidth,
  box,
  DASH,
  freezeHeader,
  HEAD_FILL,
  headerRow,
  noteRow,
  NUM_FMT,
  numCell,
  pctCell,
  printSetup,
  ratioCell,
  textCell,
  TITLE_FILL,
  WARN_FILL,
  zebra,
} from "@/lib/reports/xlsx-style";
import { genderLabel } from "@/lib/programs/config";
import type { HitsRow } from "@/lib/reports/queries";
import type { HkmBulanan } from "@/lib/reports/hkm-bulanan";

const RECAP_COLS = 9; // A..I — No | Hal yang diobservasi (B..D) | Aktual | Benchmark | Notes | Rincian (H..I)
const ROSTER_COLS = 8;
const ROSTER_SHEET = "Peserta di Bawah Target";

/**
 * "Tidak Aktif" (zero pages all month) and "Belum Tercapai" (reading, just under
 * target) need different follow-up, so they must not share one amber. Amber =
 * behind, rose = not reading at all.
 */
const IDLE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } };

/** Number format that keeps the unit glued to the value without stringifying it. */
const FMT_PAGES_PER_DAY = '#,##0.00" halaman/hari"';
const FMT_PAGES_PER_DAY_SHORT = '#,##0" hal/hari"';

const isIdle = (keterangan: string): boolean => keterangan.trim().toLowerCase().startsWith("tidak aktif");

// Prose formatters — these land inside a Rincian SENTENCE, not in a cell of
// their own, so they stay strings; every standalone figure goes through
// pctCell/numCell instead.
const pctText = (v: number | null): string => (v == null ? DASH : `${v.toFixed(2)}%`);
const ratioText = (real: number, ideal: number): string =>
  ideal > 0 ? `${((100 * real) / ideal).toFixed(2)}%` : DASH;

/** "Ikhwan 90.36% · Akhwat 88.10%" out of the report's per-gender rows. */
function genderText(rows: HitsRow[], pick: (r: HitsRow) => string): string {
  if (rows.length === 0) return DASH;
  return rows
    .map((r) => `${r.gender == null ? "Tanpa gender" : genderLabel(r.gender)} ${pick(r)}`)
    .join(" · ");
}

/** How the target for the month is arrived at — the same sentence on both sheets. */
function targetBasis(data: HkmBulanan): string {
  const total = data.pagesPerDayTarget * data.days;
  return `Target ${data.pagesPerDayTarget} halaman/hari × ${data.days} hari = ${total} halaman per peserta (${data.start} s/d ${data.end}).`;
}

/** A cell writer, so an observasi row can carry a %, a count or a unit-formatted number. */
type Writer = (cell: ExcelJS.Cell) => void;
const asPct = (v: number | null): Writer => (c) => pctCell(c, v);
const asCount = (v: number | null): Writer => (c) => numCell(c, v);
const asFmt = (v: number | null, fmt: string): Writer => (c) => numCell(c, v, { fmt });
const asText = (v: string): Writer => (c) => textCell(c, v, { align: "center" });

// ── recap sheet ────────────────────────────────────────────────────────────
function buildRecapSheet(wb: ExcelJS.Workbook, data: HkmBulanan) {
  const ws = wb.addWorksheet(data.monthLabel);
  const lastCol = ws.getColumn(RECAP_COLS).letter;
  const p = data.presensi;
  let r = 1;

  const bandRow = (text: string, opts: { fill?: ExcelJS.Fill; bold?: boolean } = {}) => {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    ws.getCell(r, 1).value = text;
    box(ws.getCell(r, 1), { align: "left", bold: opts.bold ?? true, fill: opts.fill });
    r += 1;
  };

  const obsRow = (
    no: number,
    label: string,
    aktual: Writer,
    benchmark: Writer,
    notes: string,
    rincian: string,
  ) => {
    numCell(ws.getCell(r, 1), no);
    // Merge first: exceljs makes a merged cell's style an alias of the master's,
    // so styling the slaves afterwards would overwrite the label's alignment.
    ws.mergeCells(r, 2, r, 4);
    textCell(ws.getCell(r, 2), label);
    aktual(ws.getCell(r, 5));
    benchmark(ws.getCell(r, 6));
    textCell(ws.getCell(r, 7), notes, { align: "center" });
    ws.mergeCells(r, 8, r, RECAP_COLS);
    textCell(ws.getCell(r, 8), rincian);
    r += 1;
  };

  // ── header ───────────────────────────────────────────────────────────────
  bandRow(`HKM (${data.monthLabel})`, { fill: TITLE_FILL });
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  ws.getCell(r, 1).value =
    `Setoran ${data.start} s/d ${data.end} (${data.days} hari) · presensi periode sama` +
    (p ? ` · ambang pengajar ${p.thresholdPct}%` : "") +
    `. Kolom "${DASH}" belum punya sumber data.`;
  box(ws.getCell(r, 1), { align: "left" });
  r += 2;

  const obsHeaderRow = r;
  r = headerRow(ws, r, ["No", "Hal yang di observasi", "", "", "Aktual", "Benchmark", "Notes", "Rincian", ""]);
  ws.mergeCells(obsHeaderRow, 2, obsHeaderRow, 4);
  ws.mergeCells(obsHeaderRow, 8, obsHeaderRow, RECAP_COLS);

  // 1 — setoran volume (berkah side)
  obsRow(
    1,
    "Rata-rata tilawah Al-Qur'an seluruh peserta HKM per hari",
    asFmt(data.setoran.perDay, FMT_PAGES_PER_DAY),
    asFmt(data.pagesPerDayTarget, FMT_PAGES_PER_DAY),
    "halaman",
    data.setoran.byGender
      .map((g) => `${g.gender} ${g.perDay.toFixed(2)} hal/hari (${g.peserta} peserta)`)
      .join(" · "),
  );

  // 2 — presensi peserta (tilawah side)
  obsRow(
    2,
    "Rata-rata kehadiran seluruh peserta",
    asPct(p ? p.overall.kehadiranPct : null),
    asPct(80),
    "%",
    p ? genderText(p.byGender, (x) => pctText(x.kehadiranPct)) : "presensi HKM tidak terbaca",
  );

  // 3 — under-target participants. The roster itself is a sheet of its own, so
  // this line carries everything needed to read the number without it.
  obsRow(
    3,
    "Jumlah peserta dengan akumulasi tilawah Al Qur'an di bawah target",
    asCount(data.setoran.below.length),
    asFmt(data.pagesPerDayTarget, FMT_PAGES_PER_DAY_SHORT),
    "orang",
    `Total peserta yang mencapai target ${data.setoran.tercapai}/${data.setoran.total} peserta HKM · ` +
      `di bawah target: ${data.setoran.belumTercapai} Belum Tercapai + ${data.setoran.tidakAktif} Tidak Aktif · ` +
      `daftar per peserta di sheet "${ROSTER_SHEET}"`,
  );

  // 4 & 5 — pengajar (tilawah side)
  obsRow(
    4,
    "Kehadiran pengajar perbulan",
    p ? (c) => ratioCell(c, p.overall.teacherReal, p.overall.teacherIdeal) : asText(DASH),
    asPct(100),
    "%",
    p
      ? genderText(p.byGender, (x) => ratioText(x.teacherReal, x.teacherIdeal))
      : "presensi HKM tidak terbaca",
  );
  obsRow(
    5,
    "Jumlah pengajar dengan absensi dibawah target",
    asCount(p ? p.pengajarBelowTarget.length : null),
    asCount(0),
    "orang",
    p && p.pengajarBelowTarget.length > 0 ? "lihat daftar di bawah" : DASH,
  );
  r += 1;

  // ── pengajar detail — small enough to stay inline, but banded off so it is
  // not read as more observasi rows.
  if (p && p.pengajarBelowTarget.length > 0) {
    bandRow(`Pengajar dengan absensi di bawah ambang ${p.thresholdPct}%`, { fill: TITLE_FILL });
    r = headerRow(ws, r, ["No", "Nama Pengajar", "Jenis", "Mengajar", "Terjadwal", "Rasio"]);
    const teacherFirstRow = r;
    p.pengajarBelowTarget.forEach((t, i) => {
      numCell(ws.getCell(r, 1), i + 1);
      textCell(ws.getCell(r, 2), t.name);
      textCell(ws.getCell(r, 3), t.gender == null ? DASH : genderLabel(t.gender), { align: "center" });
      numCell(ws.getCell(r, 4), t.real);
      numCell(ws.getCell(r, 5), t.ideal);
      ratioCell(ws.getCell(r, 6), t.real, t.ideal);
      r += 1;
    });
    zebra(ws, teacherFirstRow, r - 1, 6);
    r += 1;
  }

  r = noteRow(
    ws,
    r,
    RECAP_COLS,
    `${targetBasis(data)} Untuk bulan berjalan periode dipotong sampai hari ini, jadi presensi dan target ` +
      `dihitung atas rentang hari yang sama — pertemuan yang belum terjadi tidak masuk penyebut. ` +
      `"${DASH}" berarti sumber datanya belum ada, bukan nol terukur.`,
  );
  r += 1;

  // Narrative, filled in by hand — ruled blanks so it is obvious they are blanks.
  bandRow("Poin Menarik:", { fill: HEAD_FILL });
  for (let i = 1; i <= 4; i++) {
    const num = ws.getCell(r, 1);
    num.value = `${i}.`;
    num.alignment = { vertical: "middle", horizontal: "right" };
    ws.mergeCells(r, 2, r, RECAP_COLS);
    ws.getCell(r, 2).border = { bottom: { style: "hair", color: { argb: "FF999999" } } };
    ws.getRow(r).height = 18;
    r += 1;
  }

  // Hand-set: nearly every cell here is merged, so a width computed from the
  // unmerged content would collapse the label columns to nothing.
  const widths = [5, 30, 14, 14, 20, 20, 10, 30, 30];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  printSetup(ws, { landscape: true, fitToWidth: 1 });
  // Freeze only — deliberately NOT freezeHeader(), which would also repeat the
  // observasi header on printed page 2, where the pengajar table with entirely
  // different columns sits.
  ws.views = [{ state: "frozen", ySplit: obsHeaderRow, activeCell: `A${obsHeaderRow + 1}` }];
}

// ── roster sheet ───────────────────────────────────────────────────────────
function buildRosterSheet(wb: ExcelJS.Workbook, data: HkmBulanan) {
  const ws = wb.addWorksheet(ROSTER_SHEET);
  const lastCol = ws.getColumn(ROSTER_COLS).letter;
  const rows = data.setoran.below;
  let r = 1;

  ws.mergeCells(`A${r}:${lastCol}${r}`);
  ws.getCell(r, 1).value = `Peserta di bawah target — HKM (${data.monthLabel})`;
  box(ws.getCell(r, 1), { align: "left", bold: true, fill: TITLE_FILL });
  r += 1;

  ws.mergeCells(`A${r}:${lastCol}${r}`);
  ws.getCell(r, 1).value =
    `${rows.length} peserta dari ${data.setoran.total} · ${data.setoran.belumTercapai} Belum Tercapai · ` +
    `${data.setoran.tidakAktif} Tidak Aktif · ${targetBasis(data)}`;
  box(ws.getCell(r, 1), { align: "left" });
  r += 1;

  const head = r;
  headerRow(ws, r, [
    "No",
    "Nama",
    "Jenis",
    "Kelompok",
    "Nama Pengajar",
    "Realisasi (Hal)",
    "Rata-rata (Hal/Hari)",
    "Keterangan",
  ]);
  r += 1;

  const first = r;
  if (rows.length === 0) {
    ws.mergeCells(r, 1, r, ROSTER_COLS);
    textCell(ws.getCell(r, 1), "(tidak ada peserta di bawah target)", { align: "center" });
    r += 1;
  } else {
    rows.forEach((b, i) => {
      numCell(ws.getCell(r, 1), i + 1);
      textCell(ws.getCell(r, 2), b.nama);
      textCell(ws.getCell(r, 3), b.gender, { align: "center" });
      textCell(ws.getCell(r, 4), b.halaqah);
      textCell(ws.getCell(r, 5), b.pengajar);
      numCell(ws.getCell(r, 6), b.realisasi);
      // Raw value under a 2-decimal format: rounding it into the cell would make
      // the column un-summable and hide the difference between 0 and 0.004.
      numCell(ws.getCell(r, 7), b.perDay, { fmt: NUM_FMT.dec2 });
      textCell(ws.getCell(r, 8), b.keterangan, {
        align: "center",
        fill: isIdle(b.keterangan) ? IDLE_FILL : WARN_FILL,
      });
      r += 1;
    });
    // Zebra last: it leaves already-filled cells alone, so the Keterangan tints
    // survive it.
    zebra(ws, first, r - 1, ROSTER_COLS);
    autoFilter(ws, head, ROSTER_COLS, r - 1);
  }

  r += 1;
  noteRow(
    ws,
    r,
    ROSTER_COLS,
    `${targetBasis(data)} "Belum Tercapai" = membaca tapi masih di bawah target; "Tidak Aktif" = tidak ada ` +
      `setoran sama sekali pada periode ini. Urutan bawaan: kelompok, lalu realisasi terbesar. ` +
      `"${DASH}" berarti data kelompok/pengajar belum ada, bukan nol.`,
  );

  autoWidth(ws, { min: 6, max: 40 });
  printSetup(ws, { landscape: true, fitToWidth: 1 });
  freezeHeader(ws, head);
}

export function buildHkmBulananWorkbook(data: HkmBulanan): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  buildRecapSheet(wb, data);
  buildRosterSheet(wb, data);
  return wb;
}
