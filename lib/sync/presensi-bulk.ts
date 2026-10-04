import { tilawahGet } from "@/lib/integrations/tilawah-client";
import { type TilawahSession } from "@/lib/integrations/tilawah-auth";

/**
 * Bulk incremental pull of `/api/presensis` — the system-wide attendance stream
 * (36k+ rows), which carries exactly the columns `attendance_sync` stores. The
 * endpoint has no batch/date filter, but `sort_by=updated_at&sort=desc` works
 * (probed live 2026-08-22), so we page newest-first and stop as soon as a row
 * older than our high-water appears. This replaces pulling every halaqah's
 * `/api/halaqah/{id}` detail just to refresh attendance: a normal run reads 1–3
 * pages instead of ~357 detail calls.
 */
export type BulkPresensiRow = {
  id: number;
  halaqah_user_id: number;
  halaqah_jadwal_id: number;
  status: number | string | null;
  notes: string | null;
  lahn_jaliy: string | null;
  lahn_khofiy: string | null;
  task_submission_date: string | null;
  updated_at: string | null;
};

/**
 * From one page (already sorted updated_at DESC), how many leading rows to keep
 * and whether to stop paging. `since` inclusive (`>=`) so a boundary row is
 * re-emitted rather than dropped — the caller's upsert is idempotent by id. The
 * first row strictly older than `since` means everything after it is older too,
 * so paging can stop. Rows with no `updated_at` are kept (can't be ordered) and
 * never trigger a stop. Pure — unit-tested without the network.
 */
export function takeUntilSeen(
  page: readonly { updated_at: string | null }[],
  since: Date | null,
): { keptCount: number; stop: boolean } {
  if (!since) return { keptCount: page.length, stop: page.length === 0 };
  const sinceMs = since.getTime();
  let kept = 0;
  for (const r of page) {
    const t = r.updated_at ? new Date(r.updated_at).getTime() : null;
    if (t === null || Number.isNaN(t)) {
      kept += 1;
      continue;
    }
    if (t >= sinceMs) kept += 1;
    else return { keptCount: kept, stop: true };
  }
  return { keptCount: kept, stop: page.length === 0 };
}

const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type BulkPresensiResult = {
  rows: BulkPresensiRow[];
  maxUpdatedAt: Date | null;
  pages: number;
  reachedCap: boolean;
};

/**
 * Pull presensi with `updated_at >= since` (all rows when `since` is null — the
 * first-run full pull, ~73 pages @500). `maxPages` is a runaway guard, not an
 * expected limit; `reachedCap` says it was hit so the caller can log a partial.
 */
export async function fetchPresensiSince(
  baseUrl: string,
  session: TilawahSession,
  since: Date | null,
  opts: { perPage?: number; maxPages?: number; gapMs?: number } = {},
): Promise<BulkPresensiResult> {
  const perPage = opts.perPage ?? 500;
  const maxPages = opts.maxPages ?? 200;
  const gapMs = opts.gapMs ?? 150;

  const rows: BulkPresensiRow[] = [];
  let maxUpdatedAt: Date | null = null;
  let page = 1;
  let pages = 0;
  let reachedCap = false;

  for (; page <= maxPages; page += 1) {
    const body = await tilawahGet<{
      presensis?: BulkPresensiRow[];
      pagination?: { last_page?: number };
    }>(baseUrl, session, `/api/presensis?page=${page}&per_page=${perPage}&sort_by=updated_at&sort=desc`);
    pages += 1;

    const pageRows = body.data.presensis ?? [];
    const { keptCount, stop } = takeUntilSeen(pageRows, since);
    for (let i = 0; i < keptCount; i += 1) {
      const r = pageRows[i];
      rows.push(r);
      const t = r.updated_at ? new Date(r.updated_at) : null;
      if (t && !Number.isNaN(t.getTime()) && (!maxUpdatedAt || t > maxUpdatedAt)) maxUpdatedAt = t;
    }

    const lastPage = body.data.pagination?.last_page ?? page;
    if (stop || pageRows.length === 0 || page >= lastPage) break;
    if (gapMs) await SLEEP(gapMs);
  }
  if (page > maxPages) reachedCap = true;

  return { rows, maxUpdatedAt, pages, reachedCap };
}
