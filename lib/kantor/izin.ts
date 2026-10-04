/**
 * Aturan kabar tidak hadir (ikhbar) + ringkasan pekan Operating Office.
 * Syaikh mengabarkan, bukan memohon izin: kabar tercatat langsung tanpa persetujuan.
 * Murni: tanpa DB, tanpa next/*. Dipakai server action, halaman, dan diuji unit.
 */
import { addDaysISO, diffDaysISO, isoDow } from "@/lib/time/jakarta";

export const ALASAN_IZIN = ["sakit", "keluarga", "safar", "lain"] as const;
export type AlasanIzin = (typeof ALASAN_IZIN)[number];
/** 'menunggu' | 'disetujui' | 'ditolak' hanya ada pada baris dari alur izin lama (sebelum 0048). */
export type StatusIzin = "dikabarkan" | "dibatalkan" | "menunggu" | "disetujui" | "ditolak";

/** Kabar yang masih berlaku menutupi hari itu. */
export const IZIN_AKTIF: readonly StatusIzin[] = ["dikabarkan", "menunggu", "disetujui"];

export function izinAktif(status: string): boolean {
  return (IZIN_AKTIF as readonly string[]).includes(status);
}

export const IZIN_HARI_MAKS = 14;
export const CATATAN_MAKS = 500;

export type Rentang = { dari: string; sampai: string };
export type IzinRingkas = Rentang & { status: string };

export type TolakIzin =
  | "alasan-tidak-sah"
  | "tanggal-tidak-sah"
  | "sudah-lewat"
  | "terlalu-panjang"
  | "catatan-terlalu-panjang"
  | "bertumpuk";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function tanggalSah(s: string): boolean {
  return ISO.test(s) && addDaysISO(s, 0) === s;
}

/** Dua rentang inklusif beririsan. */
export function beririsan(a: Rentang, b: Rentang): boolean {
  return a.dari <= b.sampai && b.dari <= a.sampai;
}

/**
 * Kabar tidak hadir baru. `hariIni` = tanggal WIB server. Mulai hari ini atau
 * sesudahnya — hari yang sudah lewat bukan kabar, itu koreksi, dan itu urusan admin.
 */
export function periksaIzin(
  v: { dari: string; sampai: string; alasan: string; catatan: string },
  hariIni: string,
  yangAda: IzinRingkas[],
): { ok: true } | { ok: false; alasan: TolakIzin } {
  if (!(ALASAN_IZIN as readonly string[]).includes(v.alasan)) return { ok: false, alasan: "alasan-tidak-sah" };
  if (!tanggalSah(v.dari) || !tanggalSah(v.sampai) || v.sampai < v.dari) return { ok: false, alasan: "tanggal-tidak-sah" };
  if (v.dari < hariIni) return { ok: false, alasan: "sudah-lewat" };
  if (diffDaysISO(v.sampai, v.dari) + 1 > IZIN_HARI_MAKS) return { ok: false, alasan: "terlalu-panjang" };
  if (v.catatan.length > CATATAN_MAKS) return { ok: false, alasan: "catatan-terlalu-panjang" };
  if (yangAda.some((i) => izinAktif(i.status) && beririsan(i, v)))
    return { ok: false, alasan: "bertumpuk" };
  return { ok: true };
}

export type SelPekan = {
  tanggal: string;
  /** hadir = ada absen masuk; izin = ada kabar tidak hadir yang berlaku. */
  keadaan: "hadir" | "izin" | "kosong";
  hariIni: boolean;
  lewat: boolean;
};

/** Senin–Jumat pekan yang memuat `hariIni` (Sabtu/Ahad → pekan yang baru lewat). */
export function hariKerjaPekan(hariIni: string): string[] {
  const senin = addDaysISO(hariIni, 1 - isoDow(hariIni));
  return Array.from({ length: 5 }, (_, i) => addDaysISO(senin, i));
}

export function ringkasanPekan(
  hariIni: string,
  tanggalMasuk: Set<string>,
  izin: IzinRingkas[],
): { sel: SelPekan[]; hadir: number; izin: number } {
  const sel = hariKerjaPekan(hariIni).map((tanggal): SelPekan => {
    const keadaan = tanggalMasuk.has(tanggal)
      ? "hadir"
      : izin.some((i) => izinAktif(i.status) && tanggal >= i.dari && tanggal <= i.sampai)
        ? "izin"
        : "kosong";
    return { tanggal, keadaan, hariIni: tanggal === hariIni, lewat: tanggal < hariIni };
  });
  return {
    sel,
    hadir: sel.filter((s) => s.keadaan === "hadir").length,
    izin: sel.filter((s) => s.keadaan === "izin").length,
  };
}

/** Masuk sesudah jadwal masuk ("HH:MM" WIB) = terlambat. `jamMasukWib` = "HH:MM". */
export function terlambat(jamMasukWib: string, jamDinas: string): boolean {
  return jamMasukWib > jamDinas;
}
