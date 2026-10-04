import { getHalaqahList } from "@/lib/insights/halaqah";
import { agentProgram } from "../../_program";
import { agentJson } from "../../_respond";

export const dynamic = "force-dynamic";

/** Per-halaqah aggregates: peserta count, average rate, meetings, presensi backlog. */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, []);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const rows = await getHalaqahList(slug);

  return agentJson(
    req,
    { program: slug, rows },
    { program: slug, truncated: { rows: rows.length }, query: params, startedAt },
  );
}
