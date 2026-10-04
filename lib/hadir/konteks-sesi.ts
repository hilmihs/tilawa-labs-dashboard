import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Konteks satu sesi untuk panel hari-H (design "Acara" a3): hadir sesi
 * sebelumnya dalam seri yang sama (untuk delta "▲ 12 vs pekan lalu") dan
 * jumlah wajah baru — yang hadir di sesi ini tanpa pernah hadir di acara mana
 * pun sebelumnya. Sesi tanpa seri tidak punya pembanding.
 */
export async function getKonteksSesi(acara: { id: string; seri: string | null; tanggal: string }): Promise<{
  sebelumnya: { nama: string; tanggal: string; hadir: number } | null;
  wajahBaru: number;
}> {
  const db = getDb();
  const [sebelumRes, baruRes] = await Promise.all([
    acara.seri
      ? db.execute(sql`
          select a.nama, a.tanggal::text tanggal, count(h.id)::int hadir
          from acara a left join acara_hadir h on h.acara_id = a.id
          where a.seri = ${acara.seri} and a.tanggal < ${acara.tanggal}::date and a.id <> ${acara.id}
          group by a.id order by a.tanggal desc limit 1`)
      : Promise.resolve({ rows: [] }),
    db.execute(sql`
      select count(*)::int n from acara_hadir h
      where h.acara_id = ${acara.id} and not exists (
        select 1 from acara_hadir h2 join acara a2 on a2.id = h2.acara_id
        where h2.orang_id = h.orang_id and h2.acara_id <> ${acara.id} and a2.tanggal < ${acara.tanggal}::date
      )`),
  ]);
  const s = sebelumRes.rows[0] as { nama: string; tanggal: string; hadir: number } | undefined;
  return { sebelumnya: s ? { ...s, hadir: Number(s.hadir) } : null, wajahBaru: Number((baruRes.rows[0] as { n: number } | undefined)?.n ?? 0) };
}
