/**
 * Angka Beranda (`/`): peserta aktif, pengajar, dan kelas lintas semua program
 * yang boleh dilihat user, plus rincian per program dan kesegaran sinkron.
 *
 * Tiga keputusan yang membedakan angka ini dari sekadar menjumlah kartu program
 * (disepakati 23 Sep 2026):
 *
 * 1. **Angka utama = orang unik.** Menjumlah per program menghitung dobel orang
 *    yang ikut >1 program. Diukur 23 Sep: pendaftaran 3.695 vs orang 3.591, dan
 *    pengajar 342 vs 184 — pengajar mengajar di beberapa program sekaligus,
 *    jadi jumlah per program hampir dua kali lipat. Jumlah pendaftaran tetap
 *    tampil sebagai keterangan; keduanya benar untuk pertanyaan berbeda.
 *
 * 2. **Id orang diberi awalan sumber.** `tilawah_user_id` bukan id global: id 22
 *    di tilawah dan id 22 di mabni adalah dua orang berbeda. Unik = pasangan
 *    (data_source_type, id). Di atasnya, akun ganda satu orang digabung
 *    (lib/peserta/identitas.ts, sejak 29 Sep 2026): anggotaId Maahir per kelas,
 *    HP + nama sama, salinan HKM→RBI. Nama sama tanpa bukti lain tetap dua.
 *
 * 3. **Aktif = enrollment aktif DAN sudah berkelas.** `pesertaAktif()` membuang
 *    yang keluar/nonaktif; peserta tanpa halaqah (daftar tunggu) dihitung
 *    terpisah. Kelas = halaqah yang punya ≥1 peserta aktif, sehingga halaqah
 *    bubar tidak ikut; pengajar = `pengajar` berbeda dari kelas-kelas itu
 *    (cara yang sama dengan tab Pengajar: satu string = satu pengajar)
 *    — untuk rincian per program. Angka Pengajar TOTAL memakai direktori
 *    /pengajar (per orang, lib/pengajar/direktori.ts) supaya kartu = daftar yang
 *    dibukanya.
 *
 * Maahir tidak menulis cermin tilawah; peserta dan kelasnya dari cache
 * `rekap/kehadiran`, sama dengan kartunya di /overview. Grid itu tidak memuat
 * pengajar, jadi pengajar Maahir = **syaikh aktif** di cermin `maahir_sync`
 * (keputusan pemilik 23 Sep 2026). Selama entitas `syaikh` belum pernah
 * ditarik, pengajar Maahir tidak ikut dihitung dan halaman menyebutnya.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bukanAkunSampah, bukanKelasDemo, pesertaAktif } from "@/lib/enrollment";
import { getAccessiblePrograms, getAllPrograms, type Program } from "@/lib/programs/resolve";
import { hidePairedPresensi } from "@/lib/programs/config";
import { familyDisplayName, readBatchConfig } from "@/lib/programs/families";
import { statsProgramIds } from "@/lib/insights/overview";
import { readKehadiran } from "@/lib/maahir/rekap";
import { entityLastSync, readSyaikh } from "@/lib/maahir/entities";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import { getDirektoriPengajarUntuk } from "@/lib/pengajar/direktori";
import { kelompokkanPeserta, type AkunPeserta } from "@/lib/peserta/identitas";
import { bacaRentangKelas, statusDariRentang, type StatusKelas } from "@/lib/kelas/status";
import { todayJakarta } from "@/lib/time/jakarta";
import type { SessionPayload } from "@/lib/auth/session";

/** Sinkron lebih tua dari ini ditandai basi di Beranda. */
export const BASI_JAM = 24;

export type BerandaProgram = {
  /** Slug yang dibuka saat baris diklik (anggota terbaru untuk keluarga batch). */
  slug: string;
  name: string;
  peserta: number;
  /** null = pengajar sumber ini belum tertarik (Maahir tanpa cermin syaikh), bukan nol. */
  pengajar: number | null;
  kelas: number;
  belumBerkelas: number;
  /** Sinkron sukses terakhir di antara program yang menyuapi baris ini. */
  sinkronAt: Date | null;
  /** Run terakhir salah satu program penyuapnya gagal. */
  sinkronGagal: boolean;
};

