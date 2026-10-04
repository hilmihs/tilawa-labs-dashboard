import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Halaqah mirrored under a program whose batch the program is no longer pinned
 * to — and a way for a coordinator to remove them deliberately.
 *
 * The automatic prune in lib/sync/tilawah-sync.ts refuses to delete more than a
 * fifth of a program in one run, because a shrunken upstream list is more often
 * a bad fetch than a real deletion. That cap is right, and it also means a
 * program that accumulates MORE strays than the cap can never heal on its own:
 * HKM-Presensi sat at seven strays against a cap of five, so every sync logged a
 * warning and changed nothing, while seven TAFM LAZ classes went on padding its
 * dashboard for weeks.
 *
 * The escape hatch is a human saying yes. This module defines a stray by a test
 * that needs no upstream call and cannot be fooled by a partial fetch: the row's
 * own `tilawah_batch_id` contradicts the batch its program is pinned to. Nothing
 * here is guessed from absence.
 *
 * Everything removed is mirror data — a re-sync rebuilds any row that still
 * exists upstream. App-owned rows (`students`, confirmations, notes) are left
 * alone, exactly as the automatic prune leaves them.
 */

export type BatchStray = {
  halaqahId: number;
  name: string | null;
  batchId: number | null;
  pengajar: string | null;
  jadwal: number;
  attendance: number;
  students: number;
};

/** Strays for one program, with the rows that would go with each. */
export async function listBatchStrays(programId: string): Promise<BatchStray[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    select h.tilawah_halaqah_id as hid,
           h.name,
           h.tilawah_batch_id as batch,
           h.pengajar,
           (select count(*) from jadwal_sync j
             where j.program_id = h.program_id
               and j.tilawah_halaqah_id = h.tilawah_halaqah_id)::int as jadwal,
           (select count(*) from attendance_sync a
             join jadwal_sync j on j.program_id = a.program_id
              and j.tilawah_jadwal_id = a.halaqah_jadwal_id
             where j.program_id = h.program_id
               and j.tilawah_halaqah_id = h.tilawah_halaqah_id)::int as presensi,
           (select count(*) from students_sync s
             where s.program_id = h.program_id
               and s.halaqah_id = h.tilawah_halaqah_id)::int as murid
    from halaqah_sync h
    join programs p on p.id = h.program_id
    where h.program_id = ${programId}
      -- A rolling-batch program mirrors every batch on purpose (config.
      -- syncAllBatches), so "batch differs from the pin" proves nothing there —
      -- its pin is only a single-batch fallback. Without this guard, switching a
      -- program to syncAllBatches would present every halaqah of every new batch
      -- as a stray and offer to delete them.
      and coalesce((p.config->>'syncAllBatches')::boolean, false) = false
      and p.tilawah_batch_id is not null
      and h.tilawah_batch_id is not null
      and h.tilawah_batch_id <> p.tilawah_batch_id
    order by h.name
  `);

  return rows.rows.map((r) => ({
    halaqahId: Number(r.hid),
    name: (r.name as string) ?? null,
    batchId: r.batch != null ? Number(r.batch) : null,
    pengajar: (r.pengajar as string) ?? null,
    jadwal: Number(r.jadwal),
    attendance: Number(r.presensi),
    students: Number(r.murid),
  }));
}

export type PurgeStraysResult = {
  halaqah: number;
  jadwal: number;
  attendance: number;
  studentsSync: number;
};

/**
 * Delete this program's batch strays. Deliberately NOT capped: the caller is a
 * coordinator who has just been shown exactly what disappears.
 *
 * Order matters — attendance reaches its halaqah only through jadwal_sync, so
 * the link must still exist while it is deleted.
 */
export async function purgeBatchStrays(programId: string): Promise<PurgeStraysResult> {
  const db = getDb();
  const strays = await listBatchStrays(programId);
  if (strays.length === 0) {
    return { halaqah: 0, jadwal: 0, attendance: 0, studentsSync: 0 };
  }
  const ids = sql.join(
    strays.map((s) => sql`${s.halaqahId}`),
    sql`, `,
  );

  const att = await db.execute(sql`
    delete from attendance_sync a
    using jadwal_sync j
    where j.program_id = a.program_id
      and j.tilawah_jadwal_id = a.halaqah_jadwal_id
      and j.program_id = ${programId}
      and j.tilawah_halaqah_id in (${ids})
  `);
  const jad = await db.execute(sql`
    delete from jadwal_sync
    where program_id = ${programId} and tilawah_halaqah_id in (${ids})
  `);
  const stu = await db.execute(sql`
    delete from students_sync
    where program_id = ${programId} and halaqah_id in (${ids})
  `);
  const hal = await db.execute(sql`
    delete from halaqah_sync
    where program_id = ${programId} and tilawah_halaqah_id in (${ids})
  `);

  return {
    halaqah: hal.rowCount ?? 0,
    jadwal: jad.rowCount ?? 0,
    attendance: att.rowCount ?? 0,
    studentsSync: stu.rowCount ?? 0,
  };
}
