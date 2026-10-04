import { NextResponse } from "next/server";
import { getProgramsOverview } from "@/lib/insights/overview";
import { agentAuthOr401 } from "../_auth";
import { agentJson, readParams } from "../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["programs"] as const;

/**
 * Aggregate health per program — the same numbers the /overview grid shows.
 * Counts and percentages only: zero PII, so this is the cheapest thing the
 * agent can read to answer "how are things going".
 */
export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = readParams(new URL(req.url), ALLOW);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const slugs = parsed.params.programs ? parsed.params.programs.split(",") : undefined;
  const programs = await getProgramsOverview(slugs);

  return agentJson(req, { programs }, { query: parsed.params, startedAt });
}
