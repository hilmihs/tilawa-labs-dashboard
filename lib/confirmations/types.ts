/**
 * Shared contract for the monthly teacher recap confirmation flow (WA blast →
 * /rekap/<token> → teacher_meeting_confirmations).
 *
 * Every module in the flow imports its types from here so the query, the page,
 * the message builder and the agent endpoint cannot drift apart. Types only —
 * no runtime dependencies, so importing this from a client component is safe.
 */

/**
 * The per-meeting answer a teacher can give. The first four already exist in
 * teacher_meeting_confirmations (see lib/confirmations/queries.ts);
 * `data_tidak_sesuai` is new: the meeting IS recorded as taught but the teacher
 * says the record is wrong (wrong date, wrong teacher, not their halaqah).
 * `status` is a text column, so no migration is needed to add it.
 */
export type RecapConfirmStatus =
  | "tidak_mengajar"
  | "mengajar_belum_input"
  | "mengajar_kendala_sistem"
  | "diisi_koordinator"
  | "data_tidak_sesuai";

/** One meeting in the recap, as the teacher sees it. */
export type RecapMeeting = {
  jadwalId: number; // tilawah_jadwal_id — the write key
  programId: string; // programs.id (uuid)
  programSlug: string;
  programName: string;
  halaqahId: number; // tilawah_halaqah_id
  halaqahName: string;
  order: number | null;
  date: string | null; // YYYY-MM-DD
  /** jadwal status ∈ (3,4) = Mulai/Selesai — the system says this was taught. */
  done: boolean;
  /** Existing confirmation for this meeting, if the teacher already answered. */
  confStatus: RecapConfirmStatus | null;
  reasonCode: string | null;
  reasonText: string | null;
};

/** The teacher's meetings in one halaqah, oldest first. */
export type RecapHalaqah = {
  programSlug: string;
  programName: string;
  halaqahId: number;
  halaqahName: string;
  /** True when this teacher is not the halaqah's main pengajar (badal). */
  asBadal: boolean;
  meetings: RecapMeeting[];
  taught: number; // meetings with done = true
  gaps: number; // meetings with done = false
  confirmed: number; // gap meetings that already carry a confirmation
};

export type RecapCounts = {
  halaqah: number;
  meetings: number;
  taught: number;
  gaps: number;
  confirmed: number; // gap meetings already answered
  unresolved: number; // gaps - confirmed
};

/** Everything one teacher is asked to confirm for one period. */
export type TeacherRecap = {
  guruId: number; // tilawah user id — stable across programs
  nama: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  halaqah: RecapHalaqah[];
  counts: RecapCounts;
};

/** Blast-list row: the recap folded to counts, plus the contact details. */
export type RecapTeacherSummary = {
  guruId: number;
  nama: string;
  /** Normalized 62… form, or null when no number is known — never guessed. */
  phone: string | null;
  /** Distinct program names this teacher taught in during the period. */
  programs: string[];
  /** The same programs as slugs — for copy that must target one batch. */
  programSlugs: string[];
  counts: RecapCounts;
};

/** Why a teacher was left out of the blast. Reported, never silently dropped. */
export type RecapSkipReason = "no_phone" | "no_guru_id";

export type RecapSkipped = {
  guruId: number | null;
  nama: string;
  reason: RecapSkipReason;
};