export type Beranda = {
  /** Orang di kelas yang masih berjalan (lib/kelas/status.ts) — angka "Peserta aktif". */
  pesertaUnik: number;
  /** Semua orang di batch yang ada di cermin, termasuk kelas yang sudah selesai. */
  pesertaSepanjang: number;
  pendaftaran: number;
  pengajarUnik: number;
  /** Kelas berjalan (belum selesai). */
  kelas: number;
  /** Kelas yang pertemuan terakhirnya sudah lewat. */
  kelasSelesai: number;
  belumBerkelas: number;
  /** Baris yang punya data, urut peserta terbanyak. */
  programs: BerandaProgram[];
  /** Program yang terlihat tapi belum punya satu pun peserta/kelas. */
  tanpaData: { slug: string; name: string }[];
  /** Ada Maahir di antara baris tapi syaikh-nya belum tertarik → angka pengajar tidak memuatnya. */
  pengajarTanpaMaahir: boolean;
  /** Pengajar Maahir (syaikh aktif) yang sudah ikut di `pengajarUnik`; null = tidak ada Maahir / belum tertarik. */
  pengajarMaahir: number | null;
  /** Sinkron sukses tertua di antara baris ber-data — yang membatasi kesegaran total. */
  sinkronTertua: Date | null;
};

export type Baris = { slug: string; name: string; programs: Program[]; statsIds: string[] };

/**
 * Satu baris per program seperti yang dikenal user: keluarga batch dilipat
 * (hits-regular + -jan + -apr = "HITS Reguler"), pasangan presensi disembunyikan
 * (HKM, bukan HKM + HKM — Presensi). Sama dengan kartu /overview.
 */
export function susunBaris(visible: Program[], all: Program[]): Baris[] {
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const out: Baris[] = [];
  const perKeluarga = new Map<string, Baris>();
  for (const p of hidePairedPresensi(visible)) {
    const fam = readBatchConfig(p.config)?.family;
    const ids = statsProgramIds(p, all, bySlug);
    if (!fam) {
      out.push({ slug: p.slug, name: p.name, programs: [p], statsIds: ids });
      continue;
    }
    const ada = perKeluarga.get(fam);
    if (ada) {
      ada.programs.push(p);
      // Anggota terbaru yang dibuka saat baris diklik, seperti pemilih program.
      const order = (q: Program) => readBatchConfig(q.config)?.order ?? 0;
      const terbaru = ada.programs.reduce((a, q) => (order(q) > order(a) ? q : a));
      ada.slug = terbaru.slug;
      ada.name = familyDisplayName(terbaru.name);
      continue;
    }
    const b = { slug: p.slug, name: familyDisplayName(p.name), programs: [p], statsIds: ids };
    perKeluarga.set(fam, b);
    out.push(b);
  }
  return out;
}

export async function getBeranda(user: SessionPayload): Promise<Beranda> {
  const [visible, all] = await Promise.all([getAccessiblePrograms(user), getAllPrograms()]);
  return getBerandaUntuk(visible, all);
}

/**
 * Inti `getBeranda` tanpa sesi: angka untuk himpunan program `visible`. Dipakai
 * juga oleh halaman publik (lib/publik/snapshot.ts), yang tidak punya user.
 */
