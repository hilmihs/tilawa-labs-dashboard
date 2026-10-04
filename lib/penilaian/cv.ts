import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { hurufDariRata, isNilai, median, type Nilai } from "./skala";

export type RingkasKpi = {
  kpiId: string;
  nama: string;
  jenis: string;
  /** Huruf dari median angka semua nilai (≥ 2 penilaian) atau nilai tunggal. */
  ringkas: Nilai | null;
  jumlah: number;
  riwayat: { acara: string; tanggal: string | null; nilai: Nilai; sumber: string }[];
};

export type Kepanitiaan = {
  acaraSlug: string;
  acara: string;
  tanggal: string;
  divisi: string | null;
  peran: string;
  tugasSelesai: number;
  tugasTotal: number;
  nilai: { kpi: string; nilai: Nilai }[];
  evidence: string | null;
};

export type CatatanCv = { jenis: string; isi: string; aspek: string[]; acara: string | null; tanggal: string };

/** Bagian penilaian & kepanitiaan di CV satu orang (design CV Individu c1). */
export async function getPenilaianOrang(orangId: string): Promise<{
  kpi: RingkasKpi[];
  kepanitiaan: Kepanitiaan[];
  catatan: CatatanCv[];
}> {
  const db = getDb();
  const [nilaiRes, panitiaRes, catatanRes] = await Promise.all([
    db.execute(sql`
      select k.id kpi_id, k.nama, k.jenis, k.urutan, n.nilai, n.nilai_angka, n.sumber, a.nama acara, a.tanggal::text tanggal
      from penilaian n
      join kpi_rubrik k on k.id = n.kpi_id
      left join acara a on a.id = n.acara_id
      where n.orang_id = ${orangId}
      order by k.urutan, a.tanggal desc nulls last`),
    db.execute(sql`
      select a.id acara_id, a.slug, a.nama acara, a.tanggal::text tanggal, d.nama divisi, p.peran,
        count(t.id) filter (where t.status in ('selesai', 'disetujui'))::int tugas_selesai, count(t.id)::int tugas_total
      from acara_panitia p
      join acara a on a.id = p.acara_id
      left join acara_divisi d on d.id = p.divisi_id
      left join acara_tugas t on t.acara_id = p.acara_id and t.panitia_id = p.id
      where p.orang_id = ${orangId} and p.status <> 'mundur'
      group by a.id, d.nama, p.peran
      order by a.tanggal desc`),
    db.execute(sql`
      select c.jenis, c.isi, c.aspek, a.nama acara, a.id acara_id, c.updated_at::text tanggal
      from catatan_orang c left join acara a on a.id = c.acara_id
      where c.orang_id = ${orangId}
      order by c.updated_at desc limit 30`),
  ]);

  const perKpi = new Map<string, RingkasKpi & { _angka: number[] }>();
  const nilaiPerAcara = new Map<string, { kpi: string; nilai: Nilai }[]>();
  for (const r of nilaiRes.rows as Record<string, unknown>[]) {
    if (!isNilai(r.nilai)) continue;
    const id = String(r.kpi_id);
    const e = perKpi.get(id) ?? { kpiId: id, nama: String(r.nama), jenis: String(r.jenis), ringkas: null, jumlah: 0, riwayat: [], _angka: [] };
    e.jumlah += 1;
    e._angka.push(Number(r.nilai_angka));
    e.riwayat.push({ acara: String(r.acara ?? "—"), tanggal: (r.tanggal as string | null) ?? null, nilai: r.nilai, sumber: String(r.sumber) });
    perKpi.set(id, e);
  }
  const kpi = [...perKpi.values()].map(({ _angka, ...k }) => {
    const m = median(_angka);
    return { ...k, ringkas: m == null ? null : hurufDariRata(m) };
  });

  // Nilai per acara untuk tabel kepanitiaan (butuh acara_id; ambil ulang ringkas).
  const nilaiAcara = await db.execute(sql`
    select n.acara_id, k.nama kpi, n.nilai from penilaian n join kpi_rubrik k on k.id = n.kpi_id
    where n.orang_id = ${orangId} and n.acara_id is not null order by k.urutan`);
  for (const r of nilaiAcara.rows as { acara_id: string; kpi: string; nilai: string }[]) {
    if (!isNilai(r.nilai)) continue;
    const arr = nilaiPerAcara.get(r.acara_id) ?? [];
    if (!arr.some((x) => x.kpi === r.kpi)) arr.push({ kpi: r.kpi, nilai: r.nilai });
    nilaiPerAcara.set(r.acara_id, arr);
  }
  const evidencePerAcara = new Map<string, string>();
  for (const r of catatanRes.rows as Record<string, unknown>[]) {
    if (r.jenis === "evidence" && r.acara_id && !evidencePerAcara.has(String(r.acara_id))) evidencePerAcara.set(String(r.acara_id), String(r.isi));
  }

  const kepanitiaan: Kepanitiaan[] = (panitiaRes.rows as Record<string, unknown>[]).map((r) => ({
    acaraSlug: String(r.slug),
    acara: String(r.acara),
    tanggal: String(r.tanggal),
    divisi: (r.divisi as string | null) ?? null,
    peran: String(r.peran),
    tugasSelesai: Number(r.tugas_selesai),
    tugasTotal: Number(r.tugas_total),
    nilai: nilaiPerAcara.get(String(r.acara_id)) ?? [],
    evidence: evidencePerAcara.get(String(r.acara_id)) ?? null,
  }));

  const catatan: CatatanCv[] = (catatanRes.rows as Record<string, unknown>[]).map((r) => ({
    jenis: String(r.jenis),
    isi: String(r.isi),
    aspek: Array.isArray(r.aspek) ? (r.aspek as string[]) : [],
    acara: (r.acara as string | null) ?? null,
    tanggal: String(r.tanggal).slice(0, 10),
  }));

  return { kpi, kepanitiaan, catatan };
}
