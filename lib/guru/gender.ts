import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { currentBatchOnly } from "@/lib/programs/batch-guard";

/**
 * Is this teacher on the ikhwan or the akhwat side?
 *
 * The blast needs it because the two sides are contacted by different senders:
 * ikhwan through the KIRIMI device, akhwat through the Baileys one. Getting it
 * wrong is not a cosmetic error — it puts a message from the wrong coordinator
 * in front of the wrong person.
 *
 * tilawah does not expose a teacher's gender through anything we sync, so it is
 * inferred from the halaqah they teach, in two steps:
 *
 *  1. The halaqah NAME. HITS names carry the side explicitly ("HITS 044 AKHWAT
 *     JUNI", "HITS 37 IKHWAN 0747") and, unlike the roster, a name cannot be
 *     flipped by a single mis-enrolled student.
 *  2. Failing that, the MAJORITY gender of its students — deliberately not the
 *     minimum the dashboard uses elsewhere, because one ikhwan enrolled in an
 *     akhwat halaqah (a coordinator sitting in, which really happened) drags the
 *     whole halaqah to "ikhwan" under a min() rule.
 *
 * A teacher whose halaqah give conflicting signals, or none, comes back null:
 * the endpoint reports them rather than guessing a sender.
 */

export type GuruSide = "ikhwan" | "akhwat";

export async function getTeacherSides(
  start: string,
  end: string,
  programIds: string[],
): Promise<Map<number, GuruSide | null>> {
  const out = new Map<number, GuruSide | null>();
  if (programIds.length === 0) return out;
  const db = getDb();
  const pid = sql.join(
    programIds.map((id) => sql`${id}`),
    sql`, `,
  );

  // The teacher's own gender, when tilawah gave us one. This outranks every
  // inference below — a person's recorded gender is not a signal to be weighed
  // against halaqah names, it IS the answer.
  const own = await db.execute(sql`
    select g.tilawah_guru_id, min(g.gender) as gender
    from guru_sync g
    join programs p on p.id = g.program_id and p.data_source_type = 'tilawah_api'
    where g.gender is not null
    group by g.tilawah_guru_id
  `);
  for (const r of own.rows) {
    const guruId = Number(r.tilawah_guru_id);
    const gender = Number(r.gender);
    if (!Number.isFinite(guruId)) continue;
    if (gender === 1) out.set(guruId, "ikhwan");
    else if (gender === 2) out.set(guruId, "akhwat");
  }

  const rows = await db.execute(sql`
    with per_halaqah as (
      select j.program_id,
             j.tilawah_halaqah_id as halaqah_id,
             coalesce(j.guru_id, h.guru_id) as guru_id,
             count(*) as meetings,
             case
               when h.name ilike '%akhwat%' then 'akhwat'
               when h.name ilike '%ikhwan%' then 'ikhwan'
               else null
             end as by_name
      from jadwal_sync j
      join halaqah_sync h
        on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
      join programs p on p.id = j.program_id
      where j.program_id in (${pid})
        and j.schedule_date between ${start} and ${end}
        and coalesce(j.guru_id, h.guru_id) is not null
        -- Current batch only, same reason as the recap: stale halaqah from
        -- deleted batches would weight a teacher's side with meetings that no
        -- longer exist.
        and ${currentBatchOnly}
      group by 1, 2, 3, 5
    ),
    by_students as (
      select program_id, halaqah_id,
             count(*) filter (where gender = 1) as ikhwan,
             count(*) filter (where gender = 2) as akhwat
      from students_sync
      where program_id in (${pid})
      group by 1, 2
    )
    select ph.guru_id,
           sum(ph.meetings) filter (
             where coalesce(ph.by_name,
                            case when bs.akhwat > bs.ikhwan then 'akhwat'
                                 when bs.ikhwan > bs.akhwat then 'ikhwan' end) = 'ikhwan'
           ) as ikhwan_meetings,
           sum(ph.meetings) filter (
             where coalesce(ph.by_name,
                            case when bs.akhwat > bs.ikhwan then 'akhwat'
                                 when bs.ikhwan > bs.akhwat then 'ikhwan' end) = 'akhwat'
           ) as akhwat_meetings
    from per_halaqah ph
    left join by_students bs
      on bs.program_id = ph.program_id and bs.halaqah_id = ph.halaqah_id
    group by 1
  `);

  for (const r of rows.rows) {
    const guruId = Number(r.guru_id);
    if (!Number.isFinite(guruId)) continue;
    // Never override a gender the CMS stated outright.
    if (out.get(guruId)) continue;
    const ikhwan = Number(r.ikhwan_meetings ?? 0);
    const akhwat = Number(r.akhwat_meetings ?? 0);
    // A tie (or nothing at all) stays null. Teaching both sides is real — a
    // teacher can cover an ikhwan halaqah as badal — so the side is decided by
    // where most of their meetings are, not by the first one found.
    out.set(guruId, ikhwan === akhwat ? null : ikhwan > akhwat ? "ikhwan" : "akhwat");
  }
  return out;
}
