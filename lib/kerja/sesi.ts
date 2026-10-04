/**
 * Penentu sesi logbook — murni. Pagi = [pagiMulai, siangMulai),
 * Siang = [siangMulai, soreMulai), Sore = [soreMulai, selesai). Di luar itu null:
 * tap tetap disimpan, tapi tidak mengisi kolom mana pun.
 */
import { BATAS_BAWAAN, type BatasSesi, type Sesi } from "./types";

const menit = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

/** Jam dinding WIB "HH:MM" dari sebuah instan. */
export function jamWibDari(at: Date): string {
  const d = new Date(at.getTime() + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "HH:MM" → "HH.MM", format yang ditulis tangan di logbook kertas. */
export const jamTitik = (hhmm: string) => hhmm.slice(0, 5).replace(":", ".");

export function sesiDariJam(hhmm: string, b: BatasSesi = BATAS_BAWAAN): Sesi | null {
  const t = menit(hhmm);
  if (t < menit(b.pagiMulai) || t >= menit(b.selesai)) return null;
  if (t < menit(b.siangMulai)) return "pagi";
  if (t < menit(b.soreMulai)) return "siang";
  return "sore";
}

export function sesiDari(at: Date, b: BatasSesi = BATAS_BAWAAN): Sesi | null {
  return sesiDariJam(jamWibDari(at), b);
}

/**
 * Jam perangkat dipercaya hanya dalam batas: antrean offline boleh terlambat
 * dikirim (sampai 3 hari), tapi tidak boleh dari masa depan (> 2 menit) —
 * jam HP yang ngawur jatuh kembali ke jam server.
 */
export function waktuTepercaya(klien: string, server: Date): Date {
  const t = Date.parse(klien);
  if (!Number.isFinite(t)) return server;
  if (t > server.getTime() + 2 * 60_000) return server;
  if (t < server.getTime() - 3 * 86_400_000) return server;
  return new Date(t);
}

/** Batas yang masuk akal: urut naik dan format HH:MM. */
export function batasValid(b: BatasSesi): boolean {
  const ok = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  if (![b.pagiMulai, b.siangMulai, b.soreMulai, b.selesai].every(ok)) return false;
  return menit(b.pagiMulai) < menit(b.siangMulai) && menit(b.siangMulai) < menit(b.soreMulai) && menit(b.soreMulai) < menit(b.selesai);
}
