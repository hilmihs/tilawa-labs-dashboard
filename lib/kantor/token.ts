import { randomBytes } from "node:crypto";

/** 32 byte acak, base64url (43 karakter). Tautan = kapabilitas, jadi harus tak tertebak. */
export function buatToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Bentuk token yang sah — menolak nilai aneh sebelum menyentuh DB. */
export function tokenSah(t: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(t);
}
