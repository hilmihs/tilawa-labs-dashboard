import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Who has already been nudged, when, and how many times.
 *
 * The "Ingatkan via WA" button opens wa.me and the coordinator finishes the
 * send by hand, so the dashboard never sees the message. Without recording the
 * click, the Action Items list looks identical whether a teacher was reminded
 * five minutes ago or never — which is how the same person gets chased three
 * times in one evening by two different coordinators, and how someone else is
 * quietly forgotten.
 *
 * Stored in notification_log (channel 'wa_reminder_click') rather than a new
 * table: the row shape already fits, and every other send this app knows about
 * is queryable from the same place.
 */

export type ReminderTarget = {
  programId: string;
  halaqahId: number;
  pengajar: string | null;
  phone: string | null;
};

export type ReminderHistory = {
  count: number;
  lastAt: string; // ISO
  lastBy: string | null; // coordinator email
};

/** Record one click. Never throws — a failed log must not block the reminder. */
export async function logReminderClick(
  target: ReminderTarget,
  clickedBy: string | null,
): Promise<void> {
  try {
    const db = getDb();
    await db.execute(sql`
      insert into notification_log (channel, recipient, payload, status)
      values (
        'wa_reminder_click',
        ${target.phone ?? "(tanpa nomor)"},
        ${JSON.stringify({
          programId: target.programId,
          halaqahId: target.halaqahId,
          pengajar: target.pengajar,
          clickedBy,
        })}::jsonb,
        'clicked'
      )
    `);
  } catch {
    // Deliberately silent: the coordinator is mid-click, and a logging failure
    // is not worth interrupting the nudge they are about to send.
  }
}

/**
 * Click history for one program's halaqah, keyed by tilawah halaqah id.
 * One query for the whole page — the inbox renders up to 50 rows at once.
 */
export async function getReminderHistory(
  programId: string,
): Promise<Map<number, ReminderHistory>> {
  const db = getDb();
  const rows = await db.execute(sql`
    select (payload->>'halaqahId')::int as halaqah_id,
           count(*)::int as n,
           max(created_at) as last_at,
           (array_agg(payload->>'clickedBy' order by created_at desc))[1] as last_by
    from notification_log
    where channel = 'wa_reminder_click'
      and payload->>'programId' = ${programId}
      and payload->>'halaqahId' is not null
    group by 1
  `);

  const out = new Map<number, ReminderHistory>();
  for (const r of rows.rows) {
    const halaqahId = Number(r.halaqah_id);
    if (!Number.isFinite(halaqahId)) continue;
    out.set(halaqahId, {
      count: Number(r.n),
      lastAt: new Date(r.last_at as string).toISOString(),
      lastBy: (r.last_by as string) ?? null,
    });
  }
  return out;
}
