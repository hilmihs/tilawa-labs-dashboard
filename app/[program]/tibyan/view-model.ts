/**
 * Pemetaan payload `rekap/tibyan` → baris siap render. Fungsi murni saja: tidak
 * ada DB, tidak ada Date "sekarang", supaya bisa diuji dengan fixture asli
 * (`lib/maahir/__fixtures__/tibyan.json`).
 *
 * Dua aturan yang dijaga di sini, bukan di JSX:
 *
 * 1. `persen: null` BUKAN 0. Dua dari 22 kelas di tangkapan asli belum punya
 *    sesi sama sekali; menampilkannya sebagai 0% berarti melaporkan "tidak ada
 *    yang hadir" untuk kelas yang memang belum jalan. Kelas begitu juga tidak
 *    diberi nomor peringkat — mendudukkannya di posisi buncit sama bohongnya.
 * 2. Tidak ada angka yang dihitung ulang dari kisi presensi. Docs §9 melarangnya
 *    (penyebut kehadiran mengecualikan `sakit`, anggota yang masuk di tengah
 *    periode penyebutnya dipotong). Yang dilakukan di sini hanya mengurutkan,
 *    membagi porsi distribusi, dan memformat — persennya tetap punya upstream.
 */
import type {
  MaahirCounts,
  MaahirKehadiranKode,
  MaahirTibyanPerhatianAnggota,
  MaahirTibyanPerhatianKelas,
  MaahirTibyanRanking,
  MaahirTibyanTrend,
} from "@/lib/maahir/types";
import type { StatusTone } from "@/lib/ui/status";
import { jakartaDate, jamWib } from "@/lib/time/jakarta";

// ── Tanggal (string in, string out — tanpa Date, tanpa timezone) ────────────

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/**
 * "2026-08-01" → "1 Agu 2026". Sengaja tidak lewat `new Date(iso)`: itu dibaca
 * sebagai tengah malam UTC dan tercetak mundur satu hari untuk siapa pun di
 * barat UTC. Mengembalikan input apa adanya kalau bukan tanggal ISO.
 */
export function formatTanggal(iso: string, withYear = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const bulan = Number(m[2]);
  if (bulan < 1 || bulan > 12) return iso;
  return `${Number(m[3])} ${BULAN_PENDEK[bulan - 1]}${withYear ? ` ${m[1]}` : ""}`;
}

/** Label "terakhir ditarik": jam WIB + tanggal, dari `maahir_rekap.fetched_at`. */
export function fetchedLabel(at: Date): string {
  return `${jamWib(at)} WIB · ${formatTanggal(jakartaDate(at))}`;
}

// ── Distribusi H/I/S/A/T ────────────────────────────────────────────────────

export const KODE_LABEL: Record<MaahirKehadiranKode, string> = {
  H: "Hadir",
  I: "Izin",
  S: "Sakit",
  A: "Alpa",
  T: "Terlambat",
};

export const KODE_TONE: Record<MaahirKehadiranKode, StatusTone> = {
  H: "success",
  I: "info",
  S: "teal",
  A: "danger",
  T: "warning",
};

const KODE_URUT: MaahirKehadiranKode[] = ["H", "T", "I", "S", "A"];

export type DistribusiRow = {
  kode: MaahirKehadiranKode;
  label: string;
  tone: StatusTone;
  jumlah: number;
  /** Porsi 0–100, atau null kalau belum ada satu pun catatan (bukan 0%). */
  share: number | null;
};

/** Kelima kode selalu muncul, termasuk yang nol — hilangnya baris "Alpa: 0"
 *  membuat pembaca mengira alpa-nya belum dihitung. */
export function distribusiRows(d: MaahirCounts | null | undefined): {
  rows: DistribusiRow[];
  total: number;
} {
  const total = KODE_URUT.reduce((n, k) => n + (d?.[k] ?? 0), 0);
  const rows = KODE_URUT.map((kode) => {
    const jumlah = d?.[kode] ?? 0;
    return {
      kode,
      label: KODE_LABEL[kode],
      tone: KODE_TONE[kode],
      jumlah,
      share: total > 0 ? (jumlah / total) * 100 : null,
    };
  });
  return { rows, total };
}

// ── Ranking kelas ───────────────────────────────────────────────────────────

export type RankingRow = MaahirTibyanRanking & {
  /** null = belum ada sesi, jadi tidak diberi nomor peringkat sama sekali. */
  peringkat: number | null;
};

/** Persen turun; kelas tanpa sesi (`persen: null`) selalu di bawah dan tanpa
 *  nomor. Nama kelas jadi pemecah seri supaya urutannya stabil antar render. */
export function rankingRows(ranking: MaahirTibyanRanking[]): RankingRow[] {
  const sorted = [...ranking].sort((a, b) => {
    if (a.persen == null || b.persen == null) {
      if (a.persen == null && b.persen == null) return a.kelasName.localeCompare(b.kelasName, "id");
      return a.persen == null ? 1 : -1;
    }
    if (a.persen !== b.persen) return b.persen - a.persen;
    return a.kelasName.localeCompare(b.kelasName, "id");
  });
  let n = 0;
  return sorted.map((r) => ({ ...r, peringkat: r.persen == null ? null : ++n }));
}

// ── Daftar perhatian ────────────────────────────────────────────────────────

/** Alpa beruntun paling panjang duluan — itu yang harus ditelepon hari ini —
 *  lalu persen terendah. */
export function perhatianAnggotaRows(
  rows: MaahirTibyanPerhatianAnggota[],
): MaahirTibyanPerhatianAnggota[] {
  return [...rows].sort(
    (a, b) =>
      b.alphaBeruntun - a.alphaBeruntun ||
      a.persen - b.persen ||
      a.name.localeCompare(b.name, "id"),
  );
}

export function perhatianKelasRows(
  rows: MaahirTibyanPerhatianKelas[],
): MaahirTibyanPerhatianKelas[] {
  return [...rows].sort((a, b) => a.persen - b.persen || a.kelasName.localeCompare(b.kelasName, "id"));
}

// ── Tren harian ─────────────────────────────────────────────────────────────

export type TrendChart = {
  points: number[];
  labels: string[];
  min: number;
  max: number;
  awal: MaahirTibyanTrend;
  akhir: MaahirTibyanTrend;
};

/** null kalau titiknya kurang dari dua — `<Sparkline>` memang tidak menggambar
 *  apa pun di bawah itu, dan satu titik bukan "tren". */
export function trendChart(trend: MaahirTibyanTrend[]): TrendChart | null {
  if (trend.length < 2) return null;
  const points = trend.map((t) => t.persen);
  return {
    points,
    labels: trend.map((t) => formatTanggal(t.tanggal, false)),
    min: Math.min(...points),
    max: Math.max(...points),
    awal: trend[0],
    akhir: trend[trend.length - 1],
  };
}
