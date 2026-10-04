import { NextRequest, NextResponse } from "next/server";
import { runAllMabniSyncs } from "@/lib/sync/mabni-sync";
import { isSyncRunning } from "@/lib/sync/last-sync";
import { inSyncBlackout } from "@/lib/sync/sync-window";

// Cron calls this with `Authorization: Bearer ${CRON_SECRET}`. Pulls Madrasah
// Rabbaniyah attendance from boarding.tilawalabs.demo into the shared read-model.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // DevOps' quiet hours — see lib/sync/sync-window.ts.
  if (inSyncBlackout(new Date())) {
    return NextResponse.json({ skipped: true, reason: "blackout" });
  }
  if (await isSyncRunning()) {
    return NextResponse.json({ skipped: true, reason: "sync already in progress" });
  }
  const results = await runAllMabniSyncs();
  // An empty result set means no program is configured as `mabni_api` — the sync
  // did nothing at all. Say so instead of returning a bare 200, which reads as
  // success in monitoring and hid this exact misconfiguration for weeks.
  if (results.length === 0) {
    return NextResponse.json(
      { results, warning: "no program with data_source_type='mabni_api' — nothing synced" },
      { status: 500 },
    );
  }
  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ results }, { status: allOk ? 200 : 500 });
}
