import { NextRequest, NextResponse } from "next/server";
import { getInsights } from "@/lib/insights/queries";
import { bearerToken, safeEqual } from "@/lib/auth/bearer";

export const dynamic = "force-dynamic";

// Machine-readable "guru belum presensi" feed for automation (n8n reminders).
// Same data the coordinator sees on /[program]/inbox, but gated by
// `Authorization: Bearer ${CRON_SECRET}` instead of the jose session cookie so a
// backend job can read it without logging in. Reuses getInsights() — no logic
// duplicated.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ program: string }> },
) {
  // Constant-time, via the same helper /api/agent/* uses. The plain `!==` this
  // replaced short-circuits on the first differing byte; with no rate limiting
  // anywhere in this app that is a free side channel, and it was the pattern
  // every new route was copying.
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const presented = bearerToken(req);
  if (!secret || !presented || !safeEqual(presented, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { program } = await params;
  const insights = await getInsights(program);
  if (!insights) {
    return NextResponse.json({ error: "program tidak ditemukan" }, { status: 404 });
  }

  // Only the teacher-gap slices are exposed — the reminder just needs to know
  // which pengajar/pertemuan is missing, not the full insight bundle.
  return NextResponse.json({
    program,
    thresholdPct: insights.thresholdPct,
    teacherGaps: insights.teacherGaps,
    partialPresensi: insights.partialPresensi,
    // Merged per-halaqah view — matches the single reminder the coordinator now
    // sends from /[program]/inbox, so automation doesn't nudge twice either.
    presensiGaps: insights.presensiGaps,
    counts: {
      teacherGapMeetings: insights.counts.teacherGapMeetings,
      teacherGapHalaqah: insights.counts.teacherGapHalaqah,
      partialMeetings: insights.counts.partialMeetings,
      presensiGapHalaqah: insights.counts.presensiGapHalaqah,
    },
  });
}
