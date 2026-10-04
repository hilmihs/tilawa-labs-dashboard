/**
 * Susunan logbook — murni. Bentuknya meniru lembar kertas "Logbook Kehadiran
 * Pengurus Pendidikan": tabel Ikhwan dan Akhwat, baris = orang, kolom =
 * tanggal × (P / Si / Sr), isi = jam datang HH.MM.
 */
import { jamTitik, jamWibDari } from "./sesi";
import { SESI, type Sesi, type SumberHadir } from "./types";

export type AnggotaLogbook = { orangId: string; nama: string; gender: string };
export type HadirLogbook = { orangId: string; tanggal: string; sesi: string; waktu: Date; sumber: string; catatan?: string | null };
export type Sel = { jam: string /* "HH.MM" */; sumber: SumberHadir; catatan: string | null } | null;
export type BarisLogbook = {
  no: number;
  orangId: string;
  nama: string;
  sel: Record<string /* tanggal */, Record<Sesi, Sel>>;
  /** Jumlah sesi terisi per sesi dan total, dalam rentang hari yang disusun. */
  jumlah: Record<Sesi | "total", number>;
};
export type Logbook = { hari: string[]; ikhwan: BarisLogbook[]; akhwat: BarisLogbook[] };

/** Semua tanggal "YYYY-MM-DD" dalam bulan "YYYY-MM". */
export function hariDalamBulan(bulan: string): string[] {
  const [y, m] = bulan.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${bulan}-${String(i + 1).padStart(2, "0")}`);
}

/** Potong hari jadi halaman berisi `per` tanggal (lembar kertas: 5 tanggal per halaman). */
export function potongHalaman<T>(xs: readonly T[], per = 5): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += per) out.push(xs.slice(i, i + per));
  return out;
}

export function susunLogbook(anggota: readonly AnggotaLogbook[], hadir: readonly HadirLogbook[], hari: readonly string[]): Logbook {
  const dalam = new Set(hari);
  const peta = new Map<string, Map<string, Record<Sesi, Sel>>>();
  for (const h of hadir) {
    if (!dalam.has(h.tanggal) || !(SESI as readonly string[]).includes(h.sesi)) continue;
    const perHari = peta.get(h.orangId) ?? new Map();
    const sel = perHari.get(h.tanggal) ?? { pagi: null, siang: null, sore: null };
    sel[h.sesi as Sesi] = { jam: jamTitik(jamWibDari(h.waktu)), sumber: h.sumber as SumberHadir, catatan: h.catatan ?? null };
    perHari.set(h.tanggal, sel);
    peta.set(h.orangId, perHari);
  }
  const baris = (a: AnggotaLogbook, i: number): BarisLogbook => {
    const perHari = peta.get(a.orangId);
    const sel: BarisLogbook["sel"] = {};
    const jumlah = { pagi: 0, siang: 0, sore: 0, total: 0 };
    for (const t of hari) {
      const s = perHari?.get(t) ?? { pagi: null, siang: null, sore: null };
      sel[t] = s;
      for (const k of SESI) if (s[k]) { jumlah[k]++; jumlah.total++; }
    }
    return { no: i + 1, orangId: a.orangId, nama: a.nama, sel, jumlah };
  };
  return {
    hari: [...hari],
    ikhwan: anggota.filter((a) => a.gender !== "P").map(baris),
    akhwat: anggota.filter((a) => a.gender === "P").map(baris),
  };
}
