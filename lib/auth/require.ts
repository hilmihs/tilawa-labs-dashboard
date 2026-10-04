import { redirect } from "next/navigation";
import { getCurrentUser } from "./current-user";
import { bearerToken, safeEqual } from "./bearer";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from "./session";

/**
 * Gate a Server Component / Server Action to super_coordinator. Redirects to
 * /login (no session) or /overview (not super) — never returns for others.
 */
export async function requireSuperUser(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_coordinator") redirect("/overview");
  return user;
}

/**
 * Authenticate an Ops API request. Two accepted credentials, both checked
 * server-side (never trust the UI/menu):
 *   1) `Authorization: Bearer <OPS_SECRET>` — for machines/curl/Claude.
 *   2) A valid session cookie whose role is super_coordinator — for humans
 *      hitting the API from the browser.
 * Returns the actor identity for audit, or null when unauthorized.
 */
export async function assertOpsAuth(req: Request): Promise<string | null> {
  const secret = process.env.OPS_SECRET;
  const presented = bearerToken(req);
  if (presented && secret && safeEqual(presented, secret)) {
    return "ops-token";
  }

  // Fall back to session cookie (browser). Parse manually — route handlers get
  // the raw Request; reuse the same verifier as getCurrentUser.
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(/;\s*/)
    .map((c) => c.split("="))
    .find(([k]) => k === SESSION_COOKIE_NAME)?.[1];
  if (token) {
    const session = await verifySessionToken(decodeURIComponent(token));
    if (session?.role === "super_coordinator") return session.email;
  }
  return null;
}
