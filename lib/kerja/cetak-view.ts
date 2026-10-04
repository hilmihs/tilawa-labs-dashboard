/**
 * Tata letak cetak logbook — murni. Meniru lembar kertas "Logbook Kehadiran
 * Pengurus Pendidikan" (A4 lanskap): satu lembar = satu blok (Ikhwan/Akhwat)
 * × 5 tanggal × paling banyak BARIS_PER_LEMBAR orang, tiap lembar punya baris
 * "Diperiksa" sendiri untuk paraf.
 */
import { addDaysISO, diffDaysISO, isoDow } from "@/lib/time/jakarta";
import { potongHalaman, type BarisLogbook, type Logbook } from "./logbook";
import { SESI } from "./types";

/** Lembar kertas: 5 tanggal per halaman. */
export const TGL_PER_LEMBAR = 5;
/**
 * Baris setinggi ~6,8 mm (masih cukup untuk tulisan tangan) → 20 orang muat,
 * di A4 lanskap bersama judul, kepala tabel, dan baris "Diperiksa".
 */
export const BARIS_PER_LEMBAR = 20;
/** Rentang ?dari&sampai paling panjang (± 3 bulan) — lebih dari itu dipotong. */
export const RENTANG_MAKS = 93;

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** Indeks = isoDow (1 = Senin … 7 = Ahad). */
const HARI = ["", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Ahad"];

const RE_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_TGL = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const bulanValid = (s: unknown): s is string => typeof s === "string" && RE_BULAN.test(s);
/** Tanggal kalender sungguhan (2026-02-30 ditolak). */
export const tanggalValid = (s: unknown): s is string => typeof s === "string" && RE_TGL.test(s) && addDaysISO(s, 0) === s;

/** "2026-09" + 1 → "2026-10"; mundur lintas tahun juga. */
export function geserBulan(bulan: string, n: number): string {
  const [y, m] = bulan.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** "2026-09" → "September 2026". */
export function labelBulan(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  return `${BULAN[m - 1]} ${y}`;
}

/**
 * Isian "Bulan/Tahun" satu lembar dari tanggal-tanggalnya: biasanya satu
 * bulan; rentang ?dari&sampai bisa melintas bulan → "September – Oktober 2026".
 */
export function labelBulanTahun(hari: readonly (string | null)[]): string {
  const bulan = [...new Set(hari.filter((t): t is string => !!t).map((t) => t.slice(0, 7)))].sort();
  if (bulan.length === 0) return "";
  const awal = bulan[0];
  const akhir = bulan[bulan.length - 1];
  if (awal === akhir) return labelBulan(awal);
  if (awal.slice(0, 4) === akhir.slice(0, 4)) return `${BULAN[Number(awal.slice(5)) - 1]} – ${labelBulan(akhir)}`;
  return `${labelBulan(awal)} – ${labelBulan(akhir)}`;
}

/** "2026-09-29" → { tgl: 29, hari: "Sel" } untuk kepala kolom "Tgl 29". */
export function kepalaTgl(iso: string): { tgl: number; hari: string } {
  return { tgl: Number(iso.slice(8, 10)), hari: HARI[isoDow(iso)] };
}

/** Semua tanggal dari `dari` s.d. `sampai` (inklusif), dipotong RENTANG_MAKS hari. */
export function rentangHari(dari: string, sampai: string): string[] {
  const n = Math.min(diffDaysISO(sampai, dari) + 1, RENTANG_MAKS);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDaysISO(dari, i));
}

export type ParamCetak = {
  /** Bulan acuan navigasi (prev/next, kembali ke logbook). */
  bulan: string;
  hari: string[];
  rentang: { dari: string; sampai: string } | null;
  kosong: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;
const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * ?bulan=YYYY-MM (bawaan: bulan berjalan WIB), atau ?dari&sampai (keduanya
 * wajib, dari ≤ sampai), dan ?kosong=1 untuk formulir kosong (nama saja).
 * Nilai yang ngawur jatuh diam-diam ke bawaan — halaman cetak tidak perlu galat.
 */
export function bacaParamCetak(sp: SearchParams, hariIni: string): ParamCetak {
  const kosong = satu(sp.kosong) === "1";
  const dari = satu(sp.dari);
  const sampai = satu(sp.sampai);
  if (tanggalValid(dari) && tanggalValid(sampai) && dari <= sampai) {
    const hari = rentangHari(dari, sampai);
    return { bulan: dari.slice(0, 7), hari, rentang: { dari, sampai: hari[hari.length - 1] }, kosong };
  }
  const b = satu(sp.bulan);
  const bulan = bulanValid(b) ? b : hariIni.slice(0, 7);
  const [y, m] = bulan.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hari = Array.from({ length: n }, (_, i) => `${bulan}-${String(i + 1).padStart(2, "0")}`);
  return { bulan, hari, rentang: null, kosong };
}

/** Tautan halaman cetak dengan parameter yang sama. */
export function hrefCetak(p: { bulan: string; rentang?: { dari: string; sampai: string } | null; kosong?: boolean }): string {
  const q = new URLSearchParams();
  if (p.rentang) {
    q.set("dari", p.rentang.dari);
    q.set("sampai", p.rentang.sampai);
  } else q.set("bulan", p.bulan);
  if (p.kosong) q.set("kosong", "1");
  return `/operating-office/kehadiran/cetak?${q}`;
}

/**
 * Bagi rata: 19 orang dengan maks 14 → 10 + 9, bukan 14 + 5, supaya lembar
 * kedua tidak nyaris kosong.
 */
export function bagiRata<T>(xs: readonly T[], maks: number): T[][] {
  if (xs.length === 0) return [];
  const lembar = Math.ceil(xs.length / maks);
  return potongHalaman(xs, Math.ceil(xs.length / lembar));
}

export type Blok = "IKHWAN" | "AKHWAT";
export type Lembar = {
  kunci: string;
  blok: Blok;
  /** Selalu TGL_PER_LEMBAR kolom; null = kolom tanggal kosong di lembar terakhir. */
  hari: (string | null)[];
  baris: BarisLogbook[];
  /** Ada sel "manual" di lembar ini → tampilkan catatan kaki "* diisi manual". */
  adaManual: boolean;
};

/**
 * Urutan lembar: Ikhwan dulu, lalu Akhwat; di dalam blok per 5 tanggal, lalu
 * per potongan orang. Blok tanpa anggota tidak dicetak. Nomor baris tetap
 * bersambung (dari BarisLogbook.no) meski orangnya terbagi dua lembar.
 */
export function susunLembar(lb: Logbook, opts: { tglPerLembar?: number; barisPerLembar?: number } = {}): Lembar[] {
  const per = opts.tglPerLembar ?? TGL_PER_LEMBAR;
  const maks = opts.barisPerLembar ?? BARIS_PER_LEMBAR;
  const potongHari = potongHalaman(lb.hari, per).map((h) => [...h, ...Array<null>(per - h.length).fill(null)]);
  const out: Lembar[] = [];
  for (const [blok, semua] of [["IKHWAN", lb.ikhwan], ["AKHWAT", lb.akhwat]] as const) {
    const potongOrang = bagiRata(semua, maks);
    for (const hari of potongHari) {
      for (const baris of potongOrang) {
        const adaManual = baris.some((b) => hari.some((t) => t && SESI.some((s) => b.sel[t]?.[s]?.sumber === "manual")));
        out.push({ kunci: `${blok}-${hari[0]}-${baris[0].no}`, blok, hari, baris, adaManual });
      }
    }
  }
  return out;
}
