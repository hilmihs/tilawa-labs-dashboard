import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Data for the teacher gap-confirmation magic-link page and its writes. A
 * "gap meeting" here matches the monthly recap's definition of not-taught:
 * jadwal status ∉ (3,4) (Mulai/Selesai) and the date has passed. Scoped to one
 * halaqah; a 120-day window keeps the list bounded. Existing confirmations are
 * joined so the teacher sees what they already answered.
 */

export type ConfirmStatus =
  | "tidak_mengajar"
  | "mengajar_belum_input"
  | "mengajar_kendala_sistem"
  | "diisi_koordinator" // coordinator force-filled the meeting as taught
  // The monthly recap page (/rekap/<token>) lets a teacher dispute a meeting the
  // system already counts as taught — wrong date, wrong halaqah, not them. The
  // column is `text`, so widening this union needs no migration.
  | "data_tidak_sesuai";

export type GapMeetingView = {
  jadwalId: number;
  order: number | null;
  date: string | null;
  guruId: number | null;
  status: ConfirmStatus | null; // existing confirmation, if any
  reasonCode: string | null;
  reasonText: string | null;
};

export type HalaqahConfirmView = {
  halaqahName: string | null;
  meetings: GapMeetingView[];
};

export async function getHalaqahConfirmView(
  programId: string,
  tilawahHalaqahId: number,
): Promise<HalaqahConfirmView> {
  const db = getDb();
  const rows = await db.execute(sql`
    select j.tilawah_jadwal_id as jadwal_id,
           j."order" as ord,
           j.schedule_date::text as date,
           j.guru_id as guru_id,
           h.name as halaqah_name,
           c.status as conf_status,
           c.reason_code as conf_reason_code,
           c.reason_text as conf_reason_text
    from jadwal_sync j
    join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    left join teacher_meeting_confirmations c
      on c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
    where j.program_id = ${programId}
      and j.tilawah_halaqah_id = ${tilawahHalaqahId}
      and j.schedule_date <= current_date
      and j.schedule_date >= current_date - interval '120 days'
      and (j.status is null or j.status not in (3, 4))
    order by j.schedule_date asc nulls last, j."order" asc
  `);

  const meetings: GapMeetingView[] = rows.rows.map((r) => ({
    jadwalId: Number(r.jadwal_id),
    order: r.ord != null ? Number(r.ord) : null,
    date: (r.date as string) ?? null,
    guruId: r.guru_id != null ? Number(r.guru_id) : null,
    status: (r.conf_status as ConfirmStatus) ?? null,
    reasonCode: (r.conf_reason_code as string) ?? null,
    reasonText: (r.conf_reason_text as string) ?? null,
  }));

  return {
    halaqahName: (rows.rows[0]?.halaqah_name as string) ?? null,
    meetings,
  };
}

export type ConfirmInput = {
  jadwalId: number;
  order: number | null;
  date: string | null;
  guruId: number | null;
  status: ConfirmStatus;
  reasonCode: string | null;
  reasonText: string | null;
};

/** Upsert one meeting confirmation (one row per program+jadwal). */
export async function upsertConfirmation(
  programId: string,
  tilawahHalaqahId: number,
  input: ConfirmInput,
  confirmedByPhone: string | null,
): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    insert into teacher_meeting_confirmations
      (program_id, tilawah_halaqah_id, tilawah_jadwal_id, guru_id, meeting_order,
       schedule_date, status, reason_code, reason_text, confirmed_by_phone, source)
    values
      (${programId}, ${tilawahHalaqahId}, ${input.jadwalId}, ${input.guruId},
       ${input.order}, ${input.date}, ${input.status}, ${input.reasonCode},
       ${input.reasonText}, ${confirmedByPhone}, 'wa_magiclink')
    on conflict (program_id, tilawah_jadwal_id) do update set
      status = excluded.status,
      reason_code = excluded.reason_code,
      reason_text = excluded.reason_text,
      guru_id = excluded.guru_id,
      meeting_order = excluded.meeting_order,
      schedule_date = excluded.schedule_date,
      updated_at = now()
  `);
}

export type ForceFillInput = {
  programId: string;
  jadwalId: number;
  status: ConfirmStatus; // 'diisi_koordinator' (taught) or 'tidak_mengajar' (resolved, not taught)
  reasonCode: string | null;
  reasonText: string | null;
  confirmedBy: string; // coordinator email
};

/**
 * Coordinator force-fills a meeting on the teacher's behalf from the report page.
 * Looks up the meeting's halaqah/order/date/guru from jadwal_sync (the client only
 * passes program + jadwal id) and upserts a confirmation with source='coordinator'
 * and the coordinator's email for audit. Returns false if the jadwal isn't found.
 */
export async function forceFillConfirmation(input: ForceFillInput): Promise<boolean> {
  const db = getDb();
  const meta = await db.execute(sql`
    select tilawah_halaqah_id, "order" as ord, schedule_date::text as date, guru_id
    from jadwal_sync
    where program_id = ${input.programId} and tilawah_jadwal_id = ${input.jadwalId}
    limit 1
  `);
  const row = meta.rows[0];
  if (!row) return false;

  await db.execute(sql`
    insert into teacher_meeting_confirmations
      (program_id, tilawah_halaqah_id, tilawah_jadwal_id, guru_id, meeting_order,
       schedule_date, status, reason_code, reason_text, confirmed_by, source)
    values
      (${input.programId}, ${Number(row.tilawah_halaqah_id)}, ${input.jadwalId},
       ${row.guru_id != null ? Number(row.guru_id) : null},
       ${row.ord != null ? Number(row.ord) : null}, ${(row.date as string) ?? null},
       ${input.status}, ${input.reasonCode}, ${input.reasonText}, ${input.confirmedBy}, 'coordinator')
    on conflict (program_id, tilawah_jadwal_id) do update set
      status = excluded.status,
      reason_code = excluded.reason_code,
      reason_text = excluded.reason_text,
      confirmed_by = excluded.confirmed_by,
      source = 'coordinator',
      -- Re-point the confirmation at the meeting's CURRENT guru/order/date. A
      -- badal handover reassigns the jadwal's guru upstream (13 → 37) AFTER a
      -- coordinator already force-filled it taught; the report joins a
      -- confirmation by the meeting's per-meeting guru, so a row left carrying
      -- the previous guru silently drops off the substitute's recap and the
      -- meeting reads as an untaught gap ("sudah klik tandai mengajar tapi gak
      -- masuk"). The freshly-read excluded.* values are always the meeting's
      -- own, so a second force-fill self-heals what a resync knocked stale.
      guru_id = excluded.guru_id,
      meeting_order = excluded.meeting_order,
      schedule_date = excluded.schedule_date,
      updated_at = now()
  `);
  return true;
}

/**
 * Coordinator undo: drop a meeting's confirmation entirely, restoring it to its
 * raw upstream state. Used when a teacher's own mark was simply wrong (e.g. a
 * `data_tidak_sesuai` dispute on a meeting that WAS taught as recorded) and the
 * coordinator wants the flag gone rather than replaced by another status.
 * Idempotent — clearing a meeting that has no confirmation is a no-op success.
 */
export async function clearConfirmation(programId: string, jadwalId: number): Promise<boolean> {
  const db = getDb();
  await db.execute(sql`
    delete from teacher_meeting_confirmations
    where program_id = ${programId} and tilawah_jadwal_id = ${jadwalId}
  `);
  return true;
}
