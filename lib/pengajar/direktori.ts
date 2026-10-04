import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bukanAkunSampah, bukanKelasDemo, pesertaAktif } from "@/lib/enrollment";
import { DUPLICATE_GURU_ACCOUNTS } from "@/lib/guru/duplicates";
import { KEPUTUSAN_IDENTITAS } from "@/lib/orang/keputusan";
import { defaultBatchScope } from "@/lib/programs/batches";
import { getAccessiblePrograms, type Program } from "@/lib/programs/resolve";
import type { SessionPayload } from "@/lib/auth/session";
import {
  rapikanBatch,
  susunDirektori,
  type GuruTerdaftar,
  type HalaqahMasukan,
  type MaahirMasukan,
  type PengajarBaris,
  type SumberGuru,
  type TautanOrang,
} from "./direktori-view";

const SUMBER: Record<string, SumberGuru> = { tilawah_api: "tilawah", mabni_api: "mabni" };

/**
 * Direktori pengajar lintas program yang boleh dilihat `user` — aturan barisnya
 * di `./direktori-view.ts`. Hanya program tilawah & mabni: Maahir tidak punya
 * halaqah di cermin, HKM-berkah tidak punya pengajar.
 */
export async function getDirektoriPengajar(user: SessionPayload): Promise<{
  rows: PengajarBaris[];
  sinkronTertua: Date | null;
  kajianTotal: number;
}> {
  return getDirektoriPengajarUntuk(await getAccessiblePrograms(user));
}

