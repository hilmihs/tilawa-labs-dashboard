/**
 * Antrean kirim scan terpadu → Maahir: hadir anggota di kelas Maahir.
 * SATU request batch per putaran sync Maahir (lib/sync/maahir-sync.ts), dan
 * nol request bila antrean kosong. Maahir sendiri yang menolak menimpa isian
 * musyrif, mencari pertemuan hari itu, dan menghormati libur/pemutihan.
 *
 * Endpoint tulis butuh scope khusus pada API key. Bila belum diberikan (403)
 * atau belum dipasang (404), antrean ditahan utuh — bukan dihitung gagal —
 * supaya tidak ada yang hilang sementara admin Maahir menyetel key.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { tapArti } from "@/lib/db/schema";
import { jakartaDate } from "@/lib/time/jakarta";
import { mundur, PERCOBAAN_MAKS } from "./kirim";

/** Path relatif terhadap MAAHIR_BASE_URL (…/api/v1). */
export const PATH_KEHADIRAN_TAP = "/kehadiran/tap";
const BATAS_BATCH = 200;

type HasilItem = { ref: string; status: string; pesan?: string };

/**
 * Status Maahir → nasib baris kita. 'tunggu' = pertemuan hari itu belum dibuka
 * ketua kelas (Maahir hanya membuat pertemuan saat presensi dibuka) — coba lagi
 * sepanjang hari itu tanpa menghabiskan percobaan; 'ulang' = galat, dihitung.
 */
export function petaHasilMaahir(status: string, tanggal: string | undefined, hariIni: string): "tersinkron" | "dilewati" | "tunggu" | "ulang" {
  if (status === "tercatat") return "tersinkron";
  if (status === "tanpa_pertemuan") return tanggal && tanggal >= hariIni ? "tunggu" : "dilewati";
  if (status === "sudah_diisi" || status === "bukan_anggota" || status === "libur" || status === "terkunci") return "dilewati";
  return "ulang";
}

export async function kirimAntreanMaahir(now = new Date()): Promise<{ dikirim: number; dilewati: number; ditahan: number; request: number }> {
  const db = getDb();
  const antre = await db
    .select()
    .from(tapArti)
    .where(and(eq(tapArti.sasaran, "maahir_kehadiran"), eq(tapArti.status, "menunggu_sinkron")))
    .orderBy(asc(tapArti.createdAt))
    .limit(BATAS_BATCH);
  const siap = antre.filter((b) => !b.kirimSetelah || b.kirimSetelah <= now);
  if (siap.length === 0) return { dikirim: 0, dilewati: 0, ditahan: 0, request: 0 };

  const base = (process.env.MAAHIR_BASE_URL ?? "https://teachers.tilawalabs.demo/api/v1").replace(/\/$/, "");
  const key = process.env.MAAHIR_API_KEY_TULIS ?? process.env.MAAHIR_API_KEY;
  if (!key) return { dikirim: 0, dilewati: 0, ditahan: siap.length, request: 0 };

  const items = siap.map((b) => {
    const ref = (b.ref ?? {}) as { programKelasId?: string; anggotaId?: string; tanggal?: string; waktu?: string };
    // Jam tap asli (antrean offline kiosk bisa tiba belakangan), bukan jam baris dibuat.
    return { ref: b.id, program_kelas_id: ref.programKelasId, anggota_id: ref.anggotaId, tanggal: ref.tanggal, waktu: ref.waktu ?? b.createdAt.toISOString(), mode: "offline" };
  });

  let res: Response;
  try {
    res = await fetch(`${base}${PATH_KEHADIRAN_TAP}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items }),
    });
  } catch (e) {
    await tahan(siap, `jaringan: ${e instanceof Error ? e.message : "galat"}`, now, true);
    return { dikirim: 0, dilewati: 0, ditahan: siap.length, request: 1 };
  }
  if (res.status === 403 || res.status === 404) {
    // Scope belum diberikan / endpoint belum ada: tahan tanpa menghabiskan percobaan.
    await tahan(siap, `Maahir ${res.status}: endpoint tulis belum aktif untuk key ini`, now, false);
    return { dikirim: 0, dilewati: 0, ditahan: siap.length, request: 1 };
  }
  if (!res.ok) {
    await tahan(siap, `Maahir HTTP ${res.status}`, now, true);
    return { dikirim: 0, dilewati: 0, ditahan: siap.length, request: 1 };
  }
  const body = (await res.json().catch(() => ({}))) as { hasil?: HasilItem[] };
  const perRef = new Map((body.hasil ?? []).map((h) => [h.ref, h]));
  let dikirim = 0;
  let dilewati = 0;
  const gagal: typeof siap = [];
  const tunggu: typeof siap = [];
  const hariIni = jakartaDate(now);
  for (const b of siap) {
    const h = perRef.get(b.id);
    const st = h ? petaHasilMaahir(h.status, (b.ref as { tanggal?: string } | null)?.tanggal, hariIni) : "ulang";
    if (st === "ulang") {
      gagal.push(b);
      continue;
    }
    if (st === "tunggu") {
      tunggu.push(b);
      continue;
    }
    await db.update(tapArti).set({ status: st, terkirimAt: now, pesanKirim: `Maahir: ${h!.status}${h!.pesan ? ` — ${h!.pesan}` : ""}`.slice(0, 300) }).where(eq(tapArti.id, b.id));
    if (st === "tersinkron") dikirim++;
    else dilewati++;
  }
  if (gagal.length) await tahan(gagal, "Maahir menjawab galat untuk item ini", now, true);
  if (tunggu.length) await tahan(tunggu, "Maahir: pertemuan hari ini belum dibuka ketua kelas — dicoba lagi", now, false);
  return { dikirim, dilewati, ditahan: gagal.length + tunggu.length, request: 1 };
}

async function tahan(rows: { id: string; percobaan: number }[], pesan: string, now: Date, hitung: boolean) {
  const db = getDb();
  if (!hitung) {
    await db.update(tapArti).set({ pesanKirim: pesan, kirimSetelah: mundur(1, now) }).where(inArray(tapArti.id, rows.map((r) => r.id)));
    return;
  }
  for (const r of rows) {
    const n = r.percobaan + 1;
    await db
      .update(tapArti)
      .set({ percobaan: n, pesanKirim: pesan, status: n >= PERCOBAAN_MAKS ? "gagal" : "menunggu_sinkron", kirimSetelah: mundur(n, now) })
      .where(eq(tapArti.id, r.id));
  }
}
