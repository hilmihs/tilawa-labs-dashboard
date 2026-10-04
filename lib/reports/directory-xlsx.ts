import ExcelJS from "exceljs";
import type { PesertaDirectory, PengajarDirectory } from "@/lib/directory/queries";
import { genderLabel } from "@/lib/programs/config";
import { formatUsia } from "@/lib/directory/usia";
import {
  DASH,
  autoFilter,
  autoWidth,
  freezeHeader,
  headerRow,
  noteRow,
  numCell,
  pctCell,
  printSetup,
  textCell,
  zebra,
} from "@/lib/reports/xlsx-style";

/**
 * Flat directory exports — one row per peserta / per pengajar-halaqah pair.
 * Deliberately plain (no merged header blocks like the recap workbooks): these
 * sheets get filtered and pivoted by the coordinator, so they must stay a clean
 * rectangle with a single header row.
 */

/**
 * How a column is written, not what it says. `pct` takes a percent (92.9) and
 * stores the fraction so the coordinator can sort/average it; `int` and `pct`
 * right-align, everything else is left-aligned text — including "No WA", whose
 * leading zero only survives as text.
 */
type ColKind = "text" | "int" | "pct";
type Col = { header: string; kind: ColKind };
type Cell = string | number | null;

/** Jakarta-local date for the footnote; the server may well run in UTC. */
function todayJakarta(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * A percentage cell, snapped to the precision `0.00%` actually shows. pctCell
 * stores value/100, and 33.3/100 lands on 0.33299999999999996 — invisible on
 * screen, but autoWidth measures the raw repr and widens the column to fit all
 * 19 characters of it.
 */
function pct(cell: ExcelJS.Cell, value: number | null) {
  pctCell(cell, value);
  if (typeof cell.value === "number") cell.value = Math.round(cell.value * 1e6) / 1e6;
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  cols: Col[],
  rows: Cell[][],
  opts: { note: string; freezeCols?: number },
) {
  const ws = wb.addWorksheet(name);
  // Instantiate the columns up front so autoWidth() has something to walk; the
  // widths here are placeholders it overwrites once the data is in.
  ws.columns = cols.map(() => ({ width: 10 }));

  const HEAD = 1;
  let r = headerRow(ws, HEAD, cols.map((c) => c.header));

  for (const row of rows) {
    cols.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1);
      const v = row[i];
      if (col.kind === "text") {
        textCell(cell, v == null ? null : String(v));
      } else if (v != null && typeof v !== "number") {
        // A numeric column handed a non-number is a bug upstream, not a value
        // to coerce: show it verbatim rather than inventing a 0.
        textCell(cell, String(v));
      } else if (col.kind === "pct") {
        pct(cell, v);
      } else {
        numCell(cell, v);
      }
    });
    r++;
  }

  const last = r - 1;
  if (last >= HEAD + 1) zebra(ws, HEAD + 1, last, cols.length);
  // A blank row keeps the footnote outside the filtered range.
  noteRow(ws, last + 2, cols.length, opts.note);

  autoWidth(ws, { min: 6 });
  freezeHeader(ws, HEAD, { xSplit: opts.freezeCols });
  autoFilter(ws, HEAD, cols.length, last);
  printSetup(ws);
  return ws;
}

const statusLabel = (code: number | null, text: string | null) =>
  code == null || code === 1 ? "Aktif" : text?.trim() || "Tidak aktif";

/** Footnote: which program, when it was taken, and what the placeholder means. */
const footnote = (programName: string, count: number, unit: string) =>
  `Snapshot ${todayJakarta()} · Program: ${programName} · ${count} ${unit} · ` +
  `"${DASH}" = belum ada datanya di sumber (bukan nol).`;

/**
 * Kolom "Batch" hanya ada pada berkas "semua batch" (`?batch=semua`): berkas
 * satu batch tetap persis seperti sebelumnya, dan berkas gabungan tidak
 * menyembunyikan dari batch mana tiap baris berasal.
 */
