/**
 * This file is an alarm, not a formality.
 *
 * The kegiatan map is hand-written against a measured pull (7 Sep 2026, 4 515
 * rows, 34 spellings). Upstream is a free-text box, so the map decays the moment
 * somebody types a new event name — and it decays *silently*, because an
 * unmapped string still renders fine on the page. The counts below are pinned so
 * that the decay has to be acknowledged in a diff instead of being noticed by a
 * coordinator six weeks later.
 */
import { describe, expect, it } from "vitest";
import {
  KEGIATAN_GROUPS,
  findKegiatanGroup,
  kegiatanIndex,
  resolveKegiatan,
} from "@/lib/insights/alfatihah/kegiatan";

/**
 * Rows per group in the full pull of 7 Sep 2026. Ground truth — do not adjust a
 * number here to make a test pass; re-measure and change both together.
 */
const BARIS_2026_09_07: Record<string, number> = {
  hirs: 1332,
  "half-deen": 944,
  "rs-ummi": 853,
  laz: 308,
  "alfatihah-mei": 292,
  har: 225,
  manasik: 138,
  fsqt: 130,
  "ortu-abk": 99,
  "nurul-iman": 86,
  "tuku-maka": 45,
  armalah: 32,
  "hits-batch": 20,
  lainnya: 11,
};

/** Rows confidently grouped into a named event — everything except `lainnya`. */
const TERKELOMPOK = 4504;
/** Every non-dummy row the pull returned. */
const TOTAL_BARIS = 4515;

describe("KEGIATAN_GROUPS — integritas peta", () => {
  it("tidak ada satu pun penulisan mentah yang diklaim dua grup", () => {
    const pemilik = new Map<string, string>();
    const bentrok: string[] = [];
    for (const g of KEGIATAN_GROUPS) {
      for (const v of g.variants) {
        const k = v.trim().toLowerCase();
        const lama = pemilik.get(k);
        // Same string in two different groups = one of them silently loses its
        // rows to the other. Same string twice inside one group is harmless.
        if (lama && lama !== g.key) bentrok.push(`${v}: ${lama} vs ${g.key}`);
        pemilik.set(k, g.key);
      }
    }
    expect(bentrok).toEqual([]);
    // Nothing may vanish from the index other than the known case-only pair.
    expect(kegiatanIndex().size).toBe(pemilik.size);
  });

  it("satu-satunya penulisan yang kembar setelah lipat huruf adalah pasangan Half Deen", () => {
    const hitung = new Map<string, string[]>();
    for (const g of KEGIATAN_GROUPS) {
      for (const v of g.variants) {
        const k = v.trim().toLowerCase();
        hitung.set(k, [...(hitung.get(k) ?? []), v]);
      }
    }
    const kembar = [...hitung.entries()].filter(([, vs]) => vs.length > 1);
    expect(kembar.map(([k]) => k)).toEqual(["half deen series 2026"]);
  });

  it("key unik dan aman untuk URL", () => {
    const keys = KEGIATAN_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+$/);
  });

  it("setiap grup punya minimal satu penulisan, dan 'lainnya' selalu paling akhir", () => {
    for (const g of KEGIATAN_GROUPS) expect(g.variants.length).toBeGreaterThan(0);
    expect(KEGIATAN_GROUPS[KEGIATAN_GROUPS.length - 1].key).toBe("lainnya");
    // Only the last one may be the catch-all.
    expect(KEGIATAN_GROUPS.filter((g) => g.key === "lainnya")).toHaveLength(1);
  });

  it("findKegiatanGroup mengembalikan grup untuk key yang dikenal, null untuk sisanya", () => {
    expect(findKegiatanGroup("hirs")?.label).toBe("HIRS");
    expect(findKegiatanGroup("tanpa-kegiatan")?.label).toBe("(tanpa kegiatan)");
    expect(findKegiatanGroup("belum-dikelompokkan")).toBeNull();
    expect(findKegiatanGroup("entah-apa")).toBeNull();
  });
});

