/**
 * Semua angka halaman publik (/publik/[program]), dirakit sekali dan dibagi.
 *
 * Halaman ini dibuka tanpa akun oleh donatur, mitra dan jamaah, jadi aturan
 * pertamanya: **yang keluar hanya agregat.** Tidak ada nama peserta atau
 * pengajar, nomor, catatan presensi, atau id mentah.
 *
 * Kelas disebut dengan **nama aslinya** (`nama_tampil`, jatuh ke `name`) —
 * keputusan pemilik 25 Sep 2026, demi transparansi, menggantikan kode turunan
 * (`HITS-07`). Nama halaqah bisa memuat nama pengajar; itu diterima.
 *
 * Angka utama (peserta, pengajar, kelas, sinkron) diambil dari inti Beranda
 * (`getBerandaUntuk`), supaya halaman publik dan Beranda tidak pernah
 * menyebut angka berbeda untuk program yang sama. Yang ditambahkan di sini
 * hanya rinciannya: ikhwan/akhwat, jenjang, batch, jadwal pekan ini, dan
 * kehadiran 30 hari per kelas.
 *
 * Memo janji TTL seperti lib/tv/snapshot.ts: halaman force-dynamic (image
 * build tidak punya DB), dan memo ini yang membuat seribu pembuka tautan
 * berbagi satu putaran query.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pesertaAktif } from "@/lib/enrollment";
import { getAllPrograms, type Program } from "@/lib/programs/resolve";
import { readBatchConfig } from "@/lib/programs/families";
import { basi, getBerandaUntuk, susunBaris, type Baris, type BerandaProgram } from "@/lib/insights/beranda";
import { readKehadiran } from "@/lib/maahir/rekap";
import { entityLastSync, readSyaikh } from "@/lib/maahir/entities";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import { addDaysISO, isoDow, jakartaDate, jamWib } from "@/lib/time/jakarta";
import {
  AMBANG_BAWAAN,
  HARI_PENDEK,
  indeksHari,
  jamMulai,
  labelBatchPendek,
  labelJenjang,
  statusOf,
  type Gender,
  type StatusKey,
} from "./format";

const TTL_MS = 300_000;
/** Jendela kehadiran yang ditampilkan: 30 hari terakhir, hari ini ikut. */
const JENDELA_HARI = 30;
/** Di atas ini, jadwal pekan dirangkum per jam, bukan satu kartu per kelas. */
const JADWAL_PER_KELAS_MAKS = 24;

export type PublikKelas = {
  /** Kunci React; urutan, bukan id upstream. */
  key: string;
  /** Nama kelas seperti yang dilihat koordinator (nama_tampil ?? name). */
  nama: string;
  level: string | null;
  gender: Gender | null;
  /** "Sel, Kam · 20:00" */
  jadwal: string | null;
  peserta: number;
  pct: number | null;
  status: StatusKey;
};

export type PublikJadwalItem = {
  /** Nama kelas, atau jam bila dirangkum ("20:00"). */
  judul: string;
  /** "20:00 · I · 12 org" / "8 kelas · 96 org" */
  keterangan: string;
};

export type PublikHari = { day: string; date: string; today: boolean; count: number; items: PublikJadwalItem[] };

export type PublikProgram = {
  slug: string;
  /** Slug lain yang boleh membuka baris ini (anggota keluarga batch). */
  aliases: string[];
  name: string;
  color: string;
  /** Keterangan sumber di bawah judul, mis. "3 batch · terbaru Juni 2026". */
  src: string | null;
  thr: number;
  peserta: number;
  ikhwan: number;
  akhwat: number;
  /** null = pengajar sumber ini belum tertarik (Maahir tanpa cermin syaikh). */
  pengajar: number | null;
  pengajarIkhwan: number;
  pengajarAkhwat: number;
  kelas: number;
  kelasIkhwan: number;
  kelasAkhwat: number;
  pct: number | null;
  status: StatusKey;
  /** Kosong bila program tak punya lebih dari satu batch. */
  batches: { label: string; n: number }[];
  levels: { label: string; n: number; kelas: number }[];
  /** Peserta aktif yang kelasnya tak berjenjang atau belum tercermin. */
  tanpaJenjang: number;
  /** Kosong bila tak ada jadwal sama sekali pekan ini. */
  week: PublikHari[];
  halaqah: PublikKelas[];
  sinkronAt: string | null;
  stale: boolean;
};

