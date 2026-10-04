/**
 * Query golongan, keanggotaan, target acara, dan baris rekap. Dipisah dari
 * queries.ts (yang sudah mengurus kartu/scan/impor) supaya dua berkas tetap
 * satu tanggung jawab. Aturan hitung TIDAK ada di sini — semuanya di rekap.ts
 * dan golongan.ts.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { acara, acaraHadir, acaraTarget, klasifikasi, orang, orangKlasifikasi } from "@/lib/db/schema";
import { slugGolongan } from "./golongan";
import type { AnggotaGolongan, BarisRekap, SesiMeta, SifatTarget, TargetSesi } from "./rekap";

export type KlasifikasiRow = typeof klasifikasi.$inferSelect;
export type KlasifikasiDenganAnggota = KlasifikasiRow & { anggota: number };

export async function listKlasifikasi(opsi: { hanyaAktif?: boolean } = {}): Promise<KlasifikasiDenganAnggota[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    select k.id, k.slug, k.nama, k.keterangan, k.urutan, k.aktif, k.created_at, k.updated_at,
           count(ok.id)::int as anggota
      from ${klasifikasi} k
      left join ${orangKlasifikasi} ok on ok.klasifikasi_id = k.id
     ${opsi.hanyaAktif ? sql`where k.aktif` : sql``}
     group by k.id
     order by k.urutan, k.nama
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    nama: String(r.nama),
    keterangan: (r.keterangan as string | null) ?? null,
    urutan: Number(r.urutan),
    aktif: Boolean(r.aktif),
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
    anggota: Number(r.anggota),
  }));
}

export async function insertKlasifikasi(v: { nama: string; keterangan: string | null; urutan: number }): Promise<void> {
  const db = getDb();
  await db
    .insert(klasifikasi)
    .values({ slug: slugGolongan(v.nama), nama: v.nama, keterangan: v.keterangan, urutan: v.urutan })
    .onConflictDoNothing({ target: klasifikasi.slug });
}

/** Slug TIDAK pernah diubah dari UI: rekap sesi lampau mengenali golongan lewat slug. */
export async function updateKlasifikasi(
  id: string,
  v: { nama: string; keterangan: string | null; urutan: number; aktif: boolean },
): Promise<void> {
  const db = getDb();
  await db.update(klasifikasi).set({ ...v, updatedAt: new Date() }).where(eq(klasifikasi.id, id));
}

/** slug golongan → himpunan orangId anggotanya (hanya orang kanonik aktif). */
export async function anggotaPerGolongan(): Promise<AnggotaGolongan> {
  const db = getDb();
  const rows = await db
    .select({ slug: klasifikasi.slug, orangId: orangKlasifikasi.orangId })
    .from(orangKlasifikasi)
    .innerJoin(klasifikasi, eq(klasifikasi.id, orangKlasifikasi.klasifikasiId))
    .innerJoin(orang, eq(orang.id, orangKlasifikasi.orangId))
    .where(and(eq(orang.status, "aktif"), sql`${orang.gabungKeId} is null`));
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.slug) ?? new Set<string>();
    set.add(r.orangId);
    out.set(r.slug, set);
  }
  return out;
}

/** Ganti keanggotaan manual satu orang. Baris 'tautan' milik sinkron tidak disentuh. */
export async function setGolonganOrang(orangId: string, klasifikasiIds: readonly string[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(orangKlasifikasi)
      .where(and(eq(orangKlasifikasi.orangId, orangId), sql`${orangKlasifikasi.sumber} <> 'tautan'`));
    if (klasifikasiIds.length > 0) {
      await tx
        .insert(orangKlasifikasi)
        .values(klasifikasiIds.map((klasifikasiId) => ({ orangId, klasifikasiId, sumber: "manual" })))
        .onConflictDoNothing({ target: [orangKlasifikasi.orangId, orangKlasifikasi.klasifikasiId] });
    }
  });
}

