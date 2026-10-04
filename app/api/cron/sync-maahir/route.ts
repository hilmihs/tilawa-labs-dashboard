import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runAllMaahirSyncs } from "@/lib/sync/maahir-sync";
import { isSyncRunning } from "@/lib/sync/last-sync";
import { inSyncBlackout } from "@/lib/sync/sync-window";

// Cron calls this with `Authorization: Bearer ${CRON_SECRET}`. Pulls the Maahir
// Public API (36 entities + 7 rekap routes) into `maahir_sync` / `maahir_rekap`.
// Until now Maahir was the only source with no cron at all — it moved solely by
// `pnpm sync:maahir` or the admin button, which is why the mirror sat five days
// stale on 7 Sep 2026 while every screen built on it looked current.
export const dynamic = "force-dynamic";
// One run is 36 entity pulls + 12 rekap pulls, all serialised behind a 250 ms
// throttle, so it is far slower than the tilawah sync. 120 s is not enough.
// 600 on the self-hosted deployment, where the 48-request pull needs it. The
// demo runs on a plan capped at 300, and it has no upstream to pull from — the
// route exists here only so the build matches production's shape.
export const maxDuration = 300;

/**
 * How stale the mirror must be before a cron tick actually syncs.
 *
 * The shared cron loop fires every 15 minutes, but `docs/API-PUBLIC.md` §5
 * recommends a **daily** pull and the upstream already serves cached responses
 * with its own TTL. Running the full 48-request pass 96 times a day would be
 * ~4600 requests against a small production server for data that changes once a
 * day — and the API answers 429 with a `Retry-After` when pushed.
 *
 * So the route throttles itself instead of the loop having to know about it: a
 * tick is a no-op unless the last successful run is older than this. That keeps
 * the compose file a plain list of route names, and keeps the cadence decision
 * next to the reason for it. `?force=1` bypasses it for a manual run.
 */
const MIN_JAM_ANTAR_SYNC = 6;

/**
 * When the last successful Maahir sync finished, or `null` if there never was one.
 *
 * `partial` counts as a run: its rows did land, and what it missed (an entity the
 * upstream pages unstably, see lib/sync/maahir-sync.ts) will not appear by
 * re-pulling 15 minutes later — it would only turn the 6-hour cadence into a full
 * pass every cron tick against a small production API.
 *
 * `db.execute` with raw SQL hands back whatever the pg driver parsed — for a
 * `max(timestamptz)` that is a **string**, not a `Date`, because the aggregate
 * loses the column type the driver would otherwise use to pick a parser. Typing
 * the row as `Date` compiles fine and then throws `last.getTime is not a
 * function` at runtime, which is exactly what this route did on its first call.
 * Parse explicitly, and treat an unparseable value as "never synced" so a bad
 * timestamp makes the sync run rather than silently skip forever.
 */
async function terakhirSukses(): Promise<Date | null> {
  const db = getDb();
  const rows = await db.execute<{ finished_at: string | Date | null }>(sql`
    select max(sr.finished_at) as finished_at
    from sync_runs sr
    join programs p on p.id = sr.program_id
    where p.data_source_type = 'maahir_api' and sr.status in ('success', 'partial')
  `);
  const raw = rows.rows[0]?.finished_at;
  if (!raw) return null;
  const at = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Is a **Maahir** sync already running?
 *
 * Deliberately not `isSyncRunning()` with no argument, which the sibling cron
 * routes use. That checks every program at once, and on a box whose 15-minute
 * loop keeps a tilawah sync almost permanently in flight it means Maahir never
 * gets a turn — observed on the hilmihs VPS, 8 Sep 2026: five consecutive ticks
 * answered "sync already in progress", every one of them blocked by a tilawah
 * run.
 *
 * The overlap guard exists so two syncs of the same thing cannot interleave and
 * so a small upstream is not hit twice at once. Tilawah and Maahir are different
 * upstreams and different tables, so a global lock buys nothing here and costs
 * the whole schedule. Scoped to `maahir_api` programs, which is what this route
 * is about to write.
 *
 * Stale rows are still ignored — `isSyncRunning` drops anything older than its
 * own window, so a crashed run cannot wedge this shut.
 */
async function maahirSyncRunning(): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute<{ id: string }>(sql`
    select id from programs where data_source_type = 'maahir_api'
  `);
  for (const row of rows.rows) {
    if (await isSyncRunning(row.id)) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Jam hening DevOps — di atas `?force=1`, karena force ada untuk menembus
  // throttle 6 jam di bawah, bukan untuk menembus jendela ini.
  // Lihat lib/sync/sync-window.ts.
  if (inSyncBlackout(new Date())) {
    return NextResponse.json({ skipped: true, reason: "blackout" });
  }

  if (await maahirSyncRunning()) {
    return NextResponse.json({ skipped: true, reason: "sync Maahir sedang berjalan" });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const last = await terakhirSukses();
  if (!force && last) {
    const jam = (Date.now() - last.getTime()) / 3_600_000;
    if (jam < MIN_JAM_ANTAR_SYNC) {
      return NextResponse.json({
        skipped: true,
        reason: `terakhir sukses ${jam.toFixed(1)} jam lalu (< ${MIN_JAM_ANTAR_SYNC} jam)`,
        lastSuccessAt: last,
      });
    }
  }

  const results = await runAllMaahirSyncs();

  // An empty result set means no program is configured as `maahir_api` — the
  // sync did nothing at all. Say so instead of returning a bare 200, which reads
  // as success in monitoring. Same failure mode that hid a mabni misconfiguration
  // for weeks; see app/api/cron/sync-mabni/route.ts.
  if (results.length === 0) {
    return NextResponse.json(
      { results, warning: "no program with data_source_type='maahir_api' — nothing synced" },
      { status: 500 },
    );
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ results }, { status: allOk ? 200 : 500 });
}
