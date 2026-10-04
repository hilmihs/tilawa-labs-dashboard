/**
 * Rules, not readings.
 *
 * Nothing here pins a dataset total — the live figures in the module doc are
 * re-derived by `scripts/verify-asesmen-angka.ts`. What is pinned is the shape of
 * the refusals: that a duplicate spelling is *reported* and never *merged*, that a
 * threshold hides a column and not a person, that a test account stays counted, and
 * that a missing score travels all the way out as `null`. Those are the lines a
 * later "small cleanup" would quietly cross.
 */
import { describe, expect, it } from "vitest";
import {
  buildPemeriksa,
  detectSpellingClusters,
  type KegiatanGroupOf,
  type Rec,
} from "@/lib/insights/alfatihah/pemeriksa";

let seq = 0;

/** One assessment row. `score: null` is an explicit unreadable score, not a default. */
function rec(o: {
  nama?: string | null;
  at?: string;
  score?: number | null;
  pemeriksa?: string | null;
  kegiatan?: string | null;
  is_dummy?: boolean;
}): Rec {
  return {
    uuid: `u${++seq}`,
    kode_unik: null,
    kegiatan: o.kegiatan ?? null,
    divisi: null,
    pemeriksa: o.pemeriksa ?? null,
    asal_halaqah: null,
    rekomendasi_program: null,
    is_dummy: o.is_dummy ?? false,
    created_at: o.at ?? "2026-05-01T02:00:00Z",
    // The upstream type says `number`, but the readers guard with `Number.isFinite`
    // because it does not always send one.
    score: (o.score === null ? null : (o.score ?? 5)) as number,
    namaLengkap: o.nama === undefined ? `Peserta ${seq}` : o.nama,
  };
}

/**
 * Stand-in for `./kegiatan`'s resolver. The real one is deliberately not imported —
 * `groupOf` is a parameter precisely so these tests decide what "same event" means.
 */
const groupOf: KegiatanGroupOf = (k) => {
  const t = (k ?? "").trim().toLowerCase();
  if (t.startsWith("mei")) return { key: "alfatihah-mei", label: "Al-Fatihah Mei" };
  if (t.startsWith("ummi")) return { key: "rs-ummi", label: "RS Ummi" };
  return { key: "lain-lain", label: "Lainnya" };
};

const many = (n: number, f: (i: number) => Rec) => Array.from({ length: n }, (_, i) => f(i));
const row = (i: ReturnType<typeof buildPemeriksa>, nama: string) =>
  i.rows.find((r) => r.nama === nama);

describe("baseline campuran kegiatan, bukan rata-rata global", () => {
  // Mei: Adil 9,9,9 + Bakr 7            → rata-rata grup 8.5
  // Ummi: Adil 3 + Cahya 1 x7           → rata-rata grup 1.25
  // Adil sendiri: (9+9+9+3)/4           = 7.5
  // expected(Adil) = (3·8.5 + 1·1.25)/4 = 6.6875 → deviasi +0.8125
  // Rata-rata global = 44/12            ≈ 3.667 → perbandingan global +3.833
  const rows = [
    ...many(3, () => rec({ pemeriksa: "Ustadz Adil", kegiatan: "Mei 2026", score: 9 })),
    rec({ pemeriksa: "Ustadz Adil", kegiatan: "Ummi", score: 3 }),
    rec({ pemeriksa: "Ustadz Bakr", kegiatan: "Mei 2026", score: 7 }),
    ...many(7, () => rec({ pemeriksa: "Ustadz Cahya", kegiatan: "Ummi", score: 1 })),
  ];
  const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 4 });

  it("expected adalah campuran tertimbang kegiatan yang benar-benar dia pegang", () => {
    const adil = row(insight, "Ustadz Adil");
    expect(adil?.evaluations).toBe(4);
    expect(adil?.kegiatan).toBe(2);
    expect(adil?.meanScore).toBeCloseTo(7.5, 10);
    expect(adil?.expected).toBeCloseTo(6.6875, 10);
    expect(adil?.deviation).toBeCloseTo(0.8125, 10);
  });

  it("dan deviasinya BUKAN selisih terhadap rata-rata global", () => {
    const adil = row(insight, "Ustadz Adil");
    expect(insight.globalMean).toBeCloseTo(44 / 12, 10);
    const globalGap = 7.5 - (insight.globalMean ?? 0);
    expect(globalGap).toBeCloseTo(3.8333, 3);
    // Selisih global akan menyebut Adil pemurah ekstrem; padahal hampir seluruh
    // jaraknya cuma "dia ditugaskan di Mei, bukan di Ummi".
    expect(adil?.deviation).not.toBeCloseTo(globalGap, 2);
  });

  it("pemeriksa satu kegiatan diadu dengan rata-rata kegiatan itu sendiri", () => {
    const cahya = row(insight, "Ustadz Cahya");
    expect(cahya?.kegiatan).toBe(1);
    expect(cahya?.meanScore).toBe(1);
    expect(cahya?.expected).toBeCloseTo(1.25, 10);
    expect(cahya?.deviation).toBeCloseTo(-0.25, 10);
  });

  it("rata-rata grup dihitung dari SEMUA baris grup, bukan pemeriksa lain saja", () => {
    // Kalau baris Adil dikeluarkan dari rata-rata Mei, rata-ratanya jadi 7 dan
    // expected-nya berubah — pemeriksa tak boleh jadi baseline bagi dirinya sendiri.
    expect(row(insight, "Ustadz Adil")?.expected).not.toBeCloseTo((3 * 7 + 1) / 4, 6);
  });

  it("spread dibaca dari baris yang tampil saja", () => {
    expect(insight.spread).toEqual({ min: 1, max: 7.5 });
  });
});

