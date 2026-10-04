import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export type OrangEkspor = { id: string; nama: string; programTeks: string | null; gender: string; kodeQr: string };

/**
 * Orang aktif (kanonik) yang TIDAK terdaftar dan TIDAK hadir di satu pun
 * acara `kecualiSlug` — mis. "semua orang di luar kajian pembekalan", untuk
 * dibuatkan kartu QR sekaligus. Pendaftaran/hadir milik akun yang sudah
 * digabung dihitung ke orang kanoniknya (`coalesce(gabung_ke_id, id)`), jadi
 * orang yang mendaftar lewat akun lamanya tetap dianggap sudah terdaftar.
 *
 * Peserta kelas (kategori 'peserta', lib/orang/sinkron-peserta.ts) tidak ikut:
 * zip ini untuk kajian pengajar/pengurus, dan ratusan murid akan menenggelamkannya.
 * Kartu peserta dicetak per kelas di /orang/kartu?kelompok=peserta….
 */
export async function listOrangDiLuarAcara(kecualiSlug: string[]): Promise<OrangEkspor[]> {
  const db = getDb();
  const slugs = kecualiSlug.length ? sql.join(kecualiSlug.map((s) => sql`${s}`), sql`, `) : sql`null`;
  const rows = await db.execute(sql`
    with tercatat as (
      select coalesce(o.gabung_ke_id, o.id) as id
        from acara a
        join acara_pendaftaran p on p.acara_id = a.id
        join orang o on o.id = p.orang_id
       where a.slug in (${slugs})
      union
      select coalesce(o.gabung_ke_id, o.id)
        from acara a
        join acara_hadir h on h.acara_id = a.id
        join orang o on o.id = h.orang_id
       where a.slug in (${slugs})
    )
    select o.id, o.nama, o.program_teks, o.gender, o.kode_qr
      from orang o
     where o.gabung_ke_id is null and o.status = 'aktif' and o.kategori <> 'peserta'
       and o.id not in (select id from tercatat)
     order by o.nama
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nama: String(r.nama),
    programTeks: (r.program_teks as string | null) ?? null,
    gender: String(r.gender),
    kodeQr: String(r.kode_qr),
  }));
}
