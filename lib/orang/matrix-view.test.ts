import { describe, expect, it } from "vitest";
import type { MaahirMatrixSkor } from "@/lib/maahir/types";
import { formatSkor, labelBulan, pilihPerBulan, susunMatrix, toneSkor, MAKS_BULAN } from "./matrix-view";

function skor(ym: string, over: Partial<MaahirMatrixSkor> = {}): MaahirMatrixSkor {
  return {
    id: `${ym}-${over.pengajar_id ?? "p"}`,
    pengajar_id: "p",
    year_month: ym,
    skor_bacaan: null,
    skor_hafalan: null,
    skor_tajwid: null,
    skor_kehadiran_maahir: 3,
    skor_kehadiran_tibyan: null,
    skor_kehadiran_muallim: null,
    rata_rata_hard_skill: 3,
    skor_metode_pengajaran: null,
    skor_kepatuhan_silabus: 4,
    skor_manajemen_halaqah: null,
    skor_evaluasi_penguasaan: null,
    rata_rata_pedagogis: 4,
    skor_kedisiplinan_waktu: 4,
    skor_komitmen_jadwal: null,
    skor_tanggung_jawab: null,
    skor_kepatuhan_sop: null,
    rata_rata_soft_skill: 4,
    rata_rata_keseluruhan: 3.67,
    ranking: 12,
    total_teguran_bulan: 0,
    total_teguran_kumulatif: 1,
    finalized_at: null,
    updated_at: "2026-09-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

describe("susunMatrix", () => {
  it("returns null without rows", () => {
    expect(susunMatrix([])).toBeNull();
  });

  it("orders months old→new and keeps only the last MAKS_BULAN", () => {
    const rows = ["2026-01", "2026-03", "2026-02", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map((m) =>
      skor(m),
    );
    const m = susunMatrix(rows)!;
    expect(m.bulan).toHaveLength(MAKS_BULAN);
    expect(m.bulan[0]).toBe("2026-03");
    expect(m.bulan.at(-1)).toBe("2026-08");
  });

  it("hides components empty in every month and lists them once", () => {
    const m = susunMatrix([skor("2026-08"), skor("2026-07", { skor_tajwid: 2 })])!;
    const label = m.baris.map((b) => b.label);
    expect(label).toContain("Tajwid");
    expect(label).not.toContain("Hafalan");
    expect(m.belumPernah).toContain("Hafalan");
    expect(m.belumPernah).not.toContain("Tajwid");
    // group averages and the total always show, even when empty
    expect(label.filter((l) => ["Hard skill", "Pedagogis", "Soft skill", "Keseluruhan"].includes(l))).toHaveLength(4);
  });

  it("reads the latest month's ranking against that month's ranked count", () => {
    const m = susunMatrix([skor("2026-07", { ranking: 30 }), skor("2026-08", { ranking: 12 })], { "2026-08": 166 })!;
    expect(m.terakhir).toMatchObject({ bulan: "2026-08", ranking: 12, dariRanking: 166, keseluruhan: 3.67 });
  });
});

describe("pilihPerBulan", () => {
  it("keeps the most recently updated row when two accounts share a month", () => {
    const lama = skor("2026-08", { pengajar_id: "a", rata_rata_keseluruhan: 1, updated_at: "2026-08-02T00:00:00Z" });
    const baru = skor("2026-08", { pengajar_id: "b", rata_rata_keseluruhan: 3, updated_at: "2026-08-20T00:00:00Z" });
    expect(pilihPerBulan([baru, lama])).toEqual([baru]);
  });
});

describe("format", () => {
  it("colours by rubric band, null stays neutral", () => {
    expect([4, 3, 2, 1, 0, null].map(toneSkor)).toEqual(["success", "teal", "warning", "danger", "danger", "neutral"]);
  });
  it("labels months and scores in Indonesian", () => {
    expect(labelBulan("2026-08")).toBe("Agu 26");
    expect(formatSkor(2.333)).toBe("2,33");
    expect(formatSkor(3)).toBe("3");
    expect(formatSkor(null)).toBe("—");
  });
});
