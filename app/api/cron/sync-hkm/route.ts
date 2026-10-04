import { NextRequest, NextResponse } from "next/server";
import { runAllHkmSyncs } from "@/lib/sync/hkm-sync";
import { isSyncRunning } from "@/lib/sync/last-sync";
import { inSyncBlackout } from "@/lib/sync/sync-window";

// Cron (Vercel or an Azure Container Apps Job) calls this with an
// `Authorization: Bearer ${CRON_SECRET}` header. Pulls HKM tilawah data from
// cms.example.com and writes one daily progress snapshot per
// participant. Scheduled offset from the tilawah cron so they don't overlap.
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

  const results = await runAllHkmSyncs();
  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ results }, { status: allOk ? 200 : 500 });
}
