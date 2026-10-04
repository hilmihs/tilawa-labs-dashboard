/**
 * Rules, not readings.
 *
 * Every number this module produces over the live API is re-derived by
 * `scripts/verify-asesmen-angka.ts`, so nothing here pins a dataset total: a
 * suite that goes red the first time upstream adds a row is a suite people
 * learn to ignore. What is pinned instead are the refusals — the cases where
 * the honest answer is `null`, a flag, or an exclusion — because those are the
 * ones a later "small cleanup" would quietly delete.
 */
import { describe, expect, it } from "vitest";
import {
  buildPersons,
  examinerMeans,
  honestCohort,
  progressionSummary,
  retestByKegiatan,
  rosterPhoneKey,
  turunDalamKegiatan,
  type KegiatanGroupOf,
  type Rec,
} from "@/lib/insights/alfatihah/person";

let seq = 0;

/** One assessment row. `nama: null` is an explicit unnamed row, not a default. */
function rec(o: {
  nama?: string | null;
  at: string;
  score?: number;
  pemeriksa?: string | null;
  kegiatan?: string | null;
  gender?: string | null;
  rekomendasi?: string | null;
  is_dummy?: boolean;
}): Rec {
  return {
    uuid: `u${++seq}`,
    kode_unik: null,
    kegiatan: o.kegiatan ?? null,
    divisi: null,
    pemeriksa: o.pemeriksa ?? null,
    asal_halaqah: o.gender ?? null,
    rekomendasi_program: o.rekomendasi ?? null,
    is_dummy: o.is_dummy ?? false,
    created_at: o.at,
    score: o.score ?? 5,
    namaLengkap: o.nama === undefined ? "Peserta Uji" : o.nama,
  };
}

/**
 * Stand-in for `./kegiatan`'s resolver. The real one is written by another
 * module and is deliberately not imported — `groupOf` is a parameter precisely
 * so these tests can decide what "same event" means.
 */
const groupOf: KegiatanGroupOf = (k) => {
  const t = (k ?? "").trim().toLowerCase();
  if (t.startsWith("mei")) return { key: "alfatihah-mei", label: "Al-Fatihah Mei" };
  if (t.startsWith("ummi")) return { key: "rs-ummi", label: "RS Ummi" };
  return { key: "lain-lain", label: "Lainnya" };
};

const find = (rows: Rec[], key: string) =>
  buildPersons(rows, groupOf).find((p) => p.key === key);

describe("identity is personKey and nothing else", () => {
  it("menyatukan underscore, spasi ganda, dan beda kapital", () => {
    const rows = [
      rec({ nama: "Ahmad_Fauzi", at: "2026-05-01T02:00:00Z", score: 4 }),
      rec({ nama: "ahmad  fauzi", at: "2026-05-08T02:00:00Z", score: 7 }),
      rec({ nama: "AHMAD FAUZI", at: "2026-05-15T02:00:00Z", score: 8 }),
    ];
    const persons = buildPersons(rows, groupOf);
    expect(persons).toHaveLength(1);
    expect(persons[0].key).toBe("AHMAD FAUZI");
    expect(persons[0].count).toBe(3);
  });

  it("tidak membuang tanda baca — bukan fuzzy matching (hukum 4)", () => {
    const rows = [
      rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z" }),
      rec({ nama: "Ahmad Fauzi.", at: "2026-05-08T02:00:00Z" }),
    ];
    expect(buildPersons(rows, groupOf)).toHaveLength(2);
  });

  it("memakai ejaan mentah baris terawal sebagai nama tampil", () => {
    const rows = [
      rec({ nama: "AHMAD FAUZI", at: "2026-05-08T02:00:00Z" }),
      rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z" }),
    ];
    expect(buildPersons(rows, groupOf)[0].nama).toBe("Ahmad Fauzi");
  });
});

