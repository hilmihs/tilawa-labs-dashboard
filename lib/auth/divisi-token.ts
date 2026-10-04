import { SignJWT, jwtVerify } from "jose";

/**
 * Tautan bertoken papan divisi (/acara/d/<token>). Meniru recap-token.ts:
 * ditandatangani AUTH_SECRET, stateless, token ADALAH kapabilitasnya. Satu
 * tautan dikirim ke grup divisi; siapa pun yang memegangnya mengisi atas nama
 * divisi itu — setara dengan tingkat kepercayaan grup WhatsApp yang menerimanya.
 *
 * Scope "divisi" sengaja berbeda dari "recapconfirm" dan "gapconfirm" supaya
 * token pengajar tidak pernah bisa diputar ulang ke papan divisi, dan sebaliknya.
 *
 * `v` = acara_divisi.token_versi saat ditandatangani. Verifikasi JWT di sini
 * tidak menyentuh DB; pencocokan versi dilakukan pemanggil lewat
 * isTokenVersiCurrent() setelah memuat divisinya. Menaikkan token_versi
 * mematikan semua tautan lama tanpa daftar hitam.
 */

/** 90 hari — melewati hari-H, supaya tautan yang dibagikan di awal persiapan tetap hidup sampai pengembalian barang. */
const DIVISI_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 90;
const SCOPE = "divisi";

/** Dibaca saat dipanggil, bukan saat modul dimuat, agar uji bisa mengatur AUTH_SECRET dulu. */
function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  return new TextEncoder().encode(secret);
}

export type DivisiTokenPayload = {
  did: string; // acara_divisi.id
  slug: string; // acara.slug, untuk tautan balik dan pesan
  v: number; // acara_divisi.token_versi saat ditandatangani
};

export async function signDivisiToken(payload: DivisiTokenPayload): Promise<string> {
  return new SignJWT({ did: payload.did, slug: payload.slug, v: payload.v, scope: SCOPE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DIVISI_TOKEN_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * null untuk setiap penolakan — tanda tangan salah, kedaluwarsa, scope lain,
 * klaim rusak — supaya halaman merender satu keadaan "tautan tidak valid" tanpa
 * membocorkan pemeriksaan mana yang gagal.
 */
export async function verifyDivisiToken(token: string): Promise<DivisiTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== SCOPE) return null;
    const { did, slug, v } = payload;
    if (typeof did !== "string" || !did) return null;
    if (typeof slug !== "string" || !slug) return null;
    if (typeof v !== "number" || !Number.isInteger(v)) return null;
    return { did, slug, v };
  } catch {
    return null;
  }
}

/** Benar hanya bila token ditandatangani pada versi yang persis sama dengan versi divisi sekarang. */
export function isTokenVersiCurrent(payload: DivisiTokenPayload, tokenVersiDivisi: number): boolean {
  return payload.v === tokenVersiDivisi;
}
