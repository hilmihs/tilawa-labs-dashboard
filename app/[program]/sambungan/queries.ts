/**
 * "Sambungan Akun" — siapa yang setorannya belum terhitung di dashboard, dan
 * kenapa.
 *
 * Dashboard HKM sudah menampilkan gejalanya (kartu rekonsiliasi di
 * HkmActionItems: master tanpa email / tanpa data / akun internal tak
 * terdaftar), tapi hanya sebagai daftar nama — tiap perbaikannya dulu berarti
 * membuka terminal. Halaman ini memakai data yang sama, lalu menamai SEBABNYA
 * sehingga tiap baris punya satu tombol yang jelas.
 *
 * Tiga sebab yang benar-benar berbeda penanganannya:
 *
 *   `tanpa_akun`     baris master tak punya email → belum ketahuan akun the partner system-nya.
 *                    Perlu dicarikan (nama/HP/email), lalu disambungkan.
 *   `tak_tertarik`   email ada, tapi akunnya tidak ada di hkm_users_sync. Sync
 *                    cuma menarik `is_internal=1`, jadi ini hampir selalu berarti
 *                    akunnya masih eksternal — perlu tombol "Aktifkan". Bisa juga
 *                    emailnya salah ketik, karena itu tombol "Cari akun" tetap ada.
 *   `belum_setor`    tersambung dan tertarik, tapi nol riwayat baca. Ini BUKAN
 *                    masalah teknis — jangan tawarkan tombol perbaikan, cukup
 *                    tampilkan supaya tidak dikira masalah sambungan.
 *
 * Nomor HP diambil dari roster presensi (`students_sync` program presensiSlug),
 * dicocokkan lewat nama yang dinormalisasi: baris master sendiri tidak menyimpan
 * nomor, dan akun the partner system-nya justru yang belum ketemu.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { hkmParticipants, hkmUsersSync, hkmReadingHistorySync, studentsSync } from "@/lib/db/schema";
import { getProgram } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { isExcludedName, normalizeEmail, toHkmStatus, isTracked } from "@/lib/insights/hkm";
import { normalizePhone } from "@/lib/wa";

export type SambunganSebab = "tanpa_akun" | "tak_tertarik" | "belum_setor";

export type SambunganRow = {
  participantId: string;
  nama: string;
  halaqah: string | null;
  pengajar: string | null;
  email: string | null;
  /** Id akun the partner system yang tercatat di master (kalau pernah tertaut). */
  berkahUserId: number | null;
  sebab: SambunganSebab;
  phone: string | null;
  hariSetoran: number;
  terakhirSetor: string | null;
  statusNote: string | null;
};

export type AkunNganggur = {
  berkahUserId: number;
  nama: string | null;
  email: string | null;
  hariSetoran: number;
};

