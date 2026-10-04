import { getHkmDashboardData } from "@/app/[program]/hkm/queries";
import { agentProgram } from "../../_program";
import { agentError, agentJson, collector, intParam } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["mode", "month", "limit", "quality"] as const;

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 500;
const CAP_TREND = 30;

/**
 * HKM tilawah progress. Measured in PAGES against a target, never in attendance
 * percent — HERMES.md:322-323 records that trap, and `avgKehadiran` genuinely
 * does not exist for these programs.
 *
 * `reconciliation` (data-quality diagnostics) is omitted unless `?quality=1`:
 * it is operator noise, not an answer to "how is HKM going".
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const data = await getHkmDashboardData(slug, {
    mode: params.mode === "kumulatif" ? "kumulatif" : "bulanan",
    month: params.month,
  });
  // getHkmDashboardData returns null for any program that is not berkah_api.
  if (!data) {
    return agentError(req, 404, "program ini bukan HKM (sumber data bukan berkah_api)", {
      program: slug, query: params, startedAt,
    });
  }

  const limit = intParam(params, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const c = collector();

  return agentJson(
    req,
    {
      program: slug,
      hasData: data.hasData,
      period: data.period,
      target: data.target,
      mode: data.mode,
      month: data.month,
      monthTargetPages: data.monthTargetPages,
      kpis: data.kpis,
      monthlyKpis: data.monthlyKpis,
      // Worst-first: the ones actually needing attention survive the cap.
      atRisk: c.take("atRisk", data.atRisk, limit),
      participants: c.take("participants", data.participants, limit),
      halaqahLeaderboard: data.halaqahLeaderboard,
      pengajarLeaderboard: data.pengajarLeaderboard,
      trend: c.take("trend", data.trend.slice(-CAP_TREND), CAP_TREND),
      ...(params.quality === "1" ? { reconciliation: data.reconciliation } : {}),
    },
    { program: slug, caps: c.caps, truncated: c.truncated, query: params, startedAt },
  );
}
