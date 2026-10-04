import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { syncRuns } from "@/lib/db/schema";
import { getProgram } from "@/lib/programs/resolve";

export type LastSync = {
  finishedAt: string | null; // ISO of the last SUCCESSFUL run
  lastStatus: "success" | "failed" | "running" | null; // status of the most recent run
  running: boolean; // a fresh run is in progress now
};

// A run stuck in 'running' past this window is treated as crashed, so a new sync
// (or the guard) isn't blocked forever by a dead run.
const STALE_RUNNING_MIN = 10;

/**
 * Record a failure that happened BEFORE any per-program run row existed —
 * upstream login refusing to connect, a missing credential, anything in the
 * preamble of a runAll* function.
 *
 * Without this the outage is invisible: the runner throws, the cron route
 * answers 500 with an empty body, `sync_runs` gets no row at all, and the
 * "terakhir disinkron" badge keeps showing the last SUCCESS. That is how the
 * tilawah + HKM syncs sat dead from 28 Aug 2026 06:00 UTC (upstream host
 * 103.181.142.223 stopped accepting TCP from the VPS) while looking merely
 * quiet — the mabni runner, which opens its run row before touching upstream,
 * left a `failed` trail every 15 minutes and was the only reason we noticed.
 *
 * Never throws: a logging path must not turn a diagnosable outage into a
 * different error.
 */
export async function recordFailedRuns(
  programIds: string[],
  runType: string,
  error: string,
): Promise<void> {
  if (programIds.length === 0) return;
  try {
    const db = getDb();
    const now = new Date();
    await db.insert(syncRuns).values(
      programIds.map((programId) => ({
        programId,
        runType,
        status: "failed",
        error: error.slice(0, 500),
        startedAt: now,
        finishedAt: now,
      })),
    );
  } catch (err) {
    console.error("[sync] gagal mencatat kegagalan login:", err instanceof Error ? err.message : err);
  }
}

/**
 * Is a sync currently in progress? Scoped to one program when `programId` is
 * given, else any program. Ignores 'running' rows older than STALE_RUNNING_MIN
 * (a crashed run never flips to success/failed).
 */
export async function isSyncRunning(programId?: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute(sql`
    select 1 from sync_runs
    where status = 'running'
      and started_at > now() - interval '${sql.raw(String(STALE_RUNNING_MIN))} minutes'
      ${programId ? sql`and program_id = ${programId}` : sql``}
    limit 1
  `);
  return rows.rows.length > 0;
}

/** Last-sync status for a program (for the "terakhir disinkron" label). */
export async function getLastSync(programSlug: string): Promise<LastSync | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();

  const [lastSuccess] = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.programId, program.id), eq(syncRuns.status, "success")))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  const [latest] = await db
    .select({ status: syncRuns.status })
    .from(syncRuns)
    .where(eq(syncRuns.programId, program.id))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  return {
    finishedAt: lastSuccess?.finishedAt ? lastSuccess.finishedAt.toISOString() : null,
    lastStatus: (latest?.status as LastSync["lastStatus"]) ?? null,
    running: await isSyncRunning(program.id),
  };
}

/** Human label + tone for the last-sync badge. Computed at render (pages are dynamic). */
export function lastSyncLabel(ls: LastSync | null): { text: string; tone: "ok" | "warn" | "bad" } {
  if (ls?.running) return { text: "sedang menyinkron…", tone: "ok" };
  if (!ls || !ls.finishedAt) return { text: "belum pernah disinkron", tone: "warn" };

  const d = new Date(ls.finishedAt);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  const jam = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  const rel = mins < 1 ? "barusan" : mins < 60 ? `${mins} menit lalu` : `${Math.floor(mins / 60)} jam lalu`;
  const failed = ls.lastStatus === "failed";
  const tone: "ok" | "warn" | "bad" = failed ? "bad" : mins > 30 ? "warn" : "ok";
  return { text: `${jam} WIB (${rel})${failed ? " · sync terakhir gagal" : ""}`, tone };
}
