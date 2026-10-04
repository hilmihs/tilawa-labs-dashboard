/**
 * Workbook Hasil Ujian di memori (tanpa DB). Yang dijaga: tiga sheet selalu ada,
 * kolom periode ikut, dan status draft tertulis sebagai TEKS — simbol `*` di layar
 * hilang maknanya begitu berkas dicetak.
 */
import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { susunEvaluasi, type EvalMentah } from "@/lib/insights/evaluasi/maahir-view-model";
import type { HasilUjianLaporan } from "./hasil-ujian";
import { buildHasilUjianWorkbook } from "./hasil-ujian-xlsx";

function laporan(): HasilUjianLaporan {
  const m: EvalMentah = {
    halaqah: [{ id: "hits-regular:77", nama: "HITS 077 AKHWAT JUNI", gender: "akhwat", pengajarId: "wa:1", ambangUjian: 65 }],
    pengajar: [{ id: "wa:1", nama: "Ustadzah A" }],
    peserta: [
      { id: "hits-regular:1", nama: "Aisyah", gender: "akhwat", halaqahId: "hits-regular:77", aktif: true },
      { id: "hits-regular:2", nama: "Fatimah", gender: "akhwat", halaqahId: "hits-regular:77", aktif: true },
    ],
    sesi: [
      { id: "s1", halaqahId: "hits-regular:77", jenis: "qn", nomor: 1, tglJadwal: null, surat: null, status: "terkirim", dihapus: false, updatedAt: null, createdAt: "2026-09-05T03:00:00Z" },
      { id: "d1", halaqahId: "hits-regular:77", jenis: "pb", nomor: 1, tglJadwal: null, surat: null, status: "draft", dihapus: false, updatedAt: null, createdAt: "2026-09-06T03:00:00Z" },
    ],
    nilai: [
      { id: "n1", sesiId: "s1", pesertaId: "hits-regular:1", hadir: true, skor: 80, updatedAt: null },
      { id: "n2", sesiId: "d1", pesertaId: "hits-regular:2", hadir: true, skor: 70, updatedAt: null },
    ],
    rapot: [],
  };
  return {
    start: "2026-09-01",
    end: "2026-09-30",
    label: "Juni 2026",
    programName: "HITS Reguler (Batch Juni 2026)",
    maahir: { ...susunEvaluasi(m, { dari: "2026-09-01", sampai: "2026-09-30" }), syncedAt: new Date("2026-09-30T05:00:00Z"), kodePeserta: { 1: "M001" } },
    ujianTilawah: [],
  };
}

const teksBaris = (ws: ExcelJS.Worksheet, r: number) =>
  (ws.getRow(r).values as unknown[]).filter((v) => v != null).map(String);

function cariBaris(ws: ExcelJS.Worksheet, isi: string): number {
  for (let r = 1; r <= ws.rowCount; r++) if (teksBaris(ws, r).includes(isi)) return r;
  return -1;
}

describe("buildHasilUjianWorkbook", () => {
  it("selalu tiga sheet dengan nama tetap", () => {
    const wb = buildHasilUjianWorkbook(laporan());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Per halaqah", "Per peserta"]);
  });

  it("sheet peserta memuat kolom periode, kode peserta, dan status draft sebagai teks", () => {
    const ws = buildHasilUjianWorkbook(laporan()).getWorksheet("Per peserta")!;
    const head = cariBaris(ws, "Nama");
    expect(teksBaris(ws, head)).toEqual(expect.arrayContaining(["Kode", "Rata² QN", "Sesi di periode", "Status nilai"]));
    const aisyah = teksBaris(ws, cariBaris(ws, "Aisyah"));
    expect(aisyah).toEqual(expect.arrayContaining(["M001", "final"]));
    const fatimah = teksBaris(ws, cariBaris(ws, "Fatimah"));
    expect(fatimah).toContain("draft");
  });

  it("sheet halaqah memuat jumlah sesi di periode", () => {
    const ws = buildHasilUjianWorkbook(laporan()).getWorksheet("Per halaqah")!;
    const head = teksBaris(ws, cariBaris(ws, "Halaqah"));
    const baris = ws.getRow(cariBaris(ws, "HITS 077 AKHWAT JUNI"));
    const kol = head.indexOf("Sesi di periode") + 1;
    expect(kol).toBeGreaterThan(0);
    expect(baris.getCell(kol).value).toBe(2);
  });
});
