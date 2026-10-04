import { getSilabus } from "@/lib/insights/silabus";
import { agentProgram } from "../../_program";
import { agentError, agentJson } from "../../_respond";

export const dynamic = "force-dynamic";

/**
 * Syllabus plus each halaqah's position on it. `derivable: false` means the CMS
 * meeting titles are generic ("Pertemuan 1") and carry no materi — that is a
 * real answer, not an empty one, so it is returned as-is rather than 404'd.
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, []);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const data = await getSilabus(slug);
  if (!data) {
    return agentError(req, 404, "program tidak punya silabus", {
      program: slug, query: params, startedAt,
    });
  }

  return agentJson(req, { program: slug, ...data }, { program: slug, startedAt });
}