export async function getBerandaUntuk(visible: Program[], all: Program[]): Promise<Beranda> {
  const baris = susunBaris(visible, all);
  // Slug per program_id — sama dengan /peserta (lib/lintas/direktori.ts), dipakai aturan salinan HKM→RBI.
  const slugProgram = new Map(all.map((p) => [p.id, p.slug]));

  const maahir = baris.filter((b) => b.programs.some((p) => p.dataSourceType === "maahir_api"));
  const cermin = baris.filter((b) => !maahir.includes(b));

  // Pemetaan program_id → kunci baris untuk SQL. Satu program penyuap hanya
  // milik satu baris (keluarga dan pasangan presensi tidak saling tumpang).
  const ids: string[] = [];
  const keys: string[] = [];
  for (const b of cermin) {
    for (const id of b.statsIds) {
      if (ids.includes(id)) continue;
      ids.push(id);
      keys.push(b.slug);
    }
  }

  const db = getDb();
  const idArr = sql`array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]`;
  const keyArr = sql`array[${sql.join(keys.map((k) => sql`${k}`), sql`, `)}]::text[]`;

  type Agg = { k: string | null; pendaftaran: number; orang: number; belum: number; kelas: number; pengajar: number };
  const agg = new Map<string | null, Agg>();
  const akunPeserta: AkunPeserta[] = [];
  const akunAktif = new Set<string>();
  const statusKelas = new Map<string, StatusKelas>();
  if (ids.length > 0) {
    // GROUPING SETS ((k), ()): baris per program + satu baris total (k = null)
    // dengan distinct yang dihitung ulang lintas program — bukan dijumlah.
    const res = await db.execute(sql`
      with m as (select * from unnest(${idArr}, ${keyArr}) as t(program_id, k)),
      aktif as (
        select m.k, p.data_source_type as src, s.tilawah_user_id as uid,
               s.program_id, s.halaqah_id
        from students_sync s
        join m on m.program_id = s.program_id
        join programs p on p.id = s.program_id
        left join halaqah_sync h
          on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
        where ${pesertaAktif("s")}
          -- [DEMO WALI] Kelas (mabni id 35) adalah kelas uji, bukan kelas nyata.
          and ${bukanKelasDemo("h.name")}
          and ${bukanAkunSampah("s.name")}
      ),
      kelas as (
        select m.k, lower(btrim(h.pengajar)) as pengajar
        from halaqah_sync h
        join m on m.program_id = h.program_id
        where exists (
          select 1 from aktif a
          where a.program_id = h.program_id and a.halaqah_id = h.tilawah_halaqah_id
        )
          and ${bukanKelasDemo("h.name")}
      ),
      p as (
        select k,
               count(*) filter (where halaqah_id is not null)::int as pendaftaran,
               count(distinct (src, uid)) filter (where halaqah_id is not null)::int as orang,
               count(*) filter (where halaqah_id is null)::int as belum
        from aktif group by grouping sets ((k), ())
      ),
      g as (
        select k, count(*)::int as kelas,
               count(distinct nullif(pengajar, ''))::int as pengajar
        from kelas group by grouping sets ((k), ())
      )
      select p.k, p.pendaftaran, p.orang, p.belum,
             coalesce(g.kelas, 0) as kelas, coalesce(g.pengajar, 0) as pengajar
      from p left join g on g.k is not distinct from p.k
    `);
    for (const r of res.rows as Agg[]) agg.set(r.k, r);

    // Akun berkelas untuk hitungan orang unik: (sumber, id) belum tentu satu
    // manusia — akun ganda dan salinan HKM→RBI digabung di lib/peserta/identitas.ts.
    const akunRes = await db.execute(sql`
      select distinct s.program_id, p.data_source_type src, s.tilawah_user_id uid, s.name, s.phone,
        s.halaqah_id hid, h.id is not null h_ada, h.raw->'kelas'->'periode'->>'nama' periode
      from students_sync s
      join programs p on p.id = s.program_id
      left join halaqah_sync h on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
      where s.program_id = any(${idArr}) and s.halaqah_id is not null and ${pesertaAktif("s")}
        and ${bukanKelasDemo("h.name")} and ${bukanAkunSampah("s.name")}`);
    const rentang = await bacaRentangKelas(ids);
    const hariIni = todayJakarta();
    for (const r of akunRes.rows as Record<string, unknown>[]) {
      const pid = String(r.program_id);
      const hid = r.hid == null ? null : Number(r.hid);
      const status = statusDariRentang(rentang.kelas(pid, hid, String(r.src), (r.periode as string | null) ?? null), hariIni);
      if (status !== "selesai") akunAktif.add(`${r.src}:${r.uid}`);
      // Kelas = halaqah yang ada di cermin, sama dengan hitungan `kelas` di atas dan /kelas.
      if (r.h_ada) statusKelas.set(`${pid}:${hid}`, status);
      akunPeserta.push({
        kunci: `${r.src}:${r.uid}`,
        sumber: "cermin",
        programSlug: slugProgram.get(String(r.program_id)) ?? "",
        nama: String(r.name ?? ""),
        hp: (r.phone as string | null) ?? null,
      });
    }
  }

  // Sinkron: sukses terakhir per program + status run terakhir.
  const semuaIds = [...new Set(baris.flatMap((b) => [...b.statsIds, ...b.programs.map((p) => p.id)]))];
  const sinkron = new Map<string, { sukses: Date | null; gagal: boolean }>();
  if (semuaIds.length > 0) {
    const res = await db.execute(sql`
      select program_id::text as id,
             max(finished_at) filter (where status = 'success') as sukses,
             (array_agg(status order by started_at desc))[1] = 'failed' as gagal
      from sync_runs
      where program_id = any(array[${sql.join(semuaIds.map((i) => sql`${i}`), sql`, `)}]::uuid[])
      group by 1
    `);
    for (const r of res.rows as { id: string; sukses: string | Date | null; gagal: boolean }[]) {
      sinkron.set(r.id, { sukses: r.sukses ? new Date(r.sukses) : null, gagal: !!r.gagal });
    }
  }
  const sinkronBaris = (b: Baris) => {
    // Baris sesegar penyuapnya yang paling basi.
    const s = b.statsIds.map((id) => sinkron.get(id));
    const waktu = s.map((x) => x?.sukses ?? null);
    const sinkronAt = waktu.includes(null) ? null : new Date(Math.min(...waktu.map((w) => w!.getTime())));
    return { sinkronAt, sinkronGagal: s.some((x) => x?.gagal) };
  };

  const rows: BerandaProgram[] = cermin.map((b) => {
    const a = agg.get(b.slug);
    return {
      slug: b.slug,
      name: b.name,
      peserta: a?.pendaftaran ?? 0,
      pengajar: a?.pengajar ?? 0,
      kelas: a?.kelas ?? 0,
      belumBerkelas: a?.belum ?? 0,
      ...sinkronBaris(b),
    };
  });

  // Maahir: dari grid kehadiran yang ter-cache, bulan ini lalu mundur sebulan.
  let maahirRow: BerandaProgram | undefined;
  let pengajarMaahir: number | null = null;
  if (maahir.length > 0) {
    const [bulanIni, bulanLalu] = rekapMonths();
    const read = (await readKehadiran(bulanIni)) ?? (await readKehadiran(bulanLalu));
    // Pengajar Maahir = syaikh aktif. `active` null dihitung aktif: kolomnya
    // hanya bisa menyatakan "nonaktif" bila upstream menulis false.
    if ((await entityLastSync("syaikh")) != null) {
      pengajarMaahir = (await readSyaikh()).filter((x) => x.active !== false).length;
    }
    const kelas = Array.isArray(read?.payload) ? read.payload : [];
    const berisi = kelas.filter((k) => (k.anggota?.length ?? 0) > 0);
    for (const k of berisi)
      for (const x of k.anggota ?? []) {
        akunPeserta.push({ kunci: `maahir:${x.anggotaId}`, sumber: "maahir", programSlug: "maahir", nama: String(x.name ?? ""), hp: null });
        akunAktif.add(`maahir:${x.anggotaId}`); // grid bulan berjalan
      }
    for (const b of maahir) {
      const row: BerandaProgram = {
        slug: b.slug,
        name: b.name,
        peserta: berisi.reduce((n, k) => n + (k.anggota?.length ?? 0), 0),
        pengajar: pengajarMaahir,
        kelas: berisi.length,
        belumBerkelas: 0,
        ...sinkronBaris(b),
      };
      maahirRow ??= row;
      rows.push(row);
    }
  }

  const total = agg.get(null);
  // Orang, bukan akun: anggotaId Maahir per kelas, akun ganda tilawah, dan
  // salinan HKM→RBI dilipat (audit 29 Sep 2026, lib/peserta/identitas.ts).
  const { orangDari } = kelompokkanPeserta(akunPeserta);
  const berdata = rows.filter((r) => r.peserta > 0 || r.kelas > 0).sort((a, b) => b.peserta - a.peserta);
  const waktu = berdata.map((r) => r.sinkronAt).filter((d): d is Date => !!d);

  return {
    // Aktif = ada di kelas yang belum selesai (keputusan pemilik 29 Sep 2026).
    pesertaUnik: new Set([...akunAktif].map((k) => orangDari.get(k) ?? k)).size,
    pesertaSepanjang: new Set(orangDari.values()).size,
    pendaftaran: (total?.pendaftaran ?? 0) + (maahirRow?.peserta ?? 0),
    // Sama persis dengan hitungan "Mengajar" di /pengajar — kartu ini menaut ke
    // sana, jadi angkanya harus sama dengan daftar yang terbuka (28 Sep 2026).
    // Direktori menggabung akun per orang (tilawah + mabni + syaikh Maahir yang
    // bertaut), jadi lebih tepat daripada menghitung string `pengajar`.
    pengajarUnik: (await getDirektoriPengajarUntuk(visible)).rows.filter((r) => r.mengajar).length,
    kelas: [...statusKelas.values()].filter((x) => x !== "selesai").length + (maahirRow?.kelas ?? 0),
    kelasSelesai: [...statusKelas.values()].filter((x) => x === "selesai").length,
    belumBerkelas: total?.belum ?? 0,
    programs: berdata,
    tanpaData: rows.filter((r) => !berdata.includes(r)).map(({ slug, name }) => ({ slug, name })),
    pengajarTanpaMaahir: !!maahirRow && maahirRow.kelas > 0 && pengajarMaahir == null,
    pengajarMaahir: maahirRow && maahirRow.kelas > 0 ? pengajarMaahir : null,
    sinkronTertua: waktu.length ? new Date(Math.min(...waktu.map((d) => d.getTime()))) : null,
  };
}

/** "5 menit lalu" / "3 jam lalu" / "2 hari lalu" — untuk cap sinkron. */
export function sejak(at: Date, now: Date = new Date()): string {
  const menit = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.round(jam / 24)} hari lalu`;
}

export function basi(at: Date | null, now: Date = new Date()): boolean {
  return !at || now.getTime() - at.getTime() > BASI_JAM * 3_600_000;
}
