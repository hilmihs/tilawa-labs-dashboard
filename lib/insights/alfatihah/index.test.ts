/**
 * Pin the pure surface of the al-Fatihah insight.
 *
 * This module feeds a published number (scorecard KPI C312), so the point of
 * these tests is not coverage but *arrest*: a refactor may reshape the code, it
 * may not quietly move a count. Everything here is hand-built `Rec` fixtures —
 * no network, no DB. `getAsesmenAlfatihah` does IO and is deliberately untested.
 */
import { describe, expect, it } from "vitest";
import {
  BANDS,
  bandOf,
  buildInsight,
  matchesFlag,
  presets,
  resolvePreset,
  SCORE_BAIK_MIN,
  type AsesmenInsight,
  type Rec,
} from "./index";

/** Fixed "today" — never call todayJakarta() here, the assertions must not drift. */
const TODAY = "2026-09-07";

/**
 * Which band a score falls in TODAY. Kept as a flat table precisely so the
 * intended fix is a one-column edit, not a test rewrite.
 *
 * KNOWN-WRONG BOUNDARY: the 7|8 split ("baik" ends at 7, "sangat-baik" starts
 * at 8) draws a line the instrument does not draw — upstream titles levels 6, 7
 * AND 8 all "Baik", and 25 of 51 pemeriksa never award a 7 at all. The planned
 * correction is three bands (1-2 / 3-5 / 6-10); when that lands, edit the keys
 * in this table and the band-shape test below still holds.
 */
const BAND_OF_SCORE: Array<[score: number, bandKey: string]> = [
  [1, "bimbingan"],
  [2, "bimbingan"],
  [3, "belum"],
  [4, "belum"],
  [5, "belum"],
  [6, "baik"],
  [7, "baik"],
  [8, "baik"],
  [9, "baik"],
  [10, "baik"],
];

function rec(over: Partial<Rec> = {}): Rec {
  return {
    uuid: "u-1",
    kode_unik: null,
    kegiatan: "HITS Juni 26",
    divisi: null,
    pemeriksa: "Ustadz A",
    asal_halaqah: "Ikhwan",
    rekomendasi_program: "Tahsin Lanjutan",
    is_dummy: false,
    created_at: "2026-06-10T03:00:00Z", // 10.00 WIB
    score: 6,
    namaLengkap: "Fulan",
    scoreLabel: null,
    ...over,
  };
}

type Opts = Parameters<typeof buildInsight>[1];

const opts = (over: Partial<Opts> = {}): Opts => ({
  preset: resolvePreset("semua", TODAY),
  gender: null,
  q: null,
  flag: null,
  ...over,
});

const bandCount = (i: AsesmenInsight, key: string) =>
  i.bands.find((b) => b.band.key === key)?.count ?? 0;

// ── presets ────────────────────────────────────────────────────────────────
describe("presets + resolvePreset", () => {
  it("90h adalah jendela hari ini-89 s.d. hari ini (90 hari inklusif)", () => {
    const p = presets(TODAY).find((x) => x.key === "90h")!;
    expect(p.start).toBe("2026-06-10");
    expect(p.end).toBe(TODAY);
  });

  it("tahun mulai 1 Januari tahun berjalan", () => {
    const p = presets(TODAY).find((x) => x.key === "tahun")!;
    expect(p.start).toBe("2026-01-01");
    expect(p.end).toBe(TODAY);
  });

  it("semua memakai lantai tetap 2015-01-01, bukan probe rekor terlama", () => {
    const p = presets(TODAY).find((x) => x.key === "semua")!;
    expect(p.start).toBe("2015-01-01");
    expect(p.end).toBe(TODAY);
  });

  it("kunci tak dikenal atau kosong jatuh ke tahun ini", () => {
    expect(resolvePreset(undefined, TODAY).key).toBe("tahun");
    expect(resolvePreset("ngawur", TODAY).key).toBe("tahun");
    expect(resolvePreset("", TODAY).key).toBe("tahun");
    expect(resolvePreset("90h", TODAY).key).toBe("90h");
  });
});

