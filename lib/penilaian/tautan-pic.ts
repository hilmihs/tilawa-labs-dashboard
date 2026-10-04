import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { signDivisiToken } from "@/lib/auth/divisi-token";
import { baseUrl } from "@/lib/hadir/base-url";
import { waLink } from "@/lib/wa";

export type TautanPic = {
  divisiId: string;
  divisi: string;
  sisi: string;
  pic: string | null;
  url: string;
  /** wa.me ke PIC dengan pesan terisi; null bila PIC tanpa nomor. */
  waHref: string | null;
  anggota: number;
  dinilaiPic: number;
};

/**
 * Tautan penilaian per divisi untuk dikirim ke PIC (design p2 "Link ke PIC").
 * Token yang sama dengan papan divisi (scope divisi, versi token_versi) —
 * menaikkan token_versi mematikan keduanya sekaligus. Pesan WA dikirim oleh
 * manusia lewat wa.me; tidak ada pengiriman otomatis.
 */
export async function getTautanPic(acara: { id: string; slug: string; nama: string }): Promise<TautanPic[]> {
  const rows = (
    await getDb().execute(sql`
      select d.id, d.nama, d.sisi, d.token_versi, d.urutan,
        (select coalesce(p.gelar || ' ', '') || p.nama from acara_panitia p
          where p.divisi_id = d.id and p.peran = 'pic' and p.status <> 'mundur' order by p.created_at limit 1) pic,
        (select p.wa from acara_panitia p
          where p.divisi_id = d.id and p.peran = 'pic' and p.status <> 'mundur' order by p.created_at limit 1) pic_wa,
        (select count(*) from acara_panitia p
          where p.divisi_id = d.id and p.status <> 'mundur'
            and p.peran not in ('pic', 'koordinator', 'ketua', 'pengawas'))::int anggota,
        (select count(distinct n.orang_id) from penilaian n join acara_panitia p on p.orang_id = n.orang_id
          where n.acara_id = d.acara_id and n.sumber = 'link_pic' and p.divisi_id = d.id)::int dinilai_pic
      from acara_divisi d
      where d.acara_id = ${acara.id}
      order by d.urutan, d.nama`)
  ).rows as Record<string, unknown>[];
  const base = await baseUrl();
  return Promise.all(
    rows.map(async (r) => {
      const token = await signDivisiToken({ did: String(r.id), slug: acara.slug, v: Number(r.token_versi) });
      const url = `${base}/acara/d/${token}/nilai`;
      const pic = (r.pic as string | null) ?? null;
      const pesan =
        `Assalamu'alaikum ${pic ?? ""}. Mohon bantu nilai anggota divisi ${r.nama} di ${acara.nama} — ±2 menit, ` +
        `satu layar per anggota: ${url}\nJazakumullahu khairan.`;
      return {
        divisiId: String(r.id),
        divisi: String(r.nama),
        sisi: String(r.sisi),
        pic,
        url,
        waHref: waLink(r.pic_wa as string | null, pesan),
        anggota: Number(r.anggota),
        dinilaiPic: Number(r.dinilai_pic),
      };
    }),
  );
}
