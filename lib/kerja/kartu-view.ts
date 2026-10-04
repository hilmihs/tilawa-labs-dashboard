/**
 * Bentuk tampilan Kartu Kehadiran (design "Kartu Kehadiran", CR80 potret).
 * Murni — datanya dari ./kartu-data.ts. Di sini hanya: peran → palet, pilihan
 * logo (#Pendidikan / #Tilawah), format kode & UID, dan baris program.
 */

export type PeranKartu = "pengajar" | "peserta" | "pengurus";
export type Rumpun = "pendidikan" | "tilawah";
export type Nada = "gold" | "forest";

export const LABEL_PERAN_KARTU: Record<PeranKartu, string> = {
  pengajar: "Pengajar",
  peserta: "Peserta",
  pengurus: "Pengurus",
};

export type Palet = {
  bg: string;
  ink: string;
  muted: string;
  line: string;
  pillBg: string;
  pillInk: string;
  /** Nada lockup di depan. */
  logo: Nada;
  /** Nada tanda gunung (watermark) di kedua sisi. */
  mark: Nada;
  /** Opasitas watermark sisi belakang — besar dan jelas. */
  markBelakang: number;
  /** Sisi depan: kira-kira separuhnya, supaya nama dan QR tetap yang utama. */
  markDepan: number;
};

export const PALET: Record<PeranKartu, Palet> = {
  pengajar: {
    bg: "#2e413d",
    ink: "#f6f4ee",
    muted: "#b4c1bc",
    line: "rgba(246,244,238,.25)",
    pillBg: "#ccbb76",
    pillInk: "#1f2d29",
    logo: "gold",
    mark: "gold",
    markBelakang: 0.14,
    markDepan: 0.07,
  },
  peserta: {
    bg: "#faf7ee",
    ink: "#1f2d29",
    muted: "#5f6a65",
    line: "#dcd5c2",
    pillBg: "#2e413d",
    pillInk: "#f6f4ee",
    logo: "forest",
    mark: "forest",
    markBelakang: 0.07,
    markDepan: 0.05, // .035 hilang di cetak dye-sub/inkjet
  },
  pengurus: {
    bg: "#ccbb76",
    ink: "#1f2d29",
    muted: "#45413a",
    line: "rgba(31,45,41,.3)",
    pillBg: "#2e413d",
    pillInk: "#ccbb76",
    logo: "forest",
    mark: "forest",
    markBelakang: 0.1,
    markDepan: 0.05,
  },
};

/** Peran tautan yang berarti mengajar. Koordinator Maahir = murid, bukan pengajar. */
export const PERAN_MENGAJAR = ["pengajar", "musyrif", "syaikh", "pengajar_hits"] as const;

/**
 * Pengurus bila ada di logbook aktif (atau kategori pengurus); lalu pengajar
 * bila punya tautan mengajar atau kategori pengajar; selain itu peserta.
 */
export function peranKartu(o: { anggotaAktif: boolean; kategori: string; peranTautan: readonly string[] }): PeranKartu {
  if (o.anggotaAktif || o.kategori === "pengurus") return "pengurus";
  if (o.kategori === "pengajar" || o.peranTautan.some((p) => (PERAN_MENGAJAR as readonly string[]).includes(p))) return "pengajar";
  return "peserta";
}

