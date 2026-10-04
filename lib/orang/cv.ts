/**
 * Query CV per orang + direktori orang. Identitas selalu lewat `orang_tautan`
 * (sumber + id upstream), tidak pernah lewat nama — id upstream tak global,
 * lihat lib/orang/klaster.ts.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { BarisHalaqah, BarisKegiatan } from "./cv-view";

export type OrangRingkas = {
  id: string;
  nama: string;
  kodeQr: string;
  gender: string;
  kategori: string;
  programTeks: string | null;
  perluReview: boolean;
  jumlahTautan: number;
  sumber: string[];
};

export type TautanOrang = {
  sumber: string;
  peran: string;
  idUpstream: string;
  programSlug: string;
  namaUpstream: string | null;
  aktif: boolean;
};

export type OrangCv = {
  orang: {
    id: string;
    nama: string;
    kodeQr: string;
    gender: string;
    kategori: string;
    programTeks: string | null;
    wa: string | null;
    email: string | null;
    perluReview: boolean;
  };
  tautan: TautanOrang[];
  halaqah: BarisHalaqah[];
  jadiBadal: number;
  kegiatan: BarisKegiatan[];
};

/** Direktori: satu baris per orang aktif, dengan jumlah akun yang tertaut. */
export async function listOrang(q?: string): Promise<OrangRingkas[]> {
  const db = getDb();
  const cari = q?.trim() ? `%${q.trim().toLowerCase()}%` : null;
  const rows = await db.execute(sql`
    select o.id, o.nama, o.kode_qr, o.gender, o.kategori, o.program_teks, o.perlu_review,
      count(t.id)::int jumlah_tautan,
      coalesce(array_agg(distinct t.sumber) filter (where t.sumber is not null), '{}') sumber
    from orang o
    left join orang_tautan t on t.orang_id = o.id
    where o.gabung_ke_id is null and o.status = 'aktif'
      ${cari ? sql`and (lower(o.nama) like ${cari} or lower(o.nama_kunci) like ${cari} or lower(o.kode_qr) like ${cari})` : sql``}
    group by o.id
    order by o.nama`);
  return rows.rows.map((r) => ({
    id: String(r.id),
    nama: String(r.nama),
    kodeQr: String(r.kode_qr),
    gender: String(r.gender),
    kategori: String(r.kategori),
    programTeks: (r.program_teks as string | null) ?? null,
    perluReview: Boolean(r.perlu_review),
    jumlahTautan: Number(r.jumlah_tautan),
    sumber: (r.sumber as string[]) ?? [],
  }));
}

