import { getDashboardData } from "@/app/[program]/dashboard/queries";
import { agentProgram } from "../../_program";
import { agentJson, collector, intParam } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["limit"] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * The attendance monitoring page as JSON: segment summaries plus the monitored
 * student rows. Segments are uncapped (a handful per program) — those are the
 * numbers a summary actually needs; the student list is what gets trimmed.
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const data = await getDashboardData(slug);
  const limit = intParam(params, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const c = collector();

  // Worst attendance first, so the cap keeps the rows worth reporting.
  const sorted = [...data.students].sort(
    (a, b) => (a.attendanceRate ?? 101) - (b.attendanceRate ?? 101),
  );

  return agentJson(
    req,
    {
      program: slug,
      hasSyncData: data.hasSyncData,
      rosterCount: data.rosterCount,
      thresholdPct: data.thresholdPct,
      segmentation: data.segmentation,
      segments: data.segments,
      students: c.take("students", sorted, limit),
    },
    { program: slug, caps: c.caps, truncated: c.truncated, query: params, startedAt },
  );
}
