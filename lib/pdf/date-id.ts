/**
 * Indonesian date/number formatting shared by the PDF letter generators.
 *
 * Everything here is locale-independent on purpose: the server may run in UTC
 * (Azure/Vercel) while the letters are read in WIB, and `toLocaleDateString`
 * would quietly shift a date across midnight.
 */

export const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

/** "2026-04-30" -> "Kamis, 30 April 2026" (no timezone shift). */
export function formatIndonesianDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = DAYS_ID[date.getUTCDay()];
  return `${day}, ${d} ${MONTHS_ID[m - 1]} ${y}`;
}

/** "2025-07-30" -> "30 Juli 2025" — the form the HKM letters use (no weekday). */
export function formatTanggalIndonesia(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}

/**
 * Today in WIB (UTC+7) as YYYY-MM-DD, regardless of the server's timezone.
 * Kept as a re-export so there is exactly one implementation (lib/time/jakarta).
 */
export { todayJakarta as todayWibISO } from "@/lib/time/jakarta";

const UNITS = [
  "Nol", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan",
  "Sembilan", "Sepuluh", "Sebelas",
] as const;

/**
 * 4 -> "Empat", 12 -> "Dua Belas". Used for the surat peringatan bullets
 * ("Empat kali (4×) alpa."). Falls back to the digits past 99 — a peserta with
 * a three-digit alfa count has bigger problems than the letter's grammar.
 */
export function terbilang(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  const i = Math.floor(n);
  if (i < 12) return UNITS[i];
  if (i < 20) return `${UNITS[i - 10]} Belas`;
  if (i < 100) {
    const tens = Math.floor(i / 10);
    const rest = i % 10;
    return `${UNITS[tens]} Puluh${rest ? ` ${UNITS[rest]}` : ""}`;
  }
  return String(i);
}
