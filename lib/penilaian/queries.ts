import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ANGKA, isNilai, saranTepatWaktu, type Nilai } from "./skala";

export type Kpi = { id: string; kode: string; nama: string; jenis: string; otomatis: boolean; versi: number; deskripsi: Record<string, string> };

export type AcaraPenilaian = {
  id: string;
  slug: string;
  nama: string;
  tanggal: string;
  status: string;
  panitia: number;
  dinilai: number;
  belumTertaut: number;
};

/** Acara yang punya panitia — calon grid penilaian. Selesai & terbaru di atas. */
export async function daftarAcaraPenilaian(): Promise<AcaraPenilaian[]> {
  const rows = await getDb().execute(sql`
    select a.id, a.slug, a.nama, a.tanggal::text tanggal, a.status,
      count(distinct p.id)::int panitia,
      count(distinct p.id) filter (where p.orang_id is null)::int belum_tertaut,
      count(distinct n.orang_id)::int dinilai
    from acara a
    join acara_panitia p on p.acara_id = a.id and p.status <> 'mundur'
    left join penilaian n on n.acara_id = a.id and n.orang_id = p.orang_id
    group by a.id
    order by (a.status = 'selesai') desc, a.tanggal desc`);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    nama: String(r.nama),
    tanggal: String(r.tanggal),
    status: String(r.status),
    panitia: Number(r.panitia),
    dinilai: Number(r.dinilai),
    belumTertaut: Number(r.belum_tertaut),
  }));
}

export async function kpiPanitia(): Promise<Kpi[]> {
  const rows = await getDb().execute(sql`
    select id, kode, nama, jenis, otomatis, versi, deskripsi from kpi_rubrik
    where aktif and berlaku_untuk = 'panitia' order by urutan, nama`);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    kode: String(r.kode),
    nama: String(r.nama),
    jenis: String(r.jenis),
    otomatis: r.otomatis === true,
    versi: Number(r.versi),
    deskripsi: (r.deskripsi as Record<string, string>) ?? {},
  }));
}

export type BarisGrid = {
  panitiaId: string;
  orangId: string | null;
  kodeQr: string | null;
  nama: string;
  gender: string;
  peran: string;
  divisi: string | null;
  sisi: string | null;
  hadirWaktu: string | null;
  tugasSelesai: number;
  tugasTotal: number;
  /** kpiId → nilai tersimpan dari grid (sumber 'grid'). */
  nilai: Record<string, Nilai>;
  /** kpiId → saran otomatis (hanya KPI otomatis, bila ada data). */
  saran: Record<string, Nilai>;
  /** kpiId → nilai dari sumber lain (link PIC, impor) — tampil sebagai petunjuk. */
  lain: Record<string, { nilai: Nilai; sumber: string }[]>;
  evidence: string;
};

export type Grid = {
  acara: { id: string; slug: string; nama: string; tanggal: string; status: string; jamMulai: string | null; toleransiMenit: number };
  kpi: Kpi[];
  baris: BarisGrid[];
};

export async function getGrid(slug: string): Promise<Grid | null> {
  const db = getDb();
  const a = (
    await db.execute(sql`
      select id, slug, nama, tanggal::text tanggal, status, jam_mulai::text jam_mulai, toleransi_menit
      from acara where slug = ${slug} limit 1`)
  ).rows[0] as Record<string, unknown> | undefined;
  if (!a) return null;
  const acara = {
    id: String(a.id),
    slug: String(a.slug),
    nama: String(a.nama),
    tanggal: String(a.tanggal),
    status: String(a.status),
    jamMulai: (a.jam_mulai as string | null) ?? null,
    toleransiMenit: Number(a.toleransi_menit ?? 15),
  };
  const [kpi, panitiaRes, nilaiRes, evRes] = await Promise.all([
    kpiPanitia(),
    db.execute(sql`
      select p.id, p.orang_id, o.kode_qr, p.nama, p.gender, p.peran, d.nama divisi, d.sisi, d.urutan,
        h.waktu::text hadir_waktu,
        count(t.id) filter (where t.status in ('selesai', 'disetujui'))::int tugas_selesai,
        count(t.id)::int tugas_total
      from acara_panitia p
      left join acara_divisi d on d.id = p.divisi_id
      left join orang o on o.id = p.orang_id
      left join acara_hadir h on h.acara_id = p.acara_id and h.orang_id = p.orang_id
      left join acara_tugas t on t.acara_id = p.acara_id and t.panitia_id = p.id
      where p.acara_id = ${acara.id} and p.status <> 'mundur'
      group by p.id, o.kode_qr, d.nama, d.sisi, d.urutan, h.waktu
      order by d.urutan nulls first, d.nama nulls first,
        case p.peran when 'ketua' then 0 when 'koordinator' then 1 when 'pic' then 2 else 3 end, p.nama`),
    db.execute(sql`
      select orang_id, kpi_id, nilai, sumber from penilaian where acara_id = ${acara.id}`),
    db.execute(sql`
      select orang_id, isi from catatan_orang where acara_id = ${acara.id} and jenis = 'evidence'
      order by updated_at desc`),
  ]);

  const nilaiPerOrang = new Map<string, { kpi: string; nilai: string; sumber: string }[]>();
  for (const r of nilaiRes.rows as { orang_id: string; kpi_id: string; nilai: string; sumber: string }[]) {
    nilaiPerOrang.set(r.orang_id, [...(nilaiPerOrang.get(r.orang_id) ?? []), { kpi: r.kpi_id, nilai: r.nilai, sumber: r.sumber }]);
  }
  const evidence = new Map<string, string>();
  for (const r of evRes.rows as { orang_id: string; isi: string }[]) if (!evidence.has(r.orang_id)) evidence.set(r.orang_id, r.isi);
  const kpiOtomatis = kpi.filter((k) => k.otomatis && k.kode === "tepat_waktu");

  const baris: BarisGrid[] = (panitiaRes.rows as Record<string, unknown>[]).map((r) => {
    const orangId = (r.orang_id as string | null) ?? null;
    const nilai: Record<string, Nilai> = {};
    const lain: BarisGrid["lain"] = {};
    for (const n of (orangId && nilaiPerOrang.get(orangId)) || []) {
      if (!isNilai(n.nilai)) continue;
      if (n.sumber === "grid") nilai[n.kpi] = n.nilai;
      else lain[n.kpi] = [...(lain[n.kpi] ?? []), { nilai: n.nilai, sumber: n.sumber }];
    }
    const hadirWaktu = (r.hadir_waktu as string | null) ?? null;
    const saran: Record<string, Nilai> = {};
    for (const k of kpiOtomatis) {
      const s = saranTepatWaktu(hadirWaktu, acara);
      if (s) saran[k.id] = s;
    }
    return {
      panitiaId: String(r.id),
      orangId,
      kodeQr: (r.kode_qr as string | null) ?? null,
      nama: String(r.nama),
      gender: String(r.gender),
      peran: String(r.peran),
      divisi: (r.divisi as string | null) ?? null,
      sisi: (r.sisi as string | null) ?? null,
      hadirWaktu,
      tugasSelesai: Number(r.tugas_selesai),
      tugasTotal: Number(r.tugas_total),
      nilai,
      saran,
      lain,
      evidence: (orangId && evidence.get(orangId)) || "",
    };
  });
  return { acara, kpi, baris };
}