function batchCol(rows: { batch?: string | null }[]): Col[] {
  return rows.some((r) => r.batch) ? [{ header: "Batch", kind: "text" }] : [];
}
function batchCell(rows: { batch?: string | null }[], r: { batch?: string | null }): Cell[] {
  return rows.some((x) => x.batch) ? [r.batch ?? null] : [];
}

export function buildPesertaDirectoryWorkbook(dir: PesertaDirectory): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  addSheet(
    wb,
    "Peserta",
    [
      { header: "No", kind: "int" },
      { header: "Nama", kind: "text" },
      ...batchCol(dir.rows),
      { header: "Kode", kind: "text" },
      { header: "No WA", kind: "text" },
      { header: "Jenis", kind: "text" },
      { header: "Nama Bapak", kind: "text" },
      { header: "Nama Ibu", kind: "text" },
      // Teks, bukan tanggal: xlsx-style tidak punya primitif dateCell dan
      // aturan 1 melarang menambal gaya lokal — ISO tetap terurut benar.
      { header: "Tanggal Lahir", kind: "text" },
      // Dua kolom usia: yang dibaca koordinator adalah bentuk prosa, tapi yang
      // bisa di-sort dan di-pivot harus angka.
      { header: "Usia", kind: "text" },
      { header: "Usia (bulan)", kind: "int" },
      { header: "Halaqah", kind: "text" },
      { header: "Level", kind: "text" },
      { header: "Tipe", kind: "text" },
      { header: "Jadwal", kind: "text" },
      { header: "Pengajar", kind: "text" },
      { header: "Status", kind: "text" },
      { header: "Kehadiran (%)", kind: "pct" },
      { header: "Hadir", kind: "int" },
      { header: "Pertemuan efektif", kind: "int" },
      { header: "Izin", kind: "int" },
      { header: "Pertemuan tercatat", kind: "int" },
      { header: "Progres semester", kind: "text" },
    ],
    dir.rows.map((r, i) => [
      i + 1,
      r.name,
      ...batchCell(dir.rows, r),
      r.userCode,
      // Text, not number: leading zeros in "0812…" must survive the export.
      r.phone,
      genderLabel(r.gender),
      r.fatherName,
      r.motherName,
      r.birthDate,
      r.usiaMonths == null ? null : formatUsia(r.usiaMonths),
      r.usiaMonths,
      r.halaqahName,
      r.level,
      r.type,
      r.jadwal,
      r.pengajar,
      statusLabel(r.statusCode, r.statusText),
      r.attendanceRate,
      r.hadirCount,
      r.effectiveMeetings,
      r.izinCount,
      r.recordedMeetings,
      // tilawah's own "6/26" string — a ratio, not a percentage; kept verbatim.
      r.pertemuan,
    ]),
    {
      note:
        `${footnote(dir.programName, dir.rows.length, "peserta")} ` +
        'Usia dihitung dari tanggal lahir saat berkas dibuat; "Usia (bulan)" adalah bentuk angkanya. ' +
        "Tanggal Lahir ditulis sebagai teks ISO (YYYY-MM-DD) agar urutannya tetap benar.",
      freezeCols: 2,
    },
  );

  /*
   * Wali santri — hanya ada untuk program yang punya lapisan keluarga dari
   * xlsx (hari ini cuma Mabni). Dijaga supaya export program lain persis sama
   * seperti sebelum kolom ini ada.
   *
   * Satu baris per SLOT anak, bukan per keluarga: kolom keluarga berulang ke
   * bawah supaya sheet-nya tetap persegi panjang yang bisa difilter dan
   * di-pivot, sama seperti sheet Peserta.
   */
  if (dir.wali.length > 0) {
    const keluarga = new Set(
      dir.wali.map((w) => `${w.fatherName ?? ""}|${w.motherName ?? ""}`),
    ).size;
    addSheet(
      wb,
      "Wali Santri",
      [
        { header: "No", kind: "int" },
        { header: "Nama Ayah", kind: "text" },
        { header: "Nama Ibu", kind: "text" },
        { header: "Jumlah Anak", kind: "int" },
        { header: "Anak ke-", kind: "int" },
        { header: "Nama Anak", kind: "text" },
        { header: "Terdaftar", kind: "text" },
        { header: "Halaqah", kind: "text" },
        { header: "Level", kind: "text" },
      ],
      dir.wali.map((w, i) => [
        i + 1,
        w.fatherName,
        w.motherName,
        // Apa adanya dari workbook, bukan cacah baris di bawahnya — satu
        // keluarga memang menuliskan angka yang berbeda dari daftar anaknya.
        w.childCount,
        w.ordinal,
        w.childName,
        w.enrolled ? "Ya" : "Tidak",
        w.halaqahName,
        w.level,
      ]),
      {
        note:
          `Snapshot ${todayJakarta()} · Program: ${dir.programName} · ` +
          `${dir.wali.length} data anak dari ${keluarga} keluarga · ` +
          '"Terdaftar = Tidak" berarti saudara kandung yang belum/tidak terdaftar sebagai santri, ' +
          `bukan data hilang · "${DASH}" = belum ada datanya di sumber (bukan nol).`,
        freezeCols: 3,
      },
    );
  }

  return wb;
}

