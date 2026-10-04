import { SignJWT, jwtVerify } from "jose";

/**
 * Stateless magic-link token for the teacher monthly-recap page (/rekap/<token>).
 * Signed with AUTH_SECRET, scoped to one teacher (tilawah guru id) + one period.
 * No DB row — the token IS the capability; the confirmations it produces land in
 * teacher_meeting_confirmations. Anyone holding the link can answer for that
 * teacher, same trust level as the wa.me blast it rides on.
 *
 * The scope claim deliberately differs from gap-token's "gapconfirm" so a
 * per-halaqah confirm link can never be replayed against the recap page, which
 * exposes a whole teacher's month across every program.
 */

/**
 * 30 days — intentionally longer than the 17 Aug 2026 16.00 WIB presensi lock.
 * After the lock the page stays reachable READ-ONLY so a teacher who answers
 * late can still see what was recorded in their name; the lock is enforced
 * separately by isPresensiLocked(), never by token expiry. Shortening this to
 * the lock date would turn "too late to edit" into "link is broken".
 */
const RECAP_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 30;
const SCOPE = "recapconfirm";

/** YYYY-MM-DD, the only date shape the recap query accepts. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Read at call time, not module load, so tests can set AUTH_SECRET first. */
function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  return new TextEncoder().encode(secret);
}

export type RecapTokenPayload = {
  gid: number; // tilawah guru (user) id — stable across programs
  nama: string; // display name, for the page header
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
};

export async function signRecapToken(payload: RecapTokenPayload): Promise<string> {
  return new SignJWT({
    gid: payload.gid,
    nama: payload.nama,
    start: payload.start,
    end: payload.end,
    scope: SCOPE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${RECAP_TOKEN_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Returns null instead of throwing for every rejection — bad signature, expired,
 * wrong scope, malformed claims — so the page can render one "link tidak valid"
 * state without branching on error types or leaking which check failed.
 */
export async function verifyRecapToken(token: string): Promise<RecapTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== SCOPE) return null;
    const { gid, nama, start, end } = payload;
    if (typeof gid !== "number" || !Number.isFinite(gid)) return null;
    if (typeof nama !== "string") return null;
    if (typeof start !== "string" || !DATE_RE.test(start)) return null;
    if (typeof end !== "string" || !DATE_RE.test(end)) return null;
    return { gid, nama, start, end };
  } catch {
    return null;
  }
}
