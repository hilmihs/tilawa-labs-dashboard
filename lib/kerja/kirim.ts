/**
 * Antrean kirim scan terpadu → tilawah. Baris `tap_arti` berstatus
 * 'menunggu_sinkron' dengan sasaran tilawah_* dikirim di dalam putaran sync
 * tilawah yang SUDAH login (lib/sync/tilawah-sync.ts) — tidak ada login atau
 * cron tambahan. Hemat request (pemilik, 30 Sep 2026: "jangan sampai banyak
 * request ke server"):
 * - paling banyak KIRIM_MAKS tulisan per putaran, berjeda JEDA_MS;
 * - dicek dulu di mirror lokal (attendance_sync / jadwal_sync) — yang sudah
 *   terisi di tilawah dilewati tanpa request sama sekali;
 * - galat server/jaringan pertama menghentikan putaran; baris yang gagal
 *   mundur eksponensial (15 menit × 2^percobaan) dan menyerah setelah
 *   PERCOBAAN_MAKS kali.
 * Presensi hanya MENAMBAH "Hadir" (status 1) dan tidak pernah menimpa isian
 * guru. Pertemuan ditandai Selesai sesudah jam kelas usai (kirim_setelah),
 * karena tilawah mencap class_end dengan jamnya sendiri.
 */
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jadwalSync, tapArti } from "@/lib/db/schema";
import type { TilawahSession } from "@/lib/integrations/tilawah-auth";
import { pushPresensiStatus } from "@/lib/integrations/tilawah";

export const KIRIM_MAKS = 12;
const JEDA_MS = 600;
export const PERCOBAAN_MAKS = 5;

type Baris = typeof tapArti.$inferSelect;
type Hasil = { status: "tersinkron" | "dilewati"; pesan: string } | { status: "gagal"; pesan: string; berhenti: boolean };

/** Kapan dicoba lagi sesudah gagal ke-n (1-based): 15, 30, 60, 120 menit … */
export function mundur(percobaan: number, now: Date): Date {
  return new Date(now.getTime() + 15 * 60_000 * 2 ** Math.max(0, percobaan - 1));
}

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function kirimAntreanTilawah(baseUrl: string, session: TilawahSession, now = new Date()) {
  const db = getDb();
  const antre = await db
    .select()
    .from(tapArti)
    .where(
      and(
        inArray(tapArti.sasaran, ["tilawah_presensi", "tilawah_selesai"]),
        eq(tapArti.status, "menunggu_sinkron"),
        or(isNull(tapArti.kirimSetelah), lte(tapArti.kirimSetelah, now)),
      ),
    )
    .orderBy(asc(tapArti.createdAt))
    .limit(KIRIM_MAKS * 3); // sebagian besar biasanya terlewati di mirror tanpa request

  const ringkas = { dikirim: 0, dilewati: 0, gagal: 0, request: 0 };
  for (const b of antre) {
    if (ringkas.request >= KIRIM_MAKS * 2) break;
    let h: Hasil;
    try {
      h = b.sasaran === "tilawah_presensi" ? await kirimPresensi(baseUrl, session, b, ringkas) : await kirimSelesai(baseUrl, session, b, ringkas);
    } catch (e) {
      h = { status: "gagal", pesan: e instanceof Error ? e.message.slice(0, 300) : "galat", berhenti: true };
    }
    await catat(b, h, now);
    if (h.status === "gagal") {
      ringkas.gagal++;
      if (h.berhenti) break; // jangan terus mengetuk server yang sedang bermasalah
    } else if (h.status === "dilewati") ringkas.dilewati++;
    else ringkas.dikirim++;
  }
  return ringkas;
}

async function catat(b: Baris, h: Hasil, now: Date) {
  const db = getDb();
  if (h.status !== "gagal") {
    await db.update(tapArti).set({ status: h.status, terkirimAt: now, pesanKirim: h.pesan }).where(eq(tapArti.id, b.id));
    return;
  }
  const n = b.percobaan + 1;
  await db
    .update(tapArti)
    .set({ percobaan: n, pesanKirim: h.pesan, status: n >= PERCOBAAN_MAKS ? "gagal" : "menunggu_sinkron", kirimSetelah: mundur(n, now) })
    .where(eq(tapArti.id, b.id));
}

type Ref = { jadwalId?: number; halaqahUserId?: number; guruId?: number; programId?: string };

