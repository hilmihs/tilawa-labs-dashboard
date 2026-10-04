import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pagePasswords } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";

/**
 * Shared-password gate for pages with no staff account behind them.
 *
 * Deliberately separate from the coordinator session in lib/auth/session.ts:
 * unlocking /countdown must never grant anything else, and a coordinator
 * logging out must not knock the TV off the board. Different cookie, different
 * payload, same AUTH_SECRET.
 */

const COOKIE_PREFIX = "page_unlock_";
// Long enough that a TV unlocked once in the morning survives the day and then
// some, short enough that a rotated password actually takes effect this month.
const UNLOCK_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  return new TextEncoder().encode(secret);
}

export function unlockCookieName(slug: string): string {
  return `${COOKIE_PREFIX}${slug}`;
}

export const unlockCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: UNLOCK_DURATION_SECONDS,
};

export async function createUnlockToken(slug: string): Promise<string> {
  return new SignJWT({ slug })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`page:${slug}`)
    .setIssuedAt()
    .setExpirationTime(`${UNLOCK_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/** True only for a live token minted for this exact slug. */
export async function verifyUnlockToken(token: string, slug: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.slug === slug;
  } catch {
    return false;
  }
}

/**
 * Check a submitted password against the stored hash.
 *
 * A missing row means the page has never been given a password. That returns
 * false — an unconfigured gate stays shut rather than swinging open.
 */
export async function checkPagePassword(slug: string, password: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select().from(pagePasswords).where(eq(pagePasswords.slug, slug));
  if (!row) return false;
  return verifyPassword(password, row.passwordHash);
}

export async function isPageConfigured(slug: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ slug: pagePasswords.slug })
    .from(pagePasswords)
    .where(eq(pagePasswords.slug, slug));
  return Boolean(row);
}