describe("ambang minEvaluations", () => {
  const rows = [
    ...many(30, () => rec({ pemeriksa: "Ustadz Ramai", kegiatan: "Mei", score: 8 })),
    ...many(29, () => rec({ pemeriksa: "Ustadz Sepi", kegiatan: "Mei", score: 2 })),
  ];
  const insight = buildPemeriksa(rows, groupOf);

  it("default 30, dan yang kurang tidak muncul sebagai baris", () => {
    expect(insight.minEvaluations).toBe(30);
    expect(insight.rows.map((r) => r.nama)).toEqual(["Ustadz Ramai"]);
  });

  it("yang tersisih dihitung — absennya dilaporkan, bukan dihilangkan", () => {
    expect(insight.belowThreshold).toBe(1);
  });

  it("tapi angkanya tetap ikut membentuk rata-rata global dan rata-rata grup", () => {
    // 30·8 + 29·2 = 298 dari 59 baris. Kalau "Sepi" benar-benar dibuang, ini 8.
    expect(insight.globalMean).toBeCloseTo(298 / 59, 10);
    // Baseline Ramai memuat baris Sepi, jadi deviasinya positif besar.
    expect(row(insight, "Ustadz Ramai")?.expected).toBeCloseTo(298 / 59, 10);
    expect(row(insight, "Ustadz Ramai")?.deviation).toBeGreaterThan(2);
  });

  it("ambang bisa diturunkan tanpa mengubah aritmetika siapa pun", () => {
    const longgar = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });
    expect(longgar.rows).toHaveLength(2);
    expect(longgar.belowThreshold).toBe(0);
    expect(row(longgar, "Ustadz Ramai")?.meanScore).toBe(
      row(insight, "Ustadz Ramai")?.meanScore,
    );
  });
});

