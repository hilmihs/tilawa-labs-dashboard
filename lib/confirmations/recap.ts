import { sql, type SQL } from "drizzle-orm";
import { getRecapPrograms } from "@/lib/confirmations/scope";
import type {
  RecapConfirmStatus,
  RecapCounts,
  RecapHalaqah,
  RecapMeeting,
  RecapTeacherSummary,
  TeacherRecap,
} from "@/lib/confirmations/types";
import { getDb } from "@/lib/db/client";
import { currentBatchOnly } from "@/lib/programs/batch-guard";
import { foldedJadwalCte } from "@/lib/reports/meeting-fold";
import { DUPLICATE_GURU_ACCOUNTS } from "@/lib/guru/duplicates";

/**
 * The recap a teacher is asked to confirm over WhatsApp: every meeting assigned
 * to them in the period, across every tilawah-sourced program in the blast's
 * scope (lib/confirmations/scope.ts).
 *
 * The numbers here MUST agree with the monthly report a coordinator already
 * trusts (lib/reports/queries.ts → getTeacherReport). Two rules carry that
 * agreement and neither may be simplified:
 *
 *  1. PER-MEETING attribution. A meeting belongs to whoever actually taught it —
 *     `coalesce(jadwal.guru_id, halaqah.guru_id)` for identity and
 *     `coalesce(jadwal.raw.guru.name, halaqah.pengajar)` for display. A badal
 *     gets their own recap, and the halaqah's main pengajar is never asked to
 *     account for a meeting a badal covered. That asymmetry is the entire reason
 *     this feature exists — collapsing it back to halaqah_sync.pengajar would
 *     send every substituted meeting to the wrong person.
 *  2. The meeting-1 fold (lib/reports/meeting-fold.ts). /report and /rekap must
 *     not disagree about how many meetings a teacher had.
 */

/**
 * Confirmation statuses this module recognises. `status` is a plain text column,
 * so a row could in principle carry anything; an unrecognised value is treated
 * as "no answer" BOTH in the typed field and in the `confirmed` counters, so the
 * detail list and the totals can never contradict each other.
 */
const KNOWN_STATUSES: readonly RecapConfirmStatus[] = [
  "tidak_mengajar",
  "mengajar_belum_input",
  "mengajar_kendala_sistem",
  "diisi_koordinator",
  "data_tidak_sesuai",
];

/** `c.status in ('…', …)` over the statuses above — the SQL twin of toStatus(). */
const knownStatusList: SQL = sql.join(
  KNOWN_STATUSES.map((s) => sql`${s}`),
  sql`, `,
);

function toStatus(v: unknown): RecapConfirmStatus | null {
  return typeof v === "string" && (KNOWN_STATUSES as readonly string[]).includes(v)
    ? (v as RecapConfirmStatus)
    : null;
}

/**
 * Per-meeting attribution over the whole blast scope, as a CTE named `att`.
 *
 * One row per meeting (post-fold), already carrying the teacher it is attributed
 * to, the halaqah/program it belongs to, and any existing confirmation. Both
 * public queries build on this so they cannot drift apart: the blast list and
 * the page a teacher opens from it must show the same counts.
 *
 * `teacher_key` is the grouping identity. It prefers the numeric tilawah user id
 * and only falls back to the display name for meetings that have no guru id at
 * all — grouping those by name keeps them visible (see
 * listRecapTeachersWithoutGuruId) instead of merging every id-less teacher in a
 * halaqah into one nameless blob.
 *
 * Expects `${foldedJadwalCte}` to be spliced in front of it.
 */
/**
 * tilawah user id 1 is the "Superadmin" account, not a person who teaches. It
 * appears as the per-meeting guru on meetings created in bulk from the admin UI.
 * Kept as a named constant because it is referenced four times below and a bare
 * `1` in the middle of a SQL string is unreadable.
 */
const ADMIN_GURU_ID = 1;

/**
 * Fold a teacher's duplicate CMS accounts onto one id (see lib/guru/duplicates).
 * Applied at attribution time so the two halves of one person become ONE recap
 * and ONE message — Nadia Rahman Syahputra teaches under both her ids and would
 * otherwise receive two WhatsApps, each showing half her month.
 */
function canonicalGuru(expr: SQL): SQL {
  const pairs = DUPLICATE_GURU_ACCOUNTS.flatMap((group) =>
    group.slice(1).map((dup) => ({ dup, canonical: group[0] })),
  );
  if (pairs.length === 0) return expr;
  return sql`case ${sql.join(
    pairs.map((p) => sql`when ${expr} = ${p.dup} then ${p.canonical}`),
    sql` `,
  )} else ${expr} end`;
}

