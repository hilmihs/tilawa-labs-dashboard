import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * The teacher's sign-off on a whole monthly recap, and the follow-up view of it.
 *
 * The report page needs to answer a question no per-meeting table can: did this
 * person actually look at their recap and say it is right? A teacher whose month
 * was already complete has nothing to answer, so "no rows in
 * teacher_meeting_confirmations" means both "all good, confirmed" and "never
 * opened the link" — which is exactly the distinction the coordinator is chasing
 * before the lock. Hence one explicit row per teacher per period.
 */

export type RecapVerdict = "tepat" | "ada_koreksi";

export type AttestationInput = {
  guruId: number;
  guruName: string | null;
  periodStart: string;
  periodEnd: string;
  verdict: RecapVerdict;
  meetingsTotal: number;
  meetingsTaught: number;
  meetingsGap: number;
  answered: number;
  disputed: number;
};

/** Upsert the sign-off. Re-submitting the page updates the same row. */
export async function upsertAttestation(input: AttestationInput): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    insert into recap_attestations
      (guru_id, guru_name, period_start, period_end, verdict,
       meetings_total, meetings_taught, meetings_gap, answered, disputed)
    values
      (${input.guruId}, ${input.guruName}, ${input.periodStart}, ${input.periodEnd},
       ${input.verdict}, ${input.meetingsTotal}, ${input.meetingsTaught},
       ${input.meetingsGap}, ${input.answered}, ${input.disputed})
    on conflict (guru_id, period_start, period_end) do update set
      verdict = excluded.verdict,
      guru_name = excluded.guru_name,
      meetings_total = excluded.meetings_total,
      meetings_taught = excluded.meetings_taught,
      meetings_gap = excluded.meetings_gap,
      answered = excluded.answered,
      disputed = excluded.disputed,
      updated_at = now()
  `);
}

export type TeacherConfirmation = {
  verdict: RecapVerdict;
  confirmedAt: string; // ISO
  answered: number;
  disputed: number;
  notes: string[]; // free-text the teacher typed, newest first
  /** Set once a coordinator has acted on the correction. null = still open. */
  resolvedAt: string | null;
  resolvedBy: string | null;
};

/**
 * Mark a teacher's correction as handled, or re-open it.
 *
 * The teacher's own words stay untouched — this records only that someone acted
 * on them. Re-opening exists because "selesai" pressed by mistake must not be a
 * one-way door on the only queue the coordinators work from.
 */
export async function setCorrectionResolved(
  guruId: number,
  periodStart: string,
  periodEnd: string,
  resolved: boolean,
  actor: string,
): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    update recap_attestations
    set resolved_at = ${resolved ? sql`now()` : sql`null`},
        resolved_by = ${resolved ? actor : null},
        updated_at = now()
    where guru_id = ${guruId}
      and period_start = ${periodStart}
      and period_end = ${periodEnd}
  `);
}

/**
 * Sign-offs for one period, keyed by tilawah guru id, with the teacher's free
 * text folded in. Notes are joined here rather than fetched per row because the
 * report renders every teacher at once — one query each, not one per teacher.
 */
export async function getConfirmationsByGuru(
  start: string,
  end: string,
): Promise<Map<number, TeacherConfirmation>> {
  const db = getDb();
  const rows = await db.execute(sql`
    select a.guru_id,
           a.verdict,
           a.confirmed_at,
           coalesce(a.answered, 0) as answered,
           coalesce(a.disputed, 0) as disputed,
           a.resolved_at,
           a.resolved_by,
           coalesce(n.notes, '{}') as notes
    from recap_attestations a
    left join (
      -- distinct: rows written before addRecapNote learned to ignore a repeat
      -- (17 Aug produced up to twenty identical lines per teacher). Ordered by
      -- the newest occurrence so a later clarification reads first.
      select guru_id, array_agg(note order by last_at desc) as notes
      from (
        select guru_id, note, max(created_at) as last_at
        from recap_confirmation_notes
        where period_start = ${start} and period_end = ${end}
        group by guru_id, note
      ) uniq
      group by guru_id
    ) n on n.guru_id = a.guru_id
    where a.period_start = ${start} and a.period_end = ${end}
  `);

  const out = new Map<number, TeacherConfirmation>();
  for (const r of rows.rows) {
    const guruId = Number(r.guru_id);
    if (!Number.isFinite(guruId)) continue;
    out.set(guruId, {
      verdict: r.verdict === "ada_koreksi" ? "ada_koreksi" : "tepat",
      confirmedAt: new Date(r.confirmed_at as string).toISOString(),
      answered: Number(r.answered ?? 0),
      disputed: Number(r.disputed ?? 0),
      notes: Array.isArray(r.notes) ? (r.notes as string[]) : [],
      resolvedAt: r.resolved_at ? new Date(r.resolved_at as string).toISOString() : null,
      resolvedBy: (r.resolved_by as string) ?? null,
    });
  }
  return out;
}

/**
 * Notes from teachers who wrote something without the page ever recording a
 * sign-off (submission interrupted, or an older link). Without this they would
 * be invisible on the report — a written complaint that nobody sees is worse
 * than no complaint box at all.
 */
export async function getOrphanNotesByGuru(
  start: string,
  end: string,
): Promise<Map<number, string[]>> {
  const db = getDb();
  const rows = await db.execute(sql`
    select guru_id, array_agg(note order by last_at desc) as notes
    from (
      select n.guru_id, n.note, max(n.created_at) as last_at
      from recap_confirmation_notes n
      where n.period_start = ${start} and n.period_end = ${end}
        and not exists (
          select 1 from recap_attestations a
          where a.guru_id = n.guru_id
            and a.period_start = n.period_start and a.period_end = n.period_end
        )
      group by n.guru_id, n.note
    ) uniq
    group by guru_id
  `);
  const out = new Map<number, string[]>();
  for (const r of rows.rows) {
    const guruId = Number(r.guru_id);
    if (!Number.isFinite(guruId)) continue;
    out.set(guruId, Array.isArray(r.notes) ? (r.notes as string[]) : []);
  }
  return out;
}
