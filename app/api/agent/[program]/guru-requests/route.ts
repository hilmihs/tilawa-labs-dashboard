import { listRequests } from "@/lib/guru-requests/queries";
import { agentProgram } from "../../_program";
import { agentError, agentJson, intParam } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["status", "limit"] as const;

const STATUSES = ["pending", "approved", "rejected", "applied", "failed"] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Teacher reschedule / badal requests.
 *
 * Worth knowing: this is the ONE thing here the human dashboard cannot show
 * yet. A coordinator sees a request only via the WhatsApp magic link that
 * notified them, so a `pending` row nobody clicked is invisible in the UI. The
 * agent can now surface it; the dashboard should grow the same list.
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const status = params.status;
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return agentError(req, 400, `status tidak dikenal: ${status}`, {
      program: slug, query: params, startedAt, extra: { valid: STATUSES },
    });
  }

  const limit = intParam(params, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await listRequests(slug, status, limit);

  return agentJson(
    req,
    {
      program: slug,
      status: status ?? "semua",
      requests: rows,
      counts: {
        returned: rows.length,
        pending: rows.filter((r) => r.status === "pending").length,
      },
    },
    { program: slug, caps: { requests: limit }, query: params, startedAt },
  );
}
