/**
 * Unduhan Excel logbook kehadiran pengurus — murni (tanpa DB), dibangun dari
 * keluaran `susunLogbook`. Tiga lembar:
 *   1. Logbook — tiruan lembar kertas: judul, Bulan/Tahun, blok IKHWAN lalu
 *      AKHWAT; kepala dua baris ("Tgl d" digabung di atas P | Si | Sr).
 *   2. Rekap   — per orang: jumlah P/Si/Sr, total, dan persen terhadap
 *      (hari berjalan × 3); hari yang belum tiba tidak ikut penyebut.
 *   3. Data    — baris datar satu sel per baris, siap di-pivot.
 */
import ExcelJS from "exceljs";
import {
  box,
  DASH,
  HEAD_FILL,
  NUM_FMT,
  TITLE_FILL,
  ZEBRA_FILL,
  autoFilter,
  autoWidth,
  freezeHeader,
  headerRow,
  noteRow,
  numCell,
  pctCell,
  printSetup,
  textCell,
} from "@/lib/reports/xlsx-style";
import type { BarisLogbook, Logbook, Sel } from "./logbook";
import { LABEL_SESI, SESI, SINGKAT_SESI, type SumberHadir } from "./types";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-09" → "September 2026". */
export function labelBulan(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  return `${BULAN[m - 1] ?? bulan} ${y}`;
}

export const LABEL_SUMBER: Record<SumberHadir, string> = { qr: "QR", nfc: "NFC", ketik: "Ketik kode", manual: "Manual" };

/** Nama berkas unduhan untuk bulan "YYYY-MM". */
export const namaBerkasLogbook = (bulan: string) => `Logbook-Kehadiran-Pengurus_${bulan}.xlsx`;

/** Teks sel logbook: "HH.MM", isian tangan admin diberi bintang. */
export function teksSel(s: Sel): string {
  if (!s) return "";
  return s.sumber === "manual" ? `${s.jam}*` : s.jam;
}

const KOLOM_TETAP = 2; // No | Nama
const kolomSel = (iHari: number, iSesi: number) => KOLOM_TETAP + iHari * SESI.length + iSesi + 1;

type Blok = { label: "IKHWAN" | "AKHWAT"; gender: "Ikhwan" | "Akhwat"; baris: BarisLogbook[] };

export function bangunLogbookXlsx(lb: Logbook, opts: { bulan: string; hariIni: string }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dashboard Pendidikan";
  const blok: Blok[] = [
    { label: "IKHWAN", gender: "Ikhwan", baris: lb.ikhwan },
    { label: "AKHWAT", gender: "Akhwat", baris: lb.akhwat },
  ];
  lembarLogbook(wb, lb, blok, opts.bulan);
  lembarRekap(wb, lb, blok, opts);
  lembarData(wb, lb, blok);
  return wb;
}

function lembarLogbook(wb: ExcelJS.Workbook, lb: Logbook, blok: Blok[], bulan: string) {
  const ws = wb.addWorksheet("Logbook");
  const kolomAkhir = KOLOM_TETAP + lb.hari.length * SESI.length;

  ws.mergeCells(1, 1, 1, kolomAkhir);
  const judul = ws.getCell(1, 1);
  judul.value = "LOGBOOK KEHADIRAN PENGURUS PENDIDIKAN";
  judul.font = { bold: true, size: 14 };
  judul.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 22;
  ws.mergeCells(2, 1, 2, kolomAkhir);
  const sub = ws.getCell(2, 1);
  sub.value = `Bulan/Tahun: ${labelBulan(bulan)}`;
  sub.font = { bold: true };

  let r = 4;
  let barisBekuan = 0;
  for (const b of blok) {
    // Label blok, lalu kepala dua baris: No & Nama digabung tegak, tanggal digabung mendatar.
    ws.mergeCells(r, 1, r, kolomAkhir);
    const lab = ws.getCell(r, 1);
    lab.value = b.label;
    box(lab, { bold: true, fill: TITLE_FILL, align: "left" });
    r++;
    const k1 = r;
    const k2 = r + 1;
    ws.mergeCells(k1, 1, k2, 1);
    ws.mergeCells(k1, 2, k2, 2);
    ws.getCell(k1, 1).value = "No";
    ws.getCell(k1, 2).value = "Nama";
    for (const c of [1, 2]) for (const rr of [k1, k2]) box(ws.getCell(rr, c), { bold: true, fill: HEAD_FILL });
    lb.hari.forEach((t, i) => {
      const c0 = kolomSel(i, 0);
      ws.mergeCells(k1, c0, k1, c0 + SESI.length - 1);
      ws.getCell(k1, c0).value = `Tgl ${Number(t.slice(8, 10))}`;
      for (let j = 0; j < SESI.length; j++) {
        box(ws.getCell(k1, c0 + j), { bold: true, fill: HEAD_FILL });
        const c = ws.getCell(k2, c0 + j);
        c.value = SINGKAT_SESI[SESI[j]];
        box(c, { bold: true, fill: HEAD_FILL });
      }
    });
    if (!barisBekuan) barisBekuan = k2;
    r = k2 + 1;

    if (b.baris.length === 0) {
      ws.mergeCells(r, 1, r, kolomAkhir);
      const c = ws.getCell(r, 1);
      c.value = "(belum ada anggota)";
      c.font = { italic: true, color: { argb: "FF666666" } };
      r++;
    }
    for (const [iBaris, row] of b.baris.entries()) {
      const isi = iBaris % 2 === 1 ? ZEBRA_FILL : undefined;
      const no = ws.getCell(r, 1);
      no.value = row.no;
      box(no, { fill: isi });
      const nama = ws.getCell(r, 2);
      nama.value = row.nama;
      box(nama, { align: "left", wrap: false, fill: isi });
      lb.hari.forEach((t, i) => {
        SESI.forEach((s, j) => {
          const sel = row.sel[t]?.[s] ?? null;
          const c = ws.getCell(r, kolomSel(i, j));
          c.value = teksSel(sel); // teks, bukan waktu: "07.45" harus tetap tertulis begitu
          box(c, { wrap: false, fill: isi });
          if (sel?.sumber === "manual") {
            c.note = sel.catatan ? `Isian manual: ${sel.catatan}` : "Isian manual admin";
          }
        });
      });
      r++;
    }
    r++; // satu baris kosong antar-blok
  }
  noteRow(ws, r, Math.min(kolomAkhir, 20), "* = isian manual admin (lupa kartu / koreksi); catatannya ada di komentar sel dan di lembar Data. Jam = jam datang pertama pada sesi itu (WIB).");

  ws.getColumn(1).width = 5;
  const terpanjang = Math.max(10, ...blok.flatMap((b) => b.baris.map((x) => x.nama.length)));
  ws.getColumn(2).width = Math.min(40, terpanjang + 2);
  for (let c = KOLOM_TETAP + 1; c <= kolomAkhir; c++) ws.getColumn(c).width = 6.5;

  // Beku di No/Nama + kepala blok pertama; saat dicetak No/Nama berulang di tiap halaman.
  freezeHeader(ws, barisBekuan, { xSplit: KOLOM_TETAP });
  printSetup(ws, { fitToWidth: 0 });
  ws.pageSetup = { ...ws.pageSetup, printTitlesRow: undefined, printTitlesColumn: "A:B", fitToPage: false };
}

