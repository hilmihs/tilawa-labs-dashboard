/**
 * Pemilih bulan halaman Observasi.
 *
 * Diuji terpisah dari view-model karena inilah satu-satunya tempat di layar ini
 * yang menyentuh "hari ini", dan karena jendela di sini **bukan** jendela 28→27
 * milik rekap Maahir: `hits/keterangan-harian` entitas mentah dengan kolom
 * `tanggal`, jadi bulannya bulan kalender penuh. Dua definisi "bulan" yang
 * berbeda hidup berdampingan di aplikasi ini (docs/API-PUBLIC.md §9), dan
 * satu-satunya cara mereka tidak tertukar adalah masing-masing diuji.
 *
 * `bulanPilihan`/`resolveBulan` menerima `hariIni` supaya suite ini tidak
 * bergantung pada tanggal mesin.
 */
import { describe, expect, it } from "vitest";
import { bulanPilihan, labelBulan, resolveBulan } from "./queries";

describe("bulanPilihan", () => {
  it("enam bulan kalender terakhir, terbaru dulu", () => {
    expect(bulanPilihan("2026-09-07")).toEqual([
      "2026-09",
      "2026-08",
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
    ]);
  });

  it("menyeberangi pergantian tahun tanpa menghasilkan bulan 0 atau 13", () => {
    expect(bulanPilihan("2026-02-01")).toEqual([
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
      "2025-10",
      "2025-09",
    ]);
  });

  it("selalu dua digit — '2026-9' akan merusak perbandingan startsWith pada tanggal", () => {
    for (const b of bulanPilihan("2026-11-30")) expect(b).toMatch(/^\d{4}-\d{2}$/);
  });

  it("tanggal yang tidak masuk akal menghasilkan daftar kosong, bukan NaN", () => {
    expect(bulanPilihan("bukan-tanggal")).toEqual([]);
  });
});

describe("resolveBulan", () => {
  it("menghormati bulan yang diminta bila ada di daftar", () => {
    expect(resolveBulan("2026-07", "2026-09-07")).toBe("2026-07");
  });

  it("mengoreksi bulan di luar rentang ke bulan berjalan — URL lama tetap terbuka", () => {
    // Enam bulan ke belakang berhenti di 2026-04; Januari sudah lewat jendela.
    expect(resolveBulan("2026-01", "2026-09-07")).toBe("2026-09");
    expect(resolveBulan("kemarin", "2026-09-07")).toBe("2026-09");
    expect(resolveBulan(undefined, "2026-09-07")).toBe("2026-09");
  });
});

describe("labelBulan", () => {
  it("memakai nama bulan Indonesia", () => {
    expect(labelBulan("2026-09")).toBe("September 2026");
    expect(labelBulan("2026-01")).toBe("Januari 2026");
    expect(labelBulan("2025-12")).toBe("Desember 2025");
  });
});
