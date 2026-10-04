import { NextResponse } from "next/server";
import { bearerToken, safeEqual } from "@/lib/auth/bearer";
import { auditAgentRead } from "./_audit";

/**
 * Authenticate a read-only agent request. ONE credential: `Authorization:
 * Bearer ${AGENT_TOKEN}`.
 *
 * Deliberately does NOT accept OPS_SECRET, CRON_SECRET, or a session cookie.
 * That is the whole point of a separate token: it can be rotated or deleted
 * without touching cron, ops, or any human account — and it can only read.
 *
 * Fails closed. An unset, empty, or placeholder AGENT_TOKEN means every
 * /api/agent/* route 401s. That is the kill switch: remove the env var,
 * `up -d --force-recreate`, and the agent is blind with no code deploy.
 */
export function assertAgentAuth(req: Request): "agent-token" | null {
  const secret = (process.env.AGENT_TOKEN ?? "").trim();
  // The length floor is load-bearing, not hygiene: timingSafeEqual() on two
  // zero-length buffers returns TRUE, so without it an unset AGENT_TOKEN plus a
  // bare `Authorization: Bearer ` would authenticate. 24 also rejects a .env
  // still carrying a CHANGEME_ placeholder.
  if (secret.length < 24) return null;
  const presented = bearerToken(req);
  if (!presented) return null;
  return safeEqual(presented, secret) ? "agent-token" : null;
}

// Failed auth is the row that matters for spotting a leaked or brute-forced
// token — but unlimited 401 logging is a write amplifier for anyone who wants
// to fill notification_log. One row per minute is enough to see an attack start.
const REJECT_LOG_INTERVAL_MS = 60_000;
let lastRejectLoggedAt = 0;

/**
 * Authenticate, or return a 401 NextResponse. Usage:
 *   const auth = await agentAuthOr401(req);
 *   if (auth instanceof NextResponse) return auth;
 */
export async function agentAuthOr401(req: Request): Promise<"agent-token" | NextResponse> {
  const actor = assertAgentAuth(req);
  if (actor) return actor;

  const now = Date.now();
  if (now - lastRejectLoggedAt >= REJECT_LOG_INTERVAL_MS) {
    lastRejectLoggedAt = now;
    await auditAgentRead(req, { status: 401, failed: true });
  }

  return NextResponse.json(
    { error: "Unauthorized — butuh header Authorization: Bearer <AGENT_TOKEN>." },
    { status: 401 },
  );
}
