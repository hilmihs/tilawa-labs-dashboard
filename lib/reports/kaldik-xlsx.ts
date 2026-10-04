/**
 * Kaldik export: three sheets, read in this order by a coordinator.
 *
 *   Kaldik      — the week grid. One row per pekan, one column per weekday, so
 *                 the shape of the batch (13 pekan, two sesi a week, where the
 *                 evaluations and the holiday sit) is visible without reading a
 *                 single date.
 *   Agenda      — the same milestones as a dated list, for a broadcast.
 *   Per Halaqah — the only sheet with actionable dates: a teacher does not care
 *                 that Evaluasi 2 is "pekan 7", they care that theirs is 4 Aug.
 *
 * The grid deliberately prints dates as day-of-month plus the session count:
 * the month lives in the "Periode" column, and repeating it 91 times makes the
 * grid unreadable at print width.
 */
import ExcelJS from "exceljs";
import {
  DOW_LABEL,
  formatISO,
  formatRange,
  type KaldikData,
  type KaldikEvent,
  type KaldikHalaqah,
} from "./kaldik";
import {
  DASH,
  HEAD_FILL,
  NUM_FMT,
  TITLE_FILL,
  WARN_FILL,
  autoFilter,
  autoWidth,
  box,
  freezeHeader,
  headerRow,
  noteRow,
  numCell,
  printSetup,
  textCell,
} from "./xlsx-style";

/** Agenda colours. Amber is already "wants the eye" elsewhere — keep it for evaluasi. */
const EVALUASI_FILL = WARN_FILL;
const UJIAN_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
const LIBUR_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8CBAD" } };
const EDGE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
/** Days outside the batch window: present so the week stays 7 columns wide. */
const OUTSIDE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };

function fillFor(kind: KaldikEvent["kind"]): ExcelJS.Fill | undefined {
  switch (kind) {
    case "evaluasi":
      return EVALUASI_FILL;
    case "ujian":
      return UJIAN_FILL;
    case "libur":
      return LIBUR_FILL;
    default:
      return EDGE_FILL;
  }
}

/** The fill a week row's agenda cell gets: the loudest agenda in that week. */
function weekFill(agenda: string[]): ExcelJS.Fill | undefined {
  if (agenda.some((a) => a.startsWith("Libur —"))) return LIBUR_FILL;
  if (agenda.some((a) => a.startsWith("Ujian"))) return UJIAN_FILL;
  if (agenda.some((a) => a.startsWith("Evaluasi"))) return EVALUASI_FILL;
  if (agenda.some((a) => a === "Awal batch" || a === "Penutupan batch")) return EDGE_FILL;
  return undefined;
}

/**
 * ISO date -> a real Date at UTC midnight. ExcelJS derives the serial from
 * getTime(), so a local-midnight Date east of Greenwich lands a day early.
 */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function dateCell(cell: ExcelJS.Cell, iso: string | null, opts: { fill?: ExcelJS.Fill } = {}) {
  if (!iso) {
    textCell(cell, null, { align: "center", ...(opts.fill ? { fill: opts.fill } : {}) });
    return;
  }
  cell.value = isoToDate(iso);
  cell.numFmt = NUM_FMT.date;
  box(cell, { align: "center", wrap: false, ...(opts.fill ? { fill: opts.fill } : {}) });
}

/** Title band + subtitle across `cols`. Returns the next free row. */
function titleBand(ws: ExcelJS.Worksheet, cols: number, title: string, subtitle: string[]): number {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 13 };
  t.alignment = { vertical: "middle", horizontal: "left" };
  t.fill = TITLE_FILL;
  ws.getRow(1).height = 22;
  let row = 2;
  for (const line of subtitle) {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value = line;
    c.font = { size: 10, color: { argb: "FF444444" } };
    c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    row++;
  }
  return row + 1; // one blank row before the table
}

function pertemuanLabel(orders: number[]): string {
  if (orders.length === 0) return DASH;
  if (orders.length === 1) return `P${orders[0]}`;
  const contiguous = orders.every((o, i) => i === 0 || o === orders[i - 1] + 1);
  return contiguous ? `P${orders[0]}–P${orders.at(-1)}` : orders.map((o) => `P${o}`).join(", ");
}

