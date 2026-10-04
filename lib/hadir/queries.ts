/**
 * Query presensi QR. Hanya akses DB; aturan bisnis di view-model.ts / impor.ts.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { acara, acaraHadir, acaraPendaftaran, guruSync, klasifikasi, orang, orangKlasifikasi } from "@/lib/db/schema";
import { pickPhone } from "@/lib/guru/phone";
import { buatKode } from "./kode";
import { namaKunci } from "./nama";
import type { Konfirmasi, MetodeHadir, OrangAcaraRow, ScanEvent } from "./view-model";

export type OrangRow = typeof orang.$inferSelect;
export type HadirRow = typeof acaraHadir.$inferSelect;

/** Ikuti gabung_ke_id satu langkah: kode lama yang sudah dicetak tetap membuka orang kanonik. */
export async function getOrangByKode(kode: string): Promise<OrangRow | null> {
  const db = getDb();
  const [row] = await db.select().from(orang).where(eq(orang.kodeQr, kode)).limit(1);
  if (!row) return null;
  if (row.gabungKeId) {
    const [kanonik] = await db.select().from(orang).where(eq(orang.id, row.gabungKeId)).limit(1);
    return kanonik ?? row;
  }
  return row;
}

export async function getOrangById(id: string): Promise<OrangRow | null> {
  const db = getDb();
  const [row] = await db.select().from(orang).where(eq(orang.id, id)).limit(1);
  return row ?? null;
}

export async function getOrangByWa(wa: string): Promise<OrangRow | null> {
  const db = getDb();
  const [row] = await db.select().from(orang).where(eq(orang.wa, wa)).limit(1);
  return row ?? null;
}

/** Kode unik: tabrakan 1/30^10 tapi tetap dicek — gagal di sini lebih baik daripada unique violation di tengah impor. */
async function kodeBaru(): Promise<string> {
  const db = getDb();
  for (let i = 0; i < 5; i++) {
    const k = buatKode();
    const [ada] = await db.select({ id: orang.id }).from(orang).where(eq(orang.kodeQr, k)).limit(1);
    if (!ada) return k;
  }
  throw new Error("gagal membuat kode QR unik");
}

export async function insertOrang(v: {
  nama: string;
  gender: "L" | "P";
  wa?: string | null;
  email?: string | null;
  programTeks?: string | null;
  kategori?: string;
  sumber: string;
  perluReview?: boolean;
}): Promise<OrangRow> {
  const db = getDb();
  const kodeQr = await kodeBaru();
  const [row] = await db
    .insert(orang)
    .values({
      nama: v.nama,
      namaKunci: namaKunci(v.nama),
      gender: v.gender,
      wa: v.wa ?? null,
      email: v.email ?? null,
      programTeks: v.programTeks ?? null,
      kategori: v.kategori ?? (v.programTeks?.toLowerCase().startsWith("pengurus") ? "pengurus" : "pengajar"),
      kodeQr,
      sumber: v.sumber,
      perluReview: v.perluReview ?? false,
    })
    .returning();
  return row;
}

