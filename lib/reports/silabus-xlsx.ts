import ExcelJS from "exceljs";
import type { SilabusData, SilabusHalaqahProgress } from "@/lib/insights/silabus";
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
  zebra,
} from "./xlsx-style";

/**
 * Syllabus export: two sheets per level — the materi sequence, and where each
 * halaqah sits on it. Both are wide and read sideways, so the halaqah/materi
 * label columns are frozen alongside the header: scrolling right must never
 * leave a row of numbers without the name they belong to.
 */

/** A cell's meaning, not its look — the writer below decides the formatting. */
type Field =
  | { kind: "text"; value: string | null }
  | { kind: "num"; value: number | null }
  | { kind: "date"; value: string | null }
  // Pace verdict; `warn` is only a highlight, the words carry the meaning.
  | { kind: "status"; value: string; warn: boolean };

const text = (value: string | null): Field => ({ kind: "text", value });
const num = (value: number | null): Field => ({ kind: "num", value });
const date = (value: string | null): Field => ({ kind: "date", value });

/** Zebra pays for itself only once a screenful of rows scrolls past the header. */
const ZEBRA_FROM_ROWS = 15;

/** Long enough for a real materi title, short enough to still print. */
const MAX_COL_WIDTH = 44;

/** Excel sheet names cap at 31 chars and reject []:*?/\ — squeeze the level in. */
function sheetName(wb: ExcelJS.Workbook, prefix: string, level: string): string {
  const clean = level.replace(/[[\]:*?/\\]/g, " ").trim();
  const base = `${prefix} ${clean}`.slice(0, 31);
  // Two long level names can truncate to the same 31 chars, and a duplicate
  // sheet name throws — number the collisions instead of losing the export.
  if (!wb.getWorksheet(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!wb.getWorksheet(candidate)) return candidate;
  }
}

/**
 * ISO date string -> a real Date, so the column sorts and filters as a date.
 * Anchored at UTC midnight because ExcelJS derives the serial from getTime():
 * a local-midnight Date east of Greenwich lands on the previous day.
 */
