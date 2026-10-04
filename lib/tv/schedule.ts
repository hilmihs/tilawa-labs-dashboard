/**
 * `sched` — "which halaqah was SUPPOSED to meet on which date", uniform across
 * data sources. Everything else on the /tv board is a join away from it.
 *
 * Why it needs to exist: the two sources disagree about what a jadwal row means.
 *   - tilawah_api: jadwal_sync IS the meeting plan, written by upstream ahead of
 *     time. A row with no presensi is exactly the gap the board wants to expose.
 *   - mabni_api:   upstream has no /sesi endpoint, so lib/sync/mabni-sync.ts
 *     synthesises a jadwal row from each *absensi* it sees. A meeting nobody has
 *     recorded therefore leaves no trace at all, and jadwal_sync can never answer
 *     "what was supposed to happen". The expectation has to be rebuilt from the
 *     recurring `hari` pattern stashed in halaqah_sync.raw — the same source
 *     getMabniDelivery() uses (lib/insights/mabni.ts).
 *   - berkah_api:  no meetings and no presensi at all. Resolved away before this
 *     is called, via config.presensiSlug (see lib/tv/programs.ts).
 *
 * Known limitation: the mabni pattern recurs unconditionally, so a national
 * holiday still produces "expected" meetings. There is no upstream holiday feed;
 * the anomaly window is bounded (30 days) so a long libur cannot pile up into a
 * frightening number.
 */
import { sql, type SQL } from "drizzle-orm";
import { pesertaAktif } from "@/lib/enrollment";

/** `in (…)` list of uuids; callers must guard against an empty array. */
export function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

/**
 * Emits the CTEs `cal`, `sched_tilawah`, `sched_mabni` and `sched`, ready to be
 * spliced after a `with`. `sched` is (program_id, halaqah_id, d).
 */
export function schedCte(
  tilawahIds: string[],
  mabniIds: string[],
  from: string,
  to: string,
): SQL {
  const tilawah = tilawahIds.length
    ? sql`
      select j.program_id, j.tilawah_halaqah_id as halaqah_id, j.schedule_date as d
      from jadwal_sync j
      where j.program_id in (${uuidList(tilawahIds)})
        and j.schedule_date between ${from}::date and ${to}::date
      group by 1, 2, 3`
    : sql`select null::uuid as program_id, null::int as halaqah_id, null::date as d where false`;

  // isodow: 1 = Senin … 7 = Ahad — already the numbering upstream Mabni stores,
  // so the weekday needs no translation.
  const mabni = mabniIds.length
    ? sql`
      select h.program_id, h.tilawah_halaqah_id as halaqah_id, cal.d
      from halaqah_sync h
      cross join cal
      where h.program_id in (${uuidList(mabniIds)})
        and coalesce(h.raw->'jadwal'->'hari', h.raw->'kelas'->'hari', '[]'::jsonb)
            @> to_jsonb(extract(isodow from cal.d)::int)
        and (h.raw->'jadwal'->>'tanggal_mulai' is null
             or (h.raw->'jadwal'->>'tanggal_mulai')::date <= cal.d)
        and (h.raw->'jadwal'->>'tanggal_selesai' is null
             or (h.raw->'jadwal'->>'tanggal_selesai')::date >= cal.d)`
    : sql`select null::uuid as program_id, null::int as halaqah_id, null::date as d where false`;

  return sql`
    cal as (
      select generate_series(${from}::date, ${to}::date, interval '1 day')::date as d
    ),
    sched_tilawah as (${tilawah}),
    sched_mabni as (${mabni}),
    sched as (
      select * from sched_tilawah
      union all
      select * from sched_mabni
    )`;
}

/**
 * Active-peserta roster per (program, halaqah). Non-aktif enrolments must not
 * inflate "terjadwal" — same filter the Action Items inbox uses. Mabni hardcodes
 * enrollment_status_code = 1 and prunes leavers instead, so there the filter is
 * a no-op by design.
 */
export function rosterCte(allIds: string[]): SQL {
  return sql`
    roster as (
      select program_id, halaqah_id, count(*)::int as n_aktif
      from students_sync
      where program_id in (${uuidList(allIds)})
        and halaqah_id is not null
        and ${pesertaAktif()}
      group by 1, 2
    )`;
}