/** Inti tanpa sesi — dipakai juga Beranda/halaman publik untuk angka Pengajar. */
export async function getDirektoriPengajarUntuk(visible: Program[]): Promise<{
  rows: PengajarBaris[];
  sinkronTertua: Date | null;
  /** Kajian Div. Kaderisasi yang sudah punya presensi — penyebut kolom Kajian. */
  kajianTotal: number;
}> {
  const programs = visible.filter((p) => SUMBER[p.dataSourceType]);
  const lihatMaahir = visible.some((p) => p.dataSourceType === "maahir_api");
  if (programs.length === 0 && !lihatMaahir) return { rows: [], sinkronTertua: null, kajianTotal: 0 };
  const db = getDb();
  const byId = new Map(programs.map((p) => [p.id, p]));
  // Array kosong tetap bertipe (uuid[]) supaya `= any(...)` sah saat hanya Maahir yang terlihat.
  const ids = programs.length
    ? sql`array[${sql.join(programs.map((p) => sql`${p.id}`), sql`, `)}]::uuid[]`
    : sql`array[]::uuid[]`;

  const [halaqahRes, guruRes, tautanRes, badalRes, kajianRes, maahir] = await Promise.all([
    // Halaqah berjalan: ≥ 1 peserta aktif, bukan kelas DEMO.
    db.execute(sql`
      with aktif as (
        select s.program_id, s.halaqah_id, count(*)::int n
        from students_sync s
        where s.program_id = any(${ids}) and s.halaqah_id is not null and ${pesertaAktif("s")}
          and ${bukanAkunSampah("s.name")}
        group by 1, 2
      )
      select h.program_id, h.tilawah_batch_id, h.guru_id, h.pengajar, h.guru_phone,
        coalesce(h.nama_tampil, h.name) halaqah,
        h.raw->'batch'->>'name' batch_nama,
        h.raw->'kelas'->'periode'->>'nama' periode,
        h.synced_at, h.raw->'gurus' gurus,
        a.n peserta,
        g.name guru_nama, g.gender guru_gender, g.phone guru_hp
      from halaqah_sync h
      join aktif a on a.program_id = h.program_id and a.halaqah_id = h.tilawah_halaqah_id
      left join guru_sync g on g.program_id = h.program_id and g.tilawah_guru_id = h.guru_id
      where h.program_id = any(${ids}) and ${bukanKelasDemo("h.name")}`),
    // Akun guru terdaftar per batch — sumber daftar "tanpa halaqah".
    db.execute(sql`
      select g.program_id, g.tilawah_batch_id, g.tilawah_guru_id, g.name, g.gender, g.phone
      from guru_sync g
      where g.program_id = any(${ids})`),
    // Semua tautan akun → orang kanonik (yang digabung menunjuk ke kanoniknya).
    db.execute(sql`
      select t.sumber, t.peran, t.id_upstream, c.id orang_id, c.nama, c.kode_qr, c.gender, c.wa, c.qism, c.mustawa
      from orang_tautan t
      join orang o on o.id = t.orang_id
      join orang c on c.id = coalesce(o.gabung_ke_id, o.id)
      -- Tanpa filter t.aktif: sinkron orang menandai akun yang tidak memegang halaqah
      -- aktif=false, padahal tautannya tetap benar. Dengan filter itu akun "terdaftar
      -- tanpa halaqah" kehilangan orangnya dan muncul sebagai baris kedua.
      where c.status = 'aktif'`),
    // Badal: pertemuan yang sudah lewat, diampu guru lain dari pengajar utamanya.
    db.execute(sql`
      select p.data_source_type src, j.guru_id, count(*)::int n
      from jadwal_sync j
      join halaqah_sync h on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
      join programs p on p.id = j.program_id
      where j.program_id = any(${ids}) and j.guru_id is not null
        and j.guru_id is distinct from h.guru_id and j.schedule_date <= current_date
        and ${bukanKelasDemo("h.name")}
      group by 1, 2`),
    // Kajian Div. Kaderisasi yang dihadiri, per orang kanonik.
    db.execute(sql`
      select coalesce(o.gabung_ke_id, o.id) orang_id, count(distinct h.acara_id)::int n,
        (select count(distinct acara_id)::int from acara_hadir) total
      from acara_hadir h join orang o on o.id = h.orang_id
      group by 1`),
    lihatMaahir ? bacaMaahir() : Promise.resolve(null),
  ]);

  // Label batch per (program, batch id) dari halaqah — guru_sync tak membawa nama batch.
  const labelBatch = new Map<string, string | null>();
  let sinkronTertua: Date | null = null;
  const akunGuru = new Map<string, { name: string | null; gender: number | null; phone: string | null }>();
  for (const r of guruRes.rows as Record<string, unknown>[]) {
    akunGuru.set(`${r.program_id}:${r.tilawah_guru_id}`, {
      name: (r.name as string | null) ?? null,
      gender: r.gender == null ? null : Number(r.gender),
      phone: (r.phone as string | null) ?? null,
    });
  }
  const halaqah: HalaqahMasukan[] = [];
  for (const r of halaqahRes.rows as Record<string, unknown>[]) {
    const p = byId.get(String(r.program_id));
    if (!p) continue;
    // Lingkup batch program (sama dengan tabel halaqah di dashboard): halaqah
    // nyasar dari batch lain yang masih tertinggal di cermin tidak dihitung.
    const scope = defaultBatchScope(p);
    const batchId = r.tilawah_batch_id == null ? null : Number(r.tilawah_batch_id);
    if (scope != null && batchId != null && batchId !== scope) continue;
    const batch = rapikanBatch((r.batch_nama as string | null) ?? (r.periode as string | null));
    labelBatch.set(`${p.id}:${batchId}`, batch);
    const t = r.synced_at ? new Date(String(r.synced_at)) : null;
    if (t && (!sinkronTertua || t < sinkronTertua)) sinkronTertua = t;
    const dasar = {
      sumber: SUMBER[p.dataSourceType],
      programSlug: p.slug,
      programNama: p.name,
      batch,
      halaqah: String(r.halaqah ?? "-"),
      peserta: Number(r.peserta ?? 0),
    };
    const guruId = r.guru_id == null ? null : Number(r.guru_id);
    halaqah.push({
      ...dasar,
      guruId,
      guruNama: (r.guru_nama as string | null) ?? null,
      pengajar: (r.pengajar as string | null) ?? null,
      guruGender: r.guru_gender == null ? null : Number(r.guru_gender),
      guruHp: (r.guru_hp as string | null) || (r.guru_phone as string | null) || null,
    });
    // Mabni: semua pengajar kelas ada di raw.gurus; selain pengajar utama = pendamping.
    if (dasar.sumber === "mabni" && Array.isArray(r.gurus)) {
      for (const g of r.gurus as { id?: unknown; nama?: unknown }[]) {
        const id = Number(g.id);
        if (!Number.isInteger(id) || id === guruId) continue;
        const akun = akunGuru.get(`${p.id}:${id}`);
        halaqah.push({
          ...dasar,
          guruId: id,
          guruNama: akun?.name ?? (typeof g.nama === "string" ? g.nama : null),
          pengajar: null,
          guruGender: akun?.gender ?? null,
          guruHp: akun?.phone ?? null,
          pendamping: true,
        });
      }
    }
  }

  const terdaftar: GuruTerdaftar[] = [];
  for (const r of guruRes.rows as Record<string, unknown>[]) {
    const p = byId.get(String(r.program_id));
    if (!p) continue;
    const batchId = r.tilawah_batch_id == null ? null : Number(r.tilawah_batch_id);
    const scope = defaultBatchScope(p);
    if (scope != null && batchId != null && batchId !== scope) continue;
    terdaftar.push({
      sumber: SUMBER[p.dataSourceType],
      guruId: Number(r.tilawah_guru_id),
      nama: (r.name as string | null) ?? null,
      gender: r.gender == null ? null : Number(r.gender),
      hp: (r.phone as string | null) ?? null,
      programSlug: p.slug,
      programNama: p.name,
      batch: labelBatch.get(`${p.id}:${batchId}`) ?? null,
    });
  }

  const tautan: TautanOrang[] = (tautanRes.rows as Record<string, unknown>[]).map((r) => ({
    sumber: r.sumber as TautanOrang["sumber"],
    peran: String(r.peran),
    idUpstream: String(r.id_upstream),
    orangId: String(r.orang_id),
    nama: String(r.nama),
    kodeQr: String(r.kode_qr),
    gender: r.gender === "L" || r.gender === "P" ? r.gender : null,
    wa: (r.wa as string | null) ?? null,
    qism: (r.qism as string | null) ?? null,
    mustawa: (r.mustawa as string | null) ?? null,
  }));
  const kajianHadir = new Map(
    (kajianRes.rows as { orang_id: string; n: number }[]).map((r) => [String(r.orang_id), Number(r.n)]),
  );

  const badal = new Map<string, number>();
  for (const r of badalRes.rows as Record<string, unknown>[]) {
    const src = SUMBER[String(r.src)];
    if (!src) continue;
    const k = `${src}:${Number(r.guru_id)}`;
    badal.set(k, (badal.get(k) ?? 0) + Number(r.n));
  }
  // Badal akun ganda ikut akun kanoniknya.
  for (const grp of DUPLICATE_GURU_ACCOUNTS) {
    for (const id of grp.slice(1)) {
      const n = badal.get(`tilawah:${id}`);
      if (n) badal.set(`tilawah:${grp[0]}`, (badal.get(`tilawah:${grp[0]}`) ?? 0) + n);
    }
  }

  return {
    rows: susunDirektori({
      halaqah, terdaftar, tautan, badal, akunGanda: DUPLICATE_GURU_ACCOUNTS, maahir, kajianHadir,
      kecuali: KEPUTUSAN_IDENTITAS.kecuali,
    }),
    sinkronTertua,
    kajianTotal: Number((kajianRes.rows[0] as { total?: number } | undefined)?.total ?? 0),
  };
}

