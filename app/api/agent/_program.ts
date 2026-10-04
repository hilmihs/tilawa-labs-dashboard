import { NextResponse } from "next/server";
import { getProgram, type Program } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { agentAuthOr401 } from "./_auth";
import { agentError, readParams, validSlug } from "./_respond";

/**
 * The preamble every per-program agent route shares: authenticate, validate the
 * slug shape, resolve the program, and parse the query against the route's
 * allowlist. Factored out so no route can skip one of the four.
 */
export type AgentContext = {
  program: Program;
  slug: string;
  params: Record<string, string>;
  startedAt: number;
};

export async function agentProgram(
  req: Request,
  routeParams: Promise<{ program: string }>,
  allow: readonly string[],
): Promise<{ ok: true; ctx: AgentContext } | { ok: false; response: NextResponse }> {
  const startedAt = Date.now();

  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return { ok: false, response: auth };

  const { program: slug } = await routeParams;
  if (!validSlug(slug)) {
    return { ok: false, response: await agentError(req, 400, "slug program tidak sah", { startedAt }) };
  }

  const parsed = readParams(new URL(req.url), allow);
  if (!parsed.ok) {
    return { ok: false, response: await agentError(req, 400, parsed.error, { program: slug, startedAt }) };
  }

  const program = await getProgram(slug);
  if (!program) {
    return {
      ok: false,
      response: await agentError(req, 404, "program tidak ditemukan", {
        program: slug,
        query: parsed.params,
        startedAt,
      }),
    };
  }

  return { ok: true, ctx: { program, slug, params: parsed.params, startedAt } };
}

/**
 * Feature gate. Returns a 404 WITH A REASON when the program does not have the
 * feature — never an empty 200, which is how an agent ends up reporting "tidak
 * ada masalah piket di DPQ" for a program that has no piket at all.
 */
export async function requireFeature(
  req: Request,
  ctx: AgentContext,
  feature: "piket" | "perubahan",
): Promise<NextResponse | null> {
  if (getProgramConfig(ctx.program).features[feature]) return null;
  return agentError(req, 404, `program ini tidak memakai fitur ${feature}`, {
    program: ctx.slug,
    query: ctx.params,
    startedAt: ctx.startedAt,
  });
}