function lembarRekap(wb: ExcelJS.Workbook, lb: Logbook, blok: Blok[], opts: { bulan: string; hariIni: string }) {
  const ws = wb.addWorksheet("Rekap");
  const berjalan = lb.hari.filter((t) => t <= opts.hariIni).length;
  const kepala = ["No", "Nama", "Gender", ...SESI.map((s) => SINGKAT_SESI[s]), "Total", "% Kehadiran"];
  let r = headerRow(ws, 1, kepala);
  let no = 1;
  for (const b of blok) {
    for (const row of b.baris) {
      numCell(ws.getCell(r, 1), no++);
      textCell(ws.getCell(r, 2), row.nama);
      textCell(ws.getCell(r, 3), b.gender, { align: "center" });
      SESI.forEach((s, j) => numCell(ws.getCell(r, 4 + j), row.jumlah[s]));
      numCell(ws.getCell(r, 7), row.jumlah.total, { bold: true });
      // Penyebut = hari berjalan × 3 sesi; bulan yang belum mulai → "-", bukan 0%.
      pctCell(ws.getCell(r, 8), berjalan > 0 ? (100 * row.jumlah.total) / (berjalan * SESI.length) : null);
      r++;
    }
  }
  const akhir = r - 1;
  freezeHeader(ws, 1, { xSplit: 2 });
  autoFilter(ws, 1, kepala.length, akhir);
  autoWidth(ws, { min: 6, max: 40 });
  noteRow(
    ws,
    r + 1,
    kepala.length,
    `P = Pagi, Si = Siang, Sr = Sore. % Kehadiran = total sesi terisi ÷ (${berjalan} hari berjalan × 3 sesi) di ${labelBulan(opts.bulan)}; hari yang belum tiba tidak dihitung.`,
  );
  printSetup(ws, { landscape: false });
}

function lembarData(wb: ExcelJS.Workbook, lb: Logbook, blok: Blok[]) {
  const ws = wb.addWorksheet("Data");
  const kepala = ["Tanggal", "Nama", "Gender", "Sesi", "Jam", "Sumber", "Catatan"];
  let r = headerRow(ws, 1, kepala);
  // Urut tanggal, lalu urutan logbook (Ikhwan dulu), lalu sesi.
  for (const t of lb.hari) {
    const [y, m, d] = t.split("-").map(Number);
    for (const b of blok) {
      for (const row of b.baris) {
        for (const s of SESI) {
          const sel = row.sel[t]?.[s];
          if (!sel) continue;
          const tg = ws.getCell(r, 1);
          tg.value = new Date(Date.UTC(y, m - 1, d)); // tanggal asli agar bisa dikelompokkan di pivot
          tg.numFmt = NUM_FMT.date;
          box(tg, { wrap: false });
          textCell(ws.getCell(r, 2), row.nama);
          textCell(ws.getCell(r, 3), b.gender, { align: "center" });
          textCell(ws.getCell(r, 4), LABEL_SESI[s], { align: "center" });
          textCell(ws.getCell(r, 5), sel.jam, { align: "center" });
          textCell(ws.getCell(r, 6), LABEL_SUMBER[sel.sumber] ?? sel.sumber, { align: "center" });
          const cat = ws.getCell(r, 7);
          cat.value = sel.catatan ?? "";
          box(cat, { align: "left" });
          r++;
        }
      }
    }
  }
  if (r === 2) ws.getCell(2, 1).value = DASH;
  freezeHeader(ws, 1);
  autoFilter(ws, 1, kepala.length, r - 1);
  autoWidth(ws, { min: 8, max: 48 });
}
