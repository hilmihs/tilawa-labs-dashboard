import { getPengajarDirectory } from "@/lib/directory/queries";
import { agentProgram } from "../../_program";
import { agentError, agentJson } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["expand"] as const;

/**
 * Teacher directory. The nested `halaqah[]` is dropped by default — it repeats
 * everything /halaqah already returns and roughly triples the payload. Ask with
 * `?expand=halaqah` when the per-halaqah rows are actually the question.
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const dir = await getPengajarDirectory(slug);
  if (!dir) {
    return agentError(req, 404, "program tidak punya direktori pengajar", {
      program: slug, query: params, startedAt,
    });
  }

  const expand = params.expand === "halaqah";
  const rows = dir.rows.map(({ halaqah, ...rest }) => (expand ? { ...rest, halaqah } : rest));

  return agentJson(
    req,
    { program: slug, programName: dir.programName, rows },
    { program: slug, truncated: { rows: dir.rows.length }, query: params, startedAt },
  );
}
