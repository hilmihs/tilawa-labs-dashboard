/**
 * Query `hadir_lepas`. Aturan hitung TIDAK di sini — semuanya di lepas.ts.
 *
 * Penautan MEMINDAHKAN baris ke acara_hadir lalu menghapusnya dari sini, dalam
 * satu transaksi. Menyalin akan membuat hitungan "belum bertaut" bohong
 * selamanya.
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { acara, acaraHadir, hadirLepas, orang } from "@/lib/db/schema";
import { kunciLepas, pilihRentang, type BarisLepasBaru } from "./lepas";

export type BarisLepas = {
  id: string;
  orangId: string;
  nama: string;
  gender: string;
  kodeQr: string;
  programTeks: string | null;
  waAkhir4: string | null;
  waktu: string; // ISO
  metode: string;
};

/** ON CONFLICT DO NOTHING per (tanggal, orang): kembalikan kunci yang benar-benar tertulis. */
export async function insertHadirLepasBatch(rows: readonly BarisLepasBaru[], staffId: string | null): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const db = getDb();
  const ditulis = await db
    .insert(hadirLepas)
    .values(
      rows.map((r) => ({
        tanggal: r.tanggal,
        orangId: r.orangId,
        waktu: new Date(r.waktu),
        metode: r.metode,
        perangkatId: r.perangkatId ?? null,
        staffId,
        klienId: r.klienId,
      })),
    )
    .onConflictDoNothing({ target: [hadirLepas.tanggal, hadirLepas.orangId] })
    .returning({ tanggal: hadirLepas.tanggal, orangId: hadirLepas.orangId });
  return new Set(ditulis.map((r) => kunciLepas(r.tanggal, r.orangId)));
}

/** Kunci `tanggal|orangId` yang sudah ada, untuk tanggal-tanggal yang disebut batch. */
export async function kunciLepasAda(tanggalList: readonly string[]): Promise<Set<string>> {
  if (tanggalList.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ tanggal: hadirLepas.tanggal, orangId: hadirLepas.orangId })
    .from(hadirLepas)
    .where(inArray(hadirLepas.tanggal, [...tanggalList]));
  return new Set(rows.map((r) => kunciLepas(r.tanggal, r.orangId)));
}

/** Untuk spanduk di /acara: tanggal yang punya scan belum bertaut, terbaru dulu. */
export async function listTanggalLepas(): Promise<{ tanggal: string; jumlah: number }[]> {
  const db = getDb();
  const rows = await db
    .select({ tanggal: hadirLepas.tanggal, jumlah: sql<number>`count(*)::int` })
    .from(hadirLepas)
    .groupBy(hadirLepas.tanggal)
    .orderBy(desc(hadirLepas.tanggal));
  return rows.map((r) => ({ tanggal: r.tanggal, jumlah: Number(r.jumlah) }));
}

export async function listHadirLepas(tanggal: string): Promise<BarisLepas[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: hadirLepas.id,
      orangId: hadirLepas.orangId,
      nama: orang.nama,
      gender: orang.gender,
      kodeQr: orang.kodeQr,
      programTeks: orang.programTeks,
      wa: orang.wa,
      waktu: hadirLepas.waktu,
      metode: hadirLepas.metode,
    })
    .from(hadirLepas)
    .innerJoin(orang, eq(orang.id, hadirLepas.orangId))
    .where(eq(hadirLepas.tanggal, tanggal))
    .orderBy(asc(hadirLepas.waktu));
  return rows.map((r) => ({
    id: r.id,
    orangId: r.orangId,
    nama: r.nama,
    gender: r.gender,
    kodeQr: r.kodeQr,
    programTeks: r.programTeks,
    waAkhir4: r.wa && r.wa.length >= 4 ? r.wa.slice(-4) : null,
    waktu: r.waktu.toISOString(),
    metode: r.metode,
  }));
}

/**
 * orangId → waktu, untuk satu tanggal. Roster pemindai global WAJIB membawa ini:
 * tanpa `hadirAt` terisi, `segarkan()` di pemindai akan mengosongkan peta hadir
 * lokal, bilah "Hadir n" jatuh ke 0, dan scan ulang berhenti memberi umpan
 * balik "sudah hadir" meski DB-nya tetap benar.
 */
export async function petaHadirLepas(tanggal: string): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({ orangId: hadirLepas.orangId, waktu: hadirLepas.waktu })
    .from(hadirLepas)
    .where(eq(hadirLepas.tanggal, tanggal));
  return new Map(rows.map((r) => [r.orangId, r.waktu.toISOString()]));
}

/**
 * Pindahkan scan lepas satu tanggal ke satu kegiatan. `dilewati` = orang yang
 * SUDAH ada di acara_hadir kegiatan itu (dipindai lewat pemindai kegiatan oleh
 * panitia lain); baris lepasnya tetap dihapus karena orangnya sudah tercatat.
 * Angka itu wajib ditampilkan — tanpa itu koordinator menyangka ada yang hilang.
 */
export async function tautkanKeAcara(
  acaraId: string,
  tanggal: string,
  rentang: { dariJam: string | null; sampaiJam: string | null },
): Promise<{ dipindah: number; dilewati: number }> {
  const db = getDb();
  const semua = await listHadirLepas(tanggal);
  const ikut = pilihRentang(semua, rentang.dariJam, rentang.sampaiJam);
  if (ikut.length === 0) return { dipindah: 0, dilewati: 0 };
  return db.transaction(async (tx) => {
    const ditulis = await tx
      .insert(acaraHadir)
      .values(
        ikut.map((b) => ({
          acaraId,
          orangId: b.orangId,
          waktu: new Date(b.waktu),
          metode: b.metode,
          klienId: `lepas:${b.id}`,
        })),
      )
      .onConflictDoNothing({ target: [acaraHadir.acaraId, acaraHadir.orangId] })
      .returning({ orangId: acaraHadir.orangId });
    await tx.delete(hadirLepas).where(inArray(hadirLepas.id, ikut.map((b) => b.id)));
    return { dipindah: ditulis.length, dilewati: ikut.length - ditulis.length };
  });
}

export async function hapusHadirLepas(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.delete(hadirLepas).where(eq(hadirLepas.id, id)).returning({ id: hadirLepas.id });
  return rows.length > 0;
}

/** Kegiatan bertanggal sama — satu-satunya tujuan penautan yang diizinkan. */
export async function listAcaraTanggal(tanggal: string): Promise<{ id: string; slug: string; nama: string }[]> {
  const db = getDb();
  return db
    .select({ id: acara.id, slug: acara.slug, nama: acara.nama })
    .from(acara)
    .where(eq(acara.tanggal, tanggal))
    .orderBy(asc(acara.nama));
}
