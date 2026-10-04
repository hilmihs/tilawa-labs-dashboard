import { getChangeRecap, getRecapDateBounds, getScheduleChanges } from "@/lib/reports/change-recap";
import { COMBINED, resolveReportScopeForAgent } from "@/lib/reports/scope";
import { agentProgram, requireFeature } from "../../_program";
import { agentError, agentJson } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["start", "end", "batch"] as const;

/**
 * Teacher-change / badal recap. Same two loaders the /perubahan page uses; the
 * date window defaults to the recap's own bounds when unspecified.
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const gated = await requireFeature(req, gate.ctx, "perubahan");
  if (gated) return gated;

  const scope = await resolveReportScopeForAgent(slug, params.batch);
  if (!scope) {
    return agentError(req, 404, "program tidak ditemukan", { program: slug, query: params, startedAt });
  }
  // Never quietly narrower than asked: the agent summarizes whatever it gets.
  if (params.batch === COMBINED && !scope.combined) {
    return agentError(req, 400, "batch=all diminta tapi program ini hanya punya satu batch", {
      program: slug, query: params, startedAt,
    });
  }

  const bounds = await getRecapDateBounds(scope.programIds);
  const start = params.start ?? bounds?.start ?? "2020-01-01";
  const end = params.end ?? bounds?.end ?? "2099-12-31";

  const [recap, schedule] = await Promise.all([
    getChangeRecap(start, end, scope.programIds),
    getScheduleChanges(start, end, scope.programIds),
  ]);

  return agentJson(
    req,
    {
      program: slug,
      scope: { combined: scope.combined, label: scope.label, members: scope.members.map((m) => m.slug) },
      range: { start, end },
      recap,
      schedule,
    },
    { program: slug, query: params, startedAt },
  );
}
