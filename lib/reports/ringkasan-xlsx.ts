import ExcelJS from "exceljs";
import { berlaku, labelBulan, ringkas, tanggalBulan } from "@/lib/ringkasan/hitung";
import type { BarisPeserta } from "@/lib/ringkasan/queries";
import { DASH, TITLE_FILL, box, freezeHeader, headerRow, numCell, textCell } from "./xlsx-style";

/** Satu sheet: matriks bulan (✓ / kosong / "-" tak berlaku) + total per peserta. */
export function buildRingkasanWorkbook(
  programName: string,
  bulan: string,
  baris: BarisPeserta[],
  hariIni: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(labelBulan(bulan));
  const tanggal = tanggalBulan(bulan);
  const lebar = 2 + tanggal.length + 3;

  ws.mergeCells(1, 1, 1, lebar);
  const judul = ws.getCell(1, 1);
  judul.value = `Ringkasan Kajian Riyadus Shalihin — ${programName} — ${labelBulan(bulan)}`;
  box(judul, { bold: true, fill: TITLE_FILL });

  const kepala = 3;
  headerRow(ws, kepala, ["Peserta", "Halaqah", ...tanggal.map((t) => String(Number(t.slice(8)))), "Setor", "Hari berlaku", "%"]);

  baris.forEach((b, i) => {
    const row = kepala + 1 + i;
    const rentang = { mulai: b.mulai, selesai: b.selesai };
    const set = new Set(b.setor);
    textCell(ws.getCell(row, 1), b.nama);
    textCell(ws.getCell(row, 2), b.halaqah);
    tanggal.forEach((t, j) => {
      const cell = ws.getCell(row, 3 + j);
      cell.value = !berlaku(t, rentang, hariIni) ? DASH : set.has(t) ? "✓" : "";
      box(cell, { align: "center" });
    });
    const r = ringkas(bulan, rentang, set, hariIni);
    numCell(ws.getCell(row, 3 + tanggal.length), r.setor);
    numCell(ws.getCell(row, 4 + tanggal.length), r.berlaku);
    numCell(ws.getCell(row, 5 + tanggal.length), r.persen);
  });

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 14;
  tanggal.forEach((_, j) => (ws.getColumn(3 + j).width = 4));
  freezeHeader(ws, kepala, { xSplit: 2 });
  return wb;
}