// ── bands ──────────────────────────────────────────────────────────────────
describe("bandOf + BANDS", () => {
  it.each(BAND_OF_SCORE)("skor %i masuk band %s", (score, key) => {
    expect(bandOf(score)?.key).toBe(key);
  });

  it("band 'baik' mulai tepat di SCORE_BAIK_MIN — keduanya wajib bergerak bersama", () => {
    // Deliberate coupling, not a leak: the band chips are the legend for the
    // "Bacaan baik ≥ N" KPI, and that KPI is the same rule that feeds scorecard
    // C312. If someone moves the threshold, the legend must follow or the page
    // colours a boundary the headline does not use.
    const baik = BANDS.find((b) => b.key === "baik");
    expect(baik?.min).toBe(SCORE_BAIK_MIN);
    expect(baik?.max).toBe(10);
  });

  it("BANDS menutup 1..10 rapat: tanpa celah, tanpa tumpang tindih", () => {
    expect(BANDS[0].min).toBe(1);
    expect(BANDS[BANDS.length - 1].max).toBe(10);
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i].min).toBe(BANDS[i - 1].max + 1);
    }
  });

  it("skor di luar 1..10 tidak punya band — pemanggil harus jatuh ke neutral", () => {
    expect(bandOf(0)).toBeNull();
    expect(bandOf(11)).toBeNull();
    expect(bandOf(-1)).toBeNull();
  });
});

// ── matchesFlag ────────────────────────────────────────────────────────────
describe("matchesFlag", () => {
  it("tanpa-nama: null, string kosong, dan spasi semuanya dianggap tanpa nama", () => {
    expect(matchesFlag(rec({ namaLengkap: null }), "tanpa-nama")).toBe(true);
    expect(matchesFlag(rec({ namaLengkap: "" }), "tanpa-nama")).toBe(true);
    expect(matchesFlag(rec({ namaLengkap: "   " }), "tanpa-nama")).toBe(true);
    expect(matchesFlag(rec({ namaLengkap: "Fulan" }), "tanpa-nama")).toBe(false);
  });

  it("perlu-bimbingan adalah skor <= 2 — batasnya 2 masuk, 3 tidak", () => {
    expect(matchesFlag(rec({ score: 1 }), "perlu-bimbingan")).toBe(true);
    expect(matchesFlag(rec({ score: 2 }), "perlu-bimbingan")).toBe(true);
    expect(matchesFlag(rec({ score: 3 }), "perlu-bimbingan")).toBe(false);
    expect(matchesFlag(rec({ score: 10 }), "perlu-bimbingan")).toBe(false);
  });

  it("skor tak terbaca TIDAK ditandai perlu-bimbingan (fallback 99, bukan 0)", () => {
    // Sengaja dipin: baris rusak lebih baik luput dari daftar bimbingan
    // daripada memalsukan seorang peserta yang butuh bimbingan.
    expect(matchesFlag(rec({ score: null as unknown as number }), "perlu-bimbingan")).toBe(false);
    expect(matchesFlag(rec({ score: Number.NaN }), "perlu-bimbingan")).toBe(false);
  });

  it("tanpa-rekomendasi: string kosong dihitung TIDAK ada, sama seperti null", () => {
    expect(matchesFlag(rec({ rekomendasi_program: null }), "tanpa-rekomendasi")).toBe(true);
    expect(matchesFlag(rec({ rekomendasi_program: "" }), "tanpa-rekomendasi")).toBe(true);
    expect(matchesFlag(rec({ rekomendasi_program: "   " }), "tanpa-rekomendasi")).toBe(true);
    expect(matchesFlag(rec({ rekomendasi_program: "Tahsin" }), "tanpa-rekomendasi")).toBe(false);
  });
});

