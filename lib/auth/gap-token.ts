import { SignJWT, jwtVerify } from "jose";

/**
 * Stateless magic-link token for the teacher gap-confirmation page
 * (/confirm/<token>). Signed with AUTH_SECRET, scoped to one halaqah + teacher.
 * No DB row — the token IS the capability; confirmations it produces are written
 * to teacher_meeting_confirmations. Anyone holding the link can submit for that
 * halaqah, same trust level as the wa.me nudge it rides on.
 */

const GAP_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SCOPE = "gapconfirm";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  return new TextEncoder().encode(secret);
}

export type GapTokenPayload = {
  pid: string; // program uuid
  hid: number; // tilawah halaqah id
  gid: number | null; // per-meeting teacher (tilawah guru id), null = halaqah main
  pengajar?: string; // display name, for the confirm page header
};

export async function signGapToken(payload: GapTokenPayload): Promise<string> {
  return new SignJWT({
    pid: payload.pid,
    hid: payload.hid,
    gid: payload.gid,
    pengajar: payload.pengajar ?? null,
    scope: SCOPE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${GAP_TOKEN_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyGapToken(token: string): Promise<GapTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== SCOPE) return null;
    if (typeof payload.pid !== "string" || typeof payload.hid !== "number") return null;
    const gid = typeof payload.gid === "number" ? payload.gid : null;
    const pengajar = typeof payload.pengajar === "string" ? payload.pengajar : undefined;
    return { pid: payload.pid, hid: payload.hid, gid, pengajar };
  } catch {
    return null;
  }
}
