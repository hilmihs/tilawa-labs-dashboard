/**
 * Rekap lintas sesi kajian — permintaan Div. Kaderisasi 21 Sep 2026: per sesi
 * nama ustadz, tema/kitab, tanggal, total, ikhwan, akhwat, jumlah prodi;
 * dibandingkan antar sesi; plus nama berulang dipecah ikhwan/akhwat.
 *
 * Semua fungsi murni, tanpa DB. Kuncinya SELALU `orangId`, bukan string nama:
 * "Annisa Kurniasari" dan "Annisa kurniasari" adalah satu orang, dan itu yang
 * tidak bisa dilakukan spreadsheet.
 */

/** Satu baris kehadiran yang sudah digabung dengan profil orang + golongannya. */
export type BarisRekap = {
  acaraId: string;
  orangId: string;
  nama: string;
  gender: string; // 'L' | 'P' | '' (tak diketahui)
  qism: string | null;
  qismTaksiran: boolean; // qism hasil pencocokan nama, bukan deklarasi dirinya
  golongan: string[]; // slug golongan orang ini
  hadirAt: string; // ISO
  /** Kode QR orang — untuk menaut ke CV (/orang/[kode]). */
  kodeQr?: string | null;
};

export type SesiMeta = {
  acaraId: string;
  slug: string;
  nama: string;
  seri: string | null;
  tanggal: string; // YYYY-MM-DD
  pemateri: string | null;
  tema: string | null;
};

export type SifatTarget = "wajib" | "diundang";
export type TargetSesi = { acaraId: string; klasifikasiSlug: string; sifat: SifatTarget };

/** slug golongan → himpunan orangId anggotanya. */
export type AnggotaGolongan = ReadonlyMap<string, ReadonlySet<string>>;

export const QISM_TAK_DIKETAHUI = "Tak diketahui";

export type RekapSesi = SesiMeta & {
  total: number;
  ikhwan: number;
  akhwat: number;
  genderTakDiketahui: number;
  perQism: { qism: string; jumlah: number; taksiran: number }[];
  perGolongan: { slug: string; jumlah: number }[];
  wajib: number; // jumlah anggota seluruh golongan wajib (hadir maupun tidak)
  hadirWajib: number;
  mangkir: number; // wajib − hadirWajib
  hadirDiundang: number;
  hadirTambahan: number; // hadir di luar wajib & diundang
};

function gabungAnggota(slugs: readonly string[], anggota: AnggotaGolongan): Set<string> {
  const out = new Set<string>();
  for (const s of slugs) for (const id of anggota.get(s) ?? []) out.add(id);
  return out;
}

export function rekapSesi(
  sesi: readonly SesiMeta[],
  hadir: readonly BarisRekap[],
  target: readonly TargetSesi[],
  anggota: AnggotaGolongan,
): RekapSesi[] {
  const perAcara = new Map<string, BarisRekap[]>();
  for (const b of hadir) {
    const arr = perAcara.get(b.acaraId) ?? [];
    arr.push(b);
    perAcara.set(b.acaraId, arr);
  }
  return sesi.map((s) => {
    const rows = perAcara.get(s.acaraId) ?? [];
    const t = target.filter((x) => x.acaraId === s.acaraId);
    const wajibSet = gabungAnggota(t.filter((x) => x.sifat === "wajib").map((x) => x.klasifikasiSlug), anggota);
    const diundangSet = gabungAnggota(t.filter((x) => x.sifat === "diundang").map((x) => x.klasifikasiSlug), anggota);

    let ikhwan = 0, akhwat = 0, genderTakDiketahui = 0;
    let hadirWajib = 0, hadirDiundang = 0, hadirTambahan = 0;
    const q = new Map<string, { jumlah: number; taksiran: number }>();
    const g = new Map<string, number>();
    for (const b of rows) {
      if (b.gender === "L") ikhwan++;
      else if (b.gender === "P") akhwat++;
      else genderTakDiketahui++;

      const kq = b.qism ?? QISM_TAK_DIKETAHUI;
      const cur = q.get(kq) ?? { jumlah: 0, taksiran: 0 };
      cur.jumlah++;
      if (b.qismTaksiran) cur.taksiran++;
      q.set(kq, cur);

      for (const slug of b.golongan) g.set(slug, (g.get(slug) ?? 0) + 1);

      // Wajib menang atas diundang: satu orang dihitung sekali.
      if (wajibSet.has(b.orangId)) hadirWajib++;
      else if (diundangSet.has(b.orangId)) hadirDiundang++;
      else hadirTambahan++;
    }

    return {
      ...s,
      total: rows.length,
      ikhwan,
      akhwat,
      genderTakDiketahui,
      perQism: [...q.entries()]
        .sort((a, b) => b[1].jumlah - a[1].jumlah || a[0].localeCompare(b[0]))
        .map(([qism, v]) => ({ qism, jumlah: v.jumlah, taksiran: v.taksiran })),
      perGolongan: [...g.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([slug, jumlah]) => ({ slug, jumlah })),
      wajib: wajibSet.size,
      hadirWajib,
      mangkir: Math.max(0, wajibSet.size - hadirWajib),
      hadirDiundang,
      hadirTambahan,
    };
  });
}

