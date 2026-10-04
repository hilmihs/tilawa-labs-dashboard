/**
 * Rekap perubahan pengajar: badal per pertemuan, plus the data-quality list of
 * halaqah whose recorded teacher no longer matches who actually teaches them.
 *
 * A meeting counts as a deviation when its per-meeting guru differs from the
 * halaqah's RECORDED guru (`halaqah_sync.guru_id`) — the operator's chosen
 * definition. Taken raw that yields ~1.054 meetings, of which only a handful are
 * genuine badal: most are halaqah whose recorded owner is simply wrong (a
 * "tukar halaqah" that never propagated, or an import that resolved every guru
 * to Superadmin #1). So every deviation is classified by the SHAPE its meeting
 * orders make, and the UI leads with that breakdown instead of the raw total.
 *
 * Deliberately separate from getTeacherReport (lib/reports/queries.ts:687):
 * that query already carries the Perkenalan fold, the confirmations join and the
 * gender join, and bolting this on would silently move the numbers on the
 * Laporan tab. The Perkenalan fold is shared via `perkenalanFoldCte` so the two
 * pages agree on how many meetings a halaqah has.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  EMPTY_BY_CATEGORY,
  RECORD_PROBLEM,
  type ChangeRecap,
  type DeviationCategory,
  type DeviationMeeting,
  type HalaqahRecordIssue,
  type MonthTally,
  type ScheduleChangeEvent,
  type ScheduleChangeSummary,
  type TeacherTally,
} from "./change-recap-types";

// Re-exported so server callers need only this module. Client components MUST
// import from ./change-recap-types instead — see that file's header.
export * from "./change-recap-types";

/**
 * Perkenalan fold, lifted verbatim from getTeacherReport so both pages count the
 * same number of meetings per halaqah. HITS Reguler has a duplicate order-1
 * ("Perkenalan" alongside "1"); the Perkenalan row is dropped when a "1" sibling
 * exists. Emitted as CTEs named `perk1` and `jf`; select from `jf`, not
 * `jadwal_sync`.
 */
export const perkenalanFoldCte = sql`
  perk1 as (
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
    select j.*
    from jadwal_sync j
    where not (
      j."order" = 1 and j.name = 'Perkenalan'
      and exists (select 1 from perk1 pk where pk.perk_id = j.tilawah_jadwal_id)
    )
  )
`;

/**
 * The classification cascade, as a CASE over the per-halaqah aggregates. Kept in
 * one place because the meeting list, the halaqah list and the tallies must all
 * agree on a halaqah's category. Verified against the reference SQL on
 * 2026-08-08: A1 30/622 · A2 10/228 · B 5/21 · C 2/37 · D 3/3 · F 10/143.
 */
const classifySql = sql`
  case
    -- No recorded guru at all: every meeting "deviates" trivially. Checked
    -- first, and phrased as "assign a teacher" rather than "the record is wrong".
    when t.no_recorded_guru = 1                     then 'tanpa_pengajar_tercatat'
    -- Same human, two tilawah accounts (verified 2026-08-08: Arsiteno 16/1804,
    -- Inas Firdaus 1800/2825, Nadia Rahman Syahputra 2824/4348). Checked FIRST: the
    -- fix is merging the accounts, so calling it "catatan salah" would send the
    -- coordinator to change a halaqah's teacher to the person already on it.
    when t.n_same_name = t.n_dev                    then 'duplikat_akun_guru'
    when t.n_super = t.n_dev                        then 'artefak_impor'
    when t.n_dev = t.n_pert                         then 'catatan_salah_total'
    when t.n_dev::numeric / t.n_pert >= 0.8         then 'catatan_salah'
    when r.runs = 1 and r.first_order = 1           then 'serah_terima'
    when r.runs = 1 and r.last_order = t.max_order  then 'ganti_guru_belum_dicatat'
    else                                                 'badal'
  end
`;

/**
 * Per-halaqah aggregates + shape, over the whole halaqah (NOT the date range):
 * a category describes the halaqah's history as a whole, so narrowing the window
 * first would reclassify a mid-batch handover as a badal.
 */
