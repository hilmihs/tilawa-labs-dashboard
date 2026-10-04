/**
 * Diuji terhadap respons ASLI `rekap/tibyan` yang ditangkap 3 Sep 2026, bukan
 * terhadap objek karangan: dua kelas di tangkapan itu ber-`persen: null`, dan
 * justru kasus itulah yang paling gampang salah dirender jadi 0%.
 *
 * Catatan: `vitest.config.ts` hanya meng-include `lib/**` , jadi berkas ini
 * dijalankan dengan config sendiri:
 *   pnpm vitest run --config <config yang include app/**>
 * (config repo tidak diubah — bukan milik agen ini).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MaahirRekapEnvelope, MaahirTibyanPayload } from "@/lib/maahir/types";
import { periodLabel } from "@/lib/maahir/rekap";
import {
  distribusiRows,
  fetchedLabel,
  formatTanggal,
  perhatianAnggotaRows,
  perhatianKelasRows,
  rankingRows,
  trendChart,
} from "./view-model";

const fx = JSON.parse(
  readFileSync(
    join(__dirname, "../../../lib/maahir/__fixtures__/tibyan.json"),
    "utf8",
  ),
) as MaahirRekapEnvelope<MaahirTibyanPayload>;

describe("ranking kelas", () => {
  const rows = rankingRows(fx.data.ranking);

  it("mempertahankan semua kelas", () => {
    expect(rows).toHaveLength(fx.data.ranking.length);
    expect(rows).toHaveLength(22);
  });

  it("mengurutkan persen menurun", () => {
    const scored = rows.filter((r) => r.persen != null).map((r) => r.persen as number);
    expect(scored).toEqual([...scored].sort((a, b) => b - a));
    expect(scored[0]).toBe(100);
  });

  it("menaruh kelas tanpa sesi di bawah TANPA nomor peringkat", () => {
    const tanpaSesi = rows.filter((r) => r.persen == null);
    expect(tanpaSesi).toHaveLength(2);
    // Bukan 0, bukan peringkat 21/22 — memang belum ada sesinya.
    for (const r of tanpaSesi) expect(r.peringkat).toBeNull();
    expect(rows.slice(-2).every((r) => r.persen == null)).toBe(true);
  });

  it("menomori hanya kelas yang punya angka, mulai dari 1", () => {
    const nomor = rows.filter((r) => r.peringkat != null).map((r) => r.peringkat);
    expect(nomor).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe("distribusi", () => {
  it("menjumlahkan kelima kode dan membagi porsinya", () => {
    const { rows, total } = distribusiRows(fx.data.distribusi);
    expect(total).toBe(355 + 128 + 22 + 16 + 5);
    expect(rows.map((r) => r.kode)).toEqual(["H", "T", "I", "S", "A"]);
    const share = rows.reduce((n, r) => n + (r.share ?? 0), 0);
    expect(share).toBeCloseTo(100, 6);
  });

  it("share-nya null saat belum ada catatan sama sekali — bukan 0%", () => {
    const { rows, total } = distribusiRows({ H: 0, I: 0, S: 0, A: 0, T: 0 });
    expect(total).toBe(0);
    for (const r of rows) expect(r.share).toBeNull();
  });
});

describe("tren", () => {
  it("memetakan titik dan label dari tanggal payload", () => {
    const chart = trendChart(fx.data.trend);
    expect(chart).not.toBeNull();
    expect(chart!.points).toEqual([62, 70, 69, 67, 74]);
    expect(chart!.labels[0]).toBe("1 Agu");
    expect(chart!.min).toBe(62);
    expect(chart!.max).toBe(74);
    expect(chart!.akhir.tanggal).toBe("2026-08-29");
  });

  it("null kalau titiknya kurang dari dua", () => {
    expect(trendChart([])).toBeNull();
    expect(trendChart([{ tanggal: "2026-08-01", persen: 62 }])).toBeNull();
  });
});

describe("daftar perhatian", () => {
  it("mendahulukan alpa beruntun terpanjang", () => {
    const rows = perhatianAnggotaRows(fx.data.perhatian.anggota);
    expect(rows).toHaveLength(91);
    const alpha = rows.map((r) => r.alphaBeruntun);
    expect(alpha).toEqual([...alpha].sort((a, b) => b - a));
  });

  it("mendahulukan kelas dengan persen terendah", () => {
    const rows = perhatianKelasRows(fx.data.perhatian.kelas);
    expect(rows).toHaveLength(fx.data.kpi.kelasDiBawahTarget);
    const persen = rows.map((r) => r.persen);
    expect(persen).toEqual([...persen].sort((a, b) => a - b));
  });
});

describe("label", () => {
  it("periode dibaca dari meta, bukan dari nama bulan", () => {
    // meta: bulan 2026-08 tapi jendelanya 28 Jul → 27 Agu. Label yang berbunyi
    // "Agustus 2026" akan menyembunyikan jendela 28→27 milik Maahir.
    expect(periodLabel(fx.meta)).toBe("28 Jul – 27 Agu 2026");
  });

  it("tanggal diformat tanpa lewat Date (tidak mundur sehari)", () => {
    expect(formatTanggal("2026-08-01")).toBe("1 Agu 2026");
    expect(formatTanggal("2026-01-31", false)).toBe("31 Jan");
    expect(formatTanggal("bukan-tanggal")).toBe("bukan-tanggal");
  });

  it("terakhir ditarik memakai jam WIB", () => {
    // 2026-09-03T01:15Z = 08:15 WIB.
    expect(fetchedLabel(new Date("2026-09-03T01:15:00Z"))).toBe("08:15 WIB · 3 Sep 2026");
  });
});
