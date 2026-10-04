/**
 * Data untuk `/[program]/observasi` — log keterangan harian ketua kelas.
 *
 * Semua bacaan SQL-nya sudah ada di `lib/maahir/entities.ts`; berkas ini hanya
 * merangkai: batch yang dipin pada program → halaqah Maahir di batch itu →
 * keterangan harian pada bulan yang diminta → anak-anaknya (pelanggaran,
 * tabayyun, hutang-bayar). Tidak ada satu pun angka rekap yang diturunkan ulang
 * di sini; lihat header `view-model.ts`.
 *
 * **Jendela waktunya kalender bulan polos atas `tanggal`.** Ini berbeda dari
 * layar rekap: di sana rentangnya milik upstream (`meta.periode`, kadang 28→27)
 * dan harus dipakai apa adanya. `hits/keterangan-harian` adalah entitas mentah —
 * tidak ada jendela upstream yang perlu dihormati, jadi bulan di sini benar-benar
 * "semua baris yang `tanggal`-nya jatuh di bulan kalender itu", tidak lebih dan
 * tidak kurang. Karena itu juga angkanya tidak boleh diadu dengan tab Disiplin.
 *
 * Penyaringannya memakai `tanggal`, BUKAN `created_at`: baris Januari/April
 * di-backfill 21 Juni 2026, jadi cap tulis bukan waktu kejadian.
 *
 * Setiap cara "tidak ada baris" mendapat state-nya sendiri, karena belum ditarik
 * / scope ditolak / mirror kosong / memang tidak ada catatan adalah empat hal
 * berbeda yang tidak boleh dirender sebagai nol yang sama.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  entityLastSync,
  isEntityForbidden,
  readHitsHalaqah,
  readHitsPengajar,
  readHutangBayar,
  readKeteranganHarian,
  readPelanggaran,
  readTabayyun,
  type MaahirHitsHalaqah,
} from "@/lib/maahir/entities";
import { halaqahIndex, matchHalaqah, type MatchTarget } from "@/lib/maahir/name-match";
import { maahirHitsBatchIds } from "@/lib/programs/nav";
import { jakartaDate } from "@/lib/time/jakarta";
import { buildObservasiView, type ObservasiView, type TautanHalaqah } from "./view-model";

/** Entitas induk layar ini — dipakai untuk cap "terakhir ditarik" dan cek scope. */
const ENTITAS_INDUK = "hits/keterangan-harian" as const;

export type ObservasiData =
  | { state: "tanpa-pin" }
  | { state: "scope-ditolak" }
  | { state: "belum-ditarik" }
  | { state: "mirror-kosong"; batchIds: string[] }
  | {
      state: "siap";
      view: ObservasiView;
      /** Bulan kalender yang dirender, `YYYY-MM`. */
      bulan: string;
      /** `maahir_sync.synced_at` terbaru untuk entitas induk. `null` = belum pernah. */
      terakhirDitarik: Date | null;
      /** Halaqah yang sedang difokuskan lewat `?halaqah=`, kalau ada. */
      fokus: { id: string; nama: string | null } | null;
      /** Semua halaqah batch ini, untuk daftar pilihan fokus di halaman. */
      halaqahBatch: { id: string; nama: string }[];
      /** Halaqah batch ini yang namanya tidak ketemu di `halaqah_sync` — barisnya tetap tampil. */
      tanpaTautan: number;
    };

// ── Bulan ──────────────────────────────────────────────────────────────────

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Berapa bulan ke belakang yang ditawarkan. Enam, bukan dua seperti layar rekap:
 *  cermin `hits/keterangan-harian` menyimpan sampai Januari 2026, dan tidak ada
 *  jendela sync yang membatasinya seperti pada `maahir_rekap`. */
const JUMLAH_BULAN = 6;

/**
 * Enam bulan kalender terakhir, terbaru dulu. Dihitung dari tanggal Jakarta —
 * memakai bulan lokal mesin akan menggeser pilihan pada tanggal 1 untuk server
 * di barat UTC.
 */