function isoToDate(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function writeField(cell: ExcelJS.Cell, field: Field) {
  switch (field.kind) {
    case "num":
      numCell(cell, field.value);
      return;
    case "date": {
      const d = field.value ? isoToDate(field.value) : null;
      if (!d) {
        // No scheduled date is not "1899-12-30" — keep the placeholder.
        textCell(cell, null, { align: "center" });
        return;
      }
      cell.value = d;
      cell.numFmt = NUM_FMT.date;
      box(cell, { align: "center", wrap: false });
      return;
    }
    case "status":
      textCell(cell, field.value, {
        align: "center",
        ...(field.warn ? { fill: WARN_FILL } : {}),
      });
      return;
    default:
      textCell(cell, field.value);
  }
}

function addSheet(
  wb: ExcelJS.Workbook,
  opts: {
    name: string;
    title: string;
    headers: string[];
    rows: Field[][];
    /** Label columns kept on screen while scrolling right. */
    freezeCols: number;
    notes: string[];
    maxWidth?: number;
    /** Off for the "no syllabus" sheet — a one-line notice is not a list. */
    filter?: boolean;
  },
) {
  const ws = wb.addWorksheet(opts.name);
  const cols = opts.headers.length;

  ws.mergeCells(1, 1, 1, cols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = opts.title;
  box(titleCell, { bold: true, fill: TITLE_FILL, align: "left", wrap: false });

  const HEAD_ROW = 2;
  headerRow(ws, HEAD_ROW, opts.headers, { fill: HEAD_FILL });

  const firstData = HEAD_ROW + 1;
  opts.rows.forEach((row, r) => {
    row.forEach((field, c) => writeField(ws.getCell(firstData + r, c + 1), field));
  });
  const lastData = firstData + opts.rows.length - 1;

  if (opts.rows.length >= ZEBRA_FROM_ROWS) zebra(ws, firstData + 1, lastData, cols);

  freezeHeader(ws, HEAD_ROW, { xSplit: opts.freezeCols });
  if (opts.filter !== false) autoFilter(ws, HEAD_ROW, cols, lastData);
  printSetup(ws, { landscape: true });

  // autoWidth walks ws.columns, which only exists for columns already touched.
  ws.getColumn(cols);
  autoWidth(ws, { min: 6, max: opts.maxWidth ?? MAX_COL_WIDTH });
  // ...but it measures a Date as String(date) — 45 chars of "Tue Jul 11 2026
  // 00:00:00 GMT+0700" that a yyyy-mm-dd cell never shows, so every date column
  // comes out pinned to the clamp. Width those to what actually prints.
  const dateCols = new Set<number>();
  for (const row of opts.rows) {
    row.forEach((field, c) => {
      if (field.kind === "date") dateCols.add(c + 1);
    });
  }
  for (const c of dateCols) {
    ws.getColumn(c).width = Math.max("yyyy-mm-dd".length + 2, opts.headers[c - 1].length + 2);
  }

  let row = lastData + 2;
  for (const note of opts.notes) row = noteRow(ws, row, cols, note);
  return ws;
}

function slotLabel(first: number | null, last: number | null): string {
  if (first == null) return "";
  return last == null || last === first ? `${first}` : `${first}–${last}`;
}

function paceLabel(h: SilabusHalaqahProgress): string {
  if (h.lastTaughtOrder == null) return "Belum mulai";
  if (h.delta == null) return "";
  if (h.delta < 0) return `Tertinggal ${Math.abs(h.delta)}`;
  if (h.delta > 0) return `Lebih cepat ${h.delta}`;
  return "Sesuai";
}

export function buildSilabusWorkbook(data: SilabusData, programName: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  if (!data.derivable || data.levels.length === 0) {
    addSheet(wb, {
      name: "Silabus",
      title: `Silabus ${programName}`,
      headers: ["Keterangan"],
      rows: [
        [
          text(
            `Silabus ${programName} belum bisa dibaca — nama pertemuan di CMS masih generik ` +
              `(mis. "Pertemuan 1", atau hanya angka).`,
          ),
        ],
      ],
      freezeCols: 0,
      notes: [],
      maxWidth: 100,
      filter: false,
    });
    return wb;
  }

  for (const lv of data.levels) {
    addSheet(wb, {
      name: sheetName(wb, "Materi", lv.level),
      title: `${programName} — Silabus (materi) · ${lv.level}`,
      headers: [
        "No",
        "Materi",
        "Pertemuan ke-",
        // Two columns rather than one range string, so the sheet stays sortable
        // and filterable by date — the point of exporting it at all.
        "Tanggal paling awal",
        "Tanggal paling akhir",
        "Dipakai (halaqah)",
      ],
      rows: lv.materi.map((m) => [
        num(m.index + 1),
        text(m.title),
        text(slotLabel(m.firstOrder, m.lastOrder)),
        date(m.firstDate),
        date(m.lastDate),
        num(m.halaqahCount),
      ]),
      // No + Materi: the numbers to the right are meaningless without them.
      freezeCols: 2,
      notes: [
        `"Pertemuan ke-" = nomor pertemuan tempat materi ini dijadwalkan; ditulis sebagai rentang ` +
          `(mis. 4–6) bila halaqah pada level ini tidak seragam.`,
        `"Tanggal paling awal/akhir" = rentang tanggal jadwal materi ini di seluruh halaqah, ` +
          `bukan satu tanggal tunggal. "${DASH}" = belum ada tanggal jadwal.`,
      ],
    });

    addSheet(wb, {
      name: sheetName(wb, "Posisi", lv.level),
      title: `${programName} — Posisi halaqah pada silabus · ${lv.level}`,
      headers: [
        "Halaqah",
        "Pengajar",
        "Pertemuan terakhir",
        "Total pertemuan",
        "Materi ke-",
        "Materi terakhir",
        "Materi berikutnya",
        "Status",
      ],
      rows: lv.halaqah.map((h) => [
        text(h.name),
        text(h.pengajar),
        num(h.lastTaughtOrder),
        num(h.totalMeetings),
        num(h.materiIndex != null ? h.materiIndex + 1 : null),
        text(h.lastTaughtTitle),
        text(h.nextTitle),
        {
          kind: "status" as const,
          value: paceLabel(h),
          // Only "tertinggal" needs the eye; ahead-of-pace is not a problem.
          warn: h.delta != null && h.delta < 0,
        },
      ]),
      // Halaqah + Pengajar stay visible while scrolling to the materi columns.
      freezeCols: 2,
      notes: [
        `Status: "Sesuai" = materi sama dengan mayoritas halaqah selevel pada nomor pertemuan yang sama; ` +
          `"Tertinggal n" = n materi di belakangnya; "Lebih cepat n" = n materi di depannya; ` +
          `"Belum mulai" = belum ada pertemuan yang terlaksana; "${DASH}" = posisi belum bisa dibandingkan.`,
        // The fill must be spelled out: printed in greyscale it is just a shade.
        `Sel Status berlatar kuning = halaqah tertinggal dari mayoritas levelnya.`,
        `"Pertemuan terakhir" = nomor pertemuan terakhir yang terlaksana (ada presensi), ` +
          `bukan jumlah pertemuan. "${DASH}" = belum ada datanya.`,
      ],
    });
  }

  return wb;
}
