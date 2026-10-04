/**
 * Saringan `?fokus=…` halaman pengajar. Modul biasa, bukan bagian dari
 * `PengajarTable.tsx` (`"use client"`) — lihat catatan di `../peserta/fokus.ts`.
 */
export type PengajarFokus = "belum-presensi" | "bawah-target" | "tanpa-wa";

export const PENGAJAR_FOKUS: readonly PengajarFokus[] = ["belum-presensi", "bawah-target", "tanpa-wa"];

export const PENGAJAR_FOKUS_LABEL: Record<PengajarFokus, string> = {
  "belum-presensi": "Hanya yang belum dipresensi",
  "bawah-target": "Hanya yang di bawah ambang",
  "tanpa-wa": "Hanya yang tanpa nomor WA",
};

export function parsePengajarFokus(v: string | string[] | undefined): PengajarFokus | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return PENGAJAR_FOKUS.includes(s as PengajarFokus) ? (s as PengajarFokus) : undefined;
}
