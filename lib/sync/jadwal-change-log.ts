/**
 * Shared writer for `jadwal_change_events` — the append-only ledger of
 * per-meeting reschedules and badal.
 *
 * Three producers share this module so they agree on the dedupe key and never
 * write the same change twice: the activity-log importer
 * (lib/sync/activity-log-import.ts), the diff computed during the tilawah sync,
 * and the /persetujuan approval path.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export type ChangeField =
  | "schedule_date" // the meeting moved to another day
  | "session_time" // same day, different clock time
  | "guru" // per-meeting teacher swapped (badal)
  | "created"
  | "deleted";

export type ChangeSource = "upstream_log" | "diff" | "guru_request" | "inferred";

export type ChangeEventDraft = {
  programId: string;
  tilawahHalaqahId: number | null;
  tilawahJadwalId: number;
  meetingOrder: number | null;
  meetingName: string | null;
  /** The meeting's date AFTER the change — the monthly aggregation axis. */
  scheduleDate: string | null;
  field: ChangeField;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
  affectedGuruId: number | null;
  affectedGuruName: string | null;
  changedAt: Date;
  source: ChangeSource;
  upstreamLogId: number | null;
  actorUserId: number | null;
  actorName: string | null;
  guruRequestId: string | null;
  raw: unknown;
};

/**
 * Minute-granularity key so the same change seen by two producers collapses.
 * Must be computed identically everywhere — hence living here and nowhere else.
 */
export function makeDedupeKey(d: {
  tilawahJadwalId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
}): string {
  return [
    d.tilawahJadwalId,
    d.field,
    d.oldValue ?? "",
    d.newValue ?? "",
    d.changedAt.toISOString().slice(0, 16),
  ].join("|");
}

/**
 * Insert drafts, ignoring anything already recorded. `onConflictDoNothing` is
 * issued WITHOUT a target so either unique index (dedupe key or upstream log id)
 * absorbs the collision. Returns how many rows were actually new.
 *
 * Callers inside the sync MUST wrap this in try/catch: the ledger is a nice-to-
 * have, the sync is the money path, and a ledger failure must never abort it.
 */
export async function recordChangeEvents(drafts: ChangeEventDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const db = getDb();
  let inserted = 0;

  // Chunked so a large backfill doesn't build one enormous statement.
  const CHUNK = 200;
  for (let i = 0; i < drafts.length; i += CHUNK) {
    const slice = drafts.slice(i, i + CHUNK);
    const values = slice.map((d) => {
      const dedupeKey = makeDedupeKey(d);
      return sql`(
        ${d.programId}::uuid, ${d.tilawahHalaqahId}, ${d.tilawahJadwalId},
        ${d.meetingOrder}, ${d.meetingName}, ${d.scheduleDate}::date,
        ${d.field}, ${d.oldValue}, ${d.newValue}, ${d.oldLabel}, ${d.newLabel},
        ${d.affectedGuruId}, ${d.affectedGuruName},
        ${d.changedAt.toISOString()}::timestamptz,
        ${d.source}, ${d.upstreamLogId}, ${d.actorUserId}, ${d.actorName},
        ${d.guruRequestId}::uuid, ${dedupeKey}, ${JSON.stringify(d.raw ?? {})}::jsonb
      )`;
    });
    const res = await db.execute(sql`
      insert into jadwal_change_events (
        program_id, tilawah_halaqah_id, tilawah_jadwal_id,
        meeting_order, meeting_name, schedule_date,
        field, old_value, new_value, old_label, new_label,
        affected_guru_id, affected_guru_name,
        changed_at, source, upstream_log_id, actor_user_id, actor_name,
        guru_request_id, dedupe_key, raw
      )
      values ${sql.join(values, sql`, `)}
      on conflict do nothing
      returning id
    `);
    inserted += res.rows?.length ?? 0;
  }
  return inserted;
}
