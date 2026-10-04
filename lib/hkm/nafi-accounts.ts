/**
 * Akun the partner system (cms.example.com) dilihat dari sisi dashboard: cari
 * akun seseorang, dan nyalakan flag yang membuat setorannya ikut tertarik.
 *
 * Kenapa flag itu ada: sync HKM menarik `filters[is_internal]=1` saja (lihat
 * lib/integrations/HKM CMS/fetchers.ts). Peserta yang akunnya
 * `is_internal=0` tampil "belum mulai tilawah" di dashboard sebanyak apa pun
 * dia membaca — bukan karena dia tidak setor, tapi karena barisnya tak pernah
 * ikut terbawa. Membalik flag itu satu-satunya perbaikan.
 *
 * Dua jebakan API yang sudah dibayar mahal, jangan diulang:
 *
 *   1. Write dijawab `302 → /login` PADAHAL BERHASIL. Status code bohong; satu-
 *      satunya kebenaran adalah re-fetch. Karena itu `setNafiInternal` selalu
 *      membaca ulang dan melaporkan nilai sesudahnya, dan tak pernah menyimpulkan
 *      apa pun dari status HTTP.
 *   2. Jangan login ulang di tengah run sebelum menulis — sesi berotasi dan
 *      write-nya benar-benar jatuh sebagai tamu (catatan scripts/berkah-set-internal.ts).
 *
 * Payload write sengaja minimal: `{name, email, is_internal}`. `is_internal`
 * sendirian ditolak 422 ("The name field is required"), jadi nama & email
 * dipantulkan apa adanya dari GET — dibaca dari server, tidak pernah dikarang
 * di sini.
 */
import { loginToBerkah, berkahBaseUrl } from "@/lib/integrations/HKM CMS/auth";
import { berkahGet, type SessionHolder } from "@/lib/integrations/HKM CMS/client";

export type NafiAccount = {
  id: number;
  nama: string | null;
  email: string | null;
  phone: string | null;
  /** false = setorannya tidak ikut tertarik sync. */
  internal: boolean;
  totalKhatam: number | null;
  progressKhatam: number | null;
};

type RawUser = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  is_internal?: unknown;
  total_khatam?: unknown;
  progress_khatam?: unknown;
};

function toAccount(u: RawUser): NafiAccount {
  return {
    id: u.id,
    nama: u.name ?? null,
    email: u.email ?? null,
    phone: u.phone ?? null,
    internal: Number(u.is_internal ?? 0) === 1,
    totalKhatam: u.total_khatam == null ? null : Number(u.total_khatam),
    progressKhatam: u.progress_khatam == null ? null : Number(u.progress_khatam),
  };
}

/** Envelope the partner system kadang `{data:{users:{data:[…]}}}`, kadang `{data:{users:[…]}}`. */
function unwrapUsers(res: unknown): RawUser[] {
  const raw = (res as { data?: { users?: unknown } }).data?.users ?? (res as { users?: unknown }).users;
  if (Array.isArray(raw)) return raw as RawUser[];
  const nested = (raw as { data?: unknown } | undefined)?.data;
  return Array.isArray(nested) ? (nested as RawUser[]) : [];
}

async function session(): Promise<{ baseUrl: string; holder: SessionHolder }> {
  const baseUrl = berkahBaseUrl();
  return { baseUrl, holder: { session: await loginToBerkah(baseUrl) } };
}

/**
 * Cari akun the partner system lintas internal & eksternal — `search=` mencakup nama dan
 * nomor HP, sementara alamat email persis lebih andal lewat `filters[email]=`
 * (`keyword=`/`q=` diabaikan diam-diam oleh API ini).
 */
export async function searchNafiAccounts(query: string): Promise<NafiAccount[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const { baseUrl, holder } = await session();

  const params = q.includes("@")
    ? [`filters[email]=${encodeURIComponent(q)}`, `search=${encodeURIComponent(q)}`]
    : [`search=${encodeURIComponent(q)}`];

  const seen = new Map<number, NafiAccount>();
  for (const p of params) {
    const res = await berkahGet<unknown>(baseUrl, holder, `/api/users?${p}&pagesize=20`);
    for (const u of unwrapUsers(res)) if (!seen.has(u.id)) seen.set(u.id, toAccount(u));
    if (seen.size > 0) break; // pencarian pertama yang berhasil sudah cukup
  }
  return [...seen.values()];
}

export async function getNafiAccount(userId: number): Promise<NafiAccount | null> {
  const { baseUrl, holder } = await session();
  const res = await berkahGet<{ user?: RawUser }>(baseUrl, holder, `/api/users/${userId}`);
  const u = (res as unknown as { data?: { user?: RawUser } }).data?.user;
  return u ? toAccount(u) : null;
}

export type SetInternalResult = {
  ok: boolean;
  /** Nilai sesudahnya menurut re-fetch — satu-satunya kebenaran di sini. */
  internal: boolean;
  akun: NafiAccount | null;
  error?: string;
};

/** Nyalakan (atau matikan) flag internal, lalu buktikan lewat re-fetch. */
export async function setNafiInternal(userId: number, target: 0 | 1): Promise<SetInternalResult> {
  const { baseUrl, holder } = await session();

  const before = await getNafiAccount(userId);
  if (!before) return { ok: false, internal: false, akun: null, error: `Akun #${userId} tidak ditemukan di the partner system.` };
  if (before.internal === (target === 1)) return { ok: true, internal: before.internal, akun: before };

  try {
    // Tanpa Origin/Referer: dengan keduanya, validasi yang gagal dibalas 302
    // "redirect back" dan pesannya di-flash ke session (tak terbaca dari sini).
    await fetch(`${baseUrl}/api/users/${userId}`, {
      method: "PUT",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": holder.session.xsrfToken,
        Cookie: holder.session.cookieHeader,
      },
      body: JSON.stringify({ name: before.nama, email: before.email, is_internal: target }),
    });
  } catch (err) {
    return {
      ok: false,
      internal: before.internal,
      akun: before,
      error: err instanceof Error ? err.message : "Gagal menghubungi the partner system.",
    };
  }

  const after = await getNafiAccount(userId);
  const internal = after?.internal ?? before.internal;
  return internal === (target === 1)
    ? { ok: true, internal, akun: after }
    : { ok: false, internal, akun: after, error: "the partner system menolak perubahan (nilai tidak berubah setelah dicek ulang)." };
}
