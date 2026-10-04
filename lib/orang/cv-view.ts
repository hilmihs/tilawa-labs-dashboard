/**
 * Bentuk tampilan CV satu orang. Murni — sumbernya lib/orang/cv.ts.
 *
 * Tiga bagian pertama (identitas, mengajar, kegiatan) sengaja hanya memakai data
 * yang sudah ada: tautan akun (orang_tautan), halaqah + pertemuan tersinkron, dan
 * presensi kajian. Tidak ada satu pun angka di sini yang menunggu orang mengisi form.
 */
import { terlambat, type AcaraPresensi } from "@/lib/hadir/view-model";
import type { StatusTone } from "@/lib/ui/status";

type JamAcara = Pick<AcaraPresensi, "tanggal" | "jamMulai" | "toleransiMenit">;

export const LABEL_PERAN: Record<string, string> = {
  pengajar: "Pengajar",
  musyrif: "Musyrif",
  syaikh: "Syaikh",
  koordinator: "Koordinator",
  koordinator_ketua_kelas: "Koordinator Ketua Kelas",
  pengajar_hits: "Roster HITS",
};

export const LABEL_SUMBER: Record<string, string> = {
  tilawah: "Tilawah",
  mabni: "Boarding",
  maahir: "Maahir",
};

/** Nada chip per sumber akun: Tilawah moss, Maahir mulberry, Mabni sage-teal. */
export const NADA_SUMBER: Record<string, StatusTone> = { tilawah: "success", maahir: "indigo", mabni: "teal" };

export function labelPeran(peran: string): string {
  return LABEL_PERAN[peran] ?? peran;
}

export type BarisHalaqah = {
  programSlug: string;
  programNama: string;
  halaqahId: number;
  halaqah: string;
  /** Pertemuan di halaqah ini yang diampu orang ini. */
  diampu: number;
  /** Di antara `diampu`, yang statusnya Selesai. */
  selesai: number;
  /** Pertemuan halaqah ini yang diampu orang lain (badal) — hanya untuk halaqah miliknya. */
  dibadalkan: number;
  pemilik: boolean;
};

export type RingkasanMengajar = {
  perProgram: {
    programSlug: string;
    programNama: string;
    halaqah: BarisHalaqah[];
    diampu: number;
    selesai: number;
  }[];
  totalHalaqah: number;
  totalDiampu: number;
  totalSelesai: number;
  /** Pertemuan yang diampu di halaqah milik orang lain — dia yang jadi badal. */
  jadiBadal: number;
};

export function ringkasMengajar(
  halaqah: readonly BarisHalaqah[],
  jadiBadal: number,
): RingkasanMengajar {
  const peta = new Map<string, RingkasanMengajar["perProgram"][number]>();
  for (const h of halaqah) {
    const p = peta.get(h.programSlug) ?? {
      programSlug: h.programSlug,
      programNama: h.programNama,
      halaqah: [],
      diampu: 0,
      selesai: 0,
    };
    p.halaqah.push(h);
    p.diampu += h.diampu;
    p.selesai += h.selesai;
    peta.set(h.programSlug, p);
  }
  const perProgram = [...peta.values()].sort((a, b) => b.selesai - a.selesai || a.programNama.localeCompare(b.programNama));
  for (const p of perProgram) p.halaqah.sort((a, b) => b.selesai - a.selesai || a.halaqah.localeCompare(b.halaqah));
  return {
    perProgram,
    totalHalaqah: halaqah.length,
    totalDiampu: halaqah.reduce((n, h) => n + h.diampu, 0),
    totalSelesai: halaqah.reduce((n, h) => n + h.selesai, 0),
    jadiBadal,
  };
}

export type BarisKegiatan = {
  slug: string;
  nama: string;
  tanggal: string;
  pemateri: string | null;
  jamMulai: string | null;
  toleransiMenit: number;
  /** null = tidak hadir. */
  hadirWaktu: string | null;
  konfirmasi: string | null; // 'bisa' | 'belum_bisa' | null
};

export type KegiatanTampil = BarisKegiatan & {
  status: "hadir" | "terlambat" | "tidak_hadir" | "mangkir";
};

export type RingkasanKegiatan = {
  baris: KegiatanTampil[];
  diundang: number;
  hadir: number;
  terlambat: number;
  /** Menyatakan bisa hadir, lalu tidak datang. */
  mangkir: number;
};

/** Satu baris kegiatan → status kehadiran. `mangkir` = bilang bisa, tapi tidak datang. */
export function statusKegiatan(b: BarisKegiatan): KegiatanTampil["status"] {
  if (b.hadirWaktu) {
    const acara: JamAcara = {
      tanggal: b.tanggal,
      jamMulai: b.jamMulai,
      toleransiMenit: b.toleransiMenit,
    };
    return terlambat(b.hadirWaktu, acara) ? "terlambat" : "hadir";
  }
  return b.konfirmasi === "bisa" ? "mangkir" : "tidak_hadir";
}

export function ringkasKegiatan(baris: readonly BarisKegiatan[]): RingkasanKegiatan {
  const rows = [...baris]
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    .map((b) => ({ ...b, status: statusKegiatan(b) }));
  return {
    baris: rows,
    diundang: rows.length,
    hadir: rows.filter((r) => r.status === "hadir" || r.status === "terlambat").length,
    terlambat: rows.filter((r) => r.status === "terlambat").length,
    mangkir: rows.filter((r) => r.status === "mangkir").length,
  };
}

export type TautanTampil = {
  sumber: string;
  peran: string;
  /** Program yang dipegang lewat akun ini (kosong untuk peran Maahir). */
  program: string[];
  /** Ejaan nama di akun-akun itu, hanya diisi bila lebih dari satu akun. */
  namaAkun: string[];
  idUpstream: string[];
  jumlah: number;
  aktif: boolean;
};

/**
 * Satu chip per (sumber, peran). Satu orang bisa punya DUA baris roster Maahir
 * (duplikat yang sudah dinyatakan satu orang), dan dua chip identik terbaca
 * sebagai bug — jadi digabung, dengan nama akunnya ditampilkan bila berbeda.
 */
export function ringkasTautan(
  tautan: readonly { sumber: string; peran: string; programSlug: string; namaUpstream: string | null; idUpstream: string; aktif: boolean }[],
): TautanTampil[] {
  const peta = new Map<string, TautanTampil>();
  for (const t of tautan) {
    const kunci = `${t.sumber}|${t.peran}`;
    const e = peta.get(kunci) ?? { sumber: t.sumber, peran: t.peran, program: [], namaAkun: [], idUpstream: [], jumlah: 0, aktif: false };
    if (t.programSlug && !e.program.includes(t.programSlug)) e.program.push(t.programSlug);
    if (t.namaUpstream && !e.namaAkun.includes(t.namaUpstream)) e.namaAkun.push(t.namaUpstream);
    if (!e.idUpstream.includes(t.idUpstream)) e.idUpstream.push(t.idUpstream);
    e.jumlah += 1;
    e.aktif ||= t.aktif;
    peta.set(kunci, e);
  }
  const urutSumber = ["tilawah", "mabni", "maahir"];
  return [...peta.values()]
    .map((e) => ({ ...e, namaAkun: e.idUpstream.length > 1 ? e.namaAkun : [] }))
    .sort((a, b) => urutSumber.indexOf(a.sumber) - urutSumber.indexOf(b.sumber) || a.peran.localeCompare(b.peran));
}