const halaqahShapeCte = sql`
  dev as (
    select j.program_id, j.tilawah_halaqah_id as halaqah_id, j."order" as ord,
           j.guru_id as actual_guru_id, h.guru_id as recorded_guru_id,
           (j.guru_id is distinct from h.guru_id) as is_dev,
           -- Different id but identical name = one person holding two accounts.
           (lower(btrim(coalesce(gj.name, j.raw->'guru'->>'name', ''))) =
            lower(btrim(coalesce(gh.name, h.pengajar, ''))))
             and coalesce(gj.name, j.raw->'guru'->>'name') is not null as same_name
    from jf j
    join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    left join guru_sync gj on gj.program_id = j.program_id and gj.tilawah_guru_id = j.guru_id
    left join guru_sync gh on gh.program_id = j.program_id and gh.tilawah_guru_id = h.guru_id
  ),
  blocks as (
    -- Contiguous runs of deviating orders: consecutive orders share (ord - rownum).
    select program_id, halaqah_id, ord,
           ord - row_number() over (partition by program_id, halaqah_id order by ord) as grp
    from dev where is_dev
  ),
  r as (
    select program_id, halaqah_id, count(distinct grp)::int as runs,
           min(ord) as first_order, max(ord) as last_order
    from blocks group by 1, 2
  ),
  t as (
    select program_id, halaqah_id,
           count(*)::int as n_pert,
           max(ord) as max_order,
           count(*) filter (where is_dev)::int as n_dev,
           count(*) filter (where is_dev and actual_guru_id = 1)::int as n_super,
           count(*) filter (where is_dev and same_name)::int as n_same_name,
           max(case when recorded_guru_id is null then 1 else 0 end)::int as no_recorded_guru
    from dev group by 1, 2
  ),
  shape as (
    select t.program_id, t.halaqah_id, t.n_pert, t.n_dev, ${classifySql} as category
    from t left join r on r.program_id = t.program_id and r.halaqah_id = t.halaqah_id
    where t.n_dev > 0
  )
`;

/** Whoever teaches the most meetings in a halaqah — the de-facto teacher. */
const pluralityCte = sql`
  plurality as (
    select distinct on (program_id, tilawah_halaqah_id)
           program_id, tilawah_halaqah_id as halaqah_id,
           guru_id as guru_id, count(*) as n
    from jf
    where guru_id is not null
    group by program_id, tilawah_halaqah_id, guru_id
    order by program_id, tilawah_halaqah_id, count(*) desc, guru_id
  )
`;

function categoryOf(v: unknown): DeviationCategory {
  return (v as DeviationCategory) ?? "badal";
}

/**
 * Recorded schedule changes for the scope — reschedules imported from tilawah's
 * activity log plus anything the sync differ has caught since.
 *
 * Bounded by the meeting's date (`schedule_date`), not by when the change was
 * made, so it lines up with the rest of the page: "which meetings in this range
 * had their schedule altered".
 */
