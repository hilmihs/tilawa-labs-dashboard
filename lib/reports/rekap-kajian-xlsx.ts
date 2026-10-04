import ExcelJS from "exceljs";
import type { BarisSebaran, OrangBerulang, RekapSesi } from "@/lib/hadir/rekap";
import {
  autoFilter,
  autoWidth,
  freezeHeader,
  headerRow,
  noteRow,
  numCell,
  textCell,
  zebra,
} from "@/lib/reports/xlsx-style";

/**
 * Rekap kajian untuk Div. Kaderisasi: tiga sheet sesuai tiga blok halaman.
 * Tanpa nomor WA — berkas ini diteruskan ke grup.
 */
export type IsiRekapXlsx = {
  rekap: RekapSesi[];
  kolomQism: string[];
  sebaran: BarisSebaran[];
  orang: OrangBerulang[];
  pivot: { slug: string; perSesi: number[]; totalKehadiran: number }[];
  namaGolongan: Map<string, string>;
};

/** Kolom harus ada lebih dulu supaya autoWidth() punya yang ditelusuri. */
function siapkanKolom(ws: ExcelJS.Worksheet, jumlah: number) {
  ws.columns = Array.from({ length: jumlah }, () => ({ width: 10 }));
}

export function bangunRekapKajianXlsx(v: IsiRekapXlsx): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  // Sheet 1 — per sesi (poin 1–7 Kaderisasi)
  const ws1 = wb.addWorksheet("Per sesi");
  // Kolom prodi diberi awalan "Prodi:" — tanpa itu, prodi "Tak diketahui"
  // bertabrakan label dengan kolom gender "Tak diketahui" di sebelahnya dan
  // pembaca tidak bisa tahu mana yang mana.
  const h1 = [
    "Tanggal", "Kajian", "Ustadz", "Tema / kitab", "Total", "Ikhwan", "Akhwat", "Gender tak diketahui",
    ...v.kolomQism.map((q) => `Prodi: ${q}`),
    "Wajib", "Hadir wajib", "Mangkir", "Hadir tambahan",
  ];
  siapkanKolom(ws1, h1.length);
  headerRow(ws1, 1, h1);
  v.rekap.forEach((r, i) => {
    const row = i + 2;
    const q = new Map(r.perQism.map((x) => [x.qism, x.jumlah]));
    textCell(ws1.getCell(row, 1), r.tanggal);
    textCell(ws1.getCell(row, 2), r.nama);
    textCell(ws1.getCell(row, 3), r.pemateri);
    textCell(ws1.getCell(row, 4), r.tema);
    [r.total, r.ikhwan, r.akhwat, r.genderTakDiketahui].forEach((n, j) => numCell(ws1.getCell(row, 5 + j), n));
    v.kolomQism.forEach((k, j) => numCell(ws1.getCell(row, 9 + j), q.get(k) ?? 0));
    const base = 9 + v.kolomQism.length;
    [r.wajib, r.hadirWajib, r.mangkir, r.hadirTambahan].forEach((n, j) => numCell(ws1.getCell(row, base + j), n));
  });
  freezeHeader(ws1, 1, { xSplit: 2 });
  autoFilter(ws1, 1, h1.length, v.rekap.length + 1);
  zebra(ws1, 2, v.rekap.length + 1, h1.length);
  noteRow(
    ws1,
    v.rekap.length + 3,
    h1.length,
    "Total = ikhwan + akhwat + tak diketahui. Kolom prodi memakai qism pada profil orang; sebagian di antaranya hasil pencocokan nama, bukan deklarasi orangnya sendiri.",
  );
  autoWidth(ws1);

  // Sheet 2 — nama berulang + sebaran frekuensi per gender
  const ws2 = wb.addWorksheet("Nama berulang");
  const h2 = ["Nama", "I/A", "Jumlah sesi", ...v.rekap.map((r) => r.tanggal)];
  siapkanKolom(ws2, Math.max(h2.length, 4));
  headerRow(ws2, 1, h2);
  v.orang.forEach((o, i) => {
    const row = i + 2;
    textCell(ws2.getCell(row, 1), o.nama);
    textCell(ws2.getCell(row, 2), o.gender === "P" ? "Akhwat" : o.gender === "L" ? "Ikhwan" : null);
    numCell(ws2.getCell(row, 3), o.jumlahSesi);
    v.rekap.forEach((r, j) => textCell(ws2.getCell(row, 4 + j), o.acaraIds.includes(r.acaraId) ? "v" : null));
  });
  const mulaiSebaran = v.orang.length + 4;
  headerRow(ws2, mulaiSebaran, ["Hadir berapa kali", "Orang", "Ikhwan", "Akhwat"]);
  v.sebaran.forEach((s, i) => {
    const row = mulaiSebaran + 1 + i;
    numCell(ws2.getCell(row, 1), s.kali);
    numCell(ws2.getCell(row, 2), s.total);
    numCell(ws2.getCell(row, 3), s.ikhwan);
    numCell(ws2.getCell(row, 4), s.akhwat);
  });
  freezeHeader(ws2, 1, { xSplit: 1 });
  autoWidth(ws2);

  // Sheet 3 — golongan x sesi
  const ws3 = wb.addWorksheet("Per golongan");
  const h3 = ["Golongan", ...v.rekap.map((r) => r.tanggal), "Total kehadiran"];
  siapkanKolom(ws3, h3.length);
  headerRow(ws3, 1, h3);
  v.pivot.forEach((p, i) => {
    const row = i + 2;
    textCell(ws3.getCell(row, 1), v.namaGolongan.get(p.slug) ?? p.slug);
    p.perSesi.forEach((n, j) => numCell(ws3.getCell(row, 2 + j), n));
    numCell(ws3.getCell(row, 2 + p.perSesi.length), p.totalKehadiran);
  });
  freezeHeader(ws3, 1, { xSplit: 1 });
  autoWidth(ws3);

  return wb;
}
