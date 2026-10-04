/**
 * Saringan `?fokus=…` halaman peserta. Sengaja modul biasa (bukan bagian dari
 * `PesertaTable.tsx` yang `"use client"`): nilai non-komponen yang diekspor
 * dari modul klien tiba di Server Component sebagai *client reference*, bukan
 * array — `PESERTA_FOKUS.includes` lalu melempar "is not a function" dan seluruh
 * halaman jatuh 500 (prod 11 Sep 2026).
 */
export type PesertaFokus = "bawah-target" | "tanpa-halaqah" | "tanpa-wa" | "keluar";

export const PESERTA_FOKUS: readonly PesertaFokus[] = [
  "bawah-target",
  "tanpa-halaqah",
  "tanpa-wa",
  "keluar",
];

export const PESERTA_FOKUS_LABEL: Record<PesertaFokus, string> = {
  "bawah-target": "Hanya yang di bawah ambang",
  "tanpa-halaqah": "Hanya yang belum punya halaqah",
  "tanpa-wa": "Hanya yang tanpa nomor WA",
  keluar: "Hanya yang keluar / tidak aktif",
};

/**
 * Next menyerahkan `?fokus=a&fokus=b` sebagai array; yang pertama dipakai.
 * Nilai tak dikenal diperlakukan sebagai "tanpa fokus", bukan galat.
 */
export function parsePesertaFokus(v: string | string[] | undefined): PesertaFokus | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return PESERTA_FOKUS.includes(s as PesertaFokus) ? (s as PesertaFokus) : undefined;
}
