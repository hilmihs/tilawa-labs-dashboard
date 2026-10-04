/**
 * Skala penilaian Div. Kaderisasi — murni.
 *
 * Hearing 7 Sep memakai B/C/D/E; matrix Maahir memakai 0–4. Keduanya disimpan
 * (penilaian.nilai + nilai_angka) supaya tampilan bisa memilih. Pemetaan ke
 * angka di sini sementara: B 4 · C 3 · D 2 · E 1 — usulan batas balik dari rata-
 * rata (B ≥ 3,25 · C ≥ 2,5 · D ≥ 1,75 · E < 1,75) masih menunggu tim kaderisasi.
 */
import { ambangTerlambatMs } from "@/lib/hadir/view-model";
import type { StatusTone } from "@/lib/ui/status";

export const NILAI = ["B", "C", "D", "E"] as const;
export type Nilai = (typeof NILAI)[number];

export const ANGKA: Record<Nilai, number> = { B: 4, C: 3, D: 2, E: 1 };

/** Warna tetap per tingkat (design: B emerald · C teal · D amber · E merah). */
export const TONE: Record<Nilai, StatusTone> = { B: "success", C: "teal", D: "warning", E: "danger" };

export const isNilai = (v: unknown): v is Nilai => typeof v === "string" && (NILAI as readonly string[]).includes(v);

/** Rata-rata angka → huruf, dengan batas usulan. */
export function hurufDariRata(rata: number): Nilai {
  return rata >= 3.25 ? "B" : rata >= 2.5 ? "C" : rata >= 1.75 ? "D" : "E";
}

/** Median — ringkasan KPI di CV memakai median bila penilainya ≥ 2 (pagar mutu). */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Menit lewat ambang (jam mulai + toleransi) di atas ini → D, bukan C. */
export const LEWAT_BERAT_MENIT = 15;

/**
 * Saran nilai "Ketepatan waktu" dari presensi QR acara itu — prinsip 1 design:
 * yang bisa dihitung jangan diketik. Tepat waktu → B; lewat ambang ≤ 15 menit
 * → C; lebih dari itu → D. Tidak ada scan → tanpa saran (bisa jadi lupa scan;
 * E harus diputuskan manusia, dengan evidence).
 */
export function saranTepatWaktu(
  waktuHadirISO: string | null,
  acara: { tanggal: string; jamMulai: string | null; toleransiMenit: number },
): Nilai | null {
  if (!waktuHadirISO) return null;
  const ambang = ambangTerlambatMs(acara);
  if (ambang === null) return null;
  const t = Date.parse(waktuHadirISO);
  if (!Number.isFinite(t)) return null;
  const lewat = (t - ambang) / 60_000;
  return lewat <= 0 ? "B" : lewat <= LEWAT_BERAT_MENIT ? "C" : "D";
}

/** Nilai D/E wajib disertai contoh kejadian (pagar mutu 1). */
export function butuhEvidence(nilai: (Nilai | "" | null | undefined)[]): boolean {
  return nilai.some((n) => n === "D" || n === "E");
}