/** Aksi borongan: tambah satu golongan ke banyak orang sekaligus. */
export async function tambahGolonganBorongan(orangIds: readonly string[], klasifikasiId: string): Promise<number> {
  if (orangIds.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .insert(orangKlasifikasi)
    .values(orangIds.map((orangId) => ({ orangId, klasifikasiId, sumber: "manual" })))
    .onConflictDoNothing({ target: [orangKlasifikasi.orangId, orangKlasifikasi.klasifikasiId] })
    .returning({ id: orangKlasifikasi.id });
  return rows.length;
}

export async function updateAtributOrang(
  orangId: string,
  v: { qism: string | null; mustawa: string | null; fatroh: string | null; asalSekolah: string | null; programMp: string | null },
): Promise<void> {
  const db = getDb();
  await db.update(orang).set({ ...v, updatedAt: new Date() }).where(eq(orang.id, orangId));
}

export async function listTargetAcara(acaraId: string): Promise<TargetSesi[]> {
  const db = getDb();
  const rows = await db
    .select({ slug: klasifikasi.slug, sifat: acaraTarget.sifat })
    .from(acaraTarget)
    .innerJoin(klasifikasi, eq(klasifikasi.id, acaraTarget.klasifikasiId))
    .where(eq(acaraTarget.acaraId, acaraId));
  return rows.map((r) => ({ acaraId, klasifikasiSlug: r.slug, sifat: r.sifat as SifatTarget }));
}

/** Target acara dalam bentuk id, untuk mengisi formulir (slug tidak cukup: tulis pakai id). */
export async function listTargetAcaraId(acaraId: string): Promise<Record<string, SifatTarget>> {
  const db = getDb();
  const rows = await db
    .select({ id: acaraTarget.klasifikasiId, sifat: acaraTarget.sifat })
    .from(acaraTarget)
    .where(eq(acaraTarget.acaraId, acaraId));
  return Object.fromEntries(rows.map((r) => [r.id, r.sifat as SifatTarget]));
}

export async function setTargetAcara(
  acaraId: string,
  rows: readonly { klasifikasiId: string; sifat: SifatTarget }[],
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(acaraTarget).where(eq(acaraTarget.acaraId, acaraId));
    if (rows.length > 0) {
      await tx.insert(acaraTarget).values(rows.map((r) => ({ acaraId, klasifikasiId: r.klasifikasiId, sifat: r.sifat })));
    }
  });
}

export type SaringRekap = { seri?: string | null; dari?: string | null; sampai?: string | null };

/** Sesi yang masuk rekap, urut tanggal naik. */
export async function listSesiRekap(f: SaringRekap): Promise<SesiMeta[]> {
  const db = getDb();
  return db
    .select({
      acaraId: acara.id,
      slug: acara.slug,
      nama: acara.nama,
      seri: acara.seri,
      tanggal: acara.tanggal,
      pemateri: acara.pemateri,
      tema: acara.tema,
    })
    .from(acara)
    .where(
      and(
        f.seri ? eq(acara.seri, f.seri) : sql`true`,
        f.dari ? sql`${acara.tanggal} >= ${f.dari}` : sql`true`,
        f.sampai ? sql`${acara.tanggal} <= ${f.sampai}` : sql`true`,
      ),
    )
    .orderBy(asc(acara.tanggal), asc(acara.slug));
}

/**
 * Satu baris per (acara, orang) yang hadir, sudah membawa profil + golongan.
 * `array_agg` digabung lewat group by supaya orang dengan tiga golongan tetap
 * satu baris — kalau tidak, satu kehadiran terhitung tiga kali.
 */