describe("ejaan ganda: dideteksi, tidak pernah digabung", () => {
  const rows = [
    ...many(3, () => rec({ pemeriksa: "Ustadzah Inas Firdaus", kegiatan: "Mei", score: 9 })),
    ...many(2, () => rec({ pemeriksa: "Inas Firdaus", kegiatan: "Mei", score: 3 })),
  ];

  it("mengenali pasangan dengan dan tanpa honorifik", () => {
    const clusters = detectSpellingClusters(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].canonical).toBe("Ustadzah Inas Firdaus");
    expect(clusters[0].spellings).toEqual([
      { nama: "Ustadzah Inas Firdaus", evaluations: 3 },
      { nama: "Inas Firdaus", evaluations: 2 },
    ]);
  });

  it("kedua ejaan tetap jadi baris sendiri dengan n masing-masing", () => {
    const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });
    expect(insight.rows).toHaveLength(2);
    expect(row(insight, "Ustadzah Inas Firdaus")?.evaluations).toBe(3);
    expect(row(insight, "Inas Firdaus")?.evaluations).toBe(2);
    // Dan rata-ratanya tidak dilebur jadi satu angka karangan (bukan 7.8).
    expect(row(insight, "Ustadzah Inas Firdaus")?.meanScore).toBe(9);
    expect(row(insight, "Inas Firdaus")?.meanScore).toBe(3);
  });

  it("penggabungan tidak boleh menggeser siapa yang lolos ambang", () => {
    // Digabung: n = 5 dan keduanya lolos. Tidak digabung: tak seorang pun lolos —
    // itulah kenapa merge mengubah percakapan, bukan cuma tampilan.
    const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 4 });
    expect(insight.rows).toHaveLength(0);
    expect(insight.belowThreshold).toBe(2);
    // Petunjuknya tetap terbit walau barisnya tidak tampil.
    expect(insight.spellingClusters).toHaveLength(1);
  });

  it("ejaanGanda cuma penanda: dipasang di baris, tidak dipakai berhitung", () => {
    const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });
    expect(insight.rows.every((r) => r.ejaanGanda)).toBe(true);
    expect(insight.rows.reduce((n, r) => n + r.evaluations, 0)).toBe(5);
  });

  it("satu ejaan saja bukan klaster", () => {
    const tunggal = many(4, () => rec({ pemeriksa: "Ustadz Hilmi", kegiatan: "Mei" }));
    expect(detectSpellingClusters(tunggal)).toEqual([]);
    const insight = buildPemeriksa(tunggal, groupOf, { minEvaluations: 1 });
    expect(insight.rows).toHaveLength(1);
    expect(insight.rows[0].ejaanGanda).toBe(false);
  });

  it("orang berbeda yang kebetulan berbeda honorifik tetap dua baris terpisah", () => {
    const ahmad = [
      ...many(2, () => rec({ pemeriksa: "Ust. Ahmad", kegiatan: "Mei", score: 8 })),
      ...many(2, () => rec({ pemeriksa: "Ahmad", kegiatan: "Mei", score: 2 })),
    ];
    const insight = buildPemeriksa(ahmad, groupOf, { minEvaluations: 1 });
    expect(insight.rows.map((r) => r.meanScore).sort()).toEqual([2, 8]);
    // Klaster hanya mengusulkan; tidak ada rata-rata 5 yang muncul di mana pun.
    expect(detectSpellingClusters(ahmad)[0].spellings).toHaveLength(2);
  });
});

describe("akun uji", () => {
  const rows = [
    ...many(3, () => rec({ pemeriksa: "Tester", kegiatan: "Mei", score: 10 })),
    rec({ pemeriksa: "Ustadz Tester", kegiatan: "Mei", score: 10 }),
    rec({ pemeriksa: "Ustadz Adil", kegiatan: "Mei", score: 6 }),
  ];
  const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });

  it("ditemukan lewat nama yang sudah dilipat", () => {
    expect(insight.akunUji).toEqual([
      { nama: "Tester", evaluations: 3 },
      { nama: "Ustadz Tester", evaluations: 1 },
    ]);
  });

  it("tetap ikut terhitung — dilaporkan, bukan disingkirkan", () => {
    expect(row(insight, "Tester")?.evaluations).toBe(3);
    expect(row(insight, "Ustadz Tester")?.evaluations).toBe(1);
    // Ikut rata-rata global juga, supaya tidak beda sendiri dengan skorcard C312.
    expect(insight.globalMean).toBeCloseTo((10 * 4 + 6) / 5, 10);
  });

  it("nama biasa yang memuat 'tester' sebagai penggalan kata tidak ikut terjaring", () => {
    const polos = buildPemeriksa(
      [rec({ pemeriksa: "Ustadz Testerian", kegiatan: "Mei" })],
      groupOf,
      { minEvaluations: 1 },
    );
    expect(polos.akunUji).toEqual([]);
  });
});

