/**
 * Workbook tab "Hasil Ujian" laporan bulanan: Ringkasan, Per halaqah, Per peserta.
 * Data dari lib/reports/hasil-ujian.ts; aturan angka dari
 * lib/insights/evaluasi/maahir-view-model.ts — di sini hanya tata letak.
 *
 * Status draft ditulis sebagai teks ("draft"/"final"), bukan simbol `*` seperti di
 * layar: tanda bintang tidak berarti apa-apa di kertas cetakan.
 */
import ExcelJS from "exceljs";
import { hanyaDraft, JENIS_RAPOT_LABEL, type HalaqahEval, type PesertaNilai } from "@/lib/insights/evaluasi/maahir-view-model";
import type { HasilUjianLaporan } from "./hasil-ujian";
import {
  TITLE_FILL,
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

const DESIMAL = "0.0";

function judul(ws: ExcelJS.Worksheet, teks: string, lastCol: number): number {
  ws.mergeCells(1, 1, 1, lastCol);
  const c = ws.getCell(1, 1);
  c.value = teks;
  box(c, { bold: true, fill: TITLE_FILL, align: "left", wrap: false });
  return 2;
}

function tglId(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d} ${BLN[m - 1]} ${y}`;
}

function rapotTeks(p: PesertaNilai): string {
  if (p.rapot.length === 0) return "belum terbit";
  return p.rapot
    .map((r) => `${JENIS_RAPOT_LABEL[r.jenis] ?? r.jenis} ${r.nilaiAkhir ?? "-"} ${r.lulus === true ? "lulus" : r.lulus === false ? "tidak lulus" : ""}`.trim())
    .join("; ");
}

function sheetRingkasan(wb: ExcelJS.Workbook, d: HasilUjianLaporan) {
  const ws = wb.addWorksheet("Ringkasan");
  const r = d.maahir.ringkas;
  let row = judul(ws, `Hasil Ujian — ${d.programName} (${d.label})`, 2);
  const isi: [string, string | number | null][] = [
    ["Periode", `${tglId(d.start)} – ${tglId(d.end)}`],
    ["Halaqah di Evaluasi Halaqah", r.halaqah],
    ["Peserta aktif", r.peserta],
    ["Peserta bernilai s.d. akhir periode", r.pesertaBernilai],
    ["  …dengan nilai final", r.pesertaFinal],
    ["  …nilainya masih dari draft saja", r.pesertaBernilai - r.pesertaFinal],
    ["Sesi dinilai di periode ini", r.sesiDiPeriode],
    ["Peserta dinilai di periode ini", r.pesertaDiPeriode],
    ["Sesi terkirim s.d. akhir periode", r.sesiTerkirim],
    ["Sesi masih draft", r.sesiDraft],
    ["Rapot aktif s.d. akhir periode", r.rapotAktif],
    ["  …lulus", r.rapotLulus],
    ["  …tidak lulus", r.rapotAktif - r.rapotLulus],
    ["Rapot terbit di periode ini", r.rapotTerbitDiPeriode],
    ["Rata² skor (per peserta per jenis)", r.rataSkor],
    ["Pertemuan ujian CMS tilawah di periode", d.ujianTilawah.length],
  ];
  row = headerRow(ws, row, ["Ukuran", "Nilai"]);
  for (const [label, nilai] of isi) {
    textCell(ws.getCell(row, 1), label);
    if (typeof nilai === "number" || nilai == null) numCell(ws.getCell(row, 2), nilai, { fmt: label.startsWith("Rata") ? DESIMAL : undefined });
    else textCell(ws.getCell(row, 2), nilai);
    row++;
  }
  row++;
  row = noteRow(
    ws,
    row,
    2,
    "Skor 0–100 dihitung Maahir dari jumlah lahn; makin besar makin baik. " +
      "\"Draft\" = sesi yang belum dikirim pengajar — nilainya ikut dihitung tapi masih bisa berubah. " +
      "Rapot yang dihitung hanya yang berstatus aktif. Posisi = sesi yang dibuat dan rapot yang terbit sampai akhir periode; " +
      "nilai yang diubah pengajar sesudah akhir periode tetap terbaca dengan angka barunya (data Maahir hanya menyimpan keadaan terakhir).",
  );
  if (d.maahir.syncedAt) noteRow(ws, row, 2, `Sinkron Maahir terakhir: ${d.maahir.syncedAt.toISOString().replace("T", " ").slice(0, 16)} UTC.`);
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 26;
  printSetup(ws, { landscape: false });
}

function sheetHalaqah(wb: ExcelJS.Workbook, d: HasilUjianLaporan) {
  const ws = wb.addWorksheet("Per halaqah");
  const kolom = [
    "Halaqah", "Pengajar", "Peserta", "Bernilai", "Bernilai final", "Sesi QN", "Sesi PB", "Ujian",
    "Sesi di periode", "Draft", "Rapot aktif", "Rapot lulus", "Rata² skor",
  ];
  let row = judul(ws, `Hasil Ujian per halaqah — ${d.programName} · ${tglId(d.start)} – ${tglId(d.end)}`, kolom.length);
  const head = row;
  row = headerRow(ws, row, kolom);
  const first = row;
  for (const h of d.maahir.halaqah as HalaqahEval[]) {
    const v: (string | number | null)[] = [
      h.halaqah ?? h.halaqahId, h.pengajar, h.peserta, h.pesertaBernilai, h.pesertaFinal,
      h.sesiTerkirim.qn, h.sesiTerkirim.pb, h.sesiTerkirim.ujian, h.sesiDiPeriode, h.sesiDraft,
      h.rapotAktif, h.rapotLulus, h.rataSkor,
    ];
    v.forEach((x, i) => {
      const c = ws.getCell(row, i + 1);
      if (i < 2) textCell(c, x as string | null);
      else numCell(c, x as number | null, { fmt: i === 12 ? DESIMAL : undefined });
    });
    row++;
  }
  zebra(ws, first, row - 1, kolom.length);
  freezeHeader(ws, head, { xSplit: 1 });
  autoFilter(ws, head, kolom.length, row - 1);
  autoWidth(ws);
  printSetup(ws);
}

function sheetPeserta(wb: ExcelJS.Workbook, d: HasilUjianLaporan) {
  const ws = wb.addWorksheet("Per peserta");
  const kolom = [
    "Kode", "Nama", "Halaqah", "Pengajar", "Rata² QN", "Sesi QN", "Rata² PB", "Sesi PB",
    "Ujian terakhir", "Sesi di periode", "Tak hadir", "Status nilai", "Rapot",
  ];
  let row = judul(ws, `Hasil Ujian per peserta — ${d.programName} · ${tglId(d.start)} – ${tglId(d.end)}`, kolom.length);
  const head = row;
  row = headerRow(ws, row, kolom);
  const first = row;
  for (const p of d.maahir.peserta) {
    const kode = p.tilawahUserId != null ? d.maahir.kodePeserta[p.tilawahUserId] ?? null : null;
    textCell(ws.getCell(row, 1), kode);
    textCell(ws.getCell(row, 2), p.nama ?? `(${p.pesertaId})`);
    textCell(ws.getCell(row, 3), p.halaqah);
    textCell(ws.getCell(row, 4), p.pengajar);
    numCell(ws.getCell(row, 5), p.qn.rata, { fmt: DESIMAL });
    numCell(ws.getCell(row, 6), p.qn.sesi);
    numCell(ws.getCell(row, 7), p.pb.rata, { fmt: DESIMAL });
    numCell(ws.getCell(row, 8), p.pb.sesi);
    numCell(ws.getCell(row, 9), p.ujian.terakhir);
    numCell(ws.getCell(row, 10), p.sesiDiPeriode);
    numCell(ws.getCell(row, 11), p.tidakHadir);
    textCell(ws.getCell(row, 12), hanyaDraft(p) ? "draft" : "final", { align: "center" });
    textCell(ws.getCell(row, 13), rapotTeks(p));
    row++;
  }
  zebra(ws, first, row - 1, kolom.length);
  freezeHeader(ws, head, { xSplit: 2 });
  autoFilter(ws, head, kolom.length, row - 1);
  autoWidth(ws);
  printSetup(ws);
}

export function buildHasilUjianWorkbook(d: HasilUjianLaporan): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  sheetRingkasan(wb, d);
  sheetHalaqah(wb, d);
  sheetPeserta(wb, d);
  return wb;
}