function sheetKaldik(wb: ExcelJS.Workbook, data: KaldikData) {
  const ws = wb.addWorksheet("Kaldik");
  const headers = ["Pekan", "Periode", "Pertemuan", "Agenda", ...DOW_LABEL, "Sesi"];
  const cols = headers.length;

  const t = data.totals;
  let row = titleBand(ws, cols, `KALENDER PENDIDIKAN — ${data.program.toUpperCase()}`, [
    `${formatISO(data.start)} s/d ${formatISO(data.end)} · ${t.pekan} pekan · ${t.meetingsPerHalaqah} pertemuan per halaqah · 2 sesi per pekan`,
    `${t.halaqahActive} halaqah berjalan (${t.offline} offline, ${t.online} online) · ${t.meetings.toLocaleString("id-ID")} sesi terjadwal` +
      (t.halaqahInactive > 0 ? ` · ${t.halaqahInactive} halaqah tidak berjalan (lihat sheet "Per Halaqah")` : ""),
    `Angka pada kolom hari = tanggal, di bawahnya jumlah sesi seluruh batch pada hari itu. Tanggal per halaqah ada di sheet "Per Halaqah".`,
  ]);

  const headerAt = row;
  row = headerRow(ws, row, headers);

  for (const w of data.weeks) {
    const fill = weekFill(w.agenda);
    numCell(ws.getCell(row, 1), w.index);
    textCell(ws.getCell(row, 2), formatRange(w.start, w.end), { align: "center" });
    textCell(ws.getCell(row, 3), pertemuanLabel(w.orders), { align: "center" });
    textCell(ws.getCell(row, 4), w.agenda.length ? w.agenda.join(" · ") : "KBM reguler", {
      ...(fill ? { fill } : {}),
      bold: !!fill,
    });
    w.days.forEach((d, i) => {
      const cell = ws.getCell(row, 5 + i);
      if (!d.inSpan) {
        cell.value = "";
        box(cell, { fill: OUTSIDE_FILL });
        return;
      }
      if (d.libur) {
        cell.value = `${d.dom}\nLIBUR`;
        box(cell, { fill: LIBUR_FILL, bold: true });
        return;
      }
      cell.value = d.sesi > 0 ? `${d.dom}\n${d.sesi} sesi` : `${d.dom}`;
      box(cell, d.sesi > 0 ? {} : { fill: OUTSIDE_FILL });
    });
    numCell(ws.getCell(row, cols), w.sesi);
    ws.getRow(row).height = 30;
    row++;
  }

  ws.mergeCells(row, 1, row, cols - 1);
  textCell(ws.getCell(row, 1), "TOTAL", { bold: true, fill: HEAD_FILL });
  numCell(ws.getCell(row, cols), t.meetings, { bold: true, fill: HEAD_FILL });
  row += 2;

  row = noteRow(ws, row, cols, "Legenda warna — kuning: pekan evaluasi berkala · biru: pekan ujian akhir · oranye: libur (tak ada kelas sama sekali) · hijau: awal/penutupan batch.");
  row = noteRow(ws, row, cols, `Evaluasi berkala mengikuti nomor pertemuan (P7, P13, P18), bukan tanggal — tiap halaqah menjalankannya pada harinya sendiri, jadi satu evaluasi tersebar dalam rentang ±6 hari.`);
  row = noteRow(ws, row, cols, `Ujian akhir = dua pertemuan penutup tiap halaqah. Karena hari tiap halaqah berbeda, tanggalnya juga berbeda; lihat kolom "Ujian Akhir" di sheet "Per Halaqah".`);
  noteRow(ws, row, cols, `Sumber: jadwal_sync (hasil sinkronisasi dari Mabni), diambil ${formatISO(data.generatedAt)}. Perubahan jadwal setelah tanggal itu belum tercermin di sini.`);

  freezeHeader(ws, headerAt, { xSplit: 4 });
  printSetup(ws);
  autoWidth(ws, { min: 7, max: 46 });
  // autoWidth measures the "22\n41 sesi" cells too; the weekday columns only
  // need to fit two lines of six characters.
  for (let c = 5; c <= 11; c++) ws.getColumn(c).width = 9;
  ws.getColumn(4).width = 40;
}

/**
 * The pekan an agenda really belongs to: the one holding most of its dates.
 * A handful of halaqah always sit a week off the cohort, and the earliest date
 * would name the wrong pekan for everyone else.
 */
function pekanOf(data: KaldikData, ev: KaldikEvent): string {
  const counts = data.weeks.map((w) => ({
    index: w.index,
    n: ev.dates.filter((d) => d >= w.start && d <= w.end).length,
  }));
  const top = counts.reduce((a, b) => (b.n > a.n ? b : a), { index: 0, n: 0 });
  if (top.n === 0) return DASH;
  const spread = counts.filter((c) => c.n > 0).map((c) => c.index);
  return spread.length > 1 ? `${top.index} (sebagian ${spread.filter((i) => i !== top.index).join(", ")})` : `${top.index}`;
}

