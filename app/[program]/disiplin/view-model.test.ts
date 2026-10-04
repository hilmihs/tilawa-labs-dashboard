/**
 * Checked against the real 3 Sep 2026 capture in `lib/maahir/__fixtures__`, not
 * a hand-written sample: the point of these tests is that the mapping still
 * matches what Maahir actually sends, and a hand-made payload can only prove the
 * mapping matches itself.
 *
 * No network, no DB — `buildDisiplinView` is pure and the batch membership is
 * passed in as a plain Set.
 */
import { describe, expect, it } from "vitest";
import fixture from "@/lib/maahir/__fixtures__/hits-disiplin.json";
import type { MaahirHitsDisiplinPayload } from "@/lib/maahir/types";
import { buildDisiplinView, pctText, tanggalPendek } from "./view-model";

const payload = (fixture as { data: MaahirHitsDisiplinPayload }).data;
const counts = payload.counts;

/** Every halaqah the payload mentions — i.e. "one batch that happens to be all
 *  of HITS", which is the only way to compare against upstream's own totals. */
const SEMUA_HALAQAH = new Set(
  [...payload.ranked, ...payload.noData].flatMap((r) => r.halaqahIds),
);

describe("buildDisiplinView — dibandingkan dengan hitungan upstream sendiri", () => {
  const view = buildDisiplinView(payload, SEMUA_HALAQAH);

  it("mempertahankan seluruh pengajar saat batch mencakup semua halaqah", () => {
    expect(view.ranked).toHaveLength(payload.ranked.length);
    expect(view.noData).toHaveLength(payload.noData.length);
    expect(view.ringkas.pengajar).toBe(counts.total);
  });

  it("mereproduksi counts.bermasalah upstream", () => {
    expect(view.ringkas.bermasalah).toBe(counts.bermasalah);
  });

  it("mereproduksi counts.obsLengkap / obsBelum upstream", () => {
    expect(view.ringkas.obsLengkap).toBe(counts.obsLengkap);
    expect(view.ringkas.obsBelum).toBe(counts.obsBelum);
    expect(view.ringkas.obsLengkap + view.ringkas.obsBelum).toBe(counts.total);
  });

  it("menghitung seluruh insiden dan yang belum diputus", () => {
    const semua = Object.values(payload.insidenByPengajar).flat();
    expect(view.ringkas.insidenTotal).toBe(semua.length);
    expect(view.ringkas.insidenTerbuka).toBe(
      semua.filter((i) => i.status !== "diputus").length,
    );
    // Ada tiga status di tangkapan ini; kalau upstream menambah status baru,
    // "terbuka" tidak boleh diam-diam berubah arti.
    expect(view.ringkas.insidenTerbuka).toBeLessThan(view.ringkas.insidenTotal);
  });
});