/**
 * Orang unik lintas semua program, sama persis dengan tiga angka Beranda.
 * Bukan jumlah kolom tabel: satu orang bisa ikut lebih dari satu program.
 */
export type PublikTotal = {
  pesertaUnik: number;
  /** Jumlah kursi (pendaftaran) — orang di dua program terhitung dua. */
  pendaftaran: number;
  pesertaIkhwan: number;
  pesertaAkhwat: number;
  pengajarUnik: number;
  pengajarIkhwan: number;
  pengajarAkhwat: number;
  /** Maahir punya kelas tapi syaikh-nya belum tertarik → tidak ikut dihitung. */
  pengajarTanpaMaahir: boolean;
};

export type PublikSnapshot = {
  generatedAt: string;
  /** "Kamis, 24 September 2026" */
  dateLong: string;
  /** "21:05" WIB */
  time: string;
  /** Sinkron tertua di antara program — yang membatasi kesegaran Rapor. */
  sinkronAt: string | null;
  stale: boolean;
  total: PublikTotal;
  programs: PublikProgram[];
};

let cache: { at: number; value: Promise<PublikSnapshot> } | null = null;

export function getPublikSnapshot(): Promise<PublikSnapshot> {
  if (cache && Date.now() - cache.at <= TTL_MS) return cache.value;
  const entry = { at: Date.now(), value: buildSnapshot() };
  cache = entry;
  // Build yang gagal tidak boleh jadi jawaban selama lima menit.
  entry.value.catch(() => {
    if (cache === entry) cache = null;
  });
  return entry.value;
}

/** Warna titik program; baris di luar peta memakai palet cadangan berurutan. */
const WARNA: Record<string, string> = {
  "hits-regular": "#2563eb",
  "hits-nurul-iman": "#0891b2",
  "hits-ortu-abk": "#a4519a",
  "hits-safar": "#d97706",
  dpq: "#7c3aed",
  mabni: "#059669",
  hkm: "#0d9488",
  maahir: "#475569",
};
const WARNA_CADANGAN = ["#db2777", "#0284c7", "#65a30d", "#ea580c", "#4f46e5", "#0f766e", "#be123c"];

/** Kunci stabil baris: nama keluarga batch bila ada, selain itu slug. */
function kunciBaris(b: Baris): string {
  return readBatchConfig(b.programs[0].config)?.family ?? b.slug;
}