function attributionCte(programIds: string[], start: string, end: string): SQL {
  const pid = sql.join(
    programIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const effGuru = canonicalGuru(sql`coalesce(nullif(j.guru_id, ${ADMIN_GURU_ID}), h.guru_id)`);
  return sql`
    att as (
      select j.program_id,
             p.slug as program_slug,
             p.name as program_name,
             j.tilawah_halaqah_id as halaqah_id,
             coalesce(h.name, '(tanpa nama)') as halaqah_name,
             j.tilawah_jadwal_id as jadwal_id,
             j."order" as ord,
             j.schedule_date::text as date,
             -- eff_status is null for meetings the sync has never given a status;
             -- those count as not-taught, exactly as the report's filters do.
             coalesce(j.eff_status in (3, 4), false) as done,
             -- The admin account is not a teacher. 118 meetings across 17
             -- hits-regular-jan halaqah carry guru_id 1 ("Superadmin") because
             -- they were created in bulk without a per-meeting guru; attributing
             -- them to the admin both invents a recipient and robs the real
             -- teacher of their own meetings. Treat it as "no per-meeting guru"
             -- and fall back to the halaqah's teacher, which is who taught them.
             ${effGuru} as guru_id,
             -- Identity-keyed name FIRST: halaqah_sync.pengajar is a denormalized
             -- snapshot that goes stale when a halaqah changes hands (four
             -- hits-regular-apr halaqah name a teacher guru_sync has no row for),
             -- and the per-meeting raw name carries the same staleness. Greeting
             -- the previous teacher on a message sent to the current one is worse
             -- than no name at all, so guru_sync wins whenever it has a row.
             nullif(
               coalesce(
                 gn.name,
                 case
                   when j.guru_id is distinct from ${ADMIN_GURU_ID}
                     then nullif(j.raw->'guru'->>'name', '')
                 end,
                 h.pengajar
               ),
               ''
             ) as guru_name,
             case
               when ${effGuru} is not null then 'g:' || (${effGuru})::text
               else 'n:' || coalesce(nullif(j.raw->'guru'->>'name', ''), h.pengajar, '?')
             end as teacher_key,
             case when c.status in (${knownStatusList}) then c.status end as conf_status,
             c.reason_code as reason_code,
             c.reason_text as reason_text
      from jf j
      join halaqah_sync h
        on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
      join programs p on p.id = j.program_id
      -- One name per identity, across programs: guru_sync is written per program
      -- and a teacher can hold halaqah in several. min() only makes the pick
      -- deterministic; the rows agree in practice.
      left join (
        -- Tilawah-sourced programs only: mabni numbers its teachers in its own
        -- space and 13 of its ids collide with tilawah ids, so an unscoped
        -- lookup can greet a teacher by a stranger's name.
        select g.tilawah_guru_id, min(g.name) as name
        from guru_sync g
        join programs gp on gp.id = g.program_id and gp.data_source_type = 'tilawah_api'
        where g.name is not null and btrim(g.name) <> ''
        group by g.tilawah_guru_id
      ) gn on gn.tilawah_guru_id = ${effGuru}
      -- Unique on (program_id, tilawah_jadwal_id), so this join never fans out.
      left join teacher_meeting_confirmations c
        on c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
        -- Only the current teacher's own answer. A reassigned meeting keeps the
        -- previous teacher's confirmation attached to it, and showing that to the
        -- new teacher asks them to account for words they never wrote. Null
        -- guru_id predates the column and is still honoured. A coordinator
        -- force-fill (source='coordinator') is exempt — it states a fact about the
        -- meeting, not the teacher, so it must not vanish when a resync re-points
        -- the jadwal's guru. See lib/reports/queries.ts for the full rationale.
        and (c.source = 'coordinator' or c.guru_id is null or c.guru_id = ${effGuru})
      where j.program_id in (${pid})
        and j.schedule_date between ${start} and ${end}
        -- Only the batch this program is currently pinned to (every batch for a
        -- rolling-batch program). Without this filter a teacher of a recreated
        -- HITS batch gets one card per batch — same halaqah name twice, meetings
        -- 1-8 under the dead batch and 13-20 under the live one — and is asked to
        -- explain attendance for sessions that were deleted months ago.
        and ${currentBatchOnly}
    )
  `;
}

/**
 * Per halaqah, the teacher holding the PLURALITY of its meetings in the period,
 * as a CTE named `main`. Everyone else who taught that halaqah is a badal.
 *
 * Same rule as getTeacherReport, and for the same reason: "differs from
 * halaqah_sync.pengajar" mislabels the de-facto teacher as a substitute whenever
 * the stored pengajar has stopped teaching, and telling a teacher they were
 * merely covering their own halaqah is exactly the kind of error that makes them
 * distrust the whole recap.
 *
 * A dead heat (two teachers, 4 meetings each) has no plurality holder, so one of
 * them is labelled badal on the teacher_key tie-break. That is arbitrary but
 * deterministic, and it is the same arbitrary choice /report makes — the two
 * pages disagreeing about who the badal is would be worse than the label being
 * debatable.
 *
 * Expects `att` to be defined before it.
 */
const mainTeacherCte: SQL = sql`
  tally as (
    select program_id, halaqah_id, teacher_key, count(*)::int as n
    from att
    group by 1, 2, 3
  ),
  main as (
    select distinct on (program_id, halaqah_id) program_id, halaqah_id, teacher_key
    from tally
    order by program_id, halaqah_id, n desc, teacher_key asc
  )
`;

/**
 * Fold meetings into the counters the message and the page both quote.
 *
 * `confirmed` counts only GAP meetings that carry an answer, per RecapCounts —
 * so `unresolved` can never go negative. An answer on a meeting the system
 * already records as taught (`data_tidak_sesuai`: "this is recorded as mine but
 * it isn't") is deliberately outside these counters; it is a correction request
 * for a coordinator, not an outstanding item on the teacher's list.
 */
function countsOf(meetings: RecapMeeting[], halaqahCount: number): RecapCounts {
  const taught = meetings.filter((m) => m.done).length;
  const gaps = meetings.length - taught;
  const confirmed = meetings.filter((m) => !m.done && m.confStatus !== null).length;
  return {
    halaqah: halaqahCount,
    meetings: meetings.length,
    taught,
    gaps,
    confirmed,
    unresolved: gaps - confirmed,
  };
}

/**
 * One teacher's full recap for the period: their meetings grouped by halaqah,
 * oldest first, with any answer they already gave.
 *
 * Returns null when the teacher has no meeting at all in the period — the caller
 * treats that as "nothing to confirm" and sends no message, rather than sending
 * an empty recap that reads like an accusation of having taught nothing.
 *
 * `guruId` is the tilawah user id, which is stable across programs, so a teacher
 * serving two programs gets ONE recap covering both.
 */
export async function getTeacherRecap(
  guruId: number,
  start: string,
  end: string,
): Promise<TeacherRecap | null> {
  const programs = await getRecapPrograms();
  if (programs.length === 0) return null;
  const db = getDb();

  const rows = await db.execute(sql`
    with ${foldedJadwalCte},
    ${attributionCte(
      programs.map((p) => p.id),
      start,
      end,
    )},
    ${mainTeacherCte}
    select a.program_id, a.program_slug, a.program_name, a.halaqah_id, a.halaqah_name,
           a.jadwal_id, a.ord, a.date, a.done, a.guru_name,
           a.conf_status, a.reason_code, a.reason_text,
           (m.teacher_key is distinct from a.teacher_key) as as_badal
    from att a
    join main m on m.program_id = a.program_id and m.halaqah_id = a.halaqah_id
    where a.guru_id = ${guruId}
    order by a.program_name asc, a.halaqah_name asc,
             a.date asc nulls last, a.ord asc nulls last
  `);
  if (rows.rows.length === 0) return null;

  // Rows arrive already ordered by (program, halaqah, date, order), so grouping
  // by insertion order preserves the ordering the teacher should read.
  const byHalaqah = new Map<string, RecapHalaqah>();
  const nameTally = new Map<string, number>();
  for (const r of rows.rows) {
    const programId = String(r.program_id);
    const halaqahId = Number(r.halaqah_id);
    const key = `${programId}\u0000${halaqahId}`;
    const meeting: RecapMeeting = {
      jadwalId: Number(r.jadwal_id),
      programId,
      programSlug: String(r.program_slug),
      programName: String(r.program_name),
      halaqahId,
      halaqahName: String(r.halaqah_name),
      order: r.ord != null ? Number(r.ord) : null,
      date: (r.date as string) ?? null,
      done: r.done === true,
      confStatus: toStatus(r.conf_status),
      reasonCode: (r.reason_code as string) ?? null,
      reasonText: (r.reason_text as string) ?? null,
    };
    const group = byHalaqah.get(key) ?? {
      programSlug: meeting.programSlug,
      programName: meeting.programName,
      halaqahId,
      halaqahName: meeting.halaqahName,
      asBadal: r.as_badal === true,
      meetings: [],
      taught: 0,
      gaps: 0,
      confirmed: 0,
    };
    group.meetings.push(meeting);
    byHalaqah.set(key, group);

    if (typeof r.guru_name === "string" && r.guru_name !== "") {
      nameTally.set(r.guru_name, (nameTally.get(r.guru_name) ?? 0) + 1);
    }
  }

  const halaqah = [...byHalaqah.values()].map((g) => {
    const c = countsOf(g.meetings, 1);
    return { ...g, taught: c.taught, gaps: c.gaps, confirmed: c.confirmed };
  });

  // The display name can differ per meeting (the jadwal's own guru name vs the
  // halaqah's pengajar, sometimes spelled differently). Greet the teacher with
  // the spelling that appears most often rather than whichever row sorted first.
  let nama = `Guru #${guruId}`;
  let best = 0;
  for (const [n, count] of nameTally) {
    if (count > best) {
      nama = n;
      best = count;
    }
  }

  return {
    guruId,
    nama,
    start,
    end,
    halaqah,
    counts: countsOf(
      halaqah.flatMap((g) => g.meetings),
      halaqah.length,
    ),
  };
}

/**
 * The blast list: every teacher with at least one meeting in the period, folded
 * to counts. Teachers with zero gaps are INCLUDED — this is a confirmation of
 * the recap, not a reprimand, and a teacher whose record is already complete
 * still deserves to see it and say so.
 *
 * One aggregate query, not N calls to getTeacherRecap: the blast spans hundreds
 * of teachers across a dozen programs.
 *
 * No phone number is returned. The caller joins contacts itself (lib/guru/
 * phone.ts) so this module never carries PII nobody asked it for.
 *
 * Meetings whose teacher has no numeric guru id are SKIPPED here: a magic-link
 * token is minted per guru id, so there is no honest way to address such a row —
 * inventing an id (0, negative, a hash of the name) would mint a token pointing
 * at the wrong person's recap. The endpoint reports them as skipped with reason
 * 'no_guru_id', reading their names from listRecapTeachersWithoutGuruId, so
 * nobody disappears quietly.
 */
export async function listRecapTeachers(
  start: string,
  end: string,
): Promise<Omit<RecapTeacherSummary, "phone">[]> {
  const programs = await getRecapPrograms();
  if (programs.length === 0) return [];
  const db = getDb();

  const rows = await db.execute(sql`
    with ${foldedJadwalCte},
    ${attributionCte(
      programs.map((p) => p.id),
      start,
      end,
    )}
    select a.guru_id,
           -- Most frequent spelling of the name, for the same reason as in
           -- getTeacherRecap; null only when no meeting carried any name.
           mode() within group (order by a.guru_name) as guru_name,
           array_agg(distinct a.program_name order by a.program_name) as programs,
           array_agg(distinct a.program_slug) as program_slugs,
           count(distinct (a.program_id, a.halaqah_id))::int as halaqah,
           count(*)::int as meetings,
           count(*) filter (where a.done)::int as taught,
           count(*) filter (where not a.done)::int as gaps,
           count(*) filter (where not a.done and a.conf_status is not null)::int as confirmed
    from att a
    where a.guru_id is not null
    group by a.guru_id
    -- Positional: ordering by the aggregated name, which has no column of its own.
    order by 2 asc nulls last, 1 asc
  `);

  return rows.rows.map((r) => {
    const guruId = Number(r.guru_id);
    const gaps = Number(r.gaps);
    const confirmed = Number(r.confirmed);
    return {
      guruId,
      nama: typeof r.guru_name === "string" && r.guru_name !== "" ? r.guru_name : `Guru #${guruId}`,
      programs: Array.isArray(r.programs) ? r.programs.map((p) => String(p)) : [],
      programSlugs: Array.isArray(r.program_slugs)
        ? r.program_slugs.map((p) => String(p))
        : [],
      counts: {
        halaqah: Number(r.halaqah),
        meetings: Number(r.meetings),
        taught: Number(r.taught),
        gaps,
        confirmed,
        unresolved: gaps - confirmed,
      },
    };
  });
}

/**
 * Names of teachers who taught in the period but carry no numeric guru id on any
 * of their meetings — neither on the jadwal nor on the halaqah.
 *
 * These are the people listRecapTeachers has to leave out (no id, no token, no
 * magic link). Surfacing their names lets the endpoint report them as skipped
 * with reason 'no_guru_id' so a coordinator can follow up by hand instead of
 * assuming everyone was reached. A meeting with neither guru id nor any name
 * falls back to its halaqah label, so it still shows up as something a human can
 * chase rather than being dropped.
 */
export async function listRecapTeachersWithoutGuruId(
  start: string,
  end: string,
): Promise<string[]> {
  const programs = await getRecapPrograms();
  if (programs.length === 0) return [];
  const db = getDb();

  const rows = await db.execute(sql`
    with ${foldedJadwalCte},
    ${attributionCte(
      programs.map((p) => p.id),
      start,
      end,
    )}
    select distinct coalesce(a.guru_name, 'Halaqah #' || a.halaqah_id::text) as nama
    from att a
    where a.guru_id is null
    order by 1 asc
  `);

  return rows.rows.map((r) => String(r.nama));
}