describe("penyaringan ke batch", () => {
  it("hanya menyisakan pengajar yang punya halaqah di batch", () => {
    const target = payload.ranked[0];
    const view = buildDisiplinView(payload, new Set(target.halaqahIds));
    expect(view.ranked.map((r) => r.pengajarId)).toContain(target.pengajarId);
    // 134 pengajar ranked tidak boleh ikut terbawa hanya karena satu batch dibuka.
    expect(view.ranked.length).toBeLessThan(payload.ranked.length);
  });

  it("mengembalikan view kosong saat daftar halaqah batch tidak diketahui", () => {
    // "kami tidak tahu halaqah Anda" TIDAK BOLEH jatuh ke "tampilkan semuanya".
    const view = buildDisiplinView(payload, new Set());
    expect(view.ranked).toHaveLength(0);
    expect(view.noData).toHaveLength(0);
    expect(view.ringkas.pengajar).toBe(0);
  });

  it("menandai halaqah pengajar yang berada di luar batch", () => {
    // Pengajar dengan >1 halaqah, disaring seolah hanya halaqah pertamanya milik batch.
    const target = payload.ranked.find((r) => r.halaqahIds.length > 1);
    expect(target).toBeDefined();
    const view = buildDisiplinView(payload, new Set([target!.halaqahIds[0]]));
    const row = view.ranked.find((r) => r.pengajarId === target!.pengajarId)!;
    expect(row.halaqahDiBatch).toBe(1);
    expect(row.halaqahLuarBatch).toBe(target!.halaqahIds.length - 1);
    expect(view.campuran).toBeGreaterThan(0);
  });

  it("menyaring insiden per halaqah dan tetap menghitung yang di luar batch", () => {
    const [pengajarId, insiden] = Object.entries(payload.insidenByPengajar).find(
      ([id, list]) =>
        list.length > 1 &&
        new Set(list.map((i) => i.halaqahId)).size > 1 &&
        payload.ranked.some((r) => r.pengajarId === id),
    )!;
    const dipilih = insiden[0].halaqahId;
    const pengajar = payload.ranked.find((r) => r.pengajarId === pengajarId)!;
    const view = buildDisiplinView(payload, new Set([...pengajar.halaqahIds, dipilih]));
    const row = view.ranked.find((r) => r.pengajarId === pengajarId)!;
    const diBatch = insiden.filter((i) => row.insiden.some((x) => x.halaqahId === i.halaqahId));
    expect(row.insiden.every((i) => i.halaqahId === dipilih || pengajar.halaqahIds.includes(i.halaqahId))).toBe(true);
    expect(row.insiden.length + row.insidenLuarBatch).toBe(insiden.length);
    expect(diBatch.length).toBeGreaterThan(0);
  });
});

describe("bucket noData", () => {
  const view = buildDisiplinView(payload, SEMUA_HALAQAH);

  it("tidak pernah dicampur ke tabel peringkat", () => {
    const rankedIds = new Set(view.ranked.map((r) => r.pengajarId));
    expect(view.noData.some((r) => rankedIds.has(r.pengajarId))).toBe(false);
  });

  it("membiarkan persentasenya null, bukan 0", () => {
    for (const r of view.noData) {
      expect(r.pctKbbs).toBeNull();
      expect(r.pctOnTime).toBeNull();
      expect(r.pctStabil).toBeNull();
      expect(r.rank).toBeNull();
    }
    // Dan bucket ini memang tidak kosong di tangkapan asli — kalau jadi kosong,
    // asumsi "tanpa data itu nyata" perlu diperiksa ulang.
    expect(view.noData.length).toBeGreaterThan(0);
  });
});

describe("daftar laporan harian yang belum masuk", () => {
  const view = buildDisiplinView(payload, SEMUA_HALAQAH);

  it("hanya memuat pertemuan berstatus belum, non-libur", () => {
    const semuaPertemuan = Object.values(payload.cakupanByPengajar).flatMap((c) => c.pertemuan);
    const harusnya = semuaPertemuan.filter((p) => p.status === "belum" && !p.libur).length;
    const nyata = [...view.ranked, ...view.noData].reduce((n, r) => n + r.laporanBelum.length, 0);
    expect(nyata).toBe(harusnya);
    // `pragenerate` tidak boleh ikut: pertemuannya mendahului pembuatan kaldik,
    // jadi tak seorang pun pernah diminta mengisinya.
    expect(semuaPertemuan.some((p) => p.status === "pragenerate")).toBe(true);
  });
});

describe("format", () => {
  it("tanggalPendek tidak menggeser tanggal (bukan lewat Date)", () => {
    expect(tanggalPendek("2026-08-01")).toBe("1 Agu");
    expect(tanggalPendek("2026-09-01T00:05:58.134Z")).toBe("1 Sep");
    expect(tanggalPendek("bukan tanggal")).toBe("bukan tanggal");
  });

  it("pctText memakai em dash untuk null, bukan 0%", () => {
    expect(pctText(null)).toBe("—");
    expect(pctText(0)).toBe("0%");
    expect(pctText(81.6)).toBe("82%");
  });
});
