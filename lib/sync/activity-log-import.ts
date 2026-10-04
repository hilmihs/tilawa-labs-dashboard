/**
 * Import tilawah's own pertemuan activity log into `jadwal_change_events`.
 *
 * This is the ONLY source of historical reschedules: it records
 * `action = "reschedule"` with the actor and the before/after values, which the
 * upsert-only `jadwal_sync` destroys. It does NOT record guru changes — no
 * badal-shaped action exists (probed 2026-08-07, see
 * scripts/probe-activity-log-shape.ts) — so badal history is only ever captured
 * going forward, by the diff during sync.
 *
 * The endpoint takes ONE pertemuan at a time (`filters[...]` forms all answer
 * 400) and there is no global index, so the candidate set is narrowed first to
 * meetings whose upstream row was ever modified. A reschedule necessarily moves
 * `updated_at`, so the filter cannot drop a real one.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { loginToTilawah } from "@/lib/integrations/tilawah-auth";
import { recordChangeEvents, type ChangeEventDraft } from "./jadwal-change-log";

type Auth = { baseUrl: string; cookieHeader: string; xsrfToken: string };

type ActivityLog = {
  id: number;
  pertemuan_id: number;
  user_id: number | null;
  action: string | null;
  old_status: number | null;
  new_status: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Candidate = {
  program_id: string;
  tilawah_jadwal_id: number;
  tilawah_halaqah_id: number | null;
  order: number | null;
  name: string | null;
  schedule_date: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The CMS drops connections at random even when the host is healthy. */
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