// ── peserta unik ───────────────────────────────────────────────────────────
describe("buildInsight — hitung peserta unik", () => {
  /**
   * ATURAN INI YANG MENYUAPI KPI C312 (scorecard "Jumlah Peserta Assessment
   * Al-Fatihah"): nama berbeda kapitalisasi/spasi = satu orang, sedangkan
   * SETIAP baris tanpa nama dihitung satu orang tersendiri. Upstream tidak
   * memberi user id, jadi baris tanpa nama tak bisa digabung — dan tidak boleh
   * runtuh jadi satu.
   */
  const rows = [
    rec({ uuid: "a", namaLengkap: "Fulan" }),
    rec({ uuid: "b", namaLengkap: "fulan" }),
    rec({ uuid: "c", namaLengkap: "  FULAN  " }),
    rec({ uuid: "d", namaLengkap: "Fulanah" }),
    rec({ uuid: "e", namaLengkap: null }),
    rec({ uuid: "f", namaLengkap: "" }),
    rec({ uuid: "g", namaLengkap: "   " }),
  ];

  it("2 nama unik + 3 baris tanpa nama = 5 peserta dari 7 evaluasi", () => {
    const i = buildInsight(rows, opts());
    expect(i.totals.evaluations).toBe(7);
    expect(i.totals.participants).toBe(5);
  });

  it("baris tanpa nama tidak pernah runtuh jadi satu", () => {
    const anon = [rec({ namaLengkap: null }), rec({ namaLengkap: null }), rec({ namaLengkap: "" })];
    expect(buildInsight(anon, opts()).totals.participants).toBe(3);
  });

  it("flags.tanpaNama menghitung ketiga baris tanpa nama itu", () => {
    expect(buildInsight(rows, opts()).flags.tanpaNama).toBe(3);
  });
});

// ── penyebut jujur ─────────────────────────────────────────────────────────
describe("buildInsight — windowEvaluations sebagai penyebut jujur", () => {
  const rows = [
    rec({ uuid: "a", asal_halaqah: "Ikhwan" }),
    rec({ uuid: "b", asal_halaqah: "Ikhwan" }),
    rec({ uuid: "c", asal_halaqah: "Akhwat" }),
    rec({ uuid: "d", asal_halaqah: "Akhwat", is_dummy: true }),
  ];

  it("windowEvaluations dihitung SEBELUM filter gender, totals.evaluations sesudah", () => {
    const i = buildInsight(rows, opts({ gender: "Ikhwan" }));
    expect(i.windowEvaluations).toBe(3); // non-dummy di jendela
    expect(i.totals.evaluations).toBe(2); // setelah filter
  });

  it("filter q (teks kegiatan) juga tidak menggerus windowEvaluations", () => {
    const i = buildInsight(
      [rec({ kegiatan: "HITS Juni 26" }), rec({ kegiatan: "Half Deen Series 2026" })],
      opts({ q: "half deen" }),
    );
    expect(i.windowEvaluations).toBe(2);
    expect(i.totals.evaluations).toBe(1);
  });

  it("tanpa filter, keduanya sama", () => {
    const i = buildInsight(rows, opts());
    expect(i.windowEvaluations).toBe(3);
    expect(i.totals.evaluations).toBe(3);
  });
});