async function buildSnapshot(): Promise<PublikSnapshot> {
  const all = await getAllPrograms();
  // Kelas uji ("[DEMO …") bukan program nyata.
  const publik = all.filter((p) => !/^\s*\[demo/i.test(p.name));
  const [beranda, baris] = [await getBerandaUntuk(publik, all), susunBaris(publik, all)];
  const barisBySlug = new Map(baris.map((b) => [b.slug, b]));

  const today = jakartaDate();
  const senin = addDaysISO(today, -(isoDow(today) - 1));
  const pekan = Array.from({ length: 7 }, (_, i) => addDaysISO(senin, i));

  const cermin = beranda.programs.filter((r) => !barisBySlug.get(r.slug)?.programs.some((p) => p.dataSourceType === "maahir_api"));
  const { detail, unik } = await detailCermin(
    cermin.map((r) => barisBySlug.get(r.slug)!).filter(Boolean),
    all,
    today,
    pekan,
  );

  const maahir = await detailMaahir();

  let cadangan = 0;
  const programs: PublikProgram[] = [];
  for (const row of beranda.programs) {
    const b = barisBySlug.get(row.slug);
    if (!b) continue;
    const kunci = kunciBaris(b);
    const color = WARNA[kunci] ?? WARNA_CADANGAN[cadangan++ % WARNA_CADANGAN.length];
    const isMaahir = b.programs.some((p) => p.dataSourceType === "maahir_api");
    const d = isMaahir ? maahir?.detail : detail.get(row.slug);
    if (!d) continue;
    programs.push(rakit(row, b, color, d, today, pekan));
  }

  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    dateLong: now.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }),
    time: jamWib(now),
    sinkronAt: beranda.sinkronTertua ? beranda.sinkronTertua.toISOString() : null,
    stale: basi(beranda.sinkronTertua),
    total: {
      pesertaUnik: beranda.pesertaUnik,
      pendaftaran: beranda.pendaftaran,
      pesertaIkhwan: unik.pesertaIkhwan + (maahir?.orangIkhwan ?? 0),
      pesertaAkhwat: unik.pesertaAkhwat + (maahir?.orangAkhwat ?? 0),
      pengajarUnik: beranda.pengajarUnik,
      // Syaikh ikut hanya bila Beranda juga menghitungnya (Maahir punya kelas).
      pengajarIkhwan: unik.pengajarIkhwan + (beranda.pengajarMaahir != null ? (maahir?.detail.pengajarIkhwan ?? 0) : 0),
      pengajarAkhwat: unik.pengajarAkhwat + (beranda.pengajarMaahir != null ? (maahir?.detail.pengajarAkhwat ?? 0) : 0),
      pengajarTanpaMaahir: beranda.pengajarTanpaMaahir,
    },
    programs,
  };
}

/** Satu kelas mentah — masih membawa kunci urut internal. */
type KelasMentah = {
  /** Urutan batch (keluarga), lalu nama. */
  urut: number;
  nama: string;
  batchKey: string;
  level: string | null;
  gender: Gender | null;
  hari: number[];
  jam: string | null;
  peserta: number;
  hadir: number;
  efektif: number;
  /** Pertemuan pekan ini: indeks hari 0..6 → jam (null = tanpa jam). */
  pekan: Map<number, string | null>;
};

type Detail = {
  ikhwan: number;
  akhwat: number;
  pengajarIkhwan: number;
  pengajarAkhwat: number;
  thr: number;
  kelas: KelasMentah[];
  /** batchKey → { label, order } */
  batchMeta: Map<string, { label: string; order: number }>;
  /**
   * Peserta aktif per program_id, definisi Beranda. Batang keluarga batch
   * memakai ini, bukan jumlah per kelas: peserta di halaqah yang belum tercermin
   * (HITS April "Lanjutan_" yatim) tetap terhitung, sehingga batang = angka hero.
   */
  pesertaPerProgram: Map<string, number>;
  /** Jadwal diambil dari hari rutin kelas, bukan dari pertemuan pekan ini. */
  jadwalRutin: boolean;
  src: string | null;
};

function genderDari(ikh: number, akh: number, cadangan: number | null): Gender | null {
  if (ikh > akh) return "Ikhwan";
  if (akh > ikh) return "Akhwat";
  if (cadangan === 1) return "Ikhwan";
  if (cadangan === 2) return "Akhwat";
  return null;
}

type Unik = { pesertaIkhwan: number; pesertaAkhwat: number; pengajarIkhwan: number; pengajarAkhwat: number };