export type IsianGrid = {
  panitiaId: string;
  /** kpiId → nilai; "" = kosongkan. */
  nilai: Record<string, Nilai | "">;
  evidence: string;
};

/**
 * Simpan isian grid satu acara. Nilai sumber 'grid' di-upsert/dihapus per
 * orang × KPI; evidence = satu catatan 'evidence' per orang × acara.
 * Baris panitia tanpa orang dilewati (dilaporkan ke pemanggil).
 */
export async function simpanGrid(
  acaraId: string,
  isian: IsianGrid[],
  staffId: string,
): Promise<{ disimpan: number; dihapus: number; dilewati: string[] }> {
  const db = getDb();
  const kpi = new Map((await kpiPanitia()).map((k) => [k.id, k]));
  const panitia = new Map(
    (
      (await db.execute(sql`select id, orang_id, nama from acara_panitia where acara_id = ${acaraId}`)).rows as {
        id: string;
        orang_id: string | null;
        nama: string;
      }[]
    ).map((p) => [p.id, p]),
  );
  let disimpan = 0;
  let dihapus = 0;
  const dilewati: string[] = [];
  await db.transaction(async (tx) => {
    for (const row of isian) {
      const p = panitia.get(row.panitiaId);
      if (!p) continue;
      if (!p.orang_id) {
        dilewati.push(p.nama);
        continue;
      }
      for (const [kpiId, v] of Object.entries(row.nilai)) {
        const k = kpi.get(kpiId);
        if (!k) continue;
        if (v === "") {
          const del = await tx.execute(sql`
            delete from penilaian where orang_id = ${p.orang_id} and acara_id = ${acaraId} and kpi_id = ${kpiId} and sumber = 'grid'
            returning id`);
          dihapus += del.rows.length;
          continue;
        }
        if (!isNilai(v)) continue;
        await tx.execute(sql`
          insert into penilaian (orang_id, acara_id, panitia_id, kpi_id, kpi_versi, nilai, nilai_angka, sumber, penilai_staff_id)
          values (${p.orang_id}, ${acaraId}, ${p.id}, ${kpiId}, ${k.versi}, ${v}, ${ANGKA[v]}, 'grid', ${staffId})
          on conflict (orang_id, acara_id, kpi_id, sumber) do update set
            nilai = excluded.nilai, nilai_angka = excluded.nilai_angka, kpi_versi = excluded.kpi_versi,
            panitia_id = excluded.panitia_id, penilai_staff_id = excluded.penilai_staff_id, updated_at = now()`);
        disimpan++;
      }
      const ev = row.evidence.trim().slice(0, 1000);
      await tx.execute(sql`delete from catatan_orang where orang_id = ${p.orang_id} and acara_id = ${acaraId} and jenis = 'evidence'`);
      if (ev) {
        await tx.execute(sql`
          insert into catatan_orang (orang_id, acara_id, jenis, isi, oleh_staff_id)
          values (${p.orang_id}, ${acaraId}, 'evidence', ${ev}, ${staffId})`);
      }
    }
  });
  return { disimpan, dihapus, dilewati };
}
