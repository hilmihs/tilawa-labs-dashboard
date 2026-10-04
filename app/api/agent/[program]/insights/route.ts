import { getInsights } from "@/lib/insights/queries";
import { agentProgram } from "../../_program";
import { agentError, agentJson, collector, intParam } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["limit", "raw"] as const;

const CAP_AT_RISK = 20;
const CAP_TOP_LAHN = 10;
const CAP_GAPS = 20;
/** Names per partial meeting. The count is what drives the nudge; the names are colour. */
const CAP_MISSING_NAMES = 10;

/**
 * The Action Items page as JSON — the same `getInsights()` call
 * app/[program]/inbox/page.tsx makes, so the agent and the coordinator are
 * never looking at different numbers.
 *
 * `teacherGaps` and `partialPresensi` are omitted by default: `presensiGaps` is
 * the two of them already folded per halaqah, and it is the one HERMES.md tells
 * the agent to use. `?raw=1` puts them back for anything that needs the split.
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const insights = await getInsights(slug);
  if (!insights) {
    return agentError(req, 404, "program tidak punya data insight", {
      program: slug,
      query: params,
      startedAt,
    });
  }

  const limit = intParam(params, "limit", CAP_AT_RISK, 200);
  const c = collector();

  const presensiGaps = c
    .take("presensiGaps", insights.presensiGaps, CAP_GAPS)
    .map((g) => ({
      ...g,
      partialMeetings: g.partialMeetings.map((m) => ({
        order: m.order,
        date: m.date,
        missingCount: m.missingStudents.length,
        missingStudents: m.missingStudents.slice(0, CAP_MISSING_NAMES),
      })),
    }));

  return agentJson(
    req,
    {
      program: slug,
      thresholdPct: insights.thresholdPct,
      presensiGaps,
      atRisk: c.take("atRisk", insights.atRisk, limit),
      // Bounded by halaqah count (~30), so no cap: a truncated health list would
      // hide exactly the "kritis" row somebody asked about.
      halaqahHealth: insights.halaqahHealth,
      topLahn: c.take("topLahn", insights.topLahn, CAP_TOP_LAHN),
      counts: insights.counts,
      ...(params.raw === "1"
        ? { teacherGaps: insights.teacherGaps, partialPresensi: insights.partialPresensi }
        : {}),
    },
    { program: slug, caps: c.caps, truncated: c.truncated, query: params, startedAt },
  );
}
