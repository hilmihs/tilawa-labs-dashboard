/**
 * Golongan orang: slug, peta program_teks → golongan, dan rencana sinkron.
 * Murni dan aman diimpor komponen klien (tidak menarik pg) — sama seperti
 * program.ts, yang memang dipisah dari daftar.ts karena alasan itu.
 */
import { PROGRAM_PILIHAN } from "./program";

/** Golongan populasi dua berkas yang diserahkan pemilik 21 Sep 2026. */
export const NAMA_MAJELIS_TAZHIM = "Open Lecture / Study Room";
export const SLUG_MAJELIS_TAZHIM = "majelis-tazhim-rumah-belajar";

export function slugGolongan(nama: string): string {
  return nama
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Deklarasi diri saat daftar → golongan. Teks di luar daftar tidak dipetakan. */
export function golonganDariProgramTeks(programTeks: string | null | undefined): string | null {
  if (!programTeks) return null;
  const t = programTeks.trim();
  return (PROGRAM_PILIHAN as readonly string[]).includes(t) ? slugGolongan(t) : null;
}

export type Keanggotaan = { orangId: string; klasifikasiId: string; sumber: string };
export type PasanganGolongan = { orangId: string; klasifikasiId: string };

const kunci = (v: PasanganGolongan) => `${v.orangId}|${v.klasifikasiId}`;

/**
 * Selisih untuk sinkron otomatis (Paket D: roster pengajar lintas program).
 * Dua aturan yang tidak boleh dilanggar:
 *  - hanya baris `sumber='tautan'` yang boleh dicabut — baris manual/impor
 *    adalah keputusan manusia dan menang atas sinkron;
 *  - keanggotaan yang sudah ada TIDAK ditambah ulang, apa pun sumbernya,
 *    supaya unique (orang, klasifikasi) tidak ditabrak.
 */
export function rencanaSinkronGolongan(
  sekarang: readonly Keanggotaan[],
  seharusnya: readonly PasanganGolongan[],
): { tambah: PasanganGolongan[]; cabut: PasanganGolongan[] } {
  const adaSekarang = new Set(sekarang.map(kunci));
  const perluAda = new Set(seharusnya.map(kunci));
  const tambah = seharusnya
    .filter((v) => !adaSekarang.has(kunci(v)))
    .map((v) => ({ orangId: v.orangId, klasifikasiId: v.klasifikasiId }));
  const cabut = sekarang
    .filter((v) => v.sumber === "tautan" && !perluAda.has(kunci(v)))
    .map((v) => ({ orangId: v.orangId, klasifikasiId: v.klasifikasiId }));
  return { tambah, cabut };
}
