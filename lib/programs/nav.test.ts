/**
 * The one property worth pinning: a tab is listed only when the route behind it
 * can render something. Every case below is a real program row shape taken from
 * scripts/seed-programs.ts + scripts/pin-maahir-batches.ts, not an invented one.
 */
import { describe, expect, it } from "vitest";
import {
  hasMaahirPin,
  isHitsProgram,
  isShakwaProgram,
  maahirHitsBatchIds,
  programTabs,
} from "@/lib/programs/nav";
import type { NavProgram } from "@/lib/programs/nav";

const HITS_BASE = {
  features: { piket: false, perubahan: true },
  reportFormat: "hits",
  segmentation: { primary: "level", secondary: "gender" },
};

function keys(p: NavProgram): string[] {
  return programTabs(p).map((t) => t.key);
}

describe("maahirHitsBatchIds", () => {
  it("menerima daftar maupun satu string — hits-regular-jan memang dua batch", () => {
    expect(maahirHitsBatchIds({ maahirHitsBatchId: ["a", "b"] })).toEqual(["a", "b"]);
    expect(maahirHitsBatchIds({ maahirHitsBatchId: "a" })).toEqual(["a"]);
  });

  it("membuang duplikat, string kosong, dan config yang belum dipin", () => {
    expect(maahirHitsBatchIds({ maahirHitsBatchId: ["a", "a", "  ", 7] })).toEqual(["a"]);
    expect(maahirHitsBatchIds({})).toEqual([]);
    expect(maahirHitsBatchIds(null)).toEqual([]);
    expect(hasMaahirPin(null)).toBe(false);
  });
});

describe("programTabs — program Maahir (maahir_api)", () => {
  const maahir: NavProgram = {
    slug: "maahir",
    dataSourceType: "maahir_api",
    config: { syncPaused: false },
  };

  it("menawarkan layar yang benar-benar punya data", () => {
    expect(keys(maahir)).toEqual([
      "dashboard",
      "kehadiran",
      "tibyan",
      "sp",
      "peserta",
      "report",
    ]);
  });

  it("TIDAK menawarkan tab yang tabel tilawah-nya tidak pernah diisi sync Maahir", () => {
    // halaqah_sync / students_sync / jadwal_sync / guru_sync semuanya 0 baris
    // untuk program ini. `peserta` dan `report` boleh ikut karena keduanya
    // sekarang bercabang pada dataSourceType dan dilayani cermin Maahir —
    // `pengajar`, `silabus`, dan `inbox` belum, jadi tetap di luar.
    for (const mati of ["pengajar", "silabus", "inbox"]) {
      expect(keys(maahir)).not.toContain(mati);
    }
  });

  it("tidak ikut menawarkan layar HITS", () => {
    for (const k of ["disiplin", "observasi", "inspeksi", "shakwa", "evaluasi"]) {
      expect(keys(maahir)).not.toContain(k);
    }
  });
});

describe("programTabs — program HITS yang batch Maahir-nya sudah dipin", () => {
  const hits: NavProgram = {
    slug: "hits-regular",
    dataSourceType: "tilawah_api",
    config: { ...HITS_BASE, maahirHitsBatchId: ["bc5a63d2-c473-4035-93b0-6b8b07582eaa"] },
  };

  it("membuka Disiplin, Observasi, Inspeksi, Shakwa, dan Evaluasi", () => {
    const k = keys(hits);
    for (const wajib of ["disiplin", "observasi", "inspeksi", "shakwa", "evaluasi"]) {
      expect(k).toContain(wajib);
    }
  });

  it("mempertahankan tab lama beserta gerbang fiturnya", () => {
    const k = keys(hits);
    expect(k.slice(0, 4)).toEqual(["dashboard", "peserta", "pengajar", "silabus"]);
    expect(k).toContain("perubahan"); // features.perubahan: true
    expect(k).not.toContain("piket"); // features.piket: false
    expect(k).not.toContain("surat"); // tidak diset
    expect(k).not.toContain("asesmen"); // features.asesmen tidak diset
  });

  it("setiap href diawali slug program dan setiap key unik", () => {
    const tabs = programTabs(hits);
    expect(tabs.every((t) => t.href.startsWith("/hits-regular/"))).toBe(true);
    expect(new Set(tabs.map((t) => t.key)).size).toBe(tabs.length);
  });
});

describe("programTabs — program HITS tanpa pin", () => {
  // hits-armalah: slug HITS, tapi scripts/pin-maahir-batches.ts tidak memberinya
  // batch Maahir, jadi Observasi/Inspeksi tidak punya apa pun untuk di-scope.
  const armalah: NavProgram = {
    slug: "hits-armalah",
    dataSourceType: "tilawah_api",
    config: { ...HITS_BASE, syncPaused: true },
  };

  it("tetap dapat Shakwa — payload-nya global, tidak dibatasi batch", () => {
    expect(isHitsProgram(armalah)).toBe(true);
    expect(keys(armalah)).toContain("shakwa");
  });

  it("tidak dapat Disiplin/Observasi/Inspeksi — tanpa pin ketiganya selalu kosong", () => {
    // Route-nya tetap bisa dibuka (page.tsx disiplin hanya memeriksa bentuk
    // HITS) supaya bookmark lama mendarat di layar yang menjelaskan dirinya,
    // tapi tab-nya tidak ditawarkan.
    for (const k of ["disiplin", "observasi", "inspeksi"]) {
      expect(keys(armalah)).not.toContain(k);
    }
  });
});

