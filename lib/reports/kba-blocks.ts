/**
 * The KBA (kolaborasi) monthly sheet's block list — pure data, no db import, so
 * the client bundle (the report page's download button) can read the slug set
 * without pulling the query layer in.
 *
 * Order is the coordinator's own workbook order, not alphabetical: the file is
 * read side by side with last month's copy. HITS Reguler is deliberately absent
 * (it has its own monthly report); Tahsin Security was dropped; HITS Al-Kautsar
 * folded into HITS Reguler in July 2026.
 */

/** A block's shape on the sheet — the writer switches on this. */
export type KbaBlockKind =
  | "placeholder" // no program row exists yet; structure printed, figures "-"
  | "observasi" // Hal yang Diobservasi | Aktual | Benchmark | Notes
  | "hitsMatrix" // per-type tables + TOTAL observasi table (HITS Safar)
  | "roster" // per-peserta + per-pengajar name tables (Tahsin Keluarga)
  | "laz"; // al-Fatihah assessment + Tahsin al-Fatihah

export type KbaBlockSpec = {
  key: string;
  title: string;
  kind: KbaBlockKind;
  /** Program slug this block reads. Absent for `placeholder`. */
  slug?: string;
  /** Read the whole batch family (HITS Safar = Juli + Januari). */
  combined?: boolean;
  /** Sub-headings for a placeholder block, one observasi table each. */
  subTitles?: string[];
  /** Whether the observasi table carries the setoran rows (HTQ only). */
  setoran?: boolean;
  /**
   * Count only the batches that held a meeting inside the report period.
   * For a rolling-batch program (LAZ opens a new batch every 1–2 weeks, all
   * mirrored into one program row) the unfiltered count is the all-time total
   * and keeps growing whatever period is asked for.
   */
  batchesInPeriodOnly?: boolean;
};

export const KBA_BLOCKS: KbaBlockSpec[] = [
  {
    key: "tahsin-nurim",
    title: "Halaqah Tahsin Al-Fatihah dan Al-Qur'an di Community Mosque",
    kind: "placeholder",
    subTitles: ["Tahsin Al-Qur'an", "Tahsin Al-Fatihah"],
  },
  {
    key: "htq",
    title: "HTQ (Halaqah Tahfizh Al Qur'an)",
    kind: "observasi",
    slug: "tahfizh-nurul-iman",
    setoran: true,
  },
  { key: "hits-nurim", title: "HITS NURIM", kind: "observasi", slug: "hits-nurul-iman" },
  { key: "hits-safar", title: "HITS SAFAR", kind: "hitsMatrix", slug: "hits-safar", combined: true },
  { key: "tahsin-keluarga", title: "TAHSIN KELUARGA", kind: "roster", slug: "tahsin-keluarga" },
  {
    key: "laz",
    title: "Assessment Al-Fatihah dan Tahsin Al-Fatihah LAZ",
    kind: "laz",
    slug: "tafm-laz",
    batchesInPeriodOnly: true,
  },
  { key: "hits-ortu-abk", title: "HITS orang Tua ABK", kind: "observasi", slug: "hits-ortu-abk" },
];

/** Every program slug the KBA sheet reads. */
export const KBA_SLUGS: string[] = KBA_BLOCKS.flatMap((b) => (b.slug ? [b.slug] : []));
