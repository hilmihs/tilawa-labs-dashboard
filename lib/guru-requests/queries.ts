import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guruChangeRequests, programs } from "@/lib/db/schema";

export type CreateRequestInput = {
  programId: string;
  tilawahHalaqahId: number;
  tilawahJadwalId: number;
  requestType: "reschedule" | "badal";
  requestedByGuruId: number | null;
  requestedByName: string;
  requestedByPhone: string | null;
  newScheduleDate?: string | null;
  newStartAt?: string | null;
  newEndAt?: string | null;
  newGuruId?: number | null;
  newGuruName?: string | null;
  reasonText?: string | null;
  coordinatorPhone: string;
};

export async function createRequest(inp: CreateRequestInput): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(guruChangeRequests)
    .values({
      programId: inp.programId,
      tilawahHalaqahId: inp.tilawahHalaqahId,
      tilawahJadwalId: inp.tilawahJadwalId,
      requestType: inp.requestType,
      requestedByGuruId: inp.requestedByGuruId,
      requestedByName: inp.requestedByName,
      requestedByPhone: inp.requestedByPhone,
      newScheduleDate: inp.newScheduleDate ?? null,
      newStartAt: inp.newStartAt ?? null,
      newEndAt: inp.newEndAt ?? null,
      newGuruId: inp.newGuruId ?? null,
      newGuruName: inp.newGuruName ?? null,
      reasonText: inp.reasonText ?? null,
      status: "pending",
      coordinatorPhone: inp.coordinatorPhone,
    })
    .returning({ id: guruChangeRequests.id });
  return row.id;
}

export type ChangeRequest = typeof guruChangeRequests.$inferSelect & { programSlug: string };

export async function getRequest(rid: string): Promise<ChangeRequest | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(guruChangeRequests)
    .innerJoin(programs, eq(guruChangeRequests.programId, programs.id))
    .where(eq(guruChangeRequests.id, rid));
  if (!row) return null;
  return { ...row.guru_change_requests, programSlug: row.programs.slug };
}

/**
 * Requests for one program, newest first, optionally filtered by status.
 *
 * There was no list query until now: a coordinator only ever saw a request
 * through the WA magic link that notified them, so a `pending` row nobody
 * clicked was invisible everywhere — including the dashboard. This is what
 * makes "a teacher asked to reschedule and nobody looked at it" answerable.
 * Rides the existing gcr_status_idx / gcr_jadwal_idx.
 */
export async function listRequests(
  programSlug: string,
  status?: string,
  limit = 50,
): Promise<ChangeRequest[]> {
  const db = getDb();
  const where = status
    ? and(eq(programs.slug, programSlug), eq(guruChangeRequests.status, status))
    : eq(programs.slug, programSlug);

  const rows = await db
    .select()
    .from(guruChangeRequests)
    .innerJoin(programs, eq(guruChangeRequests.programId, programs.id))
    .where(where)
    .orderBy(desc(guruChangeRequests.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r.guru_change_requests, programSlug: r.programs.slug }));
}

export async function markDecision(
  rid: string,
  status: "approved" | "rejected",
  decidedBy: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(guruChangeRequests)
    .set({ status, decidedBy, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(guruChangeRequests.id, rid));
}

export async function markApplyResult(
  rid: string,
  ok: boolean,
  result: unknown,
): Promise<void> {
  const db = getDb();
  await db
    .update(guruChangeRequests)
    .set({
      status: ok ? "applied" : "failed",
      appliedResult: result as object,
      appliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(guruChangeRequests.id, rid));
}