export function buildPengajarDirectoryWorkbook(dir: PengajarDirectory): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  addSheet(
    wb,
    "Pengajar",
    [
      { header: "No", kind: "int" },
      { header: "Pengajar", kind: "text" },
      ...batchCol(dir.rows),
      { header: "No WA", kind: "text" },
      { header: "Jumlah halaqah", kind: "int" },
      { header: "Jumlah peserta", kind: "int" },
      { header: "Rata² hadir (%)", kind: "pct" },
      { header: "Peserta < ambang", kind: "int" },
      { header: "Pertemuan terisi", kind: "int" },
      { header: "Pertemuan terjadwal", kind: "int" },
      { header: "Belum dipresensi", kind: "int" },
      { header: "Level", kind: "text" },
      { header: "Jenis", kind: "text" },
    ],
    dir.rows.map((r, i) => [
      i + 1,
      r.pengajar,
      ...batchCell(dir.rows, r),
      r.phone,
      r.halaqahCount,
      r.studentCount,
      r.avgRate,
      r.belowCount,
      r.recordedMeetings,
      r.totalMeetings,
      r.dueTanpaPresensi,
      r.levels.join(", "),
      r.genders.map(genderLabel).join(", "),
    ]),
    { note: footnote(dir.programName, dir.rows.length, "pengajar"), freezeCols: 2 },
  );

  // Second sheet: the same data one row per halaqah, so a coordinator can see
  // which specific halaqah is dragging a teacher's numbers down.
  const perHalaqah = dir.rows.flatMap((r) =>
    r.halaqah.map((h): Cell[] => [
      r.pengajar,
      ...batchCell(dir.rows, r),
      h.name,
      h.level,
      h.type,
      h.jadwal,
      h.studentCount,
      h.avgRate,
      h.recordedMeetings,
      h.totalMeetings,
      h.dueTanpaPresensi,
    ]),
  );
  addSheet(
    wb,
    "Per halaqah",
    [
      { header: "Pengajar", kind: "text" },
      ...batchCol(dir.rows),
      { header: "Halaqah", kind: "text" },
      { header: "Level", kind: "text" },
      { header: "Tipe", kind: "text" },
      { header: "Jadwal", kind: "text" },
      { header: "Peserta", kind: "int" },
      { header: "Rata² hadir (%)", kind: "pct" },
      { header: "Pertemuan terisi", kind: "int" },
      { header: "Pertemuan terjadwal", kind: "int" },
      { header: "Belum dipresensi", kind: "int" },
    ],
    perHalaqah,
    { note: footnote(dir.programName, perHalaqah.length, "halaqah"), freezeCols: 1 },
  );

  return wb;
}
