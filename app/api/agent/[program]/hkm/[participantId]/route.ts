import { NextResponse } from "next/server";
import { getHkmParticipantDetail } from "@/app/[program]/hkm/queries";
import { agentAuthOr401 } from "../../../_auth";
import { agentError, agentJson, readParams, validSlug } from "../../../_respond";

export const dynamic = "force-dynamic";

/** One HKM participant's reading history and position against target. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ program: string; participantId: string }> },
) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const { program: slug, participantId } = await ctx.params;
  if (!validSlug(slug)) return agentError(req, 400, "slug program tidak sah", { startedAt });
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(participantId)) {
    return agentError(req, 400, "participantId tidak sah", { program: slug, startedAt });
  }

  const parsed = readParams(new URL(req.url), []);
  if (!parsed.ok) return agentError(req, 400, parsed.error, { program: slug, startedAt });

  const detail = await getHkmParticipantDetail(slug, participantId);
  if (!detail) {
    return agentError(req, 404, "peserta HKM tidak ditemukan (atau program ini bukan HKM)", {
      program: slug, startedAt,
    });
  }

  return agentJson(req, { program: slug, ...detail }, { program: slug, startedAt });
}