/**
 * Regresi #1: pin selalu tersimpan sebagai DAFTAR.
 *
 * `scripts/pin-maahir-batches.ts` menuliskannya begitu "even for the six
 * programs with a single batch", tapi gerbang `app/[program]/shakwa/page.tsx`
 * dulu berbunyi `typeof config.maahirHitsBatchId === "string"` — cabang yang
 * karena itu tidak pernah benar. Cacatnya tak terlihat semata karena ketujuh
 * program yang dipin kebetulan ber-slug `hits-*` dan lolos di cabang pertama.
 * Begitu `tahsin-keluarga` (sudah `reportFormat: "hits"`) ikut dipin — jalur
 * pertumbuhan yang persis sama dengan masuknya `hits-nurul-iman` — nav akan
 * menawarkan tab yang route-nya `notFound()`.
 *
 * Bentuk daftar diperiksa di sini supaya bentuk string tidak bisa diam-diam
 * kembali ke salah satu gerbang.
 */
describe("bentuk pin: daftar, bukan string", () => {
  const dipinTanpaSlugHits: NavProgram = {
    slug: "tahsin-keluarga",
    dataSourceType: "tilawah_api",
    config: { ...HITS_BASE, maahirHitsBatchId: ["53148758-58e1-4ef4-a02c-7ba09bed9d9a"] },
  };

  it("dikenali oleh setiap predikat, tanpa memandang slug", () => {
    expect(hasMaahirPin(dipinTanpaSlugHits.config)).toBe(true);
    expect(isShakwaProgram(dipinTanpaSlugHits)).toBe(true);
    expect(isHitsProgram(dipinTanpaSlugHits)).toBe(true);
  });

  it("membuka Shakwa, Disiplin, Observasi, dan Inspeksi tanpa slug hits-*", () => {
    const k = keys(dipinTanpaSlugHits);
    for (const wajib of ["shakwa", "disiplin", "observasi", "inspeksi"]) {
      expect(k).toContain(wajib);
    }
  });

  it("bentuk string lama tetap diterima — config lawas tidak boleh hilang tabnya", () => {
    const lawas = { ...dipinTanpaSlugHits, config: { ...HITS_BASE, maahirHitsBatchId: "53148758" } };
    expect(hasMaahirPin(lawas.config)).toBe(true);
    expect(keys(lawas)).toContain("observasi");
  });
});

describe("programTabs — program non-HITS", () => {
  it("RBI: Evaluasi ikut (tilawah_api) tapi layar Maahir tidak", () => {
    const rbi: NavProgram = {
      slug: "rbi",
      dataSourceType: "tilawah_api",
      config: { features: { piket: false, perubahan: true } },
    };
    const k = keys(rbi);
    expect(k).toContain("evaluasi");
    for (const hits of ["disiplin", "observasi", "inspeksi", "shakwa"]) {
      expect(k).not.toContain(hits);
    }
  });

  it("HKM (berkah_api): tanpa Evaluasi, dengan Surat", () => {
    const hkm: NavProgram = {
      slug: "hkm",
      dataSourceType: "berkah_api",
      config: { features: { piket: false, perubahan: false, surat: true } },
    };
    const k = keys(hkm);
    expect(k).not.toContain("evaluasi"); // lib/insights/evaluasi menolak selain tilawah_api
    expect(k).toContain("surat");
    expect(k).toContain("sambungan"); // akun Nafi' cuma ada di program berkah_api
  });

  it("tilawah_api: tanpa Sambungan", () => {
    const rbi: NavProgram = {
      slug: "rbi",
      dataSourceType: "tilawah_api",
      config: { features: {} },
    };
    expect(keys(rbi)).not.toContain("sambungan");
  });

  it("Mabni: Piket ikut", () => {
    const mabni: NavProgram = {
      slug: "mabni",
      dataSourceType: "mabni_api",
      config: { features: { piket: true } },
    };
    expect(keys(mabni)).toContain("piket");
  });
});

describe("programTabs — ringkasan kajian", () => {
  it("tab muncul hanya saat features.ringkasan hidup", () => {
    const base = { slug: "hits-ortu-abk", dataSourceType: "tilawah_api" } as const;
    expect(keys({ ...base, config: HITS_BASE })).not.toContain("ringkasan");
    expect(
      keys({ ...base, config: { ...HITS_BASE, features: { ...HITS_BASE.features, ringkasan: true } } }),
    ).toContain("ringkasan");
  });
});

describe("programTabs — tab Hasil Ujian", () => {
  const rbi: NavProgram = { slug: "rbi", dataSourceType: "tilawah_api", config: {} };

  it("berlabel Hasil Ujian (bukan Evaluasi), href tetap /evaluasi", () => {
    const t = programTabs(rbi).find((x) => x.key === "evaluasi");
    expect(t?.label).toBe("Hasil Ujian");
    expect(t?.href).toBe("/rbi/evaluasi");
  });

  it("hilang bila program belum punya nilai, muncul bila punya", () => {
    expect(programTabs(rbi, { punyaHasilUjian: false }).some((x) => x.key === "evaluasi")).toBe(false);
    expect(programTabs(rbi, { punyaHasilUjian: true }).some((x) => x.key === "evaluasi")).toBe(true);
  });
});
