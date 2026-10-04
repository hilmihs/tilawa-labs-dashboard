import { SignJWT, jwtVerify } from "jose";

/**
 * Capability token for the coordinator approval link (/persetujuan/<token>),
 * delivered over WhatsApp. Holding the link is the authorization — same trust
 * model as the /confirm gap-token magic link (it rides on the coordinator's WA).
 * Scoped to one guru_change_requests row by id.
 */

const APPROVAL_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SCOPE = "guruapprove";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  return new TextEncoder().encode(secret);
}

export type ApprovalTokenPayload = { rid: string };

export async function signApprovalToken(payload: ApprovalTokenPayload): Promise<string> {
  return new SignJWT({ rid: payload.rid, scope: SCOPE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${APPROVAL_TOKEN_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyApprovalToken(token: string): Promise<ApprovalTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== SCOPE) return null;
    if (typeof payload.rid !== "string") return null;
    return { rid: payload.rid };
  } catch {
    return null;
  }
}
