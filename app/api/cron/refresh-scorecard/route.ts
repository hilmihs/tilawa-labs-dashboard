import { NextRequest, NextResponse } from "next/server";
import { getActivePeriod } from "@/lib/scorecard/queries";
import { refreshPeriod } from "@/lib/scorecard/metrics/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Refreshes the active scorecard period's auto-sourced items (al-Fatihah
// assessment counts, …) from their upstream APIs. The VPS `cron` container
// (deploy/docker-compose.yml) curls this every 15 min alongside the tilawah/hkm
// syncs. Same guard as the other cron routes: Bearer ${CRON_SECRET}.
// A closed period is a no-op inside refreshPeriod, so this can't disturb frozen
// quarters.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = await getActivePeriod();
  if (!period) {
    return NextResponse.json({ skipped: true, reason: "no active period" });
  }

  try {
    const summary = await refreshPeriod(period.id);
    // 500 if any item failed so the platform surfaces it; body carries detail.
    return NextResponse.json({ summary }, { status: summary.errors > 0 ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