describe("gender bentrok — ambiguitas kalah (hukum 2)", () => {
  const rows = [
    rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 3, gender: "Ikhwan" }),
    rec({ nama: "Ahmad Fauzi", at: "2026-05-08T02:00:00Z", score: 9, gender: "Akhwat" }),
  ];

  it("tetap dikembalikan, ditandai, tapi delta-nya null", () => {
    const p = find(rows, "AHMAD FAUZI");
    expect(p).toBeDefined();
    expect(p?.flags).toContain("nama-ganda");
    expect(p?.gender).toBeNull();
    expect(p?.delta).toBeNull();
    expect(p?.adjustedDelta).toBeNull();
    expect(p?.withinEvent).toBeNull();
    // Skornya tetap terlihat — yang ditolak cuma klaim "orang ini naik 6".
    expect(p?.firstScore).toBe(3);
    expect(p?.lastScore).toBe(9);
  });

  it("keluar dari kohort dan terhitung di droppedGenderConflict", () => {
    const persons = buildPersons(rows, groupOf);
    expect(honestCohort(persons)).toHaveLength(0);
    const s = progressionSummary(persons, examinerMeans(rows), rows);
    expect(s.cohort).toBe(0);
    expect(s.droppedGenderConflict).toBe(1);
  });

  it("gender kosong di salah satu baris bukan bentrok", () => {
    const soft = [
      rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 3, gender: "Ikhwan" }),
      rec({ nama: "Ahmad Fauzi", at: "2026-05-08T02:00:00Z", score: 9, gender: null }),
    ];
    const p = find(soft, "AHMAD FAUZI");
    expect(p?.flags).not.toContain("nama-ganda");
    expect(p?.gender).toBe("Ikhwan");
    expect(p?.delta).toBe(6);
  });
});

describe("nama satu kata — ditandai, tidak dibuang, tidak digabung (hukum 3)", () => {
  const rows = [
    rec({ nama: "Rina", at: "2026-05-01T02:00:00Z", score: 4, gender: "Akhwat" }),
    rec({ nama: "Rina", at: "2026-05-08T02:00:00Z", score: 7, gender: "Akhwat" }),
  ];

  it("delta tetap dihitung apa adanya", () => {
    const p = find(rows, "RINA");
    expect(p).toBeDefined();
    expect(p?.flags).toEqual(["nama-satu-kata"]);
    expect(p?.count).toBe(2);
    expect(p?.delta).toBe(3);
  });

  it("tapi tidak boleh ikut dijumlahkan sebagai kemajuan", () => {
    const persons = buildPersons(rows, groupOf);
    expect(honestCohort(persons)).toHaveLength(0);
    const s = progressionSummary(persons, examinerMeans(rows), rows);
    expect(s.droppedSingleWord).toBe(1);
    expect(s.within.n).toBe(0);
    expect(s.cross.n).toBe(0);
  });
});