const genderMaahir = (g: unknown): "L" | "P" | null => (g === "ikhwan" ? "L" : g === "akhwat" ? "P" : null);

/**
 * Cermin Maahir untuk direktori: syaikh, roster HITS (kelompok, ketua, skor
 * matrix bulan terakhir) dan musyrif beserta kelasnya. `active` null dihitung
 * aktif — kolom itu hanya bisa menyatakan nonaktif bila upstream menulis false.
 */
async function bacaMaahir(): Promise<MaahirMasukan> {
  const db = getDb();
  const rows = (await db.execute(sql`
    select ms.entity, ms.raw
    from maahir_sync ms join programs p on p.id = ms.program_id
    where p.data_source_type = 'maahir_api'
      and ms.entity in ('syaikh', 'hits/pengajar', 'hits/kelompok-pengajar', 'musyrif', 'kelas')`)).rows as {
    entity: string;
    raw: Record<string, unknown>;
  }[];
  const matrixRes = (await db.execute(sql`
    with m as (
      select ms.raw->>'pengajar_id' pid, ms.raw->>'year_month' ym,
        (ms.raw->>'rata_rata_keseluruhan')::numeric skor, (ms.raw->>'ranking')::int ranking
      from maahir_sync ms join programs p on p.id = ms.program_id
      where p.data_source_type = 'maahir_api' and ms.entity = 'matrix-rekap'
    ),
    n as (select ym, count(*) filter (where ranking is not null)::int dari from m group by ym)
    select distinct on (m.pid) m.pid, m.ym, m.skor, m.ranking, n.dari
    from m join n using (ym)
    where m.skor is not null
    order by m.pid, m.ym desc`)).rows as { pid: string; ym: string; skor: string | null; ranking: number | null; dari: number | null }[];
  const matrix = new Map(
    matrixRes.map((r) => [
      r.pid,
      { bulan: r.ym, skor: r.skor == null ? null : Math.round(Number(r.skor) * 10) / 10, ranking: r.ranking, dari: r.dari },
    ]),
  );
  const aktif = (r: Record<string, unknown>) => r.active !== false;
  const kelompok = new Map(
    rows.filter((r) => r.entity === "hits/kelompok-pengajar").map((r) => [String(r.raw.id), String(r.raw.name ?? "")]),
  );
  const kelasPerMusyrif = new Map<string, string[]>();
  for (const r of rows.filter((x) => x.entity === "kelas" && x.raw.musyrif_id)) {
    const k = String(r.raw.musyrif_id);
    kelasPerMusyrif.set(k, [...(kelasPerMusyrif.get(k) ?? []), String(r.raw.name ?? "")]);
  }
  const nama = (r: Record<string, unknown>) => String(r.name ?? "").trim();
  return {
    syaikh: rows
      .filter((r) => r.entity === "syaikh")
      .map((r) => ({ id: String(r.raw.id), nama: nama(r.raw), gender: genderMaahir(r.raw.gender), aktif: aktif(r.raw) })),
    rosterHits: rows
      .filter((r) => r.entity === "hits/pengajar")
      .map((r) => {
        const kel = r.raw.kelompok_id ? (kelompok.get(String(r.raw.kelompok_id)) ?? null) : null;
        return {
          id: String(r.raw.id),
          nama: nama(r.raw),
          gender: genderMaahir(r.raw.gender),
          aktif: aktif(r.raw),
          // "Belum Ada Kelompok (Akhwat)" adalah wadah sisa, bukan kelompok.
          kelompok: kel && !/^belum ada kelompok/i.test(kel) ? kel : null,
          ketua: r.raw.is_ketua === true,
          matrix: matrix.get(String(r.raw.id)) ?? null,
        };
      }),
    musyrif: rows
      .filter((r) => r.entity === "musyrif")
      .map((r) => ({ id: String(r.raw.id), nama: nama(r.raw), aktif: aktif(r.raw), kelas: kelasPerMusyrif.get(String(r.raw.id)) ?? [] })),
  };
}