export async function getOrangCv(kode: string): Promise<OrangCv | null> {
  const db = getDb();
  const orangRows = await db.execute(sql`
    select o.id, o.nama, o.kode_qr, o.gender, o.kategori, o.program_teks, o.wa, o.email, o.perlu_review
    from orang o
    where o.status = 'aktif' and o.gabung_ke_id is null and upper(o.kode_qr) = ${kode.toUpperCase()}
    limit 1`);
  const o = orangRows.rows[0];
  if (!o) return null;
  const orangId = String(o.id);

  const [tautanRows, halaqahRows, badalRows, kegiatanRows] = await Promise.all([
    db.execute(sql`
      select sumber, peran, id_upstream, program_slug, nama_upstream, aktif
      from orang_tautan where orang_id = ${orangId}
      order by sumber, peran, program_slug`),
    // Halaqah yang dia pegang + pertemuan yang dia ampu di halaqah itu. Pertemuan
    // dihitung dari jadwal_sync.guru_id (per pertemuan), jadi badal tidak ikut
    // terhitung sebagai miliknya dan sebaliknya.
    db.execute(sql`
      with akun as (
        select t.program_slug, t.id_upstream::int guru_id
        from orang_tautan t
        where t.orang_id = ${orangId} and t.sumber in ('tilawah', 'mabni') and t.program_slug <> ''
      )
      select p.slug program_slug, p.name program_nama, h.tilawah_halaqah_id halaqah_id, h.name halaqah,
        (h.guru_id = a.guru_id) pemilik,
        count(j.id) filter (where j.guru_id = a.guru_id)::int diampu,
        count(j.id) filter (where j.guru_id = a.guru_id and j.status = 4)::int selesai,
        count(j.id) filter (where h.guru_id = a.guru_id and j.guru_id is not null and j.guru_id <> a.guru_id)::int dibadalkan
      from akun a
      join programs p on p.slug = a.program_slug
      join halaqah_sync h on h.program_id = p.id
      left join jadwal_sync j on j.program_id = p.id and j.tilawah_halaqah_id = h.tilawah_halaqah_id
      where h.guru_id = a.guru_id or exists (
        select 1 from jadwal_sync j2
        where j2.program_id = p.id and j2.tilawah_halaqah_id = h.tilawah_halaqah_id and j2.guru_id = a.guru_id
      )
      group by p.slug, p.name, h.tilawah_halaqah_id, h.name, (h.guru_id = a.guru_id)`),
    // Pertemuan yang dia ampu di halaqah milik orang lain.
    db.execute(sql`
      with akun as (
        select t.program_slug, t.id_upstream::int guru_id
        from orang_tautan t
        where t.orang_id = ${orangId} and t.sumber in ('tilawah', 'mabni') and t.program_slug <> ''
      )
      select count(*)::int n
      from akun a
      join programs p on p.slug = a.program_slug
      join jadwal_sync j on j.program_id = p.id and j.guru_id = a.guru_id
      join halaqah_sync h on h.program_id = p.id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
      where h.guru_id is distinct from a.guru_id`),
    db.execute(sql`
      select a.slug, a.nama, a.tanggal::text tanggal, a.pemateri, a.jam_mulai::text jam_mulai,
        a.toleransi_menit, h.waktu, p.konfirmasi
      from acara a
      left join acara_hadir h on h.acara_id = a.id and h.orang_id = ${orangId}
      left join acara_pendaftaran p on p.acara_id = a.id and p.orang_id = ${orangId}
      where h.id is not null or p.id is not null
      order by a.tanggal desc`),
  ]);

  return {
    orang: {
      id: orangId,
      nama: String(o.nama),
      kodeQr: String(o.kode_qr),
      gender: String(o.gender),
      kategori: String(o.kategori),
      programTeks: (o.program_teks as string | null) ?? null,
      wa: (o.wa as string | null) ?? null,
      email: (o.email as string | null) ?? null,
      perluReview: Boolean(o.perlu_review),
    },
    tautan: tautanRows.rows.map((t) => ({
      sumber: String(t.sumber),
      peran: String(t.peran),
      idUpstream: String(t.id_upstream),
      programSlug: String(t.program_slug),
      namaUpstream: (t.nama_upstream as string | null) ?? null,
      aktif: Boolean(t.aktif),
    })),
    halaqah: halaqahRows.rows.map((h) => ({
      programSlug: String(h.program_slug),
      programNama: String(h.program_nama),
      halaqahId: Number(h.halaqah_id),
      halaqah: String(h.halaqah ?? "—"),
      diampu: Number(h.diampu),
      selesai: Number(h.selesai),
      dibadalkan: Number(h.dibadalkan),
      pemilik: Boolean(h.pemilik),
    })),
    jadiBadal: Number(badalRows.rows[0]?.n ?? 0),
    kegiatan: kegiatanRows.rows.map((k) => ({
      slug: String(k.slug),
      nama: String(k.nama),
      tanggal: String(k.tanggal),
      pemateri: (k.pemateri as string | null) ?? null,
      jamMulai: (k.jam_mulai as string | null) ?? null,
      toleransiMenit: Number(k.toleransi_menit ?? 0),
      hadirWaktu: k.waktu ? new Date(k.waktu as string).toISOString() : null,
      konfirmasi: (k.konfirmasi as string | null) ?? null,
    })),
  };
}
