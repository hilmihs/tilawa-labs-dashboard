import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "mabni_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  return new TextEncoder().encode(secret);
}

export type Role = "coordinator" | "super_coordinator";

export type SessionPayload = {
  sub: string; // staff.id
  email: string;
  role: Role;
  programs: string[]; // program slugs this coordinator may access (ignored for super_coordinator)
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role, programs: payload.programs })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    // Tokens issued before P2 lack role/programs — treat as coordinator with no
    // program grants, which forces a re-login before any program access is given.
    const role: Role = payload.role === "super_coordinator" ? "super_coordinator" : "coordinator";
    const programs = Array.isArray(payload.programs)
      ? payload.programs.filter((s): s is string => typeof s === "string")
      : [];
    return { sub: payload.sub, email: payload.email, role, programs };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
};
