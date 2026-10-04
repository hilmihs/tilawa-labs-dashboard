/**
 * Scan terpadu — murni. Satu tap di satu tautan scan bisa sekaligus berarti
 * check-in kerja (logbook pengurus), hadir kegiatan (acara), dan mengajar
 * (kelas offline). Di sini hanya aturan pemilihan dan teks layar; penulisan
 * ada di ./queries.ts.
 */
import { LABEL_SESI, type Sesi } from "./types";

export type AcaraCalon = {
  id: string;
  nama: string;
  tanggal: string; // YYYY-MM-DD
  jamMulai: string | null; // "HH:MM[:SS]" WIB
  scanBukaAt: Date | null;
  scanTutupAt: Date | null;
  terdaftar: boolean; // orang ini ada di acara_pendaftaran
};

/** Tanpa jendela scan eksplisit: dari 60 menit sebelum mulai s.d. 3 jam sesudahnya. */
export const ACARA_SEBELUM_MENIT = 60;
export const ACARA_SESUDAH_MENIT = 180;

/**
 * Jendela kapan tap dihitung hadir kegiatan. Kegiatan tanpa jendela dan tanpa
 * jam mulai TIDAK ikut: tap check-in pagi di kantor tidak boleh menghadirkan
 * orang ke kajian malam di tempat lain hanya karena tanggalnya sama.
 */
export function jendelaAcara(a: Pick<AcaraCalon, "tanggal" | "jamMulai" | "scanBukaAt" | "scanTutupAt">): { buka: Date; tutup: Date } | null {
  if (a.scanBukaAt && a.scanTutupAt) return { buka: a.scanBukaAt, tutup: a.scanTutupAt };
  if (!a.jamMulai) return null;
  const mulai = new Date(`${a.tanggal}T${a.jamMulai.slice(0, 5)}:00+07:00`);
  return { buka: new Date(mulai.getTime() - ACARA_SEBELUM_MENIT * 60_000), tutup: new Date(mulai.getTime() + ACARA_SESUDAH_MENIT * 60_000) };
}

/**
 * Kegiatan mana yang dihadiri oleh tap ini: yang jendelanya mencakup waktu tap.
 * Lebih dari satu → yang orang ini terdaftar; masih lebih dari satu → tidak
 * menebak (null + daftar calon untuk ditinjau).
 */
export function pilihAcara(calon: readonly AcaraCalon[], waktu: Date): { acara: AcaraCalon | null; bentrok: AcaraCalon[] } {
  const t = waktu.getTime();
  const dalam = calon.filter((a) => {
    const j = jendelaAcara(a);
    return j !== null && j.buka.getTime() <= t && t <= j.tutup.getTime();
  });
  if (dalam.length <= 1) return { acara: dalam[0] ?? null, bentrok: [] };
  const terdaftar = dalam.filter((a) => a.terdaftar);
  if (terdaftar.length === 1) return { acara: terdaftar[0], bentrok: [] };
  return { acara: null, bentrok: dalam };
}

export type JenisArtiTap = "kerja" | "acara" | "mengajar" | "badal_mungkin" | "belajar" | "tak_terpetakan";
export type StatusArti = "tercatat" | "sudah" | "menunggu_sinkron" | "perlu_tinjau";
export type ArtiTap = { jenis: JenisArtiTap; status: StatusArti; label: string };

export function labelKerja(sesi: Sesi, jam: string, sudah: boolean): string {
  return sudah ? `Kerja · Sesi ${LABEL_SESI[sesi]} sudah tercatat ${jam}` : `Kerja · Sesi ${LABEL_SESI[sesi]} ${jam}`;
}

/** Nada layar kiosk dari kumpulan arti: ada yang baru tercatat → hijau. */
export function nadaTap(arti: readonly ArtiTap[]): "baru" | "sudah" | "tinjau" | "kosong" {
  if (arti.some((a) => a.status === "tercatat" || a.status === "menunggu_sinkron")) return "baru";
  if (arti.some((a) => a.status === "sudah")) return "sudah";
  if (arti.length > 0) return "tinjau";
  return "kosong";
}
