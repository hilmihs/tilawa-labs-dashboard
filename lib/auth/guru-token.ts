import { SignJWT, jwtVerify } from "jose";

/**
 * Lightweight session for the public teacher portal (/guru). A teacher "logs in"
 * with name + email/phone (no password) — this token is minted server-side after
 * that match and carries every tilawah guru id that identity resolves to (one
 * person can teach across programs/batches, each a distinct guru row).
 *
 * Deliberately separate from the coordinator session (mabni_session / session.ts)
 * — different cookie, different scope. This is weak identification, NOT strong
 * auth; the real safeguard is that portal actions only create *requests* that a
 * coordinator must approve before anything is written to the CMS.
 */

const GURU_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SCOPE = "guru";

export const GURU_COOKIE_NAME = "guru_session";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  return new TextEncoder().encode(secret);
}

export type GuruTokenPayload = {
  guruIds: number[]; // tilawah guru ids this identity maps to
  name: string;
  phone: string | null;
};

export async function signGuruToken(payload: GuruTokenPayload): Promise<string> {
  return new SignJWT({
    guruIds: payload.guruIds,
    name: payload.name,
    phone: payload.phone ?? null,
    scope: SCOPE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${GURU_TOKEN_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyGuruToken(token: string): Promise<GuruTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== SCOPE) return null;
    const guruIds = Array.isArray(payload.guruIds)
      ? payload.guruIds.filter((n): n is number => typeof n === "number")
      : [];
    if (guruIds.length === 0 || typeof payload.name !== "string") return null;
    const phone = typeof payload.phone === "string" ? payload.phone : null;
    return { guruIds, name: payload.name, phone };
  } catch {
    return null;
  }
}

export const guruCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: GURU_TOKEN_DURATION_SECONDS,
};
