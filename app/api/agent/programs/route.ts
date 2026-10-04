import { NextResponse } from "next/server";
import { getAllPrograms } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { readBatchConfig } from "@/lib/programs/families";
import { agentAuthOr401 } from "../_auth";
import { agentJson, readParams } from "../_respond";

export const dynamic = "force-dynamic";

/**
 * The program directory the agent reads FIRST, so it never hardcodes a slug
 * list. Slugs, batch families, feature flags, and sync-pause state — everything
 * needed to decide which of the other endpoints are even meaningful.
 *
 * `families` exists because sibling slugs (hits-regular*, hits-safar*) are
 * different BATCHES of the same program, not separate programs. Grouping is the
 * caller's job; the server refuses to pre-aggregate them.
 */
export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = readParams(new URL(req.url), []);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const all = await getAllPrograms();
  const families: Record<string, string[]> = {};

  const programs = all.map((p) => {
    const batch = readBatchConfig(p.config);
    if (batch) (families[batch.family] ??= []).push(p.slug);
    return {
      slug: p.slug,
      name: p.name,
      dataSourceType: p.dataSourceType,
      // Pause lives in config, not a column (lib/admin/service.ts:355). A paused
      // program is stale ON PURPOSE — the agent must not alarm on it.
      syncPaused: (p.config as { syncPaused?: boolean } | null)?.syncPaused === true,
      features: getProgramConfig(p).features,
      batch,
    };
  });

  return agentJson(req, { programs, families }, { startedAt });
}