describe("ulangan di hari yang sama", () => {
  it("dua baris satu hari WIB: ditandai hari-sama dan keluar dari kohort", () => {
    // 08.00 dan 16.00 WIB pada 1 Mei.
    const rows = [
      rec({ nama: "Budi Santoso", at: "2026-05-01T01:00:00Z", score: 5, gender: "Ikhwan" }),
      rec({ nama: "Budi Santoso", at: "2026-05-01T09:00:00Z", score: 8, gender: "Ikhwan" }),
    ];
    const persons = buildPersons(rows, groupOf);
    expect(persons[0].flags).toEqual(["hari-sama"]);
    expect(honestCohort(persons)).toHaveLength(0);
    const s = progressionSummary(persons, examinerMeans(rows), rows);
    expect(s.droppedSameDay).toBe(1);
    expect(s.cohort).toBe(0);
  });

  it("hari dihitung kalender Jakarta, bukan UTC — 18.00Z sudah besok", () => {
    // Keduanya 1 Mei di UTC, tapi 1 Mei dan 2 Mei di WIB.
    const rows = [
      rec({ nama: "Budi Santoso", at: "2026-05-01T02:00:00Z", score: 5, gender: "Ikhwan" }),
      rec({ nama: "Budi Santoso", at: "2026-05-01T18:00:00Z", score: 8, gender: "Ikhwan" }),
    ];
    const persons = buildPersons(rows, groupOf);
    expect(persons[0].flags).toEqual([]);
    expect(persons[0].entries.map((e) => e.tanggal)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(honestCohort(persons)).toHaveLength(1);
  });
});

describe("baris tanpa nama", () => {
  const rows = [
    rec({ nama: null, at: "2026-05-01T02:00:00Z", score: 4 }),
    rec({ nama: null, at: "2026-05-08T02:00:00Z", score: 9 }),
    rec({ nama: "   ", at: "2026-05-09T02:00:00Z", score: 2 }),
    rec({ nama: "Siti Aminah", at: "2026-05-01T02:00:00Z", score: 5, gender: "Akhwat" }),
    rec({ nama: "Siti Aminah", at: "2026-05-08T02:00:00Z", score: 7, gender: "Akhwat" }),
  ];

  it("tidak pernah digabung jadi satu orang hantu", () => {
    const persons = buildPersons(rows, groupOf);
    expect(persons.map((p) => p.key)).toEqual(["SITI AMINAH"]);
  });

  it("dilaporkan di unnamedEvaluations, bukan dihilangkan diam-diam", () => {
    const s = progressionSummary(buildPersons(rows, groupOf), examinerMeans(rows), rows);
    expect(s.unnamedEvaluations).toBe(3);
    expect(s.cohort).toBe(1); // kohort tidak terpengaruh
  });
});

describe("examinerMeans + adjustedDelta", () => {
  // Ustadz A: 4 dan 6 → rata-rata 5. Ustadz B: 8 dan 10 → rata-rata 9.
  const rows = [
    rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 4, pemeriksa: "Ustadz A" }),
    rec({ nama: "Ahmad Fauzi", at: "2026-05-08T02:00:00Z", score: 8, pemeriksa: "Ustadz B" }),
    rec({ nama: "Dewi Lestari", at: "2026-05-02T02:00:00Z", score: 6, pemeriksa: "ustadz  a" }),
    rec({ nama: "Fajar Nugroho", at: "2026-05-03T02:00:00Z", score: 10, pemeriksa: "Ustadz B" }),
  ];

  it("rata-rata pemeriksa dikunci ke personKey", () => {
    const means = examinerMeans(rows);
    expect(means.get("USTADZ A")).toBe(5);
    expect(means.get("USTADZ B")).toBe(9);
    expect(means.size).toBe(2); // "ustadz  a" bukan pemeriksa ketiga
  });

  it("(last − first) − (mean(last) − mean(first))", () => {
    const p = find(rows, "AHMAD FAUZI");
    expect(p?.delta).toBe(4);
    expect(p?.adjustedDelta).toBe(0); // 4 − (9 − 5)
    expect(p?.sameExaminer).toBe(false);
  });

  it("pemeriksa kosong di salah satu ujung → adjustedDelta null, delta tetap", () => {
    const buta = [
      ...rows,
      rec({ nama: "Rizky Pratama", at: "2026-05-01T02:00:00Z", score: 3, pemeriksa: null }),
      rec({ nama: "Rizky Pratama", at: "2026-05-08T02:00:00Z", score: 7, pemeriksa: "Ustadz B" }),
    ];
    const p = find(buta, "RIZKY PRATAMA");
    expect(p?.delta).toBe(4);
    expect(p?.adjustedDelta).toBeNull();
  });

  it("pemeriksa sama di kedua ujung terdeteksi lewat personKey", () => {
    const sama = [
      rec({ nama: "Rizky Pratama", at: "2026-05-01T02:00:00Z", score: 3, pemeriksa: "Ustadz A" }),
      rec({ nama: "Rizky Pratama", at: "2026-05-08T02:00:00Z", score: 7, pemeriksa: "ustadz_a" }),
    ];
    expect(find(sama, "RIZKY PRATAMA")?.sameExaminer).toBe(true);
  });

  it("means boleh datang dari jendela lebih luas daripada persons", () => {
    const ahmad = [
      rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 4, pemeriksa: "Ustadz A" }),
      rec({ nama: "Ahmad Fauzi", at: "2026-05-08T02:00:00Z", score: 8, pemeriksa: "Ustadz B" }),
    ];
    const luas = [
      ...ahmad,
      rec({ nama: "Dewi Lestari", at: "2026-05-02T02:00:00Z", score: 6, pemeriksa: "Ustadz A" }),
      rec({ nama: "Fajar Nugroho", at: "2026-05-03T02:00:00Z", score: 6, pemeriksa: "Ustadz B" }),
    ];
    const persons = buildPersons(ahmad, groupOf);
    // Baseline setahun: A = 5, B = 7 → 4 − (7 − 5) = 2.
    expect(progressionSummary(persons, examinerMeans(luas), ahmad).within.adjustedDelta).toBe(2);
    // Baseline dari potongan itu sendiri: tiap pemeriksa diadu dengan skornya
    // sendiri, jadi koreksinya runtuh persis ke nol dan tak menguji apa pun.
    expect(progressionSummary(persons, examinerMeans(ahmad), ahmad).within.adjustedDelta).toBe(0);
  });

  it("buildPersons memakai means yang disuntikkan, bukan means potongannya sendiri", () => {
    // Regression pin. `buildPersons` used to compute `examinerMeans(rows)`
    // internally, so `PersonRow.adjustedDelta` — and therefore every
    // `retestByKegiatan().adjustedDelta` — carried a slice-local baseline while
    // `progressionSummary` carried the window-wide one. Two figures labelled
    // "terkoreksi" on the same screen, built from different baselines. The whole
    // page reads one of them per section, so they must come from one map.
    const ahmad = [
      rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 4, pemeriksa: "Ustadz A" }),
      rec({ nama: "Ahmad Fauzi", at: "2026-05-08T02:00:00Z", score: 8, pemeriksa: "Ustadz B" }),
    ];
    const luas = [
      ...ahmad,
      rec({ nama: "Dewi Lestari", at: "2026-05-02T02:00:00Z", score: 6, pemeriksa: "Ustadz A" }),
      rec({ nama: "Fajar Nugroho", at: "2026-05-03T02:00:00Z", score: 6, pemeriksa: "Ustadz B" }),
    ];
    const rowFor = (means?: Map<string, number>) =>
      buildPersons(ahmad, groupOf, means).find((p) => p.key === "AHMAD FAUZI");
    // Window-wide baseline (A = 5, B = 7): 4 − (7 − 5) = 2.
    expect(rowFor(examinerMeans(luas))?.adjustedDelta).toBe(2);
    // Slice-local fallback still degenerates to 0 — kept only so the parameter
    // stays optional; `index.ts` must never rely on it.
    expect(rowFor()?.adjustedDelta).toBe(0);
  });
});

