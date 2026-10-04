import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jakartaDate } from "@/lib/time/jakarta";
import { KEGIATAN, PERAN_RIWAYAT, TAHUN_RIWAYAT } from "./riwayat-template";
import { susunTrackRecord, type BarisTahun } from "./track-record";

export type EntriRiwayat = { tahun: number; kegiatan: string; peran: string; status: string };

export async function listRiwayatMandiri(orangId: string): Promise<EntriRiwayat[]> {
  return (
    await getDb().execute(sql`
      select tahun, kegiatan, peran, status from riwayat_mandiri where orang_id = ${orangId} order by tahun, kegiatan`)
  ).rows as EntriRiwayat[];
}

/**
 * Simpan isian mandiri: yang dicentang disisipkan (status menunggu), yang
 * tidak lagi dicentang dan masih menunggu dihapus. Yang sudah diverifikasi
 * atau ditolak tidak disentuh — keputusan tim menang atas isian ulang.
 */
export async function simpanRiwayatMandiri(
  orangId: string,
  entri: { tahun: number; kegiatan: string; peran: string }[],
): Promise<{ disimpan: number }> {
  const kodeSah = new Set(KEGIATAN.map((k) => k.kode));
  const bersih = entri
    .filter(
      (e) =>
        (TAHUN_RIWAYAT as readonly number[]).includes(e.tahun) &&
        (PERAN_RIWAYAT as readonly string[]).includes(e.peran) &&
        (kodeSah.has(e.kegiatan) || (/^lain:.{2,80}$/.test(e.kegiatan) && !/[<>]/.test(e.kegiatan))),
    )
    .slice(0, 120);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from riwayat_mandiri where orang_id = ${orangId} and status = 'menunggu'`);
    for (const e of bersih) {
      await tx.execute(sql`
        insert into riwayat_mandiri (orang_id, tahun, kegiatan, peran)
        values (${orangId}, ${e.tahun}, ${e.kegiatan}, ${e.peran})
        on conflict (orang_id, tahun, kegiatan, peran) do nothing`);
    }
  });
  return { disimpan: bersih.length };
}

export type AntreanRiwayat = {
  orangId: string;
  nama: string;
  kodeQr: string;
  entri: { id: string; tahun: number; kegiatan: string; peran: string; createdAt: string }[];
};

/** Isian yang menunggu verifikasi, per orang (terbaru dulu). */
export async function antreanRiwayat(): Promise<AntreanRiwayat[]> {
  const rows = (
    await getDb().execute(sql`
      select r.id, r.tahun, r.kegiatan, r.peran, r.created_at::text created_at, o.id orang_id, o.nama, o.kode_qr
      from riwayat_mandiri r join orang o on o.id = r.orang_id
      where r.status = 'menunggu'
      order by r.created_at desc, r.tahun`)
  ).rows as Record<string, string | number>[];
  const per = new Map<string, AntreanRiwayat>();
  for (const r of rows) {
    const id = String(r.orang_id);
    const e = per.get(id) ?? { orangId: id, nama: String(r.nama), kodeQr: String(r.kode_qr), entri: [] };
    e.entri.push({ id: String(r.id), tahun: Number(r.tahun), kegiatan: String(r.kegiatan), peran: String(r.peran), createdAt: String(r.created_at) });
    per.set(id, e);
  }
  return [...per.values()];
}

export async function verifikasiRiwayat(ids: string[], status: "terverifikasi" | "ditolak", staffId: string): Promise<number> {
  const uuid = /^[0-9a-f-]{36}$/i;
  const sah = ids.filter((i) => uuid.test(i)).slice(0, 500);
  if (!sah.length) return 0;
  const res = await getDb().execute(sql`
    update riwayat_mandiri set status = ${status}, diverifikasi_oleh = ${staffId}, diverifikasi_at = now(), updated_at = now()
    where status = 'menunggu' and id = any(array[${sql.join(sah.map((i) => sql`${i}`), sql`, `)}]::uuid[])
    returning id`);
  return res.rows.length;
}

/** Track record per tahun untuk CV: 2022 s.d. tahun ini, data sistem + riwayat mandiri. */
export async function getTrackRecord(orangId: string): Promise<BarisTahun[]> {
  const db = getDb();
  const [hadir, panitia, mandiri] = await Promise.all([
    db.execute(sql`
      select extract(year from a.tanggal)::int tahun, a.seri, a.nama acara
      from acara_hadir h join orang o on o.id = h.orang_id join acara a on a.id = h.acara_id
      where coalesce(o.gabung_ke_id, o.id) = ${orangId}`),
    db.execute(sql`
      select extract(year from a.tanggal)::int tahun, a.nama acara, p.peran
      from acara_panitia p join acara a on a.id = p.acara_id
      where p.orang_id = ${orangId} and p.status <> 'mundur'
      order by a.tanggal`),
    listRiwayatMandiri(orangId),
  ]);
  const tahunIni = Number(jakartaDate().slice(0, 4));
  const tahun: number[] = [];
  for (let t = TAHUN_RIWAYAT[0]; t <= tahunIni; t++) tahun.push(t);
  return susunTrackRecord({
    tahun,
    hadir: hadir.rows as { tahun: number; seri: string | null; acara: string }[],
    panitia: panitia.rows as { tahun: number; acara: string; peran: string }[],
    mandiri,
  });
}