async function detailCermin(
  baris: Baris[],
  all: Program[],
  today: string,
  pekan: string[],
): Promise<{ detail: Map<string, Detail>; unik: Unik }> {
  const out = new Map<string, Detail>();
  const unik: Unik = { pesertaIkhwan: 0, pesertaAkhwat: 0, pengajarIkhwan: 0, pengajarAkhwat: 0 };
  const ids: string[] = [];
  const keys: string[] = [];
  for (const b of baris) {
    for (const id of b.statsIds) {
      if (ids.includes(id)) continue;
      ids.push(id);
      keys.push(b.slug);
    }
  }
  if (ids.length === 0) return { detail: out, unik };

  const db = getDb();
  const idArr = sql`array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]`;
  const keyArr = sql`array[${sql.join(keys.map((k) => sql`${k}`), sql`, `)}]::text[]`;
  const dari = addDaysISO(today, -(JENDELA_HARI - 1));

  // Ikhwan/akhwat peserta dengan definisi yang sama persis dengan angka
  // peserta Beranda (aktif, berkelas, bukan kelas [DEMO), agar keduanya selaras.
  const gRes = await db.execute(sql`
    with m as (select * from unnest(${idArr}, ${keyArr}) as t(program_id, k))
    select m.k, s.program_id::text as program_id, count(*)::int as n,
           count(*) filter (where s.gender = 1)::int as ikh,
           count(*) filter (where s.gender = 2)::int as akh
    from students_sync s
    join m on m.program_id = s.program_id
    left join halaqah_sync h on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
    where ${pesertaAktif("s")} and s.halaqah_id is not null
      and coalesce(h.name, '') not ilike '[DEMO%'
    group by 1, 2
  `);

  // Ikhwan/akhwat orang unik lintas program: kunci (sumber, id) seperti
  // Beranda, karena tilawah_user_id bukan id global antar sumber.
  const uRes = await db.execute(sql`
    select count(distinct (p.data_source_type, s.tilawah_user_id)) filter (where s.gender = 1)::int as ikh,
           count(distinct (p.data_source_type, s.tilawah_user_id)) filter (where s.gender = 2)::int as akh
    from students_sync s
    join programs p on p.id = s.program_id
    left join halaqah_sync h on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
    where s.program_id = any(${idArr}) and ${pesertaAktif("s")} and s.halaqah_id is not null
      and coalesce(h.name, '') not ilike '[DEMO%'
  `);
  const u = uRes.rows[0] as { ikh: number; akh: number } | undefined;
  unik.pesertaIkhwan = u?.ikh ?? 0;
  unik.pesertaAkhwat = u?.akh ?? 0;

  // Per kelas: peserta aktif + gender, pengajar (hanya untuk gender pengajar,
  // tidak pernah dikirim ke klien), dan presensi 30 hari. Hadir = Hadir/Telat;
  // penyebut = Alfa/Hadir/Telat — Izin tidak dihitung, sama dengan
  // students_sync.attendance_rate. Presensi peserta nonaktif dibuang.
  const hRes = await db.execute(sql`
    with m as (select * from unnest(${idArr}, ${keyArr}) as t(program_id, k)),
    per as (
      select s.program_id, s.halaqah_id, count(*)::int as peserta,
             count(*) filter (where s.gender = 1)::int as ikh,
             count(*) filter (where s.gender = 2)::int as akh
      from students_sync s join m on m.program_id = s.program_id
      where ${pesertaAktif("s")} and s.halaqah_id is not null
      group by 1, 2
    ),
    att as (
      select j.program_id, j.tilawah_halaqah_id as halaqah_id,
             count(*) filter (where a.status in ('1', '2'))::int as hadir,
             count(*) filter (where a.status in ('0', '1', '2'))::int as efektif
      from jadwal_sync j
      join m on m.program_id = j.program_id
      join attendance_sync a on a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
      left join students_sync s on s.program_id = a.program_id and s.halaqah_user_id = a.halaqah_user_id
      where j.schedule_date between ${dari}::date and ${today}::date
        and ${pesertaAktif("s")}
      group by 1, 2
    )
    select m.k, h.program_id::text as program_id, h.tilawah_halaqah_id as hid,
           coalesce(nullif(btrim(h.nama_tampil), ''), nullif(btrim(h.name), '')) as nama,
           h.tilawah_batch_id as batch, h.level, h.day, h.session,
           lower(btrim(h.pengajar)) as pengajar, g.gender as guru_gender,
           per.peserta, per.ikh, per.akh,
           coalesce(att.hadir, 0) as hadir, coalesce(att.efektif, 0) as efektif
    from halaqah_sync h
    join m on m.program_id = h.program_id
    join per on per.program_id = h.program_id and per.halaqah_id = h.tilawah_halaqah_id
    left join guru_sync g on g.program_id = h.program_id and g.tilawah_guru_id = h.guru_id
    left join att on att.program_id = h.program_id and att.halaqah_id = h.tilawah_halaqah_id
    where coalesce(h.name, '') not ilike '[DEMO%'
  `);

  // Pertemuan pekan ini (Senin–Ahad WIB). Jam dari sesi pertemuannya; mabni
  // tidak membawa jam di sini, jadi jatuh ke sesi halaqah.
  const jRes = await db.execute(sql`
    with m as (select * from unnest(${idArr}, ${keyArr}) as t(program_id, k))
    select j.program_id::text as program_id, j.tilawah_halaqah_id as hid,
           j.schedule_date::text as tgl,
           substring(j.raw->>'start_session_date' from 12 for 5) as jam
    from jadwal_sync j join m on m.program_id = j.program_id
    where j.schedule_date between ${pekan[0]}::date and ${pekan[6]}::date
  `);

  const tRes = await db.execute(sql`
    select program_id::text as program_id, pct_70::float as thr
    from attendance_thresholds
    where period_type = 'yaumiy' and program_id = any(${idArr})
  `);
  const ambang = new Map((tRes.rows as { program_id: string; thr: number }[]).map((r) => [r.program_id, Number(r.thr)]));

  const pekanPer = new Map<string, Map<number, string | null>>();
  for (const r of jRes.rows as { program_id: string; hid: number; tgl: string; jam: string | null }[]) {
    const key = `${r.program_id}:${r.hid}`;
    const m = pekanPer.get(key) ?? new Map<number, string | null>();
    const i = pekan.indexOf(r.tgl);
    if (i >= 0 && !m.get(i)) m.set(i, jamMulai(r.jam));
    pekanPer.set(key, m);
  }

  const byId = new Map(all.map((p) => [p.id, p]));
  for (const b of baris) {
    const fam = readBatchConfig(b.programs[0].config)?.family;
    const batchMeta = new Map<string, { label: string; order: number }>();
    // Keluarga batch: satu batang per anggota, dikunci program_id statistiknya.
    if (fam) {
      for (const id of b.statsIds) {
        const member = b.programs.find((p) => p.id === id) ?? byId.get(id);
        const bc = member ? readBatchConfig(member.config) : null;
        batchMeta.set(id, { label: bc?.label ?? "—", order: bc?.order ?? 0 });
      }
    }
    const thrIds = [b.statsIds.find((id) => ambang.has(id))].filter(Boolean) as string[];
    const newest = b.programs.reduce((a, q) =>
      (readBatchConfig(q.config)?.order ?? 0) > (readBatchConfig(a.config)?.order ?? 0) ? q : a,
    );
    out.set(b.slug, {
      ikhwan: 0,
      akhwat: 0,
      pengajarIkhwan: 0,
      pengajarAkhwat: 0,
      thr: thrIds.length ? ambang.get(thrIds[0])! : AMBANG_BAWAAN,
      kelas: [],
      batchMeta,
      pesertaPerProgram: new Map(),
      jadwalRutin: false,
      src: fam && b.statsIds.length > 1 ? `${b.statsIds.length} batch · terbaru ${readBatchConfig(newest.config)?.label}` : null,
    });
  }

  for (const r of gRes.rows as { k: string; program_id: string; n: number; ikh: number; akh: number }[]) {
    const d = out.get(r.k);
    if (!d) continue;
    d.ikhwan += r.ikh;
    d.akhwat += r.akh;
    d.pesertaPerProgram.set(r.program_id, r.n);
  }

  type HRow = {
    k: string; program_id: string; hid: number; nama: string | null; batch: number | null; level: string | null;
    day: string | null; session: string | null; pengajar: string | null; guru_gender: number | null;
    peserta: number; ikh: number; akh: number; hadir: number; efektif: number;
  };
  const pengajarPer = new Map<string, Map<string, Gender | null>>();
  // Lintas program: satu string pengajar = satu orang, seperti pengajarUnik Beranda.
  const pengajarSemua = new Map<string, Gender | null>();
  for (const r of hRes.rows as HRow[]) {
    const d = out.get(r.k);
    if (!d) continue;
    const gender = genderDari(r.ikh, r.akh, r.guru_gender);
    // Keluarga: batang per anggota. Lainnya: per tilawah_batch_id (program
    // syncAllBatches memuat beberapa batch di satu program).
    const fam = d.batchMeta.size > 0;
    const batchKey = fam ? r.program_id : `b${r.batch ?? 0}`;
    if (!fam && !d.batchMeta.has(batchKey)) {
      d.batchMeta.set(batchKey, { label: r.batch != null ? `#${r.batch}` : "—", order: r.batch ?? 0 });
    }
    const hari = (r.day ?? "").split(/[,&/]| dan /).map(indeksHari).filter((i): i is number => i != null);
    d.kelas.push({
      urut: d.batchMeta.get(batchKey)?.order ?? 0,
      nama: r.nama ?? "—",
      batchKey,
      level: r.level?.trim() ? labelJenjang(r.level.trim()) : null,
      gender,
      hari: [...new Set(hari)].sort((a, b) => a - b),
      jam: jamMulai(r.session),
      peserta: r.peserta,
      hadir: r.hadir,
      efektif: r.efektif,
      pekan: pekanPer.get(`${r.program_id}:${r.hid}`) ?? new Map(),
    });
    // Gender pengajar: akun gurunya bila ada, selain itu gender kelasnya.
    // Satu string pengajar = satu pengajar, sama dengan hitungan Beranda.
    if (r.pengajar) {
      const pm = pengajarPer.get(r.k) ?? new Map<string, Gender | null>();
      const g = r.guru_gender === 1 ? "Ikhwan" : r.guru_gender === 2 ? "Akhwat" : gender;
      if (!pm.get(r.pengajar)) pm.set(r.pengajar, g);
      pengajarPer.set(r.k, pm);
      if (!pengajarSemua.get(r.pengajar)) pengajarSemua.set(r.pengajar, g);
    }
  }
  for (const [k, pm] of pengajarPer) {
    const d = out.get(k)!;
    const gs = [...pm.values()];
    d.pengajarIkhwan = gs.filter((g) => g === "Ikhwan").length;
    d.pengajarAkhwat = gs.filter((g) => g === "Akhwat").length;
  }
  const semua = [...pengajarSemua.values()];
  unik.pengajarIkhwan = semua.filter((g) => g === "Ikhwan").length;
  unik.pengajarAkhwat = semua.filter((g) => g === "Akhwat").length;
  return { detail: out, unik };
}