export function bulanPilihan(hariIni: string = jakartaDate()): string[] {
  const [tahun, bulan] = hariIni.slice(0, 7).split("-").map(Number);
  if (!Number.isFinite(tahun) || !Number.isFinite(bulan)) return [];
  const out: string[] = [];
  for (let i = 0; i < JUMLAH_BULAN; i++) {
    const total = tahun * 12 + (bulan - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Bulan yang dirender: yang diminta bila berbentuk `YYYY-MM` dan ada di daftar
 * pilihan, selain itu bulan berjalan. Bulan di luar rentang dikoreksi, bukan
 * ditolak — URL lama tetap membuka halaman yang bisa dibaca.
 */
export function resolveBulan(requested: string | undefined, hariIni: string = jakartaDate()): string {
  const pilihan = bulanPilihan(hariIni);
  return requested && pilihan.includes(requested) ? requested : pilihan[0];
}

/** Label pemilih bulan: "Agustus 2026". */
export function labelBulan(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  return NAMA_BULAN[m - 1] ? `${NAMA_BULAN[m - 1]} ${y}` : bulan;
}

// ── Jembatan nama halaqah → route detail HITS ───────────────────────────────

/**
 * Halaqah dashboard milik program ini. Route detail memakai
 * `tilawah_halaqah_id` yang NUMERIK, jadi itulah yang dibawa sebagai `id`
 * indeks — bukan uuid barisnya.
 *
 * Dipin ke `program_id` program yang sedang dibuka: nama halaqah berulang antar
 * program, dan indeks lintas-program hanya akan menghasilkan tabrakan yang
 * membuat `matchHalaqah` menyerah.
 */
async function halaqahDashboard(programId: string): Promise<MatchTarget[]> {
  const db = getDb();
  const rows = await db.execute<{ tilawah_halaqah_id: number; name: string | null }>(sql`
    select tilawah_halaqah_id, name
    from halaqah_sync
    where program_id = ${programId}
  `);
  return rows.rows
    .filter((r) => typeof r.name === "string" && r.name.trim() !== "")
    .map((r) => ({ id: String(r.tilawah_halaqah_id), name: r.name as string }));
}

/**
 * Peta halaqah Maahir → halaqah dashboard, lewat nama (satu-satunya kunci yang
 * ada; lihat header `lib/maahir/name-match.ts`). Yang meleset atau ambigu
 * sengaja tidak masuk peta: pemanggil merender teks biasa, dan barisnya TIDAK
 * boleh hilang karenanya.
 */
function petaTautan(
  halaqah: MaahirHitsHalaqah[],
  target: MatchTarget[],
): Record<string, TautanHalaqah> {
  const index = halaqahIndex(target);
  const out: Record<string, TautanHalaqah> = {};
  for (const h of halaqah) {
    const hit = matchHalaqah(index, h.name);
    const id = hit ? Number(hit.id) : NaN;
    if (Number.isFinite(id)) out[h.id] = { tilawahHalaqahId: id };
  }
  return out;
}

// ── Pemuatan ───────────────────────────────────────────────────────────────

export async function loadObservasi(
  program: { id: string; config: unknown },
  bulan: string,
  halaqahFokus?: string,
): Promise<ObservasiData> {
  const batchIds = maahirHitsBatchIds(program.config);
  if (batchIds.length === 0) return { state: "tanpa-pin" };

  const [halaqah, ditolak, terakhirDitarik] = await Promise.all([
    readHitsHalaqah(batchIds),
    isEntityForbidden(ENTITAS_INDUK),
    entityLastSync(ENTITAS_INDUK),
  ]);

  // Urutan pemeriksaan penting: 403 menjelaskan kenapa tarikannya tidak pernah
  // ada, jadi ia diperiksa sebelum "belum ditarik".
  if (ditolak) return { state: "scope-ditolak" };
  if (terakhirDitarik === null) return { state: "belum-ditarik" };
  if (halaqah.length === 0) return { state: "mirror-kosong", batchIds };

  const halaqahIds = halaqah.map((h) => h.id);
  const idSet = new Set(halaqahIds);
  // `?halaqah=` hanya dihormati kalau halaqah-nya memang milik batch ini;
  // selain itu diabaikan, bukan dijadikan hasil kosong yang membingungkan.
  const fokusId = halaqahFokus && idSet.has(halaqahFokus) ? halaqahFokus : null;

  const semua = await readKeteranganHarian(fokusId ? [fokusId] : halaqahIds);
  // Jendela kalender bulan polos atas `tanggal` (string `YYYY-MM-DD`), bukan
  // `created_at` — lihat header berkas.
  const keterangan = semua.filter((k) => typeof k.tanggal === "string" && k.tanggal.startsWith(bulan));
  const keteranganIds = keterangan.map((k) => k.id);

  const [pelanggaran, tabayyun, hutang, pengajar, target] = await Promise.all([
    readPelanggaran(keteranganIds),
    readTabayyun(keteranganIds),
    readHutangBayar(keteranganIds),
    readHitsPengajar(),
    halaqahDashboard(program.id),
  ]);

  const tautan = petaTautan(halaqah, target);
  const view = buildObservasiView({
    keterangan,
    pelanggaran,
    tabayyun,
    hutang,
    halaqah,
    pengajar,
    tautan,
  });

  return {
    state: "siap",
    view,
    bulan,
    terakhirDitarik,
    fokus: fokusId ? { id: fokusId, nama: halaqah.find((h) => h.id === fokusId)?.name ?? null } : null,
    halaqahBatch: [...halaqah]
      .map((h) => ({ id: h.id, nama: h.name }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id", { numeric: true })),
    // Dihitung dari halaqah yang BENAR-BENAR dirender, bukan dari seluruh batch.
    // Versi sebelumnya memakai `halaqah` (isi batch), sehingga
    // /hits-regular-jan/observasi?bulan=2026-09 menulis "66 halaqah tanpa
    // tautan" di atas layar yang menampilkan 7 halaqah — 1 di antaranya tanpa
    // tautan — dan /hits-safar-jan menulis "4 halaqah tanpa tautan" tepat di
    // sebelah "tidak ada catatan". Catatan kaki harus menjelaskan yang terlihat.
    tanpaTautan: view.perHalaqah.filter((g) => g.tilawahHalaqahId == null).length,
  };
}