// Program Al-Qur'an → #Tilawah. Dicocokkan ke slug maupun nama, jadi
// "hits-regular", "HKM (Halaqah Al-Qur'an)" dan "Pengajar HITS" sama-sama kena.
const RE_QURAN = /hits|maahir|dpq|tahsin|tahfi[zd]h|hkm|qur['’]?an|tilawah|fatihah|tafm|nurim/i;

/** Rumpun dari teks program (slug/nama/program_teks); null bila tak ada teks. */
export function rumpunProgram(teks: string | null | undefined): Rumpun | null {
  if (!teks?.trim()) return null;
  return RE_QURAN.test(teks) ? "tilawah" : "pendidikan";
}

/**
 * Logo kartu. Pengurus selalu #Pendidikan. Selain itu dari program utamanya;
 * bila program tak diketahui, akun Tilawah/Maahir berarti rumpun Al-Qur'an.
 */
export function rumpunKartu(peran: PeranKartu, program: readonly (string | null | undefined)[], sumber: readonly string[] = []): Rumpun {
  if (peran === "pengurus") return "pendidikan";
  const teks = program.filter((p): p is string => !!p?.trim()).join(" ");
  const r = rumpunProgram(teks);
  if (r) return r;
  return sumber.some((s) => s === "tilawah" || s === "maahir") ? "tilawah" : "pendidikan";
}

/** "ABCDE23456" → "ABCDE 23456" (dibaca manual dari kartu; dua blok lima). */
export function fmtKode(kode: string): string {
  const k = kode.trim().toUpperCase();
  return k.length > 5 ? `${k.slice(0, 5)} ${k.slice(5)}` : k;
}

/** Kode untuk sisi belakang: dua baris lima huruf. */
export function kodeDuaBaris(kode: string): [string, string] {
  const k = kode.trim().toUpperCase();
  return [k.slice(0, 5), k.slice(5)];
}

/** UID ternormal ("04A23F1B6C8091") → "04:A2:3F:1B:6C:80:91"; tanpa chip → "—". */
export function fmtUid(uid: string | null | undefined): string {
  const u = (uid ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (!u) return "—";
  return (u.match(/.{1,2}/g) ?? []).join(":");
}

/**
 * Nama program yang muat di kartu: tanpa keterangan dalam kurung atau setelah
 * " — ", tanpa awalan peran ("Pengajar HITS" → "HITS"; pil peran sudah bilang).
 */
export function namaProgramRingkas(nama: string | null | undefined): string | null {
  if (!nama) return null;
  const s = nama
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+[—–-]\s+.*$/, "")
    .replace(/^(pengajar|peserta|pengurus)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

export const PROGRAM_PENGURUS = "Pengurus Pendidikan";

/**
 * Baris di bawah nama: "<b>program</b> · halaqah". Pengurus tanpa divisi
 * (umpan balik pemilik): hanya "Pengurus Pendidikan", tanpa bagian halaqah.
 */
export function barisProgram(
  peran: PeranKartu,
  program: string | null | undefined,
  halaqah: string | null | undefined,
): { program: string | null; halaqah: string | null } {
  if (peran === "pengurus") return { program: PROGRAM_PENGURUS, halaqah: null };
  const p = namaProgramRingkas(program);
  const h = halaqah?.trim() || null;
  return { program: p, halaqah: p ? h : null };
}

export type CalonHalaqah = {
  programSlug: string;
  programNama: string;
  halaqah: string;
  /** Pertemuan Selesai di halaqah ini. */
  selesai: number;
  /** Tanggal pertemuan terakhir terjadwal (YYYY-MM-DD), null bila tak ada jadwal. */
  terakhir: string | null;
};

/**
 * Halaqah utama untuk kartu: yang masih berjalan (pertemuan terakhir ≥ hari
 * ini) didahulukan, lalu yang paling banyak Selesai, lalu yang paling baru.
 * Batch yang sudah tamat kalah dari batch berjalan walau selesainya lebih banyak.
 */
export function pilihHalaqahUtama(calon: readonly CalonHalaqah[], hariIni: string): CalonHalaqah | null {
  if (calon.length === 0) return null;
  const jalan = (c: CalonHalaqah) => (c.terakhir != null && c.terakhir >= hariIni ? 1 : 0);
  return [...calon].sort(
    (a, b) =>
      jalan(b) - jalan(a) ||
      b.selesai - a.selesai ||
      (b.terakhir ?? "").localeCompare(a.terakhir ?? "") ||
      a.halaqah.localeCompare(b.halaqah),
  )[0];
}

/** Kelas yang diikuti sebagai peserta (tautan tilawah 'peserta' / Maahir 'anggota'). */
export type KelasPeserta = CalonHalaqah & {
  /** halaqah_sync.id (tilawah) atau program_kelas_id (Maahir) — untuk mendahulukan kelas yang dicetak. */
  kunci: string;
  sumber: "tilawah" | "maahir";
};

export const PROGRAM_MAAHIR = "Maahir";

/**
 * Nama program_kelas Maahir tanpa awalan "Maahir" — kartu sudah menulis
 * "Maahir · …": "Maahir Talaqqi (Senin pagi)" → "Talaqqi (Senin pagi)".
 */
export function namaKelasMaahir(nama: string | null | undefined): string | null {
  const s = nama?.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.replace(/^maahir\s+/i, "").trim() || s;
}

/**
 * Kelas peserta yang ditulis di kartu: yang diminta pencetak (kelas/program yang
 * sedang dicetak) bila dia ada di sana, selain itu aturan `pilihHalaqahUtama`.
 */
export function pilihKelasPeserta(
  kelas: readonly KelasPeserta[],
  hariIni: string,
  utamakan?: { kunci?: string; programSlug?: string },
): KelasPeserta | null {
  const diminta = utamakan?.kunci
    ? kelas.filter((k) => k.kunci === utamakan.kunci)
    : utamakan?.programSlug
      ? kelas.filter((k) => k.programSlug === utamakan.programSlug)
      : [];
  return (pilihHalaqahUtama(diminta.length ? diminta : kelas, hariIni) as KelasPeserta | null) ?? null;
}

/**
 * Baris program + rumpun satu kartu. Peserta: kelas yang dia ikuti dulu
 * ("HITS Reguler · HITS 065 JUNI", "Maahir · Talaqqi (Senin pagi)"), selalu
 * #Tilawah bila dia peserta lewat tautan tilawah/Maahir. Pengajar: halaqah yang
 * dia pegang dulu, kelas yang dia ikuti sebagai cadangan. Sisanya seperti
 * sebelumnya: program akun tertaut → program_teks → "Kelas Maahir".
 */
export function isiKartu(o: {
  peran: PeranKartu;
  halaqahPegang: CalonHalaqah | null;
  kelasPeserta: KelasPeserta | null;
  /** Punya tautan tilawah 'peserta' / Maahir 'anggota' (aktif atau tidak). */
  tautanPeserta: boolean;
  programTautan: string | null;
  programTeks: string | null;
  sumber: readonly string[];
}): { program: string | null; halaqah: string | null; rumpun: Rumpun } {
  const kelas = o.peran === "peserta" ? (o.kelasPeserta ?? o.halaqahPegang) : (o.halaqahPegang ?? o.kelasPeserta);
  const program =
    kelas?.programNama ??
    o.programTautan ??
    o.programTeks ??
    (o.sumber.includes("maahir") ? "Kelas Maahir" : null);
  const baris = barisProgram(o.peran, program, kelas?.halaqah ?? null);
  const rumpun =
    o.peran === "peserta" && (o.tautanPeserta || o.kelasPeserta)
      ? "tilawah"
      : rumpunKartu(o.peran, [kelas?.programSlug, program], o.sumber);
  return { ...baris, rumpun };
}
