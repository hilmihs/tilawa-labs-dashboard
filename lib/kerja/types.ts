/**
 * Kontrak bersama fitur Kartu Kehadiran / logbook pengurus (design "Kartu
 * Kehadiran", 29 Sep 2026). Skema: kerja_anggota, kartu_nfc, tap_kartu,
 * kerja_hadir (migrasi 0049). Semua halaman memakai tipe dari sini.
 */
export const SESI = ["pagi", "siang", "sore"] as const;
export type Sesi = (typeof SESI)[number];
export const LABEL_SESI: Record<Sesi, string> = { pagi: "Pagi", siang: "Siang", sore: "Sore" };
/** Singkatan kolom logbook kertas: P / Si / Sr. */
export const SINGKAT_SESI: Record<Sesi, string> = { pagi: "P", siang: "Si", sore: "Sr" };

export type MetodeTap = "qr" | "nfc" | "ketik";
export type SumberHadir = MetodeTap | "manual";

/**
 * Hasil satu tap di kiosk:
 * - tercatat: jam datang sesi ini baru tercatat
 * - sudah: sesi ini sudah tercatat lebih dulu (jam pertama dipertahankan)
 * - di_luar_sesi: anggota, tapi jam di luar semua sesi
 * - bukan_anggota: orangnya dikenal, tapi tidak ada di daftar logbook
 * - tak_dikenal: kode/UID tidak cocok dengan siapa pun
 */
export type HasilTap = "tercatat" | "sudah" | "di_luar_sesi" | "bukan_anggota" | "tak_dikenal";

/** Batas sesi dari kolom kantor.sesi_* ("HH:MM" WIB). */
export type BatasSesi = { pagiMulai: string; siangMulai: string; soreMulai: string; selesai: string };
export const BATAS_BAWAAN: BatasSesi = { pagiMulai: "05:00", siangMulai: "11:00", soreMulai: "15:00", selesai: "22:00" };

/** Yang dikirim kiosk (juga dari antrean offline). */
export type InputTap = { klienId: string; dibaca: string; metode: MetodeTap; waktu: string /* ISO dari perangkat */ };

/** Yang dikembalikan ke kiosk untuk layar umpan balik. */
export type JawabanTap = {
  hasil: HasilTap;
  nama: string | null;
  gender: string | null;
  sesi: Sesi | null;
  /** Jam datang yang berlaku untuk sesi itu ("HH:MM" WIB) — untuk 'sudah' ini jam pertama. */
  jam: string | null;
  tanggal: string;
  /** Semua arti tap ini (kerja, kegiatan, mengajar …) untuk layar kiosk. */
  arti: import("./terpadu").ArtiTap[];
};
