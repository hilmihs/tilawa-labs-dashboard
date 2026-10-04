/**
 * The hand-written variant → canonical map for the al-Fatihah assessment API's
 * free-text `kegiatan` field.
 *
 * Upstream has no controlled vocabulary here: whoever runs an assessment types
 * the event name into a text box. A full pull on **7 Sep 2026 (4 515 rows)**
 * returned **35 raw spellings — 34 once case is folded** that a coordinator
 * reads as ~13 events. "Half Deen Series 2026" and "half deen series 2026" are
 * the same thing (and are the one pair that differs *only* in case, which is why
 * the measured spelling count is 34 and the list below has 35 entries); so are
 * "Early Check-In HDS 2026" and its truncated twin "Early Check-In HDS 202".
 * Without this map the kegiatan filter on the insight page shows 34 lines and
 * splits every event's rows across two or four of them.
 *
 * Both cases of the Half Deen line are kept in `variants` even though the second
 * is redundant under the fold. `variants` is the record of what upstream
 * actually sent; deleting an observed spelling because the matcher happens to be
 * case-insensitive would lose that record for no gain.
 *
 * **This map never reconciles against a program roster, and never feeds a KPI.**
 * That is not a style preference, it is settled history: `lib/reports/kba-xlsx.ts`
 * lines 715-720 record that reconciling this API's `kegiatan` against the
 * dashboard's programs was tried for the LAZ block and abandoned — the API "was
 * returning a different, unreconcilable figure", so the KBA sheet now reads the
 * roster instead. Nothing downstream of this file may re-open that door.
 * There is deliberately no program-slug field on `KegiatanGroup` for the same
 * reason — that axis was dropped on purpose, do not add it back.
 *
 * Downstream DOES count rows per group — `GroupRow.participants` in `index.ts`
 * is exactly "how many peserta at this event", and the page renders it. That is
 * fine and is not what was abandoned: it describes the assessment source on its
 * own terms. What must never happen is equating such a figure with a program's
 * roster, or letting it reach `scripts/wire-fatihah-metrics.ts` / C312, which
 * still counts all participants with no bucket filter.
 *
 * **`variants` are exact strings, compared case-insensitively after a trim. They
 * are NOT regex, and must not become regex.** A tempting `/hirs/i` would match
 * every future spelling automatically, which is exactly the failure mode: it
 * would silently swallow a "HIRS Batch 2 (BATAL)" or "HIRS 2027" into the 2026
 * HIRS total and nobody would ever be told. An exact list cannot do that. When
 * upstream invents a spelling, `resolveKegiatan` returns `canonical: false` and
 * the test in `kegiatan.test.ts` is the thing that notices.
 *
 * Note the deliberate asymmetry between the two "unknown" outcomes:
 *   - `lainnya` is a *hand-verified* bucket. Its four spellings were each read
 *     and judged to belong nowhere else.
 *   - `belum-dikelompokkan` is synthetic — "we have never seen this string".
 *     An unknown string must never fold into `lainnya`, because that would turn
 *     a fact ("someone checked") into a guess ("something landed here").
 *
 * Pure leaf: no `db`, no network, no React. Safe from a client component.
 */

export type KegiatanGroup = {
  /** URL-safe, stable, never reused — it appears in the query string as `?kg=<key>`. */
  key: string;
  /** Indonesian label shown to the coordinator. */
  label: string;
  /** Exact raw spellings as the API sends them; compared lower-cased. Not regex. */
  variants: string[];
  /** Why this grouping is what it is, where it is not obvious from the strings. */
  note?: string;
};

/**
 * The 14 groups, ordered by measured row count descending with `lainnya` last —
 * the same order the insight page's filter list renders in, so the busiest event
 * is the first thing a coordinator's eye lands on.
 *
 * Counts in the comments are from the 7 Sep 2026 pull and are ground truth for
 * the alarm test; they are comments rather than a field because a stored count
 * goes stale the moment upstream accepts one more row, and a stale number on
 * screen is worse than no number.
 */
