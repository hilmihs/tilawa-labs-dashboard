/**
 * Which `students_sync` columns an upsert is allowed to overwrite.
 *
 * A sync run learns about a peserta from two independent places, and neither
 * one sees every column:
 *
 *   - the **halaqah detail** (`/api/halaqah/{id}`) carries the enrollment —
 *     `halaqah_user_id`, gender, and the pivot status/reason/timestamps;
 *   - the program-wide **absensi report** carries phone, user_code, the
 *     "6/26" pertemuan string and the semester percentage.
 *
 * Between full sweeps the sync deliberately skips halaqah whose attendance
 * fingerprint has not moved, so a run routinely holds the report half and not
 * the enrollment half. Writing every column unconditionally then blanked good
 * data with nulls — on 25 Agu 2026 that had emptied `halaqah_user_id` for 272
 * murid across RBI / DPQ / TAFM LAZ / HITS Ortu-ABK, and since the halaqah
 * detail page filters `halaqah_user_id is not null`, 17 halaqah rendered
 * "Belum ada peserta" while their dashboard card still counted the peserta.
 *
 * So: a column is written only by the source that actually knows it. Absent
 * source → column untouched, keeping whatever the last informed run wrote.
 */

/** Columns only the halaqah detail can supply. */
export const ENROLLMENT_COLUMNS = [
  "halaqahUserId",
  "gender",
  "enrollmentStatusCode",
  "enrollmentStatus",
  "enrollmentCreatedAt",
  "enrollmentUpdatedAt",
] as const;

/** Columns only the absensi report can supply. */
export const ABSENSI_COLUMNS = ["userCode", "phone", "pertemuan", "kehadiranPercentage"] as const;

/**
 * Columns either source can supply, so they are always safe to write — the
 * caller has already resolved them with an enrollment-first fallback.
 */
export const SHARED_COLUMNS = ["name", "halaqahId", "pengajar", "raw", "syncedAt"] as const;

type Column =
  | (typeof ENROLLMENT_COLUMNS)[number]
  | (typeof ABSENSI_COLUMNS)[number]
  | (typeof SHARED_COLUMNS)[number];

export type StudentsSyncSources = {
  /** This run fetched the halaqah detail, so the enrollment columns are real. */
  hasEnrollment: boolean;
  /** This peserta appears in the absensi report, so the report columns are real. */
  hasAbsensi: boolean;
};

/**
 * The `set` clause for the students_sync ON CONFLICT — every column the given
 * sources can vouch for, and nothing else.
 */
export function studentsSyncUpdateSet<T extends Partial<Record<Column, unknown>>>(
  values: T,
  { hasEnrollment, hasAbsensi }: StudentsSyncSources,
): Partial<T> {
  const columns: Column[] = [
    ...SHARED_COLUMNS,
    ...(hasEnrollment ? ENROLLMENT_COLUMNS : []),
    ...(hasAbsensi ? ABSENSI_COLUMNS : []),
  ];
  const set: Partial<T> = {};
  for (const c of columns) {
    if (c in values) set[c as keyof T] = values[c as keyof T];
  }
  return set;
}