async function kirimPresensi(baseUrl: string, s: TilawahSession, b: Baris, r: { request: number }): Promise<Hasil> {
  const ref = (b.ref ?? {}) as Ref;
  if (!ref.jadwalId || !ref.halaqahUserId) return { status: "dilewati", pesan: "data kelas tidak lengkap" };
  // Isian guru apa pun (hadir/telat/izin/alfa) menang — cek mirror dulu, tanpa request.
  const ada = await getDb().execute(sql`
    select status from attendance_sync where halaqah_user_id = ${ref.halaqahUserId} and halaqah_jadwal_id = ${ref.jadwalId} limit 1`);
  if (ada.rows.length > 0) return { status: "dilewati", pesan: `sudah diisi di tilawah (status ${(ada.rows[0] as { status: string }).status})` };
  if (r.request > 0) await tidur(JEDA_MS);
  r.request++;
  const res = await pushPresensiStatus({ baseUrl, cookieHeader: s.cookieHeader, xsrfToken: s.xsrfToken, halaqahUserId: ref.halaqahUserId, halaqahJadwalId: ref.jadwalId, status: 1 });
  if (res.implemented && res.ok) return { status: "tersinkron", pesan: `presensi #${res.presensiId} Hadir` };
  const pesan = res.reason;
  // Penolakan validasi (4xx berisi pesan) tidak berarti server bermasalah — lanjutkan baris lain.
  return { status: "gagal", pesan, berhenti: /fetch|timeout|HTTP 5|HTTP 429/i.test(pesan) };
}

/** Kolom pertemuan yang wajib dikirim ulang apa adanya — PUT tilawah menuntut body penuh. */
const PERTAHANKAN = [
  "name", "order", "type", "schedule_date", "start_session_date", "end_session_date", "online_url", "offline_place", "notes",
  "description", "task_name", "task_description", "task_due", "extra_end_datetime", "latitude", "longitude", "batch_id", "halaqah_id",
  "type_pertemuan",
] as const;

function kepala(s: TilawahSession): Record<string, string> {
  return { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", "X-XSRF-TOKEN": s.xsrfToken, Cookie: s.cookieHeader };
}

async function kirimSelesai(baseUrl: string, s: TilawahSession, b: Baris, r: { request: number }): Promise<Hasil> {
  const ref = (b.ref ?? {}) as Ref;
  if (!ref.jadwalId || !ref.guruId) return { status: "dilewati", pesan: "data pertemuan tidak lengkap" };
  const db = getDb();
  // Mirror sudah bilang Mulai/Selesai → guru menandainya sendiri; tanpa request.
  // tilawah_jadwal_id hanya unik per program di mirror.
  const kunciJadwal = ref.programId
    ? and(eq(jadwalSync.tilawahJadwalId, ref.jadwalId), eq(jadwalSync.programId, ref.programId))
    : eq(jadwalSync.tilawahJadwalId, ref.jadwalId);
  const [m] = await db.select({ status: jadwalSync.status }).from(jadwalSync).where(kunciJadwal).limit(1);
  if (m && (m.status === 3 || m.status === 4)) return { status: "dilewati", pesan: "pertemuan sudah ditandai di tilawah" };

  if (r.request > 0) await tidur(JEDA_MS);
  r.request++;
  const g = await fetch(`${baseUrl}/api/pertemuans/${ref.jadwalId}`, { headers: kepala(s) });
  if (!g.ok) return { status: "gagal", pesan: `GET pertemuan HTTP ${g.status}`, berhenti: g.status >= 500 || g.status === 429 };
  const body = (await g.json()) as { data?: { pertemuan?: Record<string, unknown> } & Record<string, unknown> };
  const p = (body.data?.pertemuan ?? body.data) as Record<string, unknown> | undefined;
  if (!p?.id) return { status: "gagal", pesan: "bentuk respons pertemuan tak terduga", berhenti: false };
  const st = Number(p.status);
  if (st === 3 || st === 4) return { status: "dilewati", pesan: "pertemuan sudah ditandai di tilawah" };

  const kirim: Record<string, unknown> = { id: p.id, guru_id: ref.guruId, status: 4, moduls: (p.moduls as unknown[] | undefined) ?? [] };
  for (const k of PERTAHANKAN) kirim[k] = p[k] ?? null;
  await tidur(JEDA_MS);
  r.request++;
  const u = await fetch(`${baseUrl}/api/pertemuans/${ref.jadwalId}`, {
    method: "PUT",
    headers: { ...kepala(s), "Content-Type": "application/json" },
    body: JSON.stringify(kirim),
  });
  let pesan = `HTTP ${u.status}`;
  let sukses = u.ok;
  try {
    const j = (await u.json()) as { status?: string; message?: string };
    if (j.status && j.status !== "success") sukses = false;
    if (j.message) pesan = j.message;
  } catch {
    /* balasan bukan JSON */
  }
  if (!sukses) return { status: "gagal", pesan: `PUT pertemuan: ${pesan}`.slice(0, 300), berhenti: u.status >= 500 || u.status === 429 };
  // Mirror ikut diperbarui supaya rekap tak menunggu sweep berikutnya.
  await db.update(jadwalSync).set({ status: 4, statusLabel: "Selesai", guruId: ref.guruId }).where(kunciJadwal);
  return { status: "tersinkron", pesan: "pertemuan ditandai Selesai" };
}
