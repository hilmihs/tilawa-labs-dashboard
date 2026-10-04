/**
 * Diuji terhadap respons ASLI `rekap/sp` (3 Sep 2026). Tangkapan itu punya
 * persis kasus yang ingin dijaga: lima orang dengan `sp` ≠ `spKotor`, tiga di
 * antaranya sudah putih total (`sp: 0`) tapi tetap ada di daftar.
 *
 * Config repo hanya meng-include `lib/**`, jadi berkas ini dijalankan dengan
 * config terpisah (lihat catatan di app/[program]/tibyan/view-model.test.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { periodLabel } from "@/lib/maahir/rekap";
import type { MaahirRekapEnvelope, MaahirSpPayload } from "@/lib/maahir/types";
import { cutoffLabel, fetchedLabel, filterSpRows, formatTanggal, spRows } from "./view-model";

const fx = JSON.parse(
  readFileSync(join(__dirname, "../../../lib/maahir/__fixtures__/sp.json"), "utf8"),
) as MaahirRekapEnvelope<MaahirSpPayload>;

const rows = spRows(fx.data.list);

describe("daftar SP", () => {
  it("tidak membuang satu baris pun", () => {
    expect(rows).toHaveLength(82);
  });

  it("mengurutkan SP tertinggi lebih dulu", () => {
    const sp = rows.map((r) => r.sp);
    expect(sp).toEqual([...sp].sort((a, b) => b - a));
    expect(sp[0]).toBe(3);
  });

  it("menandai baris yang turun karena pemutihan", () => {
    const turun = rows.filter((r) => r.turunKarenaPemutihan);
    expect(turun).toHaveLength(5);
    for (const r of turun) {
      expect(r.sp).toBeLessThan(r.spKotor);
      expect(r.pemutihan).toBeGreaterThan(0);
    }
  });

  it("tetap menyimpan yang sudah putih total, bukan menghapusnya", () => {
    const putihTotal = rows.filter((r) => r.sp === 0);
    expect(putihTotal).toHaveLength(3);
    // spKotor-nya tetap ≥ 1: riwayatnya ada, statusnya yang bersih.
    for (const r of putihTotal) expect(r.spKotor).toBeGreaterThanOrEqual(1);
  });

  it("mengambil penetapan level tertinggi sebagai yang terakhir", () => {
    const fariez = rows.find((r) => r.name === "Fariez");
    expect(fariez?.penetapanTerakhir).toEqual({
      level: 3,
      tanggal: "2026-08-01",
      pemicu: "alpa",
    });
  });
});

describe("saringan", () => {
  it("SP per level menjumlah kembali ke summary upstream", () => {
    expect(filterSpRows(rows, "sp1")).toHaveLength(fx.data.summary.sp1);
    expect(filterSpRows(rows, "sp2")).toHaveLength(fx.data.summary.sp2);
    expect(filterSpRows(rows, "sp3")).toHaveLength(fx.data.summary.sp3);
    const aktif =
      fx.data.summary.sp1 + fx.data.summary.sp2 + fx.data.summary.sp3;
    expect(aktif).toBe(fx.data.summary.total);
    // …dan `total` upstream memang bukan jumlah baris: 3 yang sudah putih total
    // tetap ikut di list.
    expect(rows.length).toBe(aktif + 3);
  });

  it("saringan diputihkan memotong silang level, cocok dengan summary", () => {
    expect(filterSpRows(rows, "diputihkan")).toHaveLength(fx.data.summary.diputihkan);
  });

  it("semua = tanpa saring", () => {
    expect(filterSpRows(rows, "semua")).toHaveLength(rows.length);
  });
});

describe("label kumulatif", () => {
  it("menyebut mulai dan cutoff dari payload", () => {
    expect(fx.data.perBulan).toBe(false);
    expect(cutoffLabel(fx.data)).toBe("1 Jan 2026 – 3 Sep 2026");
  });

  it("meta rekap/sp tidak punya jendela periode — labelnya harus dari cutoff", () => {
    // periodLabel() sengaja null di sini; kalau suatu saat ia mengembalikan
    // nama bulan, layar SP akan tampak seperti angka bulanan. Itu yang dijaga.
    expect(periodLabel(fx.meta)).toBeNull();
    expect(fx.meta.cutoff).toBe("2026-09-03");
  });

  it("tanggal diformat tanpa lewat Date (cutoff tidak mundur sehari)", () => {
    expect(formatTanggal("2026-09-03")).toBe("3 Sep 2026");
    expect(formatTanggal("bukan-tanggal")).toBe("bukan-tanggal");
  });

  it("cap terakhir ditarik memakai jam WIB", () => {
    // 2026-09-03T01:15Z = 08:15 WIB.
    expect(fetchedLabel(new Date("2026-09-03T01:15:00Z"))).toBe("08:15 WIB · 3 Sep 2026");
  });
});