export async function barisRekap(acaraIds: readonly string[]): Promise<BarisRekap[]> {
  if (acaraIds.length === 0) return [];
  const db = getDb();
  const daftar = sql.join(acaraIds.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute(sql`
    select h.acara_id, o.id as orang_id, o.nama, o.gender, o.qism, o.qism_taksiran, o.kode_qr, h.waktu,
           coalesce(array_remove(array_agg(k.slug), null), '{}') as golongan
      from ${acaraHadir} h
      join ${orang} o on o.id = h.orang_id
      left join ${orangKlasifikasi} ok on ok.orang_id = o.id
      left join ${klasifikasi} k on k.id = ok.klasifikasi_id
     where h.acara_id in (${daftar})
     group by h.acara_id, o.id, o.nama, o.gender, o.qism, o.qism_taksiran, o.kode_qr, h.waktu
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    acaraId: String(r.acara_id),
    orangId: String(r.orang_id),
    nama: String(r.nama),
    gender: String(r.gender ?? ""),
    qism: (r.qism as string | null) ?? null,
    qismTaksiran: Boolean(r.qism_taksiran),
    kodeQr: (r.kode_qr as string | null) ?? null,
    golongan: (r.golongan as string[]) ?? [],
    hadirAt: new Date(r.waktu as string).toISOString(),
  }));
}

/** Seri yang sudah dipakai, untuk dropdown saringan & formulir. */
export async function listSeri(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ seri: acara.seri })
    .from(acara)
    .where(sql`${acara.seri} is not null`)
    .orderBy(asc(acara.seri));
  return rows.map((r) => r.seri).filter((s): s is string => Boolean(s));
}

export type OrangDirektori = {
  id: string;
  nama: string;
  gender: string;
  wa4: string | null;
  kodeQr: string;
  programTeks: string | null;
  qism: string | null;
  mustawa: string | null;
  fatroh: string | null;
  asalSekolah: string | null;
  programMp: string | null;
  perluReview: boolean;
  golongan: { id: string; nama: string }[];
};

export type SaringOrang = {
  q?: string;
  golonganId?: string;
  qism?: string;
  gender?: string;
  perluReview?: boolean;
  limit?: number;
};

export async function listOrangDirektori(f: SaringOrang): Promise<OrangDirektori[]> {
  const db = getDb();
  const q = f.q?.trim() ? `%${f.q.trim().toLowerCase()}%` : null;
  const rows = await db.execute(sql`
    select o.id, o.nama, o.gender, o.wa, o.kode_qr, o.program_teks, o.qism, o.mustawa,
           o.fatroh, o.asal_sekolah, o.program_mp, o.perlu_review,
           coalesce(
             json_agg(json_build_object('id', k.id, 'nama', k.nama) order by k.urutan, k.nama)
               filter (where k.id is not null),
             '[]'
           ) as golongan
      from ${orang} o
      left join ${orangKlasifikasi} ok on ok.orang_id = o.id
      left join ${klasifikasi} k on k.id = ok.klasifikasi_id
     where o.status = 'aktif' and o.gabung_ke_id is null
       ${q ? sql`and (lower(o.nama) like ${q} or o.wa like ${q})` : sql``}
       ${f.gender ? sql`and o.gender = ${f.gender}` : sql``}
       ${f.qism ? sql`and o.qism = ${f.qism}` : sql``}
       ${f.perluReview ? sql`and o.perlu_review` : sql``}
       ${f.golonganId ? sql`and exists (select 1 from ${orangKlasifikasi} x where x.orang_id = o.id and x.klasifikasi_id = ${f.golonganId}::uuid)` : sql``}
     group by o.id
     order by o.nama
     limit ${f.limit ?? 200}
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nama: String(r.nama),
    gender: String(r.gender),
    wa4: r.wa ? String(r.wa).slice(-4) : null,
    kodeQr: String(r.kode_qr),
    programTeks: (r.program_teks as string | null) ?? null,
    qism: (r.qism as string | null) ?? null,
    mustawa: (r.mustawa as string | null) ?? null,
    fatroh: (r.fatroh as string | null) ?? null,
    asalSekolah: (r.asal_sekolah as string | null) ?? null,
    programMp: (r.program_mp as string | null) ?? null,
    perluReview: Boolean(r.perlu_review),
    golongan: (r.golongan as { id: string; nama: string }[]) ?? [],
  }));
}

/** Id seluruh hasil saringan (bukan hanya yang tampil), untuk aksi borongan. */
export async function listOrangIdDirektori(f: SaringOrang): Promise<string[]> {
  const rows = await listOrangDirektori({ ...f, limit: 5000 });
  return rows.map((r) => r.id);
}

export async function getKlasifikasiByIds(ids: readonly string[]): Promise<KlasifikasiRow[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  return db.select().from(klasifikasi).where(inArray(klasifikasi.id, [...ids]));
}
