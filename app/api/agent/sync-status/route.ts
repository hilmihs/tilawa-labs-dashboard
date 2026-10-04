import { NextResponse } from "next/server";
import { getAllPrograms } from "@/lib/programs/resolve";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { agentAuthOr401 } from "../_auth";
import { agentJson, readParams } from "../_respond";

export const dynamic = "force-dynamic";

/**
 * HERMES.md §6: data older than 2 hours means the agent should alert and HOLD
 * its reminders — unless the program's sync is paused, in which case being
 * stale is deliberate and must not raise an alarm.
 *
 * The rule is evaluated HERE, not in the agent. A boolean the server computed
 * cannot be re-derived wrongly by a model reading timestamps.
 */
const STALE_AFTER_MINUTES = 120;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = readParams(new URL(req.url), []);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const all = await getAllPrograms();
  const now = Date.now();

  const programs = await Promise.all(
    all.map(async (p) => {
      const ls = await getLastSync(p.slug);
      const paused = (p.config as { syncPaused?: boolean } | null)?.syncPaused === true;
      const ageMinutes =
        ls?.finishedAt != null
          ? Math.floor((now - new Date(ls.finishedAt).getTime()) / 60_000)
          : null;
      return {
        slug: p.slug,
        name: p.name,
        finishedAt: ls?.finishedAt ?? null,
        lastStatus: ls?.lastStatus ?? null,
        running: ls?.running ?? false,
        paused,
        ageMinutes,
        // Never stale while paused, and "never synced at all" counts as stale.
        stale: paused ? false : ageMinutes == null || ageMinutes > STALE_AFTER_MINUTES,
        label: lastSyncLabel(ls).text,
      };
    }),
  );

  return agentJson(
    req,
    {
      now: new Date(now).toISOString(),
      staleAfterMinutes: STALE_AFTER_MINUTES,
      stalenessRule: "lastSync > 2 jam DAN tidak paused",
      programs,
    },
    { startedAt },
  );
}