describe("partisi withinEvent lewat stub groupOf", () => {
  const rows = [
    // Naik di dalam satu kegiatan.
    rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 4, kegiatan: "Mei 2026", pemeriksa: "A", gender: "Ikhwan" }),
    rec({ nama: "Ahmad Fauzi", at: "2026-05-08T02:00:00Z", score: 8, kegiatan: "Mei sesi 2", pemeriksa: "A", gender: "Ikhwan" }),
    // Pindah kegiatan.
    rec({ nama: "Siti Aminah", at: "2026-05-02T02:00:00Z", score: 6, kegiatan: "Mei 2026", pemeriksa: "A", gender: "Akhwat" }),
    rec({ nama: "Siti Aminah", at: "2026-06-02T02:00:00Z", score: 5, kegiatan: "Ummi", pemeriksa: "B", gender: "Akhwat" }),
  ];
  const persons = buildPersons(rows, groupOf);
  const summary = progressionSummary(persons, examinerMeans(rows), rows);

  it("dua kegiatan berbeda label tapi satu grup kanonik tetap within", () => {
    expect(find(rows, "AHMAD FAUZI")?.withinEvent).toBe(true);
    expect(find(rows, "SITI AMINAH")?.withinEvent).toBe(false);
  });

  it("ringkasan memisah within dan cross", () => {
    expect(summary.cohort).toBe(2);
    expect(summary.within.n).toBe(1);
    expect(summary.within.rawDelta).toBe(4);
    expect(summary.within.up).toBe(1);
    expect(summary.within.sameExaminerPct).toBe(100);
    expect(summary.cross.n).toBe(1);
    expect(summary.cross.rawDelta).toBe(-1);
    expect(summary.cross.down).toBe(1);
    expect(summary.cross.sameExaminerPct).toBe(0);
  });

  it("grup nol ulangan tetap muncul, bukan baris hilang", () => {
    const per = retestByKegiatan(persons, rows, groupOf);
    const mei = per.find((g) => g.key === "alfatihah-mei");
    const ummi = per.find((g) => g.key === "rs-ummi");
    expect(mei?.retested).toBe(1);
    expect(mei?.participants).toBe(2); // Ahmad + Siti
    expect(mei?.coverage).toBeCloseTo(0.5, 10);
    expect(ummi?.retested).toBe(0);
    expect(ummi?.participants).toBe(1);
    expect(ummi?.coverage).toBe(0);
    expect(ummi?.adjustedDelta).toBeNull();
    expect(ummi?.sameExaminerPct).toBeNull();
  });

  it("orang yang pindah kegiatan tidak diakui grup mana pun", () => {
    const per = retestByKegiatan(persons, rows, groupOf);
    expect(per.reduce((n, g) => n + g.retested, 0)).toBe(1);
  });
});

