import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token primitives, kept in their own module so a machine-only route can
 * authenticate without importing `lib/auth/require` — which pulls in
 * `next/navigation`'s `redirect` and `lib/auth/current-user`'s `next/headers`.
 * Both `assertOpsAuth` (require.ts) and `assertAgentAuth` (api/agent/_auth.ts)
 * use these, so there is exactly ONE constant-time compare in the codebase.
 */

/** Constant-time string compare. Length mismatch short-circuits (lengths are not secret). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** The token out of `Authorization: Bearer <token>`, or null when absent/malformed. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
