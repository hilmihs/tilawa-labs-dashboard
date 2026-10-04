import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { lateIncidents, students, studentsSync, jadwalSync } from "@/lib/db/schema";
import { loginToTilawah } from "@/lib/integrations/tilawah-auth";
import { pushPresensiStatus } from "@/lib/integrations/tilawah";

export type PushLateStatusResult =
  | { pushed: true; tilawahPresensiId: number }
  | { pushed: false; reason: string };

/**
 * Pushes a late_incidents row back to the real tilawah system as a "Telat"
 * presensi record, so a guru piket submission updates both systems from one
 * input (notulensi bag. 4 efficiency goal). Resolves our own student_id +
 * occurred_at into tilawah's halaqah_user_id + halaqah_jadwal_id via
 * students/students_sync/jadwal_sync (populated by the sync engine) — see
 * lib/sync/tilawah-sync.ts and lib/integrations/tilawah.ts for how those IDs
 * were confirmed live.
 *
 * Fails soft: every failure mode returns `{ pushed: false, reason }` rather
 * than throwing, since the late_incidents row is already saved in our own DB
 * regardless — a failed push here must never look like the guru's submit failed.
 */
export async function pushLateIncidentToTilawah(lateIncidentId: string): Promise<PushLateStatusResult> {
  const baseUrl = process.env.TILAWAH_BASE_URL;
  if (!baseUrl) return { pushed: false, reason: "TILAWAH_BASE_URL not set" };

  const db = getDb();

  const [incident] = await db
    .select({
      id: lateIncidents.id,
      studentId: lateIncidents.studentId,
      occurredAt: lateIncidents.occurredAt,
      alasan: lateIncidents.alasan,
      programId: lateIncidents.programId,
    })
    .from(lateIncidents)
    .where(eq(lateIncidents.id, lateIncidentId));
  if (!incident) return { pushed: false, reason: "late incident not found" };

  const [student] = await db
    .select({ tilawahUserId: students.tilawahUserId })
    .from(students)
    .where(eq(students.id, incident.studentId));
  if (!student?.tilawahUserId) {
    return {
      pushed: false,
      reason: "student not yet reconciled with tilawah (no tilawah_user_id) — rerun the sync engine",
    };
  }

  const [syncRow] = await db
    .select({ halaqahUserId: studentsSync.halaqahUserId, halaqahId: studentsSync.halaqahId })
    .from(studentsSync)
    .where(
      and(
        eq(studentsSync.programId, incident.programId),
        eq(studentsSync.tilawahUserId, student.tilawahUserId),
      ),
    );
  if (!syncRow?.halaqahUserId || !syncRow.halaqahId) {
    return { pushed: false, reason: "no halaqah_user_id found in students_sync for this student" };
  }

  const [jadwalRow] = await db
    .select({ tilawahJadwalId: jadwalSync.tilawahJadwalId })
    .from(jadwalSync)
    .where(
      and(
        eq(jadwalSync.tilawahHalaqahId, syncRow.halaqahId),
        eq(jadwalSync.scheduleDate, incident.occurredAt),
      ),
    );
  if (!jadwalRow) {
    return {
      pushed: false,
      reason: `no pertemuan found in tilawah for halaqah ${syncRow.halaqahId} on ${incident.occurredAt}`,
    };
  }

  const session = await loginToTilawah(baseUrl);
  const result = await pushPresensiStatus({
    baseUrl,
    cookieHeader: session.cookieHeader,
    xsrfToken: session.xsrfToken,
    halaqahUserId: syncRow.halaqahUserId,
    halaqahJadwalId: jadwalRow.tilawahJadwalId,
    status: 2, // Telat — confirmed live 2026-07-12, see lib/integrations/tilawah.ts
    notes: incident.alasan ?? "",
  });

  if (!result.implemented || !result.ok) {
    return { pushed: false, reason: result.reason ?? "unknown error" };
  }

  await db
    .update(lateIncidents)
    .set({ tilawahPresensiSynced: true })
    .where(eq(lateIncidents.id, lateIncidentId));

  return { pushed: true, tilawahPresensiId: result.presensiId };
}