describe("turunDalamKegiatan", () => {
  const rows = [
    // Turun di dalam satu kegiatan → masuk.
    rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 8, kegiatan: "Mei", gender: "Ikhwan" }),
    rec({ nama: "Ahmad Fauzi", at: "2026-05-08T02:00:00Z", score: 5, kegiatan: "Mei", gender: "Ikhwan" }),
    // Naik di dalam satu kegiatan → tidak.
    rec({ nama: "Dewi Lestari", at: "2026-05-01T02:00:00Z", score: 4, kegiatan: "Mei", gender: "Akhwat" }),
    rec({ nama: "Dewi Lestari", at: "2026-05-08T02:00:00Z", score: 9, kegiatan: "Mei", gender: "Akhwat" }),
    // Turun tapi lintas kegiatan → tidak.
    rec({ nama: "Fajar Nugroho", at: "2026-05-01T02:00:00Z", score: 8, kegiatan: "Mei", gender: "Ikhwan" }),
    rec({ nama: "Fajar Nugroho", at: "2026-06-08T02:00:00Z", score: 6, kegiatan: "Ummi", gender: "Ikhwan" }),
    // Turun di satu kegiatan tapi nama satu kata → tidak (identitas tak dipercaya).
    rec({ nama: "Rina", at: "2026-05-01T02:00:00Z", score: 9, kegiatan: "Mei", gender: "Akhwat" }),
    rec({ nama: "Rina", at: "2026-05-08T02:00:00Z", score: 2, kegiatan: "Mei", gender: "Akhwat" }),
    // Datar → tidak.
    rec({ nama: "Budi Santoso", at: "2026-05-01T02:00:00Z", score: 6, kegiatan: "Mei", gender: "Ikhwan" }),
    rec({ nama: "Budi Santoso", at: "2026-05-08T02:00:00Z", score: 6, kegiatan: "Mei", gender: "Ikhwan" }),
  ];

  it("hanya yang sekegiatan dan deltanya negatif", () => {
    const turun = turunDalamKegiatan(buildPersons(rows, groupOf));
    expect(turun.map((p) => p.key)).toEqual(["AHMAD FAUZI"]);
    expect(turun[0].delta).toBe(-3);
  });

  it("diurutkan dari penurunan terdalam", () => {
    const lagi = [
      ...rows,
      rec({ nama: "Yusuf Hakim", at: "2026-05-01T02:00:00Z", score: 10, kegiatan: "Mei", gender: "Ikhwan" }),
      rec({ nama: "Yusuf Hakim", at: "2026-05-08T02:00:00Z", score: 4, kegiatan: "Mei", gender: "Ikhwan" }),
    ];
    expect(turunDalamKegiatan(buildPersons(lagi, groupOf)).map((p) => p.delta)).toEqual([-6, -3]);
  });

  it("yang datar dihitung flat, bukan turun", () => {
    const s = progressionSummary(buildPersons(rows, groupOf), examinerMeans(rows), rows);
    expect(s.within.flat).toBe(1);
    expect(s.within.down).toBe(1);
    expect(s.within.up).toBe(1);
  });
});

