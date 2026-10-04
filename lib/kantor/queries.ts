/**
 * Semua baca/tulis Operating Office. Keputusan terima/tolak TIDAK di sini —
 * lihat lib/kantor/aturan.ts.
 */
import { and, asc, between, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kantor, kantorAbsen, kantorIzin, kantorPetugas } from "@/lib/db/schema";
import { buatToken } from "./token";

export type Kantor = typeof kantor.$inferSelect;
export type Petugas = typeof kantorPetugas.$inferSelect;
export type Absen = typeof kantorAbsen.$inferSelect;
export type Izin = typeof kantorIzin.$inferSelect;

/** Satu-satunya kantor; dibuat saat pertama kali diminta supaya halaman admin tak pernah kosong. */
export async function getKantor(): Promise<Kantor> {
  const db = getDb();
  const [ada] = await db.select().from(kantor).limit(1);
  if (ada) return ada;
  const [baru] = await db.insert(kantor).values({ nama: "Operating Office — Rumah Belajar Pejaten" }).returning();
  return baru;
}

export async function setelKantor(v: {
  lat: number;
  lng: number;
  radiusM: number;
  masulNama: string | null;
  masulWa: string | null;
  oleh: string;
}) {
  const k = await getKantor();
  await getDb()
    .update(kantor)
    .set({
      lat: v.lat,
      lng: v.lng,
      radiusM: v.radiusM,
      masulNama: v.masulNama,
      masulWa: v.masulWa,
      updatedAt: new Date(),
      updatedBy: v.oleh,
    })
    .where(eq(kantor.id, k.id));
}

export async function getPetugasByToken(token: string): Promise<Petugas | null> {
  const [p] = await getDb()
    .select()
    .from(kantorPetugas)
    .where(and(eq(kantorPetugas.token, token), eq(kantorPetugas.aktif, true)))
    .limit(1);
  return p ?? null;
}

export async function absenHari(petugasId: string, tanggal: string): Promise<Absen[]> {
  return getDb()
    .select()
    .from(kantorAbsen)
    .where(and(eq(kantorAbsen.petugasId, petugasId), eq(kantorAbsen.tanggal, tanggal)));
}

/** Insert; unique (petugas, tanggal, jenis) menjadi pagar terakhir bila dua tekan berbarengan. */
export async function catatAbsen(v: typeof kantorAbsen.$inferInsert): Promise<Absen | null> {
  const rows = await getDb().insert(kantorAbsen).values(v).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

export async function listPetugas(): Promise<Petugas[]> {
  return getDb().select().from(kantorPetugas).orderBy(asc(kantorPetugas.namaLatin));
}

export async function tambahPetugas(v: { namaArab: string; namaLatin: string; wa: string | null; jamMasuk: string }) {
  const k = await getKantor();
  await getDb().insert(kantorPetugas).values({ ...v, kantorId: k.id, token: buatToken() });
}

export async function ubahPetugas(
  id: string,
  v: { namaArab: string; namaLatin: string; wa: string | null; jamMasuk: string; aktif: boolean },
) {
  await getDb().update(kantorPetugas).set(v).where(eq(kantorPetugas.id, id));
}

export async function buatUlangToken(id: string) {
  await getDb().update(kantorPetugas).set({ token: buatToken() }).where(eq(kantorPetugas.id, id));
}

/** Absen dalam rentang tanggal WIB (inklusif), urut tanggal lalu waktu. */
export async function absenRentang(dari: string, sampai: string): Promise<Absen[]> {
  return getDb()
    .select()
    .from(kantorAbsen)
    .where(between(kantorAbsen.tanggal, dari, sampai))
    .orderBy(asc(kantorAbsen.tanggal), asc(kantorAbsen.waktu));
}

/** Absen satu petugas dalam rentang tanggal WIB (inklusif). */
export async function absenPetugasRentang(petugasId: string, dari: string, sampai: string): Promise<Absen[]> {
  return getDb()
    .select()
    .from(kantorAbsen)
    .where(and(eq(kantorAbsen.petugasId, petugasId), between(kantorAbsen.tanggal, dari, sampai)));
}

// ── Kabar tidak hadir (ikhbar)

/** Kabar satu syaikh yang beririsan dengan [dari, sampai], terbaru dulu. */
export async function izinPetugas(petugasId: string, dari: string, sampai: string): Promise<Izin[]> {
  return getDb()
    .select()
    .from(kantorIzin)
    .where(and(eq(kantorIzin.petugasId, petugasId), lte(kantorIzin.dari, sampai), gte(kantorIzin.sampai, dari)))
    .orderBy(desc(kantorIzin.dibuatAt));
}

export async function getIzin(petugasId: string, id: string): Promise<Izin | null> {
  const [i] = await getDb()
    .select()
    .from(kantorIzin)
    .where(and(eq(kantorIzin.id, id), eq(kantorIzin.petugasId, petugasId)))
    .limit(1);
  return i ?? null;
}

export async function buatIzin(v: typeof kantorIzin.$inferInsert): Promise<Izin> {
  const [i] = await getDb().insert(kantorIzin).values(v).returning();
  return i;
}

/** Syaikh bisa membatalkan kabarnya sendiri selama harinya belum berakhir. */
export async function batalkanIzin(petugasId: string, id: string, hariIni: string): Promise<boolean> {
  const rows = await getDb()
    .update(kantorIzin)
    .set({ status: "dibatalkan" })
    .where(
      and(
        eq(kantorIzin.id, id),
        eq(kantorIzin.petugasId, petugasId),
        eq(kantorIzin.status, "dikabarkan"),
        gte(kantorIzin.sampai, hariIni),
      ),
    )
    .returning({ id: kantorIzin.id });
  return rows.length > 0;
}

/** Kabar yang beririsan dengan rentang, untuk admin. */
export async function izinRentang(dari: string, sampai: string): Promise<Izin[]> {
  return getDb()
    .select()
    .from(kantorIzin)
    .where(and(lte(kantorIzin.dari, sampai), gte(kantorIzin.sampai, dari)))
    .orderBy(desc(kantorIzin.dari));
}

/** Absen yang dicatat admin (syaikh lupa/tak bisa menekan tombol). Titik = titik kantor. */
export async function catatAbsenManual(v: {
  petugasId: string;
  tanggal: string;
  masuk: Date;
  keluar: Date | null;
  oleh: string;
}): Promise<void> {
  const k = await getKantor();
  if (k.lat == null || k.lng == null) throw new Error("kantor-belum-disetel");
  const dasar = { petugasId: v.petugasId, tanggal: v.tanggal, lat: k.lat, lng: k.lng, akurasiM: 0, jarakM: 0, dicatatOleh: v.oleh };
  const baris = [{ ...dasar, jenis: "masuk", waktu: v.masuk }, ...(v.keluar ? [{ ...dasar, jenis: "keluar", waktu: v.keluar }] : [])];
  // Timpa catatan hari itu: koreksi admin menggantikan tekanan yang salah/terlewat.
  for (const b of baris)
    await getDb()
      .insert(kantorAbsen)
      .values(b)
      .onConflictDoUpdate({
        target: [kantorAbsen.petugasId, kantorAbsen.tanggal, kantorAbsen.jenis],
        set: { waktu: b.waktu, lat: b.lat, lng: b.lng, akurasiM: 0, jarakM: 0, dicatatOleh: v.oleh, userAgent: null },
      });
}
