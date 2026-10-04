/**
 * Matrix penilaian Maahir untuk CV satu orang: baris = indikator (dikelompokkan
 * hard skill / pedagogis / soft skill), kolom = bulan. Murni — datanya dari
 * `lib/orang/matrix.ts`.
 *
 * Kelompok dan labelnya dipinjam dari tab Pengajar HITS
 * (`KELOMPOK_KOMPONEN`) supaya dua layar menamai skor yang sama dengan sama.
 * Bedanya: di sini baris yang kosong di SEMUA bulan disembunyikan dan disebut
 * sekali di catatan kaki — satu orang, bukan rapor seangkatan, jadi deretan
 * "—" hanya menenggelamkan skor yang ada.
 *
 * Skala upstream 0–4. Null = belum dinilai, bukan nol.
 */
import type { MaahirMatrixSkor } from "@/lib/maahir/types";
import type { StatusTone } from "@/lib/ui/status";
import { KELOMPOK_KOMPONEN, nilaiKomponen } from "@/app/[program]/pengajar/view-model";

/** Bulan yang ditampilkan paling banyak — lebih dari itu tabel melebar di HP. */
export const MAKS_BULAN = 6;

export type BarisMatrix = {
  key: keyof MaahirMatrixSkor;
  label: string;
  /** Rata-rata kelompok (baris tebal) atau komponen. */
  jenis: "rata" | "komponen" | "total";
  nilai: (number | null)[]; // sejajar dengan `bulan`
};

export type MatrixOrang = {
  bulan: string[]; // "2026-05", lama → baru
  baris: BarisMatrix[];
  belumPernah: string[]; // label komponen yang kosong di semua bulan
  terakhir: {
    bulan: string;
    keseluruhan: number | null;
    ranking: number | null;
    dariRanking: number | null;
    teguranBulan: number;
    teguranKumulatif: number;
  } | null;
};

/**
 * Satu baris per bulan. Orang dengan dua akun pengajar bisa punya dua baris di
 * bulan yang sama; yang terakhir diperbarui menang.
 */
export function pilihPerBulan(rows: MaahirMatrixSkor[]): MaahirMatrixSkor[] {
  const per = new Map<string, MaahirMatrixSkor>();
  for (const r of rows) {
    if (!r.year_month) continue;
    const ada = per.get(r.year_month);
    if (!ada || (r.updated_at ?? "") > (ada.updated_at ?? "")) per.set(r.year_month, r);
  }
  return [...per.values()].sort((a, b) => a.year_month.localeCompare(b.year_month));
}

export function susunMatrix(
  rows: MaahirMatrixSkor[],
  rankedPerBulan: Record<string, number> = {},
): MatrixOrang | null {
  const perBulan = pilihPerBulan(rows).slice(-MAKS_BULAN);
  if (perBulan.length === 0) return null;
  const bulan = perBulan.map((r) => r.year_month);
  const ambil = (key: keyof MaahirMatrixSkor) => perBulan.map((r) => nilaiKomponen(r, key));
  const adaNilai = (v: (number | null)[]) => v.some((x) => x != null);

  const baris: BarisMatrix[] = [];
  const belumPernah: string[] = [];
  for (const k of KELOMPOK_KOMPONEN) {
    baris.push({ key: k.rata, label: k.judul, jenis: "rata", nilai: ambil(k.rata) });
    for (const c of k.komponen) {
      const nilai = ambil(c.key);
      if (adaNilai(nilai)) baris.push({ key: c.key, label: c.label, jenis: "komponen", nilai });
      else belumPernah.push(c.label);
    }
  }
  baris.push({
    key: "rata_rata_keseluruhan",
    label: "Keseluruhan",
    jenis: "total",
    nilai: ambil("rata_rata_keseluruhan"),
  });

  const t = perBulan[perBulan.length - 1];
  return {
    bulan,
    baris,
    belumPernah,
    terakhir: {
      bulan: t.year_month,
      keseluruhan: nilaiKomponen(t, "rata_rata_keseluruhan"),
      ranking: nilaiKomponen(t, "ranking"),
      dariRanking: rankedPerBulan[t.year_month] ?? null,
      teguranBulan: t.total_teguran_bulan ?? 0,
      teguranKumulatif: t.total_teguran_kumulatif ?? 0,
    },
  };
}

/**
 * Warna sel. Ambangnya membaca skala 0–4 sebagai rubrik (4 sangat baik … 1
 * kurang), bukan ambang resmi Maahir — Maahir tidak menerbitkan ambang.
 */
export function toneSkor(v: number | null): StatusTone {
  if (v == null) return "neutral";
  if (v >= 3.5) return "success";
  if (v >= 2.5) return "teal";
  if (v >= 1.5) return "warning";
  return "danger";
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-08" → "Agu 26". */
export function labelBulan(ym: string): string {
  const [y, m] = ym.split("-");
  return `${BULAN[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

/** 3 → "3", 2.333 → "2,33". */
export function formatSkor(v: number | null): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
