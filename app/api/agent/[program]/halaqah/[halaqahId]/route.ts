import { getHalaqahDetail } from "@/lib/insights/halaqah";
import { agentAuthOr401 } from "../../../_auth";
import { agentError, agentJson, collector, readParams, validSlug } from "../../../_respond";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOW = ["grid"] as const;

/**
 * Meetings returned. Raised from 10 to 120 on 2026-09-05.
 *
 * Ten was chosen because "the full history is rarely the question" — true for a
 * human asking what happened lately, false for anything that counts across a
 * date range. The weekly teaching recap (`assistant/rekap_mengajar.py` in the
 * hermes repo) counts meetings between the 16th of last month and today, and at
 * ten it silently missed everything older: 359 of 382 halaqah exceed the cap,
 * the largest holds 94 meetings. Counts still rendered, still looked plausible,
 * and were wrong for 94% of halaqah.
 *
 * The response was never dishonest — `meta.truncated.meetings` said 25 next to
 * `caps.meetings: 10`. The consumer read the list and not the meta. Both sides
 * are fixed: that job now aborts on truncation instead of publishing the number.
 *
 * 120 covers the largest halaqah today with room to spare. The added payload is
 * the meetings array alone (~60 bytes each); `matrix` was never capped by this
 * constant and is still gated behind `?grid=1`.
 */
const CAP_MEETINGS = 120;

/**
 * One halaqah's attendance detail. The presensi `matrix` is omitted unless
 * `?grid=1`: it is students × meetings cells including free-text excuse notes
 * pasted from WhatsApp, i.e. the largest and most personal payload here.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ program: string; halaqahId: string }> },
) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const { program: slug, halaqahId } = await ctx.params;
  if (!validSlug(slug)) return agentError(req, 400, "slug program tidak sah", { startedAt });
  if (!/^\d{1,12}$/.test(halaqahId)) {
    return agentError(req, 400, "halaqahId harus angka", { program: slug, startedAt });
  }

  const parsed = readParams(new URL(req.url), ALLOW);
  if (!parsed.ok) {
    return agentError(req, 400, parsed.error, { program: slug, startedAt });
  }

  const detail = await getHalaqahDetail(slug, Number(halaqahId));
  if (!detail) {
    return agentError(req, 404, "halaqah tidak ditemukan di program ini", {
      program: slug, query: parsed.params, startedAt,
    });
  }

  const c = collector();
  const { matrix, meetings, ...rest } = detail;

  return agentJson(
    req,
    {
      program: slug,
      ...rest,
      // Newest meetings first is what a "what happened lately" question wants.
      meetings: c.take("meetings", [...meetings].reverse(), CAP_MEETINGS),
      ...(parsed.params.grid === "1" ? { matrix } : {}),
    },
    {
      program: slug,
      caps: c.caps,
      truncated: { ...c.truncated, students: detail.students.length },
      query: parsed.params,
      startedAt,
    },
  );
}