// ── is_dummy ───────────────────────────────────────────────────────────────
describe("buildInsight — is_dummy disaring ulang di sisi kita", () => {
  it("baris dummy tidak masuk hitungan mana pun", () => {
    const i = buildInsight(
      [
        rec({ uuid: "asli", namaLengkap: "Fulan", score: 8 }),
        rec({
          uuid: "dummy",
          is_dummy: true,
          namaLengkap: "Dummy",
          score: 1,
          kegiatan: "Kegiatan Dummy",
          pemeriksa: "Ustadz Z",
          rekomendasi_program: null,
          created_at: "2026-07-15T03:00:00Z",
        }),
      ],
      opts(),
    );
    expect(i.totals.evaluations).toBe(1);
    expect(i.totals.participants).toBe(1);
    expect(i.totals.kegiatan).toBe(1);
    expect(i.totals.days).toBe(1);
    expect(i.totals.pemeriksa).toBe(1);
    expect(i.totals.avgScore).toBe(8);
    expect(i.flags.perluBimbingan).toBe(0);
    expect(i.flags.tanpaRekomendasi).toBe(0);
    expect(i.windowEvaluations).toBe(1);
    expect(i.byKegiatan).toHaveLength(1);
    expect(i.byMonth).toHaveLength(1);
    expect(i.recent.map((r) => r.uuid)).toEqual(["asli"]);
    expect(bandCount(i, bandOf(1)!.key)).toBe(0);
  });
});

// ── band rows di dalam insight ─────────────────────────────────────────────
describe("buildInsight — sebaran band", () => {
  it("setiap skor mendarat di baris band yang sama dengan bandOf", () => {
    const rows = BAND_OF_SCORE.map(([score]) => rec({ uuid: `s${score}`, score }));
    const i = buildInsight(rows, opts());
    for (const [score, key] of BAND_OF_SCORE) {
      expect(bandOf(score)!.key).toBe(key);
      expect(bandCount(i, key)).toBeGreaterThan(0);
    }
    const total = i.bands.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(rows.length);
  });

  it("levels memakai judul upstream bila ada, kalau tidak 'Level n'", () => {
    const i = buildInsight(
      [
        rec({ score: 6, scoreLabel: { title: "Level 6 - Baik" } }),
        rec({ score: 7, scoreLabel: null }),
      ],
      opts(),
    );
    expect(i.levels.map((l) => [l.score, l.title])).toEqual([
      [6, "Level 6 - Baik"],
      [7, "Level 7"],
    ]);
  });
});

// ── grouping ───────────────────────────────────────────────────────────────
describe("buildInsight — byKegiatan", () => {
  it("mengelompokkan tanpa peduli kapitalisasi, tapi memakai ejaan yang pertama terlihat", () => {
    const i = buildInsight(
      [
        rec({ uuid: "a", kegiatan: "HITS Juni 26" }),
        rec({ uuid: "b", kegiatan: "hits juni 26" }),
        rec({ uuid: "c", kegiatan: "HITS JUNI 26" }),
      ],
      opts(),
    );
    expect(i.byKegiatan).toHaveLength(1);
    expect(i.byKegiatan[0].kegiatan).toBe("HITS Juni 26");
    expect(i.byKegiatan[0].evaluations).toBe(3);
    expect(i.totals.kegiatan).toBe(1);
  });

  it("kegiatan kosong jadi satu kelompok '(tanpa kegiatan)', bukan hilang", () => {
    const i = buildInsight(
      [rec({ uuid: "a", kegiatan: null }), rec({ uuid: "b", kegiatan: "   " })],
      opts(),
    );
    expect(i.byKegiatan).toHaveLength(1);
    expect(i.byKegiatan[0].kegiatan).toBe("(tanpa kegiatan)");
    expect(i.byKegiatan[0].bucket).toBe("kolaborasi");
    // …but it is not a kegiatan, so it must not inflate the count. The row stays
    // (a miss never removes a row); the KPI counts only real labels.
    expect(i.totals.kegiatan).toBe(0);
  });

  it("diurutkan menurun berdasarkan jumlah evaluasi", () => {
    const i = buildInsight(
      [
        rec({ kegiatan: "Half Deen Series 2026" }),
        rec({ kegiatan: "HITS Juni 26" }),
        rec({ kegiatan: "HITS Juni 26" }),
      ],
      opts(),
    );
    expect(i.byKegiatan.map((k) => [k.kegiatan, k.evaluations])).toEqual([
      ["HITS Juni 26", 2],
      ["Half Deen Series 2026", 1],
    ]);
    expect(i.byKegiatan[0].bucket).toBe("hits");
    expect(i.byKegiatan[1].bucket).toBe("kolaborasi");
  });
});