export async function upsertPendaftaran(v: {
  acaraId: string;
  orangId: string;
  konfirmasi: Konfirmasi;
  alasan?: string | null;
  sumber: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(acaraPendaftaran)
    .values({ acaraId: v.acaraId, orangId: v.orangId, konfirmasi: v.konfirmasi, alasan: v.alasan ?? null, sumber: v.sumber, dijawabAt: v.konfirmasi ? new Date() : null })
    .onConflictDoUpdate({
      target: [acaraPendaftaran.acaraId, acaraPendaftaran.orangId],
      set: { konfirmasi: v.konfirmasi, alasan: v.alasan ?? null, sumber: v.sumber, dijawabAt: v.konfirmasi ? new Date() : null },
    });
}

/**
 * Semua orang yang terdaftar ATAU sudah hadir di acara ini (hadir tanpa daftar
 * tetap tampil). `semua: true` → seluruh orang aktif, dipakai roster pemindai:
 * kartu QR berlaku lintas kajian, jadi siapa pun yang membawanya harus dikenali
 * offline meski tidak mendaftar untuk kajian ini.
 */
export async function listOrangAcara(acaraId: string, opsi: { semua?: boolean } = {}): Promise<OrangAcaraRow[]> {
  const db = getDb();
  const saring = opsi.semua ? sql`` : sql`and (p.id is not null or h.id is not null)`;
  const rows = await db.execute(sql`
    select o.id, o.nama, o.gender, o.program_teks, o.kategori, o.kode_qr, o.wa,
           p.konfirmasi, p.alasan, h.waktu as hadir_at, h.metode,
           coalesce(array_remove(array_agg(k.slug), null), '{}') as golongan
      from ${orang} o
      left join ${acaraPendaftaran} p on p.orang_id = o.id and p.acara_id = ${acaraId}
      left join ${acaraHadir} h on h.orang_id = o.id and h.acara_id = ${acaraId}
      left join ${orangKlasifikasi} ok on ok.orang_id = o.id
      left join ${klasifikasi} k on k.id = ok.klasifikasi_id
     where o.gabung_ke_id is null and o.status = 'aktif'
       ${saring}
     group by o.id, o.nama, o.gender, o.program_teks, o.kategori, o.kode_qr, o.wa,
              p.id, p.konfirmasi, p.alasan, h.id, h.waktu, h.metode
     order by o.nama
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nama: String(r.nama),
    gender: String(r.gender),
    programTeks: (r.program_teks as string | null) ?? null,
    kategori: String(r.kategori),
    kodeQr: String(r.kode_qr),
    wa: (r.wa as string | null) ?? null,
    konfirmasi: (r.konfirmasi as Konfirmasi) ?? null,
    alasan: (r.alasan as string | null) ?? null,
    hadirAt: r.hadir_at ? new Date(r.hadir_at as string).toISOString() : null,
    metode: (r.metode as MetodeHadir | null) ?? null,
    golongan: (r.golongan as string[]) ?? [],
  }));
}

/**
 * Seluruh orang aktif tanpa konteks acara — roster pemindai global. Tidak ada
 * pendaftaran/hadir yang bisa dijoin, jadi `konfirmasi` dan `hadirAt` selalu
 * null; pemindai global memang tidak menampilkan keduanya.
 */
export async function listOrangAcaraSemua(): Promise<OrangAcaraRow[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    select o.id, o.nama, o.gender, o.program_teks, o.kategori, o.kode_qr, o.wa,
           coalesce(array_remove(array_agg(k.slug), null), '{}') as golongan
      from ${orang} o
      left join ${orangKlasifikasi} ok on ok.orang_id = o.id
      left join ${klasifikasi} k on k.id = ok.klasifikasi_id
     where o.gabung_ke_id is null and o.status = 'aktif'
     group by o.id, o.nama, o.gender, o.program_teks, o.kategori, o.kode_qr, o.wa
     order by o.nama
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nama: String(r.nama),
    gender: String(r.gender),
    programTeks: (r.program_teks as string | null) ?? null,
    kategori: String(r.kategori),
    kodeQr: String(r.kode_qr),
    wa: (r.wa as string | null) ?? null,
    konfirmasi: null,
    alasan: null,
    hadirAt: null,
    metode: null,
    golongan: (r.golongan as string[]) ?? [],
  }));
}

export async function listOrangIdAcara(acaraId: string): Promise<{ terdaftar: Set<string>; hadir: Set<string> }> {
  const db = getDb();
  const [p, h] = await Promise.all([
    db.select({ id: acaraPendaftaran.orangId }).from(acaraPendaftaran).where(eq(acaraPendaftaran.acaraId, acaraId)),
    db.select({ id: acaraHadir.orangId }).from(acaraHadir).where(eq(acaraHadir.acaraId, acaraId)),
  ]);
  return { terdaftar: new Set(p.map((x) => x.id)), hadir: new Set(h.map((x) => x.id)) };
}

/** Semua orang aktif (untuk roster: orang yang tidak terdaftar tetap bisa discan — hadir tanpa RSVP). */
export async function listSemuaOrangAktif(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db.select({ id: orang.id }).from(orang).where(and(eq(orang.status, "aktif"), sql`${orang.gabungKeId} is null`));
  return new Set(rows.map((r) => r.id));
}

/** ON CONFLICT DO NOTHING per (acara, orang): kembalikan id orang yang benar-benar tertulis. */
export async function insertHadirBatch(acaraId: string, events: readonly ScanEvent[], staffId: string | null): Promise<Set<string>> {
  if (events.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .insert(acaraHadir)
    .values(
      events.map((e) => ({
        acaraId,
        orangId: e.orangId,
        waktu: new Date(e.waktu),
        metode: e.metode,
        perangkatId: e.perangkatId ?? null,
        staffId,
        klienId: e.klienId,
      })),
    )
    .onConflictDoNothing({ target: [acaraHadir.acaraId, acaraHadir.orangId] })
    .returning({ orangId: acaraHadir.orangId });
  return new Set(rows.map((r) => r.orangId));
}

export async function hapusHadir(acaraId: string, orangId: string): Promise<HadirRow | null> {
  const db = getDb();
  const [row] = await db.delete(acaraHadir).where(and(eq(acaraHadir.acaraId, acaraId), eq(acaraHadir.orangId, orangId))).returning();
  return row ?? null;
}

export async function listHadirOrang(orangId: string): Promise<{ acaraNama: string; pemateri: string | null; tanggal: string; waktu: string }[]> {
  const db = getDb();
  const rows = await db
    .select({ acaraNama: acara.nama, pemateri: acara.pemateri, tanggal: acara.tanggal, waktu: acaraHadir.waktu })
    .from(acaraHadir)
    .innerJoin(acara, eq(acara.id, acaraHadir.acaraId))
    .where(eq(acaraHadir.orangId, orangId))
    .orderBy(desc(acara.tanggal));
  return rows.map((r) => ({ acaraNama: r.acaraNama, pemateri: r.pemateri, tanggal: r.tanggal, waktu: r.waktu.toISOString() }));
}

/** Peta pencocokan untuk impor: wa → id, nama_kunci → id[] (hanya orang kanonik aktif). */
export async function petaCocokOrang(): Promise<{ byWa: Map<string, string>; byNamaKunci: Map<string, string[]> }> {
  const db = getDb();
  const rows = await db
    .select({ id: orang.id, wa: orang.wa, namaKunci: orang.namaKunci })
    .from(orang)
    .where(and(eq(orang.status, "aktif"), sql`${orang.gabungKeId} is null`));
  const byWa = new Map<string, string>();
  const byNamaKunci = new Map<string, string[]>();
  for (const r of rows) {
    if (r.wa) byWa.set(r.wa, r.id);
    const arr = byNamaKunci.get(r.namaKunci) ?? [];
    arr.push(r.id);
    byNamaKunci.set(r.namaKunci, arr);
  }
  return { byWa, byNamaKunci };
}

/**
 * nama_kunci → HP dari guru_sync (semua program tilawah). Satu nama dengan dua
 * nomor berbeda dianggap tidak pasti dan dibuang — lebih baik tanpa HP daripada
 * HP orang lain menempel di kartu QR.
 */
export async function teleponGuruByNamaKunci(): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({ name: guruSync.name, phone: guruSync.phone })
    .from(guruSync)
    .where(sql`${guruSync.phone} is not null and ${guruSync.name} is not null`);
  const peta = new Map<string, Set<string>>();
  for (const r of rows) {
    const p = pickPhone(r.name, r.phone);
    if (!p) continue;
    const k = namaKunci(r.name);
    if (!k) continue;
    const set = peta.get(k) ?? new Set<string>();
    set.add(p);
    peta.set(k, set);
  }
  const out = new Map<string, string>();
  for (const [k, set] of peta) if (set.size === 1) out.set(k, [...set][0]);
  return out;
}

export async function updateAcaraPresensi(
  acaraId: string,
  v: { jamMulai: string | null; toleransiMenit: number; scanBukaAt: Date | null; scanTutupAt: Date | null; terimaPendaftaran: boolean; pemateri: string | null; lokasi: string | null; tema: string | null; seri: string | null },
): Promise<void> {
  const db = getDb();
  await db.update(acara).set({ ...v, updatedAt: new Date() }).where(eq(acara.id, acaraId));
}

export async function insertAcara(v: { slug: string; nama: string; tanggal: string; lokasi: string | null; pemateri: string | null; jamMulai: string | null; toleransiMenit: number; tema?: string | null; seri?: string | null }): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(acara)
    .values({ ...v, tema: v.tema ?? null, seri: v.seri ?? null, status: "persiapan" })
    .returning({ id: acara.id });
  return row.id;
}

/**
 * Acara yang "sedang berjalan" untuk pemindai tanpa slug: jendela scan mencakup
 * sekarang, atau tanggal = hari ini (WIB). Bisa lebih dari satu; pemanggil memilih.
 */
export async function listAcaraHariIni(hariIni: string, sekarang: Date): Promise<{ slug: string; nama: string; tanggal: string }[]> {
  const db = getDb();
  const rows = await db
    .select({ slug: acara.slug, nama: acara.nama, tanggal: acara.tanggal })
    .from(acara)
    .where(
      sql`(${acara.scanBukaAt} is not null and ${acara.scanTutupAt} is not null and ${acara.scanBukaAt} <= ${sekarang} and ${acara.scanTutupAt} >= ${sekarang})
          or ${acara.tanggal} = ${hariIni}`,
    )
    .orderBy(asc(acara.tanggal));
  return rows;
}

export async function listOrangByIds(ids: readonly string[]): Promise<OrangRow[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  return db.select().from(orang).where(inArray(orang.id, [...ids])).orderBy(asc(orang.nama));
}

/**
 * Hitungan per acara untuk daftar /acara: `hadir` = orang yang discan, `terdaftar`
 * = orang yang terdaftar ATAU hadir (hadir tanpa daftar ikut), supaya
 * hadir/terdaftar tidak pernah lewat 100%.
 */
export async function hitungKehadiranPerAcara(): Promise<Map<string, { hadir: number; terdaftar: number }>> {
  const db = getDb();
  const rows = await db.execute(sql`
    select acara_id, count(*) filter (where hadir)::int hadir, count(*)::int terdaftar
    from (
      select acara_id, orang_id, bool_or(hadir) hadir
      from (
        select acara_id, orang_id, false hadir from acara_pendaftaran
        union all
        select acara_id, orang_id, true hadir from acara_hadir
      ) x
      group by acara_id, orang_id
    ) y
    group by acara_id`);
  return new Map(
    (rows.rows as { acara_id: string; hadir: number; terdaftar: number }[]).map((r) => [
      String(r.acara_id),
      { hadir: Number(r.hadir), terdaftar: Number(r.terdaftar) },
    ]),
  );
}
