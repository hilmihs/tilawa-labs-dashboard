"use server";

import { requireProgramAccess, getAccessiblePrograms } from "@/lib/programs/resolve";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getParticipantReport,
  getTeacherReport,
  getHitsMonthlyReport,
  getExitedParticipants,
  type ParticipantReport,
  type TeacherReport,
  type HitsMonthlyReport,
  type ExitedParticipant,
} from "@/lib/reports/queries";
import { resolveReportScope } from "@/lib/reports/scope";
import { getHasilUjianLaporan, type HasilUjianLaporan } from "@/lib/reports/hasil-ujian";
import {
  forceFillConfirmation,
  clearConfirmation,
  type ConfirmStatus,
} from "@/lib/confirmations/queries";
import { setCorrectionResolved } from "@/lib/confirmations/attestation";

const FORCE_REASONS = ["izin", "sakit", "badal", "libur", "kegiatan", "lainnya"];
// "batal" removes any existing confirmation (undo a teacher's wrong mark),
// restoring the meeting to its raw upstream status.
export type ForceFillOutcome = "mengajar" | "tidak_mengajar" | "batal";
export type ForceFillResult = { ok: true } | { ok: false; error: string };

/**
 * Coordinator/super_coordinator overrides one meeting's status on the teacher's
 * behalf. Works on an unfilled gap OR on a meeting the teacher already marked —
 * including a `data_tidak_sesuai` dispute sitting on a taught meeting, which the
 * teacher can raise from /rekap but never resolve.
 *   "mengajar"       → recorded as taught (diisi_koordinator).
 *   "tidak_mengajar" → recorded as not taught, with a reason.
 *   "batal"          → confirmation removed, meeting back to raw upstream state.
 * Scoped to programs the caller can access; the write is stamped with their
 * email for audit.
 */
export async function forceFillMeeting(
  programId: string,
  jadwalId: number,
  outcome: ForceFillOutcome,
  reasonCode?: string,
  reasonText?: string,
): Promise<ForceFillResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  // Any coordinator may override, but only for programs they can access.
  const programs = await getAccessiblePrograms(user);
  if (!programs.some((p) => p.id === programId)) {
    return { ok: false, error: "Akses ditolak untuk program ini." };
  }

  if (outcome === "batal") {
    await clearConfirmation(programId, jadwalId);
    return { ok: true };
  }

  const status: ConfirmStatus =
    outcome === "mengajar" ? "diisi_koordinator" : "tidak_mengajar";
  let rc: string | null = null;
  let rt: string | null = null;
  if (outcome === "tidak_mengajar") {
    rc = typeof reasonCode === "string" && FORCE_REASONS.includes(reasonCode) ? reasonCode : "lainnya";
    rt = typeof reasonText === "string" && reasonText.trim() ? reasonText.trim().slice(0, 500) : null;
  }

  const ok = await forceFillConfirmation({
    programId,
    jadwalId,
    status,
    reasonCode: rc,
    reasonText: rt,
    confirmedBy: user.email,
  });
  return ok ? { ok: true } : { ok: false, error: "Pertemuan tidak ditemukan." };
}

/**
 * `batch` is the report's scope selector: undefined = just this program row,
 * "all" = every batch of its family the caller may read. resolveReportScope does
 * the widening and intersects it with the session's grants, so "all" can never
 * reach past what requireProgramAccess already allowed.
 */
export async function fetchParticipantReport(
  program: string,
  start: string,
  end: string,
  batch?: string,
): Promise<ParticipantReport | null> {
  await requireProgramAccess(program);
  const scope = await resolveReportScope(program, batch);
  if (!scope) return null;
  return getParticipantReport(scope, start, end);
}

/** HITS coordinator recap (blocks per halaqah type × level). */
export async function fetchHitsMonthlyReport(
  program: string,
  start: string,
  end: string,
  batch?: string,
): Promise<HitsMonthlyReport | null> {
  await requireProgramAccess(program);
  const scope = await resolveReportScope(program, batch);
  if (!scope) return null;
  return getHitsMonthlyReport(scope, start, end);
}

/** Tab "Hasil Ujian": nilai Evaluasi Halaqah per akhir periode + aktivitas di periode. */
export async function fetchHasilUjian(
  program: string,
  start: string,
  end: string,
  batch?: string,
): Promise<HasilUjianLaporan | null> {
  await requireProgramAccess(program);
  const scope = await resolveReportScope(program, batch);
  if (!scope) return null;
  return getHasilUjianLaporan(scope, start, end);
}

/** Peserta keluar / non-aktif in scope, each with the reason recorded upstream. */
export async function fetchExitedParticipants(
  program: string,
  start: string,
  end: string,
  batch?: string,
): Promise<ExitedParticipant[]> {
  await requireProgramAccess(program);
  const scope = await resolveReportScope(program, batch);
  if (!scope) return [];
  return getExitedParticipants(scope, start, end);
}

/** Teacher recap is cross-program: aggregates every program the user can access. */
export async function fetchTeacherReport(start: string, end: string): Promise<TeacherReport> {
  const user = await getCurrentUser();
  if (!user) return { start, end, teachers: [], totalReal: 0, totalIdeal: 0 };
  const programs = await getAccessiblePrograms(user);
  return getTeacherReport(start, end, programs.map((p) => p.id));
}

/**
 * Mark a teacher's correction as handled — or re-open it.
 *
 * The queue only works if a handled item leaves it. Everything the teacher wrote
 * stays; this records that a coordinator acted, with their email and the moment.
 * Any coordinator may do it, and unlike force-fill it touches no attendance at
 * all, so the only guard needed is that they are logged in.
 */
export async function setCorrectionHandled(
  guruId: number,
  periodStart: string,
  periodEnd: string,
  resolved: boolean,
): Promise<ForceFillResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };
  try {
    await setCorrectionResolved(guruId, periodStart, periodEnd, resolved, user.email);
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal menyimpan penandaan." };
  }
}
