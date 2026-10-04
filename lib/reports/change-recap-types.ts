/**
 * Pure types + labels for the perubahan recap.
 *
 * Kept apart from change-recap.ts on purpose: that module imports getDb, and a
 * `"use client"` component importing ANY runtime value from it drags the pg
 * driver into the browser bundle ("Module not found: Can't resolve 'dns'").
 * Client components import from here; the query module re-exports these so
 * server callers only need one import.
 */

/**
 * Why a halaqah's meetings are taught by someone other than its recorded guru.
 * Ordered as a cascade — the first matching rule wins.
 */
export type DeviationCategory =
  | "tanpa_pengajar_tercatat" // H — the halaqah has no recorded guru at all
  | "duplikat_akun_guru" // G — same person, two tilawah accounts
  | "artefak_impor" // F — every deviation points at Superadmin #1
  | "catatan_salah_total" // A1 — recorded guru taught none of the meetings
  | "catatan_salah" // A2 — recorded guru taught <20% of them
  | "serah_terima" // B — one block at the start; the record is already correct
  | "ganti_guru_belum_dicatat" // C — one block at the end; the record is stale
  | "badal"; // D — sporadic, the real thing

export const CATEGORY_LABEL: Record<DeviationCategory, string> = {
  badal: "Badal",
  ganti_guru_belum_dicatat: "Ganti guru belum dicatat",
  serah_terima: "Serah terima",
  catatan_salah: "Catatan halaqah salah",
  catatan_salah_total: "Catatan halaqah salah (total)",
  duplikat_akun_guru: "Akun pengajar ganda",
  tanpa_pengajar_tercatat: "Halaqah tanpa pengajar",
  artefak_impor: "Artefak impor",
};

/** Short "so what" shown under each category chip and in the XLSX. */
export const CATEGORY_NOTE: Record<DeviationCategory, string> = {
  badal:
    "Pengajar tetap digantikan pada beberapa pertemuan saja. Ini badal yang sebenarnya.",
  ganti_guru_belum_dicatat:
    "Pengajar berganti di tengah jalan dan seterusnya. Catatan pengajar halaqah perlu diperbarui.",
  serah_terima:
    "Pengajar lama mengajar di awal, lalu diserahkan. Catatan halaqah sudah benar — tidak perlu tindakan.",
  catatan_salah:
    "Hampir semua pertemuan diajar orang lain. Kemungkinan tukar halaqah yang tidak merambat ke catatan.",
  catatan_salah_total:
    "Pengajar yang tercatat tidak pernah mengajar satu pertemuan pun di halaqah ini.",
  duplikat_akun_guru:
    "Nama pengajarnya sama persis, hanya id akunnya berbeda — orang yang sama punya dua akun di tilawah. Perbaikannya menggabungkan akun, bukan mengganti pengajar halaqah.",
  tanpa_pengajar_tercatat:
    "Halaqah ini tidak punya pengajar tercatat sama sekali, padahal pertemuannya ada yang mengajar. Perbaikannya menetapkan pengajar halaqah, bukan menggantinya.",
  artefak_impor:
    "Semua pertemuan jatuh ke Superadmin #1 — guru gagal di-resolve saat impor, bukan perbuatan siapa pun.",
};

/** Categories that mean "the halaqah record is wrong", i.e. Bagian 2 material. */
export const RECORD_PROBLEM: DeviationCategory[] = [
  "catatan_salah_total",
  "catatan_salah",
  "ganti_guru_belum_dicatat",
  "duplikat_akun_guru",
  "tanpa_pengajar_tercatat",
  "artefak_impor",
];

export type DeviationMeeting = {
  programId: string;
  programName: string;
  halaqahId: number;
  halaqah: string;
  jadwalId: number;
  order: number | null;
  name: string | null;
  date: string | null;
  status: number | null;
  statusLabel: string | null;
  recordedGuruId: number | null;
  recordedGuru: string | null;
  actualGuruId: number | null;
  actualGuru: string | null;
  category: DeviationCategory;
};

export type HalaqahRecordIssue = {
  programId: string;
  programName: string;
  halaqahId: number;
  halaqah: string;
  recordedGuruId: number | null;
  recordedGuru: string | null;
  /** Whoever teaches the most meetings — the de-facto teacher. */
  actualGuruId: number | null;
  actualGuru: string | null;
  deviating: number;
  total: number;
  category: DeviationCategory;
  /** Set when another halaqah has the mirror-image mismatch (a swap). */
  swappedWith: { halaqahId: number; halaqah: string } | null;
};

export type TeacherTally = {
  guruId: number | null;
  pengajar: string;
  /** Meetings of THIS teacher's own halaqah taught by somebody else. */
  digantikan: number;
  /** Meetings in SOMEBODY ELSE's halaqah that this teacher taught. */
  menggantikan: number;
  halaqahCount: number;
  /** `digantikan` split by category — drives the category filter. */
  byCategory: Record<DeviationCategory, number>;
  /** `menggantikan` split by category, so the filter narrows both columns. */
  masukByCategory: Record<DeviationCategory, number>;
};

export type MonthTally = {
  month: string; // YYYY-MM
  total: number;
  byCategory: Record<DeviationCategory, number>;
};

export type ChangeRecap = {
  start: string;
  end: string;
  /** Every deviation in range, already classified. */
  meetings: DeviationMeeting[];
  byCategory: Record<DeviationCategory, number>;
  teachers: TeacherTally[];
  months: MonthTally[];
  /** Bagian 2 — halaqah whose recorded teacher disagrees with the de-facto one. */
  recordIssues: HalaqahRecordIssue[];
  /**
   * The same count measured against the PLURALITY teacher instead of the
   * recorded one. Shown as a single comparison line: the gap between the two is
   * exactly the damage done by the stale halaqah records.
   */
  pluralityBaseline: { meetings: number; halaqah: number };
};

/**
 * One recorded change to a meeting's schedule, from `jadwal_change_events`.
 * Unlike the deviation rows above (which are derived from current state), these
 * are real events with a before, an after, a timestamp and usually an actor.
 */
export type ScheduleChangeEvent = {
  id: string;
  programName: string;
  halaqahId: number | null;
  halaqah: string;
  jadwalId: number;
  order: number | null;
  meetingName: string | null;
  /** 'schedule_date' = moved to another day; 'session_time' = same day, new clock time. */
  field: string;
  oldLabel: string | null;
  newLabel: string | null;
  scheduleDate: string | null;
  changedAt: string;
  actorName: string | null;
  actorUserId: number | null;
  source: string;
};

export type ScheduleChangeSummary = {
  events: ScheduleChangeEvent[];
  totalDate: number;
  totalTime: number;
  /** Earliest recorded event — everything before this is simply not known. */
  firstRecordedAt: string | null;
  byMonth: { month: string; date: number; time: number }[];
  byActor: { actor: string; n: number }[];
};

export const FIELD_LABEL: Record<string, string> = {
  schedule_date: "Tanggal diubah",
  session_time: "Jam diubah",
  guru: "Pengajar diubah",
  created: "Pertemuan dibuat",
  deleted: "Pertemuan dihapus",
};

export const EMPTY_BY_CATEGORY = (): Record<DeviationCategory, number> => ({
  badal: 0,
  ganti_guru_belum_dicatat: 0,
  serah_terima: 0,
  catatan_salah: 0,
  catatan_salah_total: 0,
  duplikat_akun_guru: 0,
  tanpa_pengajar_tercatat: 0,
  artefak_impor: 0,
});