export type SambunganData = {
  programSlug: string;
  totalPeserta: number;
  /** Peserta yang setorannya sudah terhitung — pembanding, bukan daftar kerja. */
  totalTerhitung: number;
  rows: SambunganRow[];
  /** Akun the partner system yang ikut tertarik tapi tak punya baris master. */
  akunNganggur: AkunNganggur[];
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export async function getSambunganData(programSlug: string): Promise<SambunganData | null> {
  const program = await getProgram(programSlug);
  if (!program || program.dataSourceType !== "berkah_api") return null;
  const db = getDb();

  const [masters, users, readings] = await Promise.all([
    db.select().from(hkmParticipants).where(eq(hkmParticipants.programId, program.id)),
    db.select().from(hkmUsersSync).where(eq(hkmUsersSync.programId, program.id)),
    db
      .select({
        email: hkmReadingHistorySync.email,
        berkahUserId: hkmReadingHistorySync.berkahUserId,
        historyDate: hkmReadingHistorySync.historyDate,
      })
      .from(hkmReadingHistorySync)
      .where(eq(hkmReadingHistorySync.programId, program.id)),
  ]);

  // Nomor HP dari roster presensi, kalau program ini memang punya pasangannya.
  const presensiSlug = getProgramConfig(program).presensiSlug;
  const phoneByName = new Map<string, string>();
  if (presensiSlug) {
    const presensiProgram = await getProgram(presensiSlug);
    if (presensiProgram) {
      const roster = await db
        .select({ name: studentsSync.name, phone: studentsSync.phone })
        .from(studentsSync)
        .where(eq(studentsSync.programId, presensiProgram.id));
      for (const r of roster) {
        const n = norm(r.name);
        const p = normalizePhone(r.phone);
        if (n && p && !phoneByName.has(n)) phoneByName.set(n, p);
      }
    }
  }

  const userByEmail = new Map<string, (typeof users)[number]>();
  const userById = new Map<number, (typeof users)[number]>();
  for (const u of users) {
    const e = normalizeEmail(u.email);
    if (e && !userByEmail.has(e)) userByEmail.set(e, u);
    userById.set(u.berkahUserId, u);
  }

  const readDaysByEmail = new Map<string, { hari: number; terakhir: string | null }>();
  const readDaysById = new Map<number, number>();
  for (const r of readings) {
    const e = normalizeEmail(r.email);
    if (e && r.historyDate) {
      const cur = readDaysByEmail.get(e) ?? { hari: 0, terakhir: null };
      cur.hari += 1;
      if (!cur.terakhir || r.historyDate > cur.terakhir) cur.terakhir = r.historyDate;
      readDaysByEmail.set(e, cur);
    }
    if (r.berkahUserId) readDaysById.set(r.berkahUserId, (readDaysById.get(r.berkahUserId) ?? 0) + 1);
  }

  const rows: SambunganRow[] = [];
  const masterEmails = new Set<string>();
  let totalPeserta = 0;
  let totalTerhitung = 0;

  for (const m of masters) {
    if (isExcludedName(m.namaPeserta, program.config)) continue;
    // Peserta yang sudah keluar/wafat tidak perlu disambungkan.
    if (!isTracked(toHkmStatus(m.status))) continue;
    totalPeserta += 1;

    const email = normalizeEmail(m.emailMaster);
    if (email) masterEmails.add(email);
    const akun = email ? userByEmail.get(email) : undefined;
    const baca = email ? readDaysByEmail.get(email) : undefined;

    if (akun && (baca?.hari ?? 0) > 0) {
      totalTerhitung += 1;
      continue;
    }

    const sebab: SambunganSebab = !email ? "tanpa_akun" : !akun ? "tak_tertarik" : "belum_setor";
    rows.push({
      participantId: m.id,
      nama: m.namaPeserta,
      halaqah: m.namaHalaqah,
      pengajar: m.namaPengajar,
      email: m.emailMaster,
      berkahUserId: m.berkahUserId ?? null,
      sebab,
      phone: phoneByName.get(norm(m.namaPeserta)) ?? normalizePhone(akun?.phone) ?? null,
      hariSetoran: baca?.hari ?? 0,
      terakhirSetor: baca?.terakhir ?? null,
      statusNote: m.statusNote,
    });
  }

  const SEBAB_ORDER: Record<SambunganSebab, number> = { tak_tertarik: 1, tanpa_akun: 2, belum_setor: 3 };
  rows.sort(
    (a, b) =>
      SEBAB_ORDER[a.sebab] - SEBAB_ORDER[b.sebab] ||
      (a.halaqah ?? "").localeCompare(b.halaqah ?? "") ||
      a.nama.localeCompare(b.nama),
  );

  const akunNganggur: AkunNganggur[] = users
    .filter((u) => {
      const e = normalizeEmail(u.email);
      return !e || !masterEmails.has(e);
    })
    .map((u) => ({
      berkahUserId: u.berkahUserId,
      nama: u.name,
      email: u.email,
      hariSetoran: readDaysById.get(u.berkahUserId) ?? 0,
    }))
    .sort((a, b) => b.hariSetoran - a.hariSetoran || (a.nama ?? "").localeCompare(b.nama ?? ""));

  return { programSlug, totalPeserta, totalTerhitung, rows, akunNganggur };
}
