"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { staff, staffPrograms, programs } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type Role,
} from "@/lib/auth/session";

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const db = getDb();
  const [account] = await db.select().from(staff).where(eq(staff.email, email.trim().toLowerCase()));

  if (!account) return { ok: false, error: "Email atau password salah." };

  const valid = await verifyPassword(password, account.passwordHash);
  if (!valid) return { ok: false, error: "Email atau password salah." };

  const role: Role = account.role === "super_coordinator" ? "super_coordinator" : "coordinator";
  const grants = await db
    .select({ slug: programs.slug })
    .from(staffPrograms)
    .innerJoin(programs, eq(staffPrograms.programId, programs.id))
    .where(eq(staffPrograms.staffId, account.id));
  const programSlugs = grants.map((g) => g.slug);

  const token = await createSessionToken({
    sub: account.id,
    email: account.email,
    role,
    programs: programSlugs,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);

  return { ok: true };
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