export const KEGIATAN_GROUPS: KegiatanGroup[] = [
  {
    key: "hirs",
    label: "HIRS",
    // 1 332 rows. The fourth spelling says HITS, not HIRS — a typo at the
    // keyboard, not a different event: same year, same wording either side of
    // the acronym. It is folded here on purpose.
    variants: [
      "Halaqah Intensif Ramadhan Spesial (HIRS) 2026",
      "Halaqah Al Qur'an Intensif Spesial (HIRS) 1447 H",
      "HIRS 35 Akhwat 47",
      "Halaqah Intensif Ramadhan Spesial (HITS) 2026",
    ],
    note: "Termasuk satu salah ketik 'HITS' untuk 'HIRS' dan satu penulisan per-halaqah.",
  },
  {
    key: "half-deen",
    label: "Half Deen Series",
    // 944 rows. "Early Check-In HDS 202" is a truncated "… 2026" — the string
    // was cut, not a different cohort.
    variants: [
      "Half Deen Series 2026",
      "half deen series 2026",
      "Early Check-In HDS 2026",
      "Early Check-In HDS 202",
    ],
    note: "Early check-in dihitung sebagai bagian dari seri yang sama; 'HDS 202' adalah '2026' yang terpotong.",
  },
  {
    key: "rs-ummi",
    label: "RS Ummi",
    // 853 rows. "Rs umi" and the bare "Ummi" are shorthand typed in a hurry.
    variants: ["Assessment Al-Fatihah - RS Ummi", "Tahsin RS Ummi Online 2026", "Rs umi", "Ummi"],
    note: "Assessment dan kelas tahsin online di RS Ummi digabung: satu mitra, satu rangkaian.",
  },
  {
    key: "laz",
    label: "Tahsin al-Fatihah LAZ",
    // 308 rows.
    variants: ["Tahsin Al-Fatihah - LAZ", "Tahsin Laz"],
  },
  {
    key: "alfatihah-mei",
    label: "Al-Fatihah Mei 2026",
    // 292 rows — three spellings of one month's batch.
    variants: ["Al Fatihah Mei 2026", "Tahsin Al-Fatihah Mei 2026", "Tahsin Alfatihah Mei 2026"],
  },
  {
    key: "har",
    label: "HAR 1447 H",
    // 225 rows, single spelling.
    variants: ["Halaqah Al-Qur'an Ramadhan (HAR) 1447 H"],
  },
  {
    key: "manasik",
    label: "Manasik Haji",
    // 138 rows.
    variants: ["Halaqah Tahsin Manasik Haji 1447 H", "Tahsin Manasik Haji"],
  },
  {
    key: "fsqt",
    label: "Panitia FSQT",
    // 130 rows, single spelling.
    variants: ["Panitia FSQT 1447 H"],
  },
  {
    key: "ortu-abk",
    label: "Tahsin Orang Tua ABK",
    // 99 rows, single spelling.
    variants: ["Tahsin Orang Tua ABK"],
  },
  {
    key: "nurul-iman",
    label: "Community Mosque",
    // 86 rows. "Pengecekan Al-Fatihah - Spesial" carries no venue, but it is
    // the same pengecekan run and the same wording stem as the Community Mosque line.
    variants: [
      "Pengecekan Al-Fatihah - Community Mosque",
      "Pengecekan Al-Fatihah - Spesial",
      "Tahsin alfatihah nurim",
    ],
    note: "'nurim' adalah singkatan lapangan untuk Community Mosque.",
  },
  {
    key: "tuku-maka",
    label: "Tuku & MAKA",
    // 45 rows, single spelling.
    variants: ["Assessment Al-Fatihah - Tuku & MAKA"],
  },
  {
    key: "armalah",
    label: "Armalah",
    // 32 rows across three kelas/jadwal spellings of one program.
    variants: ["Armalah 1", "Armalah 2", "Armalah Sabtu Ahad"],
  },
  {
    key: "hits-batch",
    label: "Batch HITS",
    // 20 rows. Two different HITS batches, kept in one bucket because neither
    // reaches a useful size on its own on this page.
    variants: ["HITS Juni 26", "HITS Safar"],
  },
  {
    key: "lainnya",
    label: "Lainnya",
    // 11 rows across 4 spellings — the whole remainder of the 7 Sep 2026 pull.
    variants: ["Assesmen Al Fatihah", "HKM 6 - Akhwat", "Tahsin Akhwat Aceh 2026", "Ustadz Fajar"],
    note:
      "11 baris dalam 4 penulisan yang sudah diperiksa satu per satu dan memang tidak masuk grup mana pun: " +
      "'Assesmen Al Fatihah' terlalu umum untuk dipetakan ke batch mana pun, 'HKM 6 - Akhwat' dan " +
      "'Tahsin Akhwat Aceh 2026' adalah kegiatan tersendiri yang terlalu kecil untuk berdiri sendiri, dan " +
      "'Ustadz Fajar' (5 baris) jelas nama pemeriksa yang terketik di kolom kegiatan — kesalahan input di hulu, " +
      "bukan nama kegiatan. Bucket ini hasil pemeriksaan tangan, bukan tempat pembuangan: penulisan baru yang " +
      "belum pernah dilihat masuk ke 'belum-dikelompokkan', bukan ke sini.",
  },
];

