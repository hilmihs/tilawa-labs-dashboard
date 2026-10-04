/**
 * Klien NAWA Export API: `GET /api/export/semua` (semua program sekali tarik)
 * dan `GET /api/export?acara=<slug>` (satu program).
 * Hanya dari server: token berlaku untuk SEMUA program NAWA dan responsnya
 * memuat WA, email, NIM peserta. Jangan diimpor dari komponen klien.
 *
 * Env: NAWA_EXPORT_TOKEN (wajib), NAWA_BASE_URL (default https://events.tilawalabs.demo).
 */
import type { NawaExport, NawaExportSemua, NawaStatusAcara } from "./types";

export const NAWA_SLUG_RE = /^[a-z0-9-]{1,60}$/;

/** status 0 = gagal jaringan/timeout (belum ada jawaban HTTP). */
export class NawaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "NawaError";
  }
}

/** Pesan untuk panitia: 401/404 = konfigurasi (jangan diulang), lainnya = gangguan sementara. */
export function pesanNawaError(e: unknown): string {
  if (e instanceof NawaError) {
    if (e.status === 400) return `NAWA menolak filter status (${e.message}).`;
    if (e.status === 401) return "NAWA menolak token (401). Cek NAWA_EXPORT_TOKEN di server dashboard dan EXPORT_TOKEN di server NAWA.";
    if (e.status === 404) return "Program tidak ditemukan di NAWA (404). Cek slug program.";
    if (e.status === -1) return e.message;
    return `NAWA sedang bermasalah (${e.status || "tidak menjawab"}). Data tarikan terakhir tetap dipakai.`;
  }
  return "Gagal menarik dari NAWA. Data tarikan terakhir tetap dipakai.";
}

async function ambil(path: string, params: Record<string, string>, timeoutMs: number): Promise<unknown> {
  const token = process.env.NAWA_EXPORT_TOKEN;
  if (!token) throw new NawaError(-1, "NAWA_EXPORT_TOKEN belum diset di server dashboard.");
  const base = process.env.NAWA_BASE_URL || "https://events.tilawalabs.demo";
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new NawaError(0, e instanceof Error ? e.message : "fetch gagal");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; salah?: string[] };
    throw new NawaError(res.status, body?.salah?.join(", ") ?? body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Semua program NAWA dalam satu panggilan; program baru ikut tanpa perlu tahu
 * slug-nya. `status` menyaring per status program (400 bila ada nilai asing).
 */
export async function tarikSemuaNawa(status?: readonly NawaStatusAcara[]): Promise<NawaExportSemua> {
  const data = (await ambil("/api/export/semua", status?.length ? { status: status.join(",") } : {}, 30_000)) as NawaExportSemua;
  if (!data?.diambilAt || !Array.isArray(data.program)) throw new NawaError(502, "Respons NAWA tidak berbentuk export semua");
  for (const p of data.program) {
    if (!p?.acara?.slug || !Array.isArray(p.peserta) || !Array.isArray(p.kehadiran)) {
      throw new NawaError(502, "Respons NAWA memuat program yang tidak berbentuk export");
    }
  }
  return data;
}

export async function tarikNawa(slug: string): Promise<NawaExport> {
  if (!NAWA_SLUG_RE.test(slug)) throw new NawaError(-1, "Slug NAWA tidak valid (huruf kecil, angka, tanda minus).");
  const data = (await ambil("/api/export", { acara: slug }, 15_000)) as NawaExport;
  if (!data?.acara?.slug || !Array.isArray(data.peserta) || !Array.isArray(data.kehadiran)) {
    throw new NawaError(502, "Respons NAWA tidak berbentuk export");
  }
  return data;
}
