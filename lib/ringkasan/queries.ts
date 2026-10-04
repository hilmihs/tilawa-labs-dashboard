import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { tanggalBulan } from "@/lib/ringkasan/hitung";

export type BarisPeserta = {
  id: string;
  tilawahUserId: number;
  nama: string;
  halaqah: string | null;
  phone: string | null;
  mulai: string;
  selesai: string | null;
  /** Tanggal setor di bulan ini, "YYYY-MM-DD". */
  setor: string[];
};

export type RosterItem = {
  tilawahUserId: number;
  nama: string;
  halaqah: string | null;
  aktif: boolean;
};

/**
 * Peserta yang rentangnya menyentuh bulan itu, beserta setorannya. Nama & nomor
 * dari cermin roster (students_sync); peserta yang sudah hilang dari roster
 * tetap tampil dengan nama "(akun #id)" supaya riwayatnya tidak lenyap.
 */
export async function loadRingkasanBulan(programId: string, bulan: string): Promise<BarisPeserta[]> {
  const hari = tanggalBulan(bulan);
  const awal = hari[0];
  const akhir = hari[hari.length - 1];
  const db = getDb();
  const res = await db.execute(sql`
    select rp.id, rp.tilawah_user_id, rp.mulai::text as mulai, rp.selesai::text as selesai,
           ss.name as nama, ss.phone, hs.name as halaqah,
           coalesce(array_agg(rs.tanggal::text order by rs.tanggal)
                    filter (where rs.tanggal is not null), '{}') as setor
    from ringkasan_peserta rp
    left join students_sync ss
      on ss.program_id = rp.program_id and ss.tilawah_user_id = rp.tilawah_user_id
    left join halaqah_sync hs
      on hs.program_id = rp.program_id and hs.tilawah_halaqah_id = ss.halaqah_id
    left join ringkasan_setor rs
      on rs.peserta_id = rp.id and rs.tanggal between ${awal}::date and ${akhir}::date
    where rp.program_id = ${programId}
      and rp.mulai <= ${akhir}::date
      and (rp.selesai is null or rp.selesai >= ${awal}::date)
      -- dikeluarkan di hari yang sama saat ditambahkan: selesai (kemarin) < mulai,
      -- belum pernah wajib setor satu hari pun, jadi tidak tampil di bulan mana pun.
      and (rp.selesai is null or rp.selesai >= rp.mulai)
    group by rp.id, ss.name, ss.phone, hs.name
    order by hs.name nulls last, ss.name
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    tilawahUserId: Number(r.tilawah_user_id),
    nama: (r.nama as string | null) ?? `(akun #${r.tilawah_user_id})`,
    halaqah: (r.halaqah as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    mulai: String(r.mulai),
    selesai: (r.selesai as string | null) ?? null,
    setor: (r.setor as string[]) ?? [],
  }));
}

/** Roster aktif program + penanda sedang ikut ceklis (selesai null). */
export async function loadRosterRingkasan(programId: string): Promise<RosterItem[]> {
  const db = getDb();
  const res = await db.execute(sql`
    select ss.tilawah_user_id, ss.name as nama, hs.name as halaqah,
           (rp.id is not null and rp.selesai is null) as aktif
    from students_sync ss
    left join halaqah_sync hs
      on hs.program_id = ss.program_id and hs.tilawah_halaqah_id = ss.halaqah_id
    left join ringkasan_peserta rp
      on rp.program_id = ss.program_id and rp.tilawah_user_id = ss.tilawah_user_id
    where ss.program_id = ${programId} and ss.enrollment_status_code = 1
    order by hs.name nulls last, ss.name
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    tilawahUserId: Number(r.tilawah_user_id),
    nama: String(r.nama ?? `(akun #${r.tilawah_user_id})`),
    halaqah: (r.halaqah as string | null) ?? null,
    aktif: Boolean(r.aktif),
  }));
}