async function fetchLogs(auth: Auth, jadwalId: number): Promise<ActivityLog[]> {
  return retry(async () => {
    const res = await fetch(
      `${auth.baseUrl}/api/pertemuan-activity-logs?pertemuan_id=${jadwalId}&per_page=200`,
      {
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-XSRF-TOKEN": auth.xsrfToken,
          Cookie: auth.cookieHeader,
        },
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { logs?: ActivityLog[] } };
    return body.data?.logs ?? [];
  });
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** "2026-07-25 13:00:00" → "13:00"; null when unparseable. */
function timeOf(v: string | null): string | null {
  if (!v || v.length < 16) return null;
  return v.slice(11, 16);
}

/** "2026-07-25" → "25 Jul 2026" */
const MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function dateLabel(v: string | null): string | null {
  if (!v) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return v;
  return `${d} ${MONTH[m - 1] ?? m} ${y}`;
}

/**
 * Turn one `reschedule` log row into 0–2 drafts.
 *
 * The metadata keys are NOT uniform: a pure time shift carries only the
 * start/end pair with no `schedule_date` at all. So each key is probed rather
 * than assumed, and a date move plus a clock move on the same edit yields two
 * separate events instead of one ambiguous row.
 */
export function draftsFromLog(
  log: ActivityLog,
  meeting: Candidate,
  actorName: string | null,
): ChangeEventDraft[] {
  if (log.action !== "reschedule") return [];
  const md = log.metadata ?? {};
  const changedAt = new Date(log.created_at);
  if (Number.isNaN(changedAt.getTime())) return [];

  const oldDate = str(md.old_schedule_date)?.slice(0, 10) ?? null;
  const newDate = str(md.new_schedule_date)?.slice(0, 10) ?? null;
  const oldStart = str(md.old_start_session_date);
  const newStart = str(md.new_start_session_date);
  const oldEnd = str(md.old_end_session_date);
  const newEnd = str(md.new_end_session_date);

  // Fall back to the session timestamps when the log omits schedule_date but
  // the day still moved.
  const effOldDate = oldDate ?? oldStart?.slice(0, 10) ?? null;
  const effNewDate = newDate ?? newStart?.slice(0, 10) ?? null;

  const base = {
    programId: meeting.program_id,
    tilawahHalaqahId: meeting.tilawah_halaqah_id,
    tilawahJadwalId: meeting.tilawah_jadwal_id,
    meetingOrder: meeting.order,
    meetingName: meeting.name,
    // The date this meeting ended up on — what the monthly recap groups by.
    scheduleDate: effNewDate ?? meeting.schedule_date,
    affectedGuruId: null,
    affectedGuruName: null,
    changedAt,
    source: "upstream_log" as const,
    upstreamLogId: log.id,
    actorUserId: log.user_id,
    actorName,
    guruRequestId: null,
    raw: log,
  };

  const out: ChangeEventDraft[] = [];

  if (effOldDate && effNewDate && effOldDate !== effNewDate) {
    out.push({
      ...base,
      field: "schedule_date",
      oldValue: effOldDate,
      newValue: effNewDate,
      oldLabel: dateLabel(effOldDate),
      newLabel: dateLabel(effNewDate),
    });
  }

  // Clock-time move, reported only when the time-of-day itself changed — a pure
  // day shift keeps the same times and would otherwise duplicate the row above.
  const oldT = timeOf(oldStart);
  const newT = timeOf(newStart);
  const oldTe = timeOf(oldEnd);
  const newTe = timeOf(newEnd);
  if ((oldT && newT && oldT !== newT) || (oldTe && newTe && oldTe !== newTe)) {
    const o = `${oldT ?? "?"}–${oldTe ?? "?"}`;
    const n = `${newT ?? "?"}–${newTe ?? "?"}`;
    out.push({
      ...base,
      field: "session_time",
      oldValue: o,
      newValue: n,
      oldLabel: o,
      newLabel: n,
    });
  }

  return out;
}

export type ImportResult = {
  candidates: number;
  scanned: number;
  logRows: number;
  rescheduleRows: number;
  drafts: number;
  inserted: number;
  failed: number;
};

export async function importActivityLogs(opts?: {
  programIds?: string[];
  /** Cap the candidate set — for a quick smoke run. */
  limit?: number;
  /** Parse and count, but write nothing. */
  dryRun?: boolean;
  delayMs?: number;
  /**
   * Meetings fetched at once. Each request costs ~4s of mostly waiting, so the
   * serial run would take ~3 hours for the full candidate set. Kept modest —
   * this CMS already drops connections under normal load.
   */
  concurrency?: number;
  onProgress?: (done: number, total: number, inserted: number) => void;
}): Promise<ImportResult> {
  const db = getDb();
  const delay = opts?.delayMs ?? 350;

  const scopeSql = opts?.programIds?.length
    ? sql`and j.program_id in (${sql.join(
        opts.programIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`
    : sql``;
  const limitSql = opts?.limit ? sql`limit ${opts.limit}` : sql``;

  // Only meetings whose upstream row was ever touched can carry a reschedule.
  const rows = await db.execute<Candidate>(sql`
    select j.program_id, j.tilawah_jadwal_id, j.tilawah_halaqah_id,
           j."order" as order, j.name, j.schedule_date::text as schedule_date
    from jadwal_sync j
    where j.raw->>'updated_at' is distinct from j.raw->>'created_at'
      ${scopeSql}
    order by j.raw->>'updated_at' desc
    ${limitSql}
  `);
  const candidates = rows.rows ?? [];

  // Actor names: the log's user_id is a tilawah user, usually a guru.
  const guruRows = await db.execute<{ program_id: string; tilawah_guru_id: number; name: string }>(
    sql`select program_id, tilawah_guru_id, name from guru_sync`,
  );
  const guruName = new Map<string, string>();
  for (const g of guruRows.rows ?? []) guruName.set(`${g.program_id}:${g.tilawah_guru_id}`, g.name);

  const result: ImportResult = {
    candidates: candidates.length,
    scanned: 0,
    logRows: 0,
    rescheduleRows: 0,
    drafts: 0,
    inserted: 0,
    failed: 0,
  };

  const baseUrl = process.env.TILAWAH_BASE_URL;
  if (!baseUrl) throw new Error("TILAWAH_BASE_URL not set");
  const session = await retry(() => loginToTilawah(baseUrl));
  const auth: Auth = {
    baseUrl,
    cookieHeader: session.cookieHeader,
    xsrfToken: session.xsrfToken,
  };

  let batch: ChangeEventDraft[] = [];
  // Swap the array out BEFORE awaiting. Clearing it after the await loses every
  // draft another worker pushed while the insert was in flight — that silently
  // dropped 190 of 1.683 events on the first full run.
  const flush = async () => {
    if (batch.length === 0) return;
    const chunk = batch;
    batch = [];
    if (opts?.dryRun) return;
    result.inserted += await recordChangeEvents(chunk);
  };

  // Worker pool over a shared cursor: N workers pull the next candidate as they
  // finish, so one slow meeting doesn't stall the others.
  const concurrency = Math.max(1, opts?.concurrency ?? 5);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const idx = cursor++;
      if (idx >= candidates.length) return;
      const c = candidates[idx];
      let logs: ActivityLog[];
      try {
        logs = await fetchLogs(auth, c.tilawah_jadwal_id);
      } catch {
        result.failed += 1;
        continue;
      }
      result.scanned += 1;
      result.logRows += logs.length;
      for (const log of logs) {
        if (log.action !== "reschedule") continue;
        result.rescheduleRows += 1;
        const actor =
          log.user_id != null ? (guruName.get(`${c.program_id}:${log.user_id}`) ?? null) : null;
        const drafts = draftsFromLog(log, c, actor);
        result.drafts += drafts.length;
        batch.push(...drafts);
      }
      if (batch.length >= 200) await flush();
      opts?.onProgress?.(result.scanned, candidates.length, result.inserted);
      await sleep(delay);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await flush();

  return result;
}
