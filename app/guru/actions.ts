"use server";

import { cookies } from "next/headers";
import { verifyGuruLogin } from "@/lib/guru-portal/queries";
import {
  signGuruToken,
  GURU_COOKIE_NAME,
  guruCookieOptions,
} from "@/lib/auth/guru-token";

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginGuru(name: string, identifier: string): Promise<LoginResult> {
  const identity = await verifyGuruLogin(name, identifier);
  if (!identity) {
    return {
      ok: false,
      error: "Data tidak cocok. Pastikan nama & email/nomor HP sesuai yang terdaftar, atau hubungi koordinator.",
    };
  }
  const token = await signGuruToken(identity);
  const store = await cookies();
  store.set(GURU_COOKIE_NAME, token, guruCookieOptions);
  return { ok: true };
}

export async function logoutGuru(): Promise<void> {
  const store = await cookies();
  store.delete(GURU_COOKIE_NAME);
}
