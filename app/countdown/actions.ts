"use server";

import { cookies, headers } from "next/headers";
import {
  checkPagePassword,
  createUnlockToken,
  unlockCookieName,
  unlockCookieOptions,
} from "@/lib/auth/page-password";
import { COUNTDOWN_SLUG } from "./constants";

export type UnlockResult = { ok: true } | { ok: false; error: string };

/**
 * A shared password on an open route is guessable by anyone who finds the URL,
 * so the attempt rate matters more than it does on /login. This is a per-process
 * in-memory counter: it resets on deploy and is not shared across instances, so
 * it slows a script down rather than stopping a determined attacker. Good enough
 * for a wall board; do not reuse this for anything holding PII.
 */
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function clearAttempts(key: string) {
  attempts.delete(key);
}

export async function unlockCountdown(password: string): Promise<UnlockResult> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (tooManyAttempts(ip)) {
    return { ok: false, error: "Terlalu banyak percobaan. Coba lagi beberapa menit." };
  }

  const valid = await checkPagePassword(COUNTDOWN_SLUG, password);
  if (!valid) return { ok: false, error: "Password salah." };

  clearAttempts(ip);
  const token = await createUnlockToken(COUNTDOWN_SLUG);
  const cookieStore = await cookies();
  cookieStore.set(unlockCookieName(COUNTDOWN_SLUG), token, unlockCookieOptions);
  return { ok: true };
}

export async function lockCountdown(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(unlockCookieName(COUNTDOWN_SLUG));
}