/**
 * Maahir tidak menulis cermin tilawah; kelasnya dari cache `rekap/kehadiran`,
 * sama dengan Beranda. Kehadiran dibiarkan kosong: Maahir menerbitkan tiga
 * angka dengan penyebut berbeda dan tanpa angka gabungan (lib/insights/overview.ts).
 */
async function detailMaahir(): Promise<{ detail: Detail; orangIkhwan: number; orangAkhwat: number } | undefined> {
  const [bulanIni, bulanLalu] = rekapMonths();
  const read = (await readKehadiran(bulanIni)) ?? (await readKehadiran(bulanLalu));
  const kelas = (Array.isArray(read?.payload) ? read.payload : []).filter((k) => (k.anggota?.length ?? 0) > 0);
  if (kelas.length === 0) return undefined;
  const d: Detail = {
    ikhwan: 0,
    akhwat: 0,
    pengajarIkhwan: 0,
    pengajarAkhwat: 0,
    thr: AMBANG_BAWAAN,
    kelas: [],
    batchMeta: new Map(),
    pesertaPerProgram: new Map(),
    jadwalRutin: true,
    src: null,
  };
  // Pengajar = syaikh aktif (keputusan Beranda); gender dari entitasnya.
  if ((await entityLastSync("syaikh")) != null) {
    const syaikh = (await readSyaikh()).filter((x) => x.active !== false);
    d.pengajarIkhwan = syaikh.filter((x) => x.gender === "ikhwan").length;
    d.pengajarAkhwat = syaikh.filter((x) => x.gender === "akhwat").length;
  }
  // Orang unik (anggotaId), seperti maahirOrang di Beranda.
  const orang = new Map<string, Gender | null>();
  for (const k of [...kelas].sort((x, y) => x.kelasId.localeCompare(y.kelasId))) {
    const n = k.anggota.length;
    const gender: Gender | null = k.gender === "ikhwan" ? "Ikhwan" : k.gender === "akhwat" ? "Akhwat" : null;
    if (gender === "Ikhwan") d.ikhwan += n;
    if (gender === "Akhwat") d.akhwat += n;
    for (const a of k.anggota) if (!orang.get(a.anggotaId)) orang.set(a.anggotaId, gender);
    const hari = (k.jadwalHari ?? []).map(indeksHari).filter((i): i is number => i != null);
    d.kelas.push({
      urut: 0,
      nama: k.kelasName?.trim() || "—",
      batchKey: "-",
      level: null,
      gender,
      hari: [...new Set(hari)].sort((a, c) => a - c),
      jam: null,
      peserta: n,
      hadir: 0,
      efektif: 0,
      pekan: new Map(),
    });
  }
  const gs = [...orang.values()];
  return {
    detail: d,
    orangIkhwan: gs.filter((g) => g === "Ikhwan").length,
    orangAkhwat: gs.filter((g) => g === "Akhwat").length,
  };
}