describe("skor tak terbaca: null menjalar, tidak jadi nol", () => {
  const rows = [
    ...many(3, () => rec({ pemeriksa: "Ustadz Kosong", kegiatan: "Mei", score: null })),
    rec({ pemeriksa: "Ustadz Adil", kegiatan: "Mei", score: 8 }),
  ];
  const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });

  it("meanScore, expected, dan deviation semuanya null", () => {
    const kosong = row(insight, "Ustadz Kosong");
    expect(kosong?.meanScore).toBeNull();
    expect(kosong?.expected).toBeNull();
    expect(kosong?.deviation).toBeNull();
  });

  it("tapi barisnya tetap ada dan tetap dihitung", () => {
    const kosong = row(insight, "Ustadz Kosong");
    expect(kosong?.evaluations).toBe(3);
    expect(kosong?.baik).toBe(0); // skor tak terbaca bukan "baik"
    expect(kosong?.baikPct).toBe(0);
    expect(kosong?.hari).toBe(1);
  });

  it("dan tidak menyeret rata-rata global ke bawah", () => {
    expect(insight.globalMean).toBe(8);
    expect(insight.spread).toEqual({ min: 8, max: 8 });
  });

  it("baris tanpa skor terbaca turun ke bawah urutan, bukan dibaca deviasi nol", () => {
    expect(insight.rows.map((r) => r.nama)).toEqual(["Ustadz Adil", "Ustadz Kosong"]);
  });
});

describe("kolom peserta mengikuti aturan index.ts", () => {
  it("baris tanpa nama masing-masing dihitung satu, tidak dilebur", () => {
    const rows = [
      rec({ pemeriksa: "Ustadz Adil", nama: "Ahmad Fauzi" }),
      rec({ pemeriksa: "Ustadz Adil", nama: "ahmad fauzi" }),
      rec({ pemeriksa: "Ustadz Adil", nama: null }),
      rec({ pemeriksa: "Ustadz Adil", nama: "   " }),
    ];
    const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });
    expect(row(insight, "Ustadz Adil")?.evaluations).toBe(4);
    expect(row(insight, "Ustadz Adil")?.peserta).toBe(3); // 1 nama + 2 tanpa nama
  });
});

describe("hari dan kegiatan", () => {
  it("hari memakai kalender Jakarta — 18.00Z sudah besok", () => {
    const rows = [
      rec({ pemeriksa: "Ustadz Adil", at: "2026-05-01T02:00:00Z", kegiatan: "Mei" }),
      rec({ pemeriksa: "Ustadz Adil", at: "2026-05-01T18:00:00Z", kegiatan: "Ummi" }),
    ];
    const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });
    expect(row(insight, "Ustadz Adil")?.hari).toBe(2);
    expect(row(insight, "Ustadz Adil")?.kegiatan).toBe(2);
  });

  it("tanggal tak terbaca tidak menambah hitungan hari", () => {
    const rows = [
      rec({ pemeriksa: "Ustadz Adil", at: "bukan tanggal", kegiatan: "Mei" }),
      rec({ pemeriksa: "Ustadz Adil", at: "2026-05-01T02:00:00Z", kegiatan: "Mei" }),
    ];
    expect(row(buildPemeriksa(rows, groupOf, { minEvaluations: 1 }), "Ustadz Adil")?.hari).toBe(1);
  });
});

describe("baris dummy", () => {
  it("is_dummy tidak masuk hitungan mana pun", () => {
    const rows = [
      rec({ pemeriksa: "Ustadz Adil", kegiatan: "Mei", score: 9 }),
      rec({ pemeriksa: "Ustadz Palsu", kegiatan: "Mei", score: 1, is_dummy: true }),
    ];
    const insight = buildPemeriksa(rows, groupOf, { minEvaluations: 1 });
    expect(insight.rows.map((r) => r.nama)).toEqual(["Ustadz Adil"]);
    expect(insight.globalMean).toBe(9);
    expect(insight.belowThreshold).toBe(0);
  });
});

describe("baik memakai ambang skorcard", () => {
  it("skor 6 sudah baik, 5 belum", () => {
    const rows = [
      rec({ pemeriksa: "Ustadz Adil", kegiatan: "Mei", score: 6 }),
      rec({ pemeriksa: "Ustadz Adil", kegiatan: "Mei", score: 5 }),
    ];
    const adil = row(buildPemeriksa(rows, groupOf, { minEvaluations: 1 }), "Ustadz Adil");
    expect(adil?.baik).toBe(1);
    expect(adil?.baikPct).toBe(50);
  });
});