export async function getScheduleChanges(
  start: string,
  end: string,
  programIds: string[],
): Promise<ScheduleChangeSummary> {
  const empty: ScheduleChangeSummary = {
    events: [],
    totalDate: 0,
    totalTime: 0,
    firstRecordedAt: null,
    byMonth: [],
    byActor: [],
  };
  if (programIds.length === 0) return empty;
  const db = getDb();

  const scope = sql.join(
    programIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const rows = await db.execute<{
    id: string;
    program_name: string;
    halaqah_id: number | null;
    halaqah: string;
    jadwal_id: number;
    ord: number | null;
    meeting_name: string | null;
    field: string;
    old_label: string | null;
    new_label: string | null;
    schedule_date: string | null;
    changed_at: string;
    actor_name: string | null;
    actor_user_id: number | null;
    source: string;
  }>(sql`
    select e.id::text,
           p.name as program_name,
           e.tilawah_halaqah_id as halaqah_id,
           coalesce(h.name, '(halaqah tidak dikenal)') as halaqah,
           e.tilawah_jadwal_id as jadwal_id,
           e.meeting_order as ord,
           e.meeting_name,
           e.field,
           e.old_label, e.new_label,
           e.schedule_date::text as schedule_date,
           e.changed_at::text as changed_at,
           e.actor_name, e.actor_user_id, e.source
    from jadwal_change_events e
    join programs p on p.id = e.program_id
    left join halaqah_sync h
      on h.program_id = e.program_id and h.tilawah_halaqah_id = e.tilawah_halaqah_id
    where e.program_id in (${scope})
      and e.field in ('schedule_date', 'session_time')
      and (e.schedule_date is null or (e.schedule_date >= ${start} and e.schedule_date <= ${end}))
    order by e.changed_at desc
  `);

  const events: ScheduleChangeEvent[] = (rows.rows ?? []).map((r) => ({
    id: r.id,
    programName: r.program_name,
    halaqahId: r.halaqah_id == null ? null : Number(r.halaqah_id),
    halaqah: r.halaqah,
    jadwalId: Number(r.jadwal_id),
    order: r.ord == null ? null : Number(r.ord),
    meetingName: r.meeting_name,
    field: r.field,
    oldLabel: r.old_label,
    newLabel: r.new_label,
    scheduleDate: r.schedule_date,
    changedAt: r.changed_at,
    actorName: r.actor_name,
    actorUserId: r.actor_user_id == null ? null : Number(r.actor_user_id),
    source: r.source,
  }));

  // The ledger only knows what has been imported or observed. Surfacing the
  // earliest row stops an empty month reading as "nothing changed".
  const firstRow = await db.execute<{ lo: string | null }>(sql`
    select min(changed_at)::text as lo from jadwal_change_events
    where program_id in (${scope})
  `);

  const monthMap = new Map<string, { month: string; date: number; time: number }>();
  const actorMap = new Map<string, number>();
  let totalDate = 0;
  let totalTime = 0;
  for (const e of events) {
    if (e.field === "schedule_date") totalDate += 1;
    else totalTime += 1;
    const key = (e.scheduleDate ?? e.changedAt).slice(0, 7);
    let row = monthMap.get(key);
    if (!row) {
      row = { month: key, date: 0, time: 0 };
      monthMap.set(key, row);
    }
    if (e.field === "schedule_date") row.date += 1;
    else row.time += 1;
    const actor = e.actorName ?? (e.actorUserId != null ? `Pengguna #${e.actorUserId}` : "Tidak diketahui");
    actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1);
  }

  return {
    events,
    totalDate,
    totalTime,
    firstRecordedAt: firstRow.rows?.[0]?.lo ?? null,
    byMonth: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byActor: [...actorMap.entries()]
      .map(([actor, n]) => ({ actor, n }))
      .sort((a, b) => b.n - a.n),
  };
}

/**
 * Earliest/latest meeting date in scope, used to prefill the date inputs. A
 * calendar-month default (as on /report) would be wrong here: deviations are
 * spread across a whole batch, so the page would open on an empty table.
 */
export async function getRecapDateBounds(
  programIds: string[],
): Promise<{ start: string; end: string } | null> {
  if (programIds.length === 0) return null;
  const db = getDb();
  const rows = await db.execute<{ lo: string | null; hi: string | null }>(sql`
    select min(schedule_date)::text as lo, max(schedule_date)::text as hi
    from jadwal_sync
    where program_id in (${sql.join(programIds.map((id) => sql`${id}::uuid`), sql`, `)})
  `);
  const r = rows.rows?.[0];
  if (!r?.lo || !r?.hi) return null;
  return { start: r.lo, end: r.hi };
}

/**
 * Everything the /perubahan page needs. `programIds` scopes to programs the
 * caller may read; `start`/`end` bound the MEETING dates listed, not the shape
 * analysis.
 */