function rakit(
  row: BerandaProgram,
  b: Baris,
  color: string,
  d: Detail,
  today: string,
  pekan: string[],
): PublikProgram {
  const urut = [...d.kelas].sort(
    (x, y) => x.urut - y.urut || x.nama.localeCompare(y.nama, "id", { numeric: true, sensitivity: "base" }),
  );
  const pctOf = (hadir: number, efektif: number) => (efektif > 0 ? (hadir / efektif) * 100 : null);
  const jadwalKelas = (k: KelasMentah) => {
    const hari = k.hari.map((i) => HARI_PENDEK[i]).join(", ");
    return [hari, k.jam].filter(Boolean).join(" · ") || null;
  };

  const halaqah: PublikKelas[] = urut.map((k, i) => {
    const pct = pctOf(k.hadir, k.efektif);
    return {
      key: `k${i}`,
      nama: k.nama,
      level: k.level,
      gender: k.gender,
      jadwal: jadwalKelas(k),
      peserta: k.peserta,
      pct,
      status: statusOf(pct, d.thr),
    };
  });

  const hadir = d.kelas.reduce((n, k) => n + k.hadir, 0);
  const efektif = d.kelas.reduce((n, k) => n + k.efektif, 0);
  const pct = pctOf(hadir, efektif);

  // Batch: hanya bila ada lebih dari satu; urut order.
  const perBatch = new Map<string, number>();
  for (const k of d.kelas) perBatch.set(k.batchKey, (perBatch.get(k.batchKey) ?? 0) + k.peserta);
  // Keluarga: batchKey = program_id, jadi pakai hitungan per program (lihat Detail).
  for (const [id, n] of d.pesertaPerProgram) if (d.batchMeta.has(id)) perBatch.set(id, n);
  const batches = [...d.batchMeta.entries()]
    .filter(([key]) => perBatch.has(key))
    .sort((x, y) => x[1].order - y[1].order)
    .map(([key, m]) => ({ label: labelBatchPendek(m.label), n: perBatch.get(key)! }));

  const lv = new Map<string, { n: number; kelas: number }>();
  for (const k of d.kelas) {
    if (!k.level) continue;
    const cur = lv.get(k.level) ?? { n: 0, kelas: 0 };
    cur.n += k.peserta;
    cur.kelas += 1;
    lv.set(k.level, cur);
  }
  const levels = [...lv.entries()]
    .sort((x, y) => x[0].localeCompare(y[0], "id", { numeric: true }))
    .map(([label, v]) => ({ label, ...v }));

  // Jadwal pekan: pertemuan nyata pekan ini; Maahir dari hari rutin kelas.
  const hariItems: { nama: string; jam: string | null; g: Gender | null; peserta: number }[][] = pekan.map(() => []);
  for (const k of urut) {
    const nama = k.nama;
    if (d.jadwalRutin) {
      for (const h of k.hari) hariItems[h].push({ nama, jam: k.jam, g: k.gender, peserta: k.peserta });
    } else {
      for (const [h, jam] of k.pekan) hariItems[h].push({ nama, jam: jam ?? k.jam, g: k.gender, peserta: k.peserta });
    }
  }
  const adaJadwal = hariItems.some((x) => x.length > 0);
  const rangkum = urut.length > JADWAL_PER_KELAS_MAKS;
  const week: PublikHari[] = !adaJadwal
    ? []
    : pekan.map((date, i) => {
        const items = hariItems[i].sort((x, y) => (x.jam ?? "99").localeCompare(y.jam ?? "99"));
        let out: PublikJadwalItem[];
        if (rangkum) {
          const perJam = new Map<string, { kelas: number; peserta: number }>();
          for (const it of items) {
            const key = it.jam ?? "—";
            const cur = perJam.get(key) ?? { kelas: 0, peserta: 0 };
            cur.kelas += 1;
            cur.peserta += it.peserta;
            perJam.set(key, cur);
          }
          out = [...perJam.entries()].map(([jam, v]) => ({
            judul: jam,
            keterangan: `${v.kelas} kelas · ${v.peserta} org`,
          }));
        } else {
          out = items.map((it) => ({
            judul: it.nama,
            keterangan: [it.jam, it.g?.[0], `${it.peserta} org`].filter(Boolean).join(" · "),
          }));
        }
        return { day: HARI_PENDEK[i], date, today: date === today, count: items.length, items: out };
      });

  const kelasIkhwan = halaqah.filter((h) => h.gender === "Ikhwan").length;
  const kelasAkhwat = halaqah.filter((h) => h.gender === "Akhwat").length;
  const aliases = b.programs.map((p) => p.slug).filter((s) => s !== row.slug);

  return {
    slug: row.slug,
    aliases,
    name: row.name,
    color,
    src: d.src,
    thr: d.thr,
    peserta: row.peserta,
    ikhwan: d.ikhwan,
    akhwat: d.akhwat,
    pengajar: row.pengajar,
    pengajarIkhwan: d.pengajarIkhwan,
    pengajarAkhwat: d.pengajarAkhwat,
    kelas: row.kelas,
    kelasIkhwan,
    kelasAkhwat,
    pct,
    status: statusOf(pct, d.thr),
    batches: batches.length > 1 ? batches : [],
    levels,
    tanpaJenjang: levels.length ? Math.max(0, row.peserta - levels.reduce((n, l) => n + l.n, 0)) : 0,
    week,
    halaqah,
    sinkronAt: row.sinkronAt ? row.sinkronAt.toISOString() : null,
    stale: basi(row.sinkronAt),
  };
}