function sheetAgenda(wb: ExcelJS.Workbook, data: KaldikData) {
  const ws = wb.addWorksheet("Agenda");
  const headers = ["Agenda", "Pertemuan ke", "Pekan", "Rentang tanggal", "Halaqah", "Catatan"];
  const cols = headers.length;

  let row = titleBand(ws, cols, "AGENDA KUNCI — KALDIK HITS", [
    `${data.program} · ${formatISO(data.start)} s/d ${formatISO(data.end)}`,
    `"Rentang tanggal" = tanggal paling awal s/d paling akhir di seluruh halaqah untuk agenda yang sama; tanggal per halaqah ada di sheet "Per Halaqah".`,
  ]);

  const headerAt = row;
  row = headerRow(ws, row, headers);

  for (const ev of data.events) {
    const fill = fillFor(ev.kind);
    textCell(ws.getCell(row, 1), ev.label, { bold: true, ...(fill ? { fill } : {}) });
    textCell(ws.getCell(row, 2), ev.orderLabel, { align: "center" });
    textCell(ws.getCell(row, 3), pekanOf(data, ev), { align: "center" });
    textCell(ws.getCell(row, 4), formatRange(ev.from, ev.to), { align: "center" });
    numCell(ws.getCell(row, 5), ev.halaqah);
    textCell(ws.getCell(row, 6), ev.note);
    ws.getRow(row).height = 28;
    row++;
  }

  freezeHeader(ws, headerAt);
  printSetup(ws);
  autoWidth(ws, { min: 8, max: 60 });
  ws.getColumn(6).width = 60;
}

function sheetHalaqah(wb: ExcelJS.Workbook, data: KaldikData) {
  const ws = wb.addWorksheet("Per Halaqah");
  const headers = [
    "ID", "Halaqah", "Tipe", "Tempat", "Hari", "Jam", "Level", "Pengajar",
    "Mulai", "Selesai", "Jml pertemuan",
    "Evaluasi 1 (P7)", "Evaluasi 2 (P13)", "Evaluasi 3 (P18)",
    "Ujian Akhir 1", "Ujian Akhir 2",
    "Catatan",
  ];
  const cols = headers.length;

  let row = titleBand(ws, cols, "TANGGAL PER HALAQAH — KALDIK HITS", [
    `${data.program} · ${data.totals.halaqahActive} halaqah berjalan` +
      (data.totals.halaqahInactive > 0 ? ` · ${data.totals.halaqahInactive} tidak berjalan` : ""),
    `Tanggal evaluasi diambil dari pertemuan bernomor P7 / P13 / P18 milik halaqah itu sendiri; ujian akhir = dua pertemuan terakhirnya.`,
  ]);

  const headerAt = row;
  row = headerRow(ws, row, headers);

  const sorted = [...data.halaqah].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
  );
  for (const h of sorted) {
    writeHalaqahRow(ws, row, h);
    row++;
  }

  autoFilter(ws, headerAt, cols, row - 1);
  freezeHeader(ws, headerAt, { xSplit: 2 });
  printSetup(ws);
  autoWidth(ws, { min: 8, max: 40 });
}

function writeHalaqahRow(ws: ExcelJS.Worksheet, row: number, h: KaldikHalaqah) {
  numCell(ws.getCell(row, 1), h.id);
  textCell(ws.getCell(row, 2), h.name, { bold: true });
  textCell(ws.getCell(row, 3), h.type, { align: "center" });
  textCell(ws.getCell(row, 4), h.tempat);
  textCell(ws.getCell(row, 5), h.day, { align: "center" });
  textCell(ws.getCell(row, 6), h.session, { align: "center" });
  textCell(ws.getCell(row, 7), h.level);
  textCell(ws.getCell(row, 8), h.pengajar);
  dateCell(ws.getCell(row, 9), h.start);
  dateCell(ws.getCell(row, 10), h.end);
  numCell(ws.getCell(row, 11), h.meetings);
  h.evaluasi.forEach((d, i) => dateCell(ws.getCell(row, 12 + i), d, { fill: EVALUASI_FILL }));
  dateCell(ws.getCell(row, 15), h.ujian[0] ?? null, { fill: UJIAN_FILL });
  dateCell(ws.getCell(row, 16), h.ujian[1] ?? null, { fill: UJIAN_FILL });
  textCell(ws.getCell(row, 17), h.note);
}

export function buildKaldikWorkbook(data: KaldikData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dashboard M-Edu";
  wb.created = isoToDate(data.generatedAt);
  sheetKaldik(wb, data);
  sheetAgenda(wb, data);
  sheetHalaqah(wb, data);
  return wb;
}