export async function getChangeRecap(
  start: string,
  end: string,
  programIds: string[],
): Promise<ChangeRecap> {
  const empty: ChangeRecap = {
    start,
    end,
    meetings: [],
    byCategory: EMPTY_BY_CATEGORY(),
    teachers: [],
    months: [],
    recordIssues: [],
    pluralityBaseline: { meetings: 0, halaqah: 0 },
  };
  if (programIds.length === 0) return empty;
  const db = getDb();

  const meetingRows = await db.execute<{
    program_id: string;
    program_name: string;
    halaqah_id: number;
    halaqah: string;
    jadwal_id: number;
    ord: number | null;
    name: string | null;
    schedule_date: string | null;
    status: number | null;
    status_label: string | null;
    recorded_guru_id: number | null;
    recorded_guru: string | null;
    actual_guru_id: number | null;
    actual_guru: string | null;
    category: string;
  }>(sql`
    with ${perkenalanFoldCte}, ${halaqahShapeCte}
    select j.program_id,
           p.name as program_name,
           j.tilawah_halaqah_id as halaqah_id,
           coalesce(h.name, '(tanpa nama)') as halaqah,
           j.tilawah_jadwal_id as jadwal_id,
           j."order" as ord,
           j.name as name,
           j.schedule_date::text as schedule_date,
           j.status,
           j.status_label,
           h.guru_id as recorded_guru_id,
           coalesce(gh.name, h.pengajar) as recorded_guru,
           j.guru_id as actual_guru_id,
           coalesce(nullif(j.raw->'guru'->>'name', ''), gj.name) as actual_guru,
           s.category
    from jf j
    join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    join shape s
      on s.program_id = j.program_id and s.halaqah_id = j.tilawah_halaqah_id
    join programs p on p.id = j.program_id
    left join guru_sync gh on gh.program_id = j.program_id and gh.tilawah_guru_id = h.guru_id
    left join guru_sync gj on gj.program_id = j.program_id and gj.tilawah_guru_id = j.guru_id
    where j.program_id in (${sql.join(programIds.map((id) => sql`${id}::uuid`), sql`, `)})
      and j.guru_id is distinct from h.guru_id
      and j.schedule_date >= ${start} and j.schedule_date <= ${end}
    order by j.schedule_date desc nulls last, j.tilawah_halaqah_id, j."order"
  `);

  const meetings: DeviationMeeting[] = (meetingRows.rows ?? []).map((r) => ({
    programId: r.program_id,
    programName: r.program_name,
    halaqahId: Number(r.halaqah_id),
    halaqah: r.halaqah,
    jadwalId: Number(r.jadwal_id),
    order: r.ord == null ? null : Number(r.ord),
    name: r.name,
    date: r.schedule_date,
    status: r.status == null ? null : Number(r.status),
    statusLabel: r.status_label,
    recordedGuruId: r.recorded_guru_id == null ? null : Number(r.recorded_guru_id),
    recordedGuru: r.recorded_guru,
    actualGuruId: r.actual_guru_id == null ? null : Number(r.actual_guru_id),
    actualGuru: r.actual_guru,
    category: categoryOf(r.category),
  }));

  // ── Tallies (plain JS: the row set is ~1k, and this keeps the SQL honest) ──
  const byCategory = EMPTY_BY_CATEGORY();
  for (const m of meetings) byCategory[m.category] += 1;

  const monthMap = new Map<string, MonthTally>();
  for (const m of meetings) {
    if (!m.date) continue;
    const key = m.date.slice(0, 7);
    let row = monthMap.get(key);
    if (!row) {
      row = { month: key, total: 0, byCategory: EMPTY_BY_CATEGORY() };
      monthMap.set(key, row);
    }
    row.total += 1;
    row.byCategory[m.category] += 1;
  }
  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // A deviation touches two teachers: the recorded one loses a meeting
  // (digantikan) and whoever actually taught it gains one (menggantikan).
  const teacherMap = new Map<string, TeacherTally & { halaqah: Set<number> }>();
  const touch = (guruId: number | null, name: string | null): TeacherTally & { halaqah: Set<number> } => {
    const key = guruId != null ? `#${guruId}` : (name ?? "(tanpa nama)");
    let row = teacherMap.get(key);
    if (!row) {
      row = {
        guruId,
        pengajar: name ?? (guruId != null ? `Pengajar #${guruId}` : "(tanpa nama)"),
        digantikan: 0,
        menggantikan: 0,
        halaqahCount: 0,
        byCategory: EMPTY_BY_CATEGORY(),
        masukByCategory: EMPTY_BY_CATEGORY(),
        halaqah: new Set<number>(),
      };
      teacherMap.set(key, row);
    }
    if (row.pengajar.startsWith("Pengajar #") && name) row.pengajar = name;
    return row;
  };
  for (const m of meetings) {
    const recorded = touch(m.recordedGuruId, m.recordedGuru);
    recorded.digantikan += 1;
    recorded.byCategory[m.category] += 1;
    recorded.halaqah.add(m.halaqahId);

    const actual = touch(m.actualGuruId, m.actualGuru);
    actual.menggantikan += 1;
    actual.masukByCategory[m.category] += 1;
    actual.halaqah.add(m.halaqahId);
  }
  const teachers: TeacherTally[] = [...teacherMap.values()]
    .map(({ halaqah, ...rest }) => ({ ...rest, halaqahCount: halaqah.size }))
    .sort((a, b) => b.digantikan + b.menggantikan - (a.digantikan + a.menggantikan));

  // ── Bagian 2: halaqah whose record disagrees with the de-facto teacher ────
  const issueRows = await db.execute<{
    program_id: string;
    program_name: string;
    halaqah_id: number;
    halaqah: string;
    recorded_guru_id: number | null;
    recorded_guru: string | null;
    actual_guru_id: number | null;
    actual_guru: string | null;
    n_dev: number;
    n_pert: number;
    category: string;
  }>(sql`
    with ${perkenalanFoldCte}, ${halaqahShapeCte}, ${pluralityCte}
    select h.program_id,
           p.name as program_name,
           h.tilawah_halaqah_id as halaqah_id,
           coalesce(h.name, '(tanpa nama)') as halaqah,
           h.guru_id as recorded_guru_id,
           coalesce(gh.name, h.pengajar) as recorded_guru,
           pl.guru_id as actual_guru_id,
           gp.name as actual_guru,
           s.n_dev, s.n_pert, s.category
    from shape s
    join halaqah_sync h
      on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
    join programs p on p.id = h.program_id
    left join plurality pl on pl.program_id = s.program_id and pl.halaqah_id = s.halaqah_id
    left join guru_sync gh on gh.program_id = h.program_id and gh.tilawah_guru_id = h.guru_id
    left join guru_sync gp on gp.program_id = h.program_id and gp.tilawah_guru_id = pl.guru_id
    where h.program_id in (${sql.join(programIds.map((id) => sql`${id}::uuid`), sql`, `)})
      -- Only categories that mean the RECORD is wrong. A halaqah whose
      -- deviations are genuine badal has a correct record, and so does a
      -- serah_terima — listing either here would send coordinators to fix
      -- data that is already right.
      and s.category in (${sql.join(RECORD_PROBLEM.map((c) => sql`${c}`), sql`, `)})
    order by s.n_dev desc
  `);

  const issues: HalaqahRecordIssue[] = (issueRows.rows ?? []).map((r) => ({
    programId: r.program_id,
    programName: r.program_name,
    halaqahId: Number(r.halaqah_id),
    halaqah: r.halaqah,
    recordedGuruId: r.recorded_guru_id == null ? null : Number(r.recorded_guru_id),
    recordedGuru: r.recorded_guru,
    actualGuruId: r.actual_guru_id == null ? null : Number(r.actual_guru_id),
    actualGuru: r.actual_guru,
    deviating: Number(r.n_dev),
    total: Number(r.n_pert),
    category: categoryOf(r.category),
    swappedWith: null,
  }));

  // Swap detection: halaqah X recorded to P but taught by Q, while halaqah Y is
  // recorded to Q and taught by P. Proven to exist (41↔72, 48↔104) and it names
  // the cause far more usefully than "catatan salah" alone.
  const byPair = new Map<string, HalaqahRecordIssue>();
  for (const i of issues) {
    if (i.recordedGuruId == null || i.actualGuruId == null) continue;
    byPair.set(`${i.recordedGuruId}->${i.actualGuruId}`, i);
  }
  for (const i of issues) {
    if (i.recordedGuruId == null || i.actualGuruId == null) continue;
    const mirror = byPair.get(`${i.actualGuruId}->${i.recordedGuruId}`);
    if (mirror && mirror.halaqahId !== i.halaqahId) {
      i.swappedWith = { halaqahId: mirror.halaqahId, halaqah: mirror.halaqah };
    }
  }

  // ── Comparison line: the same question asked against the plurality teacher ──
  const plurality = await db.execute<{ meetings: number; halaqah: number }>(sql`
    with ${perkenalanFoldCte}, ${pluralityCte}
    select count(*)::int as meetings,
           count(distinct (j.program_id, j.tilawah_halaqah_id))::int as halaqah
    from jf j
    join plurality pl
      on pl.program_id = j.program_id and pl.halaqah_id = j.tilawah_halaqah_id
    where j.program_id in (${sql.join(programIds.map((id) => sql`${id}::uuid`), sql`, `)})
      and j.guru_id is not null
      and j.guru_id is distinct from pl.guru_id
      and j.schedule_date >= ${start} and j.schedule_date <= ${end}
  `);
  const pb = plurality.rows?.[0];

  return {
    start,
    end,
    meetings,
    byCategory,
    teachers,
    months,
    recordIssues: issues,
    pluralityBaseline: {
      meetings: Number(pb?.meetings ?? 0),
      halaqah: Number(pb?.halaqah ?? 0),
    },
  };
}