describe("buildInsight — hari & bulan pakai kalender Asia/Jakarta", () => {
  it("baris setelah 17.00 UTC jatuh di hari Jakarta BERIKUTNYA", () => {
    const i = buildInsight(
      [
        rec({ uuid: "siang", created_at: "2026-06-30T10:00:00Z" }), // 30 Jun 17.00 WIB
        rec({ uuid: "malam", created_at: "2026-06-30T17:30:00Z" }), // 1 Jul 00.30 WIB
      ],
      opts(),
    );
    expect(i.totals.days).toBe(2);
    expect(i.recent.map((r) => [r.uuid, r.tanggal])).toEqual([
      ["siang", "2026-06-30"],
      ["malam", "2026-07-01"],
    ]);
  });

  it("pergantian hari itu juga memindahkan baris ke bulan berikutnya", () => {
    const i = buildInsight(
      [
        rec({ created_at: "2026-06-30T10:00:00Z" }),
        rec({ created_at: "2026-06-30T17:30:00Z" }),
      ],
      opts(),
    );
    // diurutkan terbaru dulu
    expect(i.byMonth.map((m) => [m.month, m.label, m.evaluations])).toEqual([
      ["2026-07", "Juli 2026", 1],
      ["2026-06", "Juni 2026", 1],
    ]);
  });

  it("created_at tak terbaca tidak menambah hari dan tidak masuk byMonth", () => {
    const i = buildInsight(
      [rec({ created_at: "2026-06-10T03:00:00Z" }), rec({ created_at: "" })],
      opts(),
    );
    expect(i.totals.evaluations).toBe(2);
    expect(i.totals.days).toBe(1);
    expect(i.byMonth).toHaveLength(1);
  });
});

// ── totals sisanya ─────────────────────────────────────────────────────────
describe("buildInsight — totals & flags lain", () => {
  it("baikPct null saat tak ada apa pun untuk dibagi, bukan 0 %", () => {
    const i = buildInsight([], opts());
    expect(i.totals.baikPct).toBeNull();
    expect(i.totals.avgScore).toBeNull();
    expect(i.totals.evaluations).toBe(0);
    expect(i.windowEvaluations).toBe(0);
  });

  it("baik adalah skor >= 6 (SCORE_BAIK_MIN)", () => {
    const i = buildInsight(
      [rec({ score: 5 }), rec({ score: 6 }), rec({ score: 10 })],
      opts(),
    );
    expect(i.totals.baik).toBe(2);
    expect(i.totals.baikPct).toBeCloseTo((2 / 3) * 100);
  });

  it("gender dibaca dari asal_halaqah dengan lipatan kapitalisasi", () => {
    const i = buildInsight(
      [
        rec({ asal_halaqah: "ikhwan" }),
        rec({ asal_halaqah: "Ikhwan" }),
        rec({ asal_halaqah: "AKHWAT" }),
        rec({ asal_halaqah: null }),
      ],
      opts(),
    );
    expect(i.byKegiatan[0].ikhwan).toBe(2);
    expect(i.byKegiatan[0].akhwat).toBe(1);
    expect(buildInsight([rec({ asal_halaqah: "ikhwan" })], opts({ gender: "Ikhwan" })).totals.evaluations).toBe(1);
  });

  it("flag hanya menyaring daftar terbaru, bukan totals", () => {
    const rows = [
      rec({ uuid: "a", namaLengkap: null }),
      rec({ uuid: "b", namaLengkap: "Fulan" }),
    ];
    const i = buildInsight(rows, opts({ flag: "tanpa-nama" }));
    expect(i.totals.evaluations).toBe(2);
    expect(i.flags.tanpaNama).toBe(1);
    expect(i.recent.map((r) => r.uuid)).toEqual(["a"]);
    expect(i.recentTruncated).toBe(0);
  });
});
