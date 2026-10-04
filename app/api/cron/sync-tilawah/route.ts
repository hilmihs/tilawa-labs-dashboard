import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jadwalSync, programs } from "@/lib/db/schema";
import { runAllTilawahSyncs } from "@/lib/sync/tilawah-sync";
import { isSyncRunning } from "@/lib/sync/last-sync";
import { decideRun, inSyncBlackout } from "@/lib/sync/sync-window";
import { todayJakarta } from "@/lib/time/jakarta";

// Cron (Vercel or an Azure Container Apps Job) calls this with an
// `Authorization: Bearer ${CRON_SECRET}` header — reject anything else so this
// can't be triggered by a random public request.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DevOps' quiet hours. Deliberately above the `?full=1` / `?sweep=1` reads
  // below: those exist to skip the *cadence* window, not this one.
  if (inSyncBlackout(new Date())) {
    return NextResponse.json({ skipped: true, reason: "blackout" });
  }

  // Near-live scheduling runs this often (e.g. every 15 min). If a previous run
  // (or a manual refresh) is still going, skip so runs don't overlap/stack.
  if (await isSyncRunning()) {
    return NextResponse.json({ skipped: true, reason: "sync already in progress" });
  }

  // `?full=1` runs regardless of the window — the manual override, and what the
  // nightly sweep uses.
  const params = new URL(req.url).searchParams;
  const force = params.get("full") === "1";

  // `?sweep=1` ALSO ignores the per-halaqah attendance fingerprint. Needed after
  // a teacher correction upstream: no presensi moved, so the fingerprint matches
  // and the detail call — the only place the new teacher would come from — is
  // skipped for up to 20 hours. Implies `full`, since sweeping inside a closed
  // window would otherwise be refused.
  const sweep = params.get("sweep") === "1";

  if (!force && !sweep) {
    const db = getDb();

    // Does ANY tilawah program have a meeting scheduled today? One indexed
    // query, no upstream call. The per-program version of this question lives
    // in runAllTilawahSyncs; this one only decides whether to bother at all.
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(jadwalSync)
      .innerJoin(programs, eq(programs.id, jadwalSync.programId))
      .where(
        and(eq(programs.dataSourceType, "tilawah_api"), eq(jadwalSync.scheduleDate, todayJakarta())),
      );

    const decision = decideRun({
      now: new Date(),
      hasMeetingToday: (row?.n ?? 0) > 0,
      // The cron loop fires every 15 minutes, so that is the elapsed time this
      // route sees. decideRun turns it into a fast or slow lane.
      minutesSinceLastRun: 15,
      allowSlowLane: true,
    });

    if (!decision.run) {
      return NextResponse.json({ skipped: true, reason: decision.reason });
    }
  }

  const results = await runAllTilawahSyncs({ forceSweep: sweep });
  const allOk = results.every((r) => r.ok);
  // 500 if any program hard-failed so the caller surfaces it; body carries
  // per-program status.
  return NextResponse.json({ results }, { status: allOk ? 200 : 500 });
}