export type DeltaSesi = { total: number | null; ikhwan: number | null; akhwat: number | null };

const TANPA_DELTA: DeltaSesi = { total: null, ikhwan: null, akhwat: null };

/**
 * Selisih tiap sesi terhadap sesi SEBELUMNYA DALAM SERI YANG SAMA. Tanpa
 * pembatas seri, rekap akan membandingkan Kajian Rumah Belajar dengan Kajian
 * Pengajar — dua populasi berbeda, angkanya tidak sebanding.
 *
 * Sesi TANPA seri tidak pernah punya delta, termasuk terhadap sesi tanpa seri
 * lainnya: "belum dikelompokkan" bukan berarti "satu kelompok". Menaruh semuanya
 * dalam satu keranjang membuat Kajian Pengajar dibandingkan dengan Kajian
 * Mahasiswa the institute, persis kesalahan yang `seri` ada untuk mencegah.
 */
export function bandingSesi(
  rekap: readonly Pick<RekapSesi, "acaraId" | "seri" | "tanggal" | "total" | "ikhwan" | "akhwat">[],
): Map<string, DeltaSesi> {
  type Baris = (typeof rekap)[number];
  const perSeri = new Map<string, Baris[]>();
  const out = new Map<string, DeltaSesi>();
  for (const r of rekap) {
    if (!r.seri) { out.set(r.acaraId, TANPA_DELTA); continue; }
    const arr = perSeri.get(r.seri) ?? [];
    arr.push(r);
    perSeri.set(r.seri, arr);
  }
  for (const arr of perSeri.values()) {
    const urut = [...arr].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.acaraId.localeCompare(b.acaraId));
    urut.forEach((r, i) => {
      const prev = i > 0 ? urut[i - 1] : null;
      out.set(
        r.acaraId,
        prev
          ? { total: r.total - prev.total, ikhwan: r.ikhwan - prev.ikhwan, akhwat: r.akhwat - prev.akhwat }
          : TANPA_DELTA,
      );
    });
  }
  return out;
}

export type OrangBerulang = { orangId: string; nama: string; gender: string; jumlahSesi: number; acaraIds: string[] };
export type BarisSebaran = { kali: number; total: number; ikhwan: number; akhwat: number };

/**
 * "Tolong cek nama yg berulang dari ikhwan dan akhwat" (Div. Kaderisasi).
 * Dihitung per `orangId`, jadi dua ejaan nama yang sama tidak pernah jadi dua
 * orang, dan satu orang yang barisnya dobel dalam satu sesi tetap satu.
 */
export function namaBerulang(hadir: readonly BarisRekap[]): { orang: OrangBerulang[]; sebaran: BarisSebaran[] } {
  const per = new Map<string, { nama: string; gender: string; sesi: Set<string> }>();
  for (const b of hadir) {
    const e = per.get(b.orangId) ?? { nama: b.nama, gender: b.gender, sesi: new Set<string>() };
    e.sesi.add(b.acaraId);
    if (!e.gender && b.gender) e.gender = b.gender;
    per.set(b.orangId, e);
  }
  const orang: OrangBerulang[] = [...per.entries()]
    .map(([orangId, e]) => ({ orangId, nama: e.nama, gender: e.gender, jumlahSesi: e.sesi.size, acaraIds: [...e.sesi].sort() }))
    .sort((a, b) => b.jumlahSesi - a.jumlahSesi || a.nama.localeCompare(b.nama));

  const hist = new Map<number, BarisSebaran>();
  for (const o of orang) {
    const row = hist.get(o.jumlahSesi) ?? { kali: o.jumlahSesi, total: 0, ikhwan: 0, akhwat: 0 };
    row.total++;
    if (o.gender === "L") row.ikhwan++;
    else if (o.gender === "P") row.akhwat++;
    hist.set(o.jumlahSesi, row);
  }
  return { orang, sebaran: [...hist.values()].sort((a, b) => a.kali - b.kali) };
}

/** Matriks golongan x sesi; `perSesi` sejajar dengan urutan `rekap` yang diberikan. */
export function pivotGolongan(
  rekap: readonly Pick<RekapSesi, "acaraId" | "perGolongan">[],
  slugs: readonly string[],
): { slug: string; perSesi: number[]; totalKehadiran: number }[] {
  return slugs.map((slug) => {
    const perSesi = rekap.map((r) => r.perGolongan.find((g) => g.slug === slug)?.jumlah ?? 0);
    return { slug, perSesi, totalKehadiran: perSesi.reduce((a, b) => a + b, 0) };
  });
}
