import { sql, type SQL } from "drizzle-orm";

/**
 * Shared "meeting-1 fold" over jadwal_sync.
 *
 * HITS Reguler carries TWO order-1 jadwals per halaqah — one named "Perkenalan"
 * and one named "1" — for what teachers experienced as a single first meeting.
 * Counting both inflates every teacher's ideal by one and leaves a permanent
 * phantom gap when only one of the pair was marked taught. The fold drops the
 * "Perkenalan" row whenever a sibling "1" exists and carries its taught status
 * over to the survivor, so the pair counts as one meeting either way.
 *
 * TWO callers depend on this exact SQL: the monthly teacher report
 * (lib/reports/queries.ts → getTeacherReport) and the WA confirmation recap
 * (lib/confirmations/recap.ts). If they folded differently, /report and
 * /rekap would show a different meeting count for the same teacher in the same
 * period, and the teacher would rightly treat one of the two as a lie. Keep the
 * fold here, never inline a copy.
 *
 * The `jf` CTE yields every jadwal_sync column plus `eff_status` — the status to
 * count on (3/4 = Mulai/Selesai = taught). Read `j.eff_status`, never `j.status`,
 * downstream.
 *
 * Usage: sql`with ${foldedJadwalCte} select ... from jf j ...`
 */
export const foldedJadwalCte: SQL = sql`
  perk1 as (
    -- "Perkenalan" order-1 jadwals that also have a sibling "1" order-1 in the
    -- same halaqah (HITS Reguler's duplicate meeting-1). Display-only fold so the
    -- recap treats them as ONE regardless of whether the sync collapsed them.
    select p.program_id, p.tilawah_halaqah_id,
           p.tilawah_jadwal_id as perk_id, p.status as perk_status
    from jadwal_sync p
    where p."order" = 1 and p.name = 'Perkenalan'
      and exists (
        select 1 from jadwal_sync o
        where o.program_id = p.program_id and o.tilawah_halaqah_id = p.tilawah_halaqah_id
          and o."order" = 1 and o.name = '1'
      )
  ),
  jf as (
    select j.*,
           -- fold Perkenalan's taught status into the surviving "1" (done if either)
           case
             when j."order" = 1 and j.name = '1'
                  and exists (
                    select 1 from perk1 pk
                    where pk.program_id = j.program_id
                      and pk.tilawah_halaqah_id = j.tilawah_halaqah_id
                      and pk.perk_status in (3, 4)
                  )
               then 4
             else j.status
           end as eff_status
    from jadwal_sync j
    -- drop the Perkenalan row that has a "1" sibling (counted as one meeting)
    where not (
      j."order" = 1 and j.name = 'Perkenalan'
      and exists (select 1 from perk1 pk where pk.perk_id = j.tilawah_jadwal_id)
    )
  )
`;
