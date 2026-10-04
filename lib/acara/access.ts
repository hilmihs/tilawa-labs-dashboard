import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTokenVersiCurrent, verifyDivisiToken, type DivisiTokenPayload } from "@/lib/auth/divisi-token";
import type { SessionPayload } from "@/lib/auth/session";
import { getAcaraById, getDivisiById, insertLog } from "./queries";
import type { AcaraRow, DivisiRow } from "./types";

/**
 * Token → (acara, divisi). Satu-satunya jalan pemegang token masuk ke modul,
 * dipakai page.tsx DAN setiap server action — action tidak pernah percaya pada
 * apa yang dikirim klien selain token itu sendiri.
 *
 * Tiga pemeriksaan, semuanya null bila gagal: JWT (tanda tangan, scope,
 * kedaluwarsa), baris divisi ada, dan token_versi masih yang sekarang.
 */
export type AksesDivisi = { payload: DivisiTokenPayload; acara: AcaraRow; divisi: DivisiRow };

export async function resolveDivisiToken(token: string): Promise<AksesDivisi | null> {
  const payload = await verifyDivisiToken(token);
  if (!payload) return null;
  const divisi = await getDivisiById(payload.did);
  if (!divisi) return null;
  if (!isTokenVersiCurrent(payload, divisi.tokenVersi)) return null;
  const acaraRow = await getAcaraById(divisi.acaraId);
  if (!acaraRow || acaraRow.slug !== payload.slug) return null;
  return { payload, acara: acaraRow, divisi };
}

let sudahPeringatkanSecret = false;

/**
 * sha256(ip + AUTH_SECRET). IP mentah tidak pernah disimpan; hash cukup untuk
 * melihat "tautan ini dibuka dari 40 alamat berbeda" saat tautan bocor.
 *
 * Asumsi satu proxy tepercaya: nginx di depan Node MENAMBAHKAN alamat klien
 * ke ujung x-forwarded-for, jadi entri TERAKHIR adalah yang ditulis nginx.
 * Entri pertama bisa dipalsukan klien (kirim header sendiri sebelum sampai
 * ke nginx) — memakainya berarti pemegang tautan bocor bisa membuat 40
 * alamat tampak seperti satu, dan deteksi kebocoran jadi hampa. Bila
 * topologi berubah (dua proxy), ubah di sini, bukan di pemanggil.
 *
 * Tanpa AUTH_SECRET, hash tidak dibuat sama sekali: sha256(ip) polos bisa
 * dibalik dengan menghitung 4 miliar IPv4, dan itu setara menyimpan IP mentah.
 */
export async function ipHash(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (!sudahPeringatkanSecret) {
      console.error("AUTH_SECRET tidak diset; ip_hash dikosongkan");
      sudahPeringatkanSecret = true;
    }
    return null;
  }
  const h = await headers();
  const xff = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = xff[xff.length - 1] || h.get("x-real-ip") || "";
  if (!ip) return null;
  return createHash("sha256").update(`${ip}|${secret}`).digest("hex").slice(0, 32);
}

/**
 * Catat ke acara_log. TIDAK PERNAH melempar: audit yang gagal (DB sesak,
 * kolom berubah) tidak boleh memblokir pembacaan papan, dan tidak boleh
 * mengubah tulisan yang sudah sukses menjadi "gagal, coba lagi" — panitia
 * akan menekan lagi dan barisnya jadi dobel. Kegagalan cukup masuk log server.
 */
export async function catatAksesToken(
  a: AksesDivisi,
  aksi: "buka" | "ubah",
  objek: { tabel: string; id: string; dari?: unknown; ke?: unknown } | null,
): Promise<void> {
  try {
    await insertLog({
      acaraId: a.acara.id,
      divisiId: a.divisi.id,
      staffId: null,
      aksi,
      objekTabel: objek?.tabel ?? null,
      objekId: objek?.id ?? null,
      dari: objek?.dari ?? null,
      ke: objek?.ke ?? null,
      ipHash: await ipHash(),
    });
  } catch (e) {
    console.error("acara_log gagal", e);
  }
}

/**
 * Semua akun staff setara di modul acara (jawaban pemilik 10 Sep 2026): tidak ada
 * peran ketua/bendahara di staff.role. Middleware sudah melempar tanpa sesi ke
 * /login; ini pengaman kedua untuk server action, yang tidak lewat middleware.
 */
export async function requireStaff(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function catatAksesStaff(
  staffId: string,
  acaraId: string,
  aksi: "ubah" | "approval",
  objek: { tabel: string; id: string; dari?: unknown; ke?: unknown },
): Promise<void> {
  try {
    await insertLog({
      acaraId, divisiId: null, staffId, aksi,
      objekTabel: objek.tabel, objekId: objek.id, dari: objek.dari, ke: objek.ke,
      ipHash: await ipHash(),
    });
  } catch (e) {
    console.error("acara_log gagal", e);
  }
}
