/**
 * Track record per tahun di CV (design CV Individu c1, rekomendasi Batch 3):
 * angka hadir untuk kegiatan rutin + daftar kegiatan eventual, per tahun.
 * Murni. Dua sumber digabung dan selalu dibedakan asalnya:
 *  - tercatat sistem: presensi QR kajian (acara_hadir) dan kepanitiaan;
 *  - riwayat mandiri: dicentang orangnya sendiri, hanya dihitung bila sudah
 *    diverifikasi tim kaderisasi (yang menunggu tetap tampil, redup).
 */
import { namaKegiatan, type PeranRiwayat } from "./riwayat-template";

export type HadirTahun = { tahun: number; seri: string | null; acara: string };
export type PanitiaTahun = { tahun: number; acara: string; peran: string };
export type MandiriTahun = { tahun: number; kegiatan: string; peran: PeranRiwayat | string; status: string };

export type BarisTahun = {
  tahun: number;
  /** Jumlah kajian hadir per seri (atau nama acara bila tanpa seri). */
  rutin: { label: string; hadir: number }[];
  kepanitiaan: { acara: string; peran: string }[];
  mandiri: { nama: string; peran: string; menunggu: boolean }[];
  kosong: boolean;
};

const labelSeri = (s: string) =>
  s.replace(/^kajian-/, "Kajian ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function susunTrackRecord(input: {
  hadir: HadirTahun[];
  panitia: PanitiaTahun[];
  mandiri: MandiriTahun[];
  /** Tahun yang selalu ditampilkan walau kosong (mis. 2022–tahun ini). */
  tahun: number[];
}): BarisTahun[] {
  const semua = new Set<number>([...input.tahun, ...input.hadir.map((h) => h.tahun), ...input.panitia.map((p) => p.tahun), ...input.mandiri.map((m) => m.tahun)]);
  return [...semua]
    .sort((a, b) => b - a)
    .map((tahun) => {
      const perSeri = new Map<string, number>();
      for (const h of input.hadir.filter((x) => x.tahun === tahun)) {
        const k = h.seri ? labelSeri(h.seri) : h.acara;
        perSeri.set(k, (perSeri.get(k) ?? 0) + 1);
      }
      const rutin = [...perSeri.entries()].map(([label, hadir]) => ({ label, hadir })).sort((a, b) => b.hadir - a.hadir);
      const kepanitiaan = input.panitia.filter((p) => p.tahun === tahun).map(({ acara, peran }) => ({ acara, peran }));
      const mandiri = input.mandiri
        .filter((m) => m.tahun === tahun && m.status !== "ditolak")
        .map((m) => ({ nama: namaKegiatan(m.kegiatan), peran: String(m.peran), menunggu: m.status !== "terverifikasi" }));
      return { tahun, rutin, kepanitiaan, mandiri, kosong: !rutin.length && !kepanitiaan.length && !mandiri.length };
    });
}