describe("resolveKegiatan", () => {
  it("melipat huruf besar/kecil dan memangkas spasi", () => {
    expect(resolveKegiatan("  tahsin laz  ").group.key).toBe("laz");
    expect(resolveKegiatan("TAHSIN LAZ").group.key).toBe("laz");
    expect(resolveKegiatan("half deen series 2026").group.key).toBe("half-deen");
    expect(resolveKegiatan("Half Deen Series 2026").group.key).toBe("half-deen");
  });

  it("penulisan per-halaqah tetap masuk grup acaranya", () => {
    const r = resolveKegiatan("HIRS 35 Akhwat 47");
    expect(r.group.key).toBe("hirs");
    expect(r.canonical).toBe(true);
    // The HITS typo is HIRS, not a HITS batch — the two must not swap.
    expect(resolveKegiatan("Halaqah Intensif Ramadhan Spesial (HITS) 2026").group.key).toBe("hirs");
    expect(resolveKegiatan("HITS Safar").group.key).toBe("hits-batch");
  });

  it("penulisan yang belum pernah dilihat TIDAK dilipat ke 'lainnya'", () => {
    const raw = "HIRS Batch 2 (BATAL)";
    const r = resolveKegiatan(raw);
    expect(r.canonical).toBe(false);
    expect(r.group.key).toBe("belum-dikelompokkan");
    // Label is the upstream string verbatim — never a bucket name that would
    // imply a human had looked at it.
    expect(r.group.label).toBe(raw);
    expect(r.group.variants).toEqual([raw]);
    expect(r.raw).toBe(raw);
  });

  it("null dan string kosong jatuh ke 'tanpa-kegiatan'", () => {
    for (const raw of [null, "", "   "]) {
      const r = resolveKegiatan(raw);
      expect(r.group.key).toBe("tanpa-kegiatan");
      expect(r.group.label).toBe("(tanpa kegiatan)");
      expect(r.canonical).toBe(true);
      expect(r.raw).toBe(raw);
    }
  });

  it("setiap penulisan yang terdaftar memang menyelesaikan ke grupnya sendiri", () => {
    for (const g of KEGIATAN_GROUPS) {
      for (const v of g.variants) {
        const r = resolveKegiatan(v);
        expect(r.canonical).toBe(true);
        expect(r.group.key).toBe(g.key);
      }
    }
  });
});

describe("alarm", () => {
  /**
   * The alarm for a NEW upstream spelling is not this test — it is a re-run of
   * the probe script showing rows with `canonical: false`. When that happens the
   * fix is to add the spelling to a group here and update `BARIS_2026_09_07`,
   * which makes this test fail until both are done. That is deliberate: a
   * failing build is a stop sign, whereas a "belum dikelompokkan" chip on the
   * coordinator's screen is something people learn to scroll past.
   */
  it("peta kegiatan menutup 4.504 dari 4.515 baris yang terukur 2026-09-07", () => {
    // Adding or removing a group without touching the counts fails here first.
    expect(KEGIATAN_GROUPS.map((g) => g.key)).toEqual([
      "hirs",
      "half-deen",
      "rs-ummi",
      "laz",
      "alfatihah-mei",
      "har",
      "manasik",
      "fsqt",
      "ortu-abk",
      "nurul-iman",
      "tuku-maka",
      "armalah",
      "hits-batch",
      "lainnya",
    ]);
    expect(Object.keys(BARIS_2026_09_07).sort()).toEqual(KEGIATAN_GROUPS.map((g) => g.key).sort());

    const jumlah = (keys: string[]) => keys.reduce((a, k) => a + BARIS_2026_09_07[k], 0);
    const bernama = KEGIATAN_GROUPS.filter((g) => g.key !== "lainnya").map((g) => g.key);

    expect(jumlah(bernama)).toBe(TERKELOMPOK);
    expect(BARIS_2026_09_07.lainnya).toBe(TOTAL_BARIS - TERKELOMPOK);
    expect(jumlah(Object.keys(BARIS_2026_09_07))).toBe(TOTAL_BARIS);
  });

  /**
   * The assertions above compare the hard-coded map against a hard-coded count
   * table — self-referential on its own. This one closes that hole by pushing
   * every listed spelling back through `resolveKegiatan`, so a bug in the
   * resolver (a fold that drops punctuation, an index built from the wrong
   * field, a group shadowed by an earlier one) fails here even though both
   * tables still agree with each other.
   */
  it("setiap ejaan terdaftar benar-benar teratasi ke kelompoknya lewat resolveKegiatan", () => {
    const kasus = KEGIATAN_GROUPS.flatMap((g) =>
      g.variants.map((raw) => ({ raw, key: g.key })),
    );
    // Guards against the list silently shrinking to nothing and passing.
    expect(kasus.length).toBe(35);

    for (const { raw, key } of kasus) {
      for (const bentuk of [raw, raw.toUpperCase(), raw.toLowerCase(), `  ${raw}  `]) {
        const r = resolveKegiatan(bentuk);
        expect(r.canonical, `"${bentuk}" harus dikenali`).toBe(true);
        expect(r.group.key, `"${bentuk}" salah kelompok`).toBe(key);
      }
    }
  });

  /**
   * 35 spellings listed, 34 once case is folded — the pair that differs only in
   * case is the Half Deen line. Both numbers are pinned so that neither "we
   * dropped a spelling" nor "we invented one" can pass quietly.
   */
  it("35 penulisan mentah terdaftar, 34 setelah lipat huruf", () => {
    const total = KEGIATAN_GROUPS.reduce((a, g) => a + g.variants.length, 0);
    expect(total).toBe(35);
    expect(kegiatanIndex().size).toBe(34);
  });

  it("urutan grup mengikuti jumlah baris menurun, 'lainnya' terakhir", () => {
    const bernama = KEGIATAN_GROUPS.filter((g) => g.key !== "lainnya");
    for (let i = 1; i < bernama.length; i++) {
      expect(BARIS_2026_09_07[bernama[i - 1].key]).toBeGreaterThanOrEqual(
        BARIS_2026_09_07[bernama[i].key],
      );
    }
  });
});