describe("urutan entries", () => {
  it("selalu kronologis meski input teracak", () => {
    const rows = [
      rec({ nama: "Ahmad Fauzi", at: "2026-06-01T02:00:00Z", score: 9, gender: "Ikhwan" }),
      rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", score: 3, gender: "Ikhwan" }),
      rec({ nama: "Ahmad Fauzi", at: "2026-05-20T02:00:00Z", score: 6, gender: "Ikhwan" }),
    ];
    const p = find(rows, "AHMAD FAUZI");
    expect(p?.entries.map((e) => e.tanggal)).toEqual(["2026-05-01", "2026-05-20", "2026-06-01"]);
    expect(p?.entries.map((e) => e.score)).toEqual([3, 6, 9]);
    expect(p?.firstScore).toBe(3);
    expect(p?.lastScore).toBe(9);
    expect(p?.delta).toBe(6);
  });

  it("membawa serta pemeriksa dan rekomendasi tiap baris", () => {
    const rows = [
      rec({ nama: "Ahmad Fauzi", at: "2026-05-20T02:00:00Z", pemeriksa: "B", rekomendasi: "Tahsin 2" }),
      rec({ nama: "Ahmad Fauzi", at: "2026-05-01T02:00:00Z", pemeriksa: "A", rekomendasi: null }),
    ];
    const p = find(rows, "AHMAD FAUZI");
    expect(p?.entries.map((e) => e.pemeriksa)).toEqual(["A", "B"]);
    expect(p?.entries.map((e) => e.rekomendasi)).toEqual([null, "Tahsin 2"]);
  });
});

describe("rosterPhoneKey", () => {
  it("awalan 62 ganda, 62 tunggal, dan 0 bertemu di kunci yang sama", () => {
    const k = rosterPhoneKey("62812345678");
    expect(k).toBe("62812345678");
    expect(rosterPhoneKey("6262812345678")).toBe(k);
    expect(rosterPhoneKey("0812345678")).toBe(k);
    expect(rosterPhoneKey("+62 812-345-678")).toBe(k);
  });

  it("62 berlapis-lapis pun dirapikan", () => {
    expect(rosterPhoneKey("626262812345678")).toBe("62812345678");
  });

  it("sampah jadi null, bukan nomor karangan", () => {
    expect(rosterPhoneKey(null)).toBeNull();
    expect(rosterPhoneKey("")).toBeNull();
    expect(rosterPhoneKey("-")).toBeNull();
    expect(rosterPhoneKey("tidak ada")).toBeNull();
    expect(rosterPhoneKey("12")).toBeNull();
    expect(rosterPhoneKey("628123456789012345")).toBeNull();
  });
});
