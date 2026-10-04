import { listRecentIncidents } from "@/app/[program]/piket/actions";
import { agentProgram, requireFeature } from "../../_program";
import { agentJson, intParam } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["limit"] as const;

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

/**
 * Lateness incidents, and — the actual question — how many surat peringatan are
 * waiting to be issued.
 *
 * `needsSp` is computed HERE. The rule (`sp_required && !sp_generated_at`) has
 * lived only in the browser until now (IncidentsTable.tsx:16,77-99); leaving a
 * two-field boolean derivation to a language model is an invitation to
 * hallucinate a number somebody will act on.
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const gated = await requireFeature(req, gate.ctx, "piket");
  if (gated) return gated;

  const limit = intParam(params, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await listRecentIncidents(slug, limit);

  const items = rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    arrivalTime: r.arrival_time,
    perizinan: r.perizinan,
    alasan: r.alasan,
    nama: r.students?.full_name ?? null,
    spRequired: r.sp_required,
    spGeneratedAt: r.sp_generated_at,
    needsSp: r.sp_required && !r.sp_generated_at,
  }));

  return agentJson(
    req,
    {
      program: slug,
      items,
      counts: {
        total: items.length,
        needsSp: items.filter((i) => i.needsSp).length,
        spGenerated: items.filter((i) => i.spGeneratedAt != null).length,
      },
    },
    {
      program: slug,
      // The DB LIMIT is applied in the query, so `total` here is the page, not
      // the table. Say so rather than implying a full count.
      caps: { items: limit },
      query: params,
      startedAt,
    },
  );
}