/** Stable group for a row whose `kegiatan` is null or blank. */
const TANPA_KEGIATAN: KegiatanGroup = {
  key: "tanpa-kegiatan",
  label: "(tanpa kegiatan)",
  variants: [],
  note: "Baris tanpa isi kegiatan — dikelompokkan agar tetap terhitung, bukan hilang dari daftar.",
};

/**
 * Built once at module load, not per call: `resolveKegiatan` runs once per row
 * and the full pull is thousands of rows.
 *
 * A variant of one group silently overwriting a variant of another would be a
 * real bug; the check lives in `kegiatan.test.ts` rather than here, because a
 * throw at import time would take down every page that touches this module.
 * Within a single group an overwrite is harmless — "Half Deen Series 2026" and
 * "half deen series 2026" write the same entry twice, which is why
 * `INDEX.size` (34) is one below the number of listed variants (35).
 */
const INDEX: Map<string, KegiatanGroup> = (() => {
  const m = new Map<string, KegiatanGroup>();
  for (const g of KEGIATAN_GROUPS) {
    for (const v of g.variants) m.set(v.trim().toLowerCase(), g);
  }
  return m;
})();

/** Lower-cased variant → group. The returned map is the shared instance; treat it as read-only. */
export function kegiatanIndex(): Map<string, KegiatanGroup> {
  return INDEX;
}

export type ResolvedKegiatan = {
  group: KegiatanGroup;
  /** True when the raw string is on a hand-written list (including the empty case). */
  canonical: boolean;
  /** The raw string exactly as it arrived, for the row detail and for debugging. */
  raw: string | null;
};

/**
 * Map one raw `kegiatan` onto a group.
 *
 * An unrecognised string yields a *synthetic* group keyed `belum-dikelompokkan`
 * whose label is the raw string verbatim, so the page still renders something
 * truthful and the coordinator sees the actual upstream spelling rather than a
 * bucket name that would imply someone had looked at it.
 */
export function resolveKegiatan(raw: string | null): ResolvedKegiatan {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { group: TANPA_KEGIATAN, canonical: true, raw };

  const hit = INDEX.get(trimmed.toLowerCase());
  if (hit) return { group: hit, canonical: true, raw };

  return {
    group: { key: "belum-dikelompokkan", label: trimmed, variants: [trimmed] },
    canonical: false,
    raw,
  };
}

/**
 * Look a group up by the key carried in `?kg=`. `tanpa-kegiatan` resolves too —
 * it is a real, linkable filter value even though it is not part of the
 * measured variant map. `belum-dikelompokkan` deliberately does not: it is
 * synthesised per row and has no single stable membership.
 */
export function findKegiatanGroup(key: string): KegiatanGroup | null {
  if (key === TANPA_KEGIATAN.key) return TANPA_KEGIATAN;
  return KEGIATAN_GROUPS.find((g) => g.key === key) ?? null;
}
