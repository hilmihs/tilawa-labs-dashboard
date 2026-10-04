/** Formatting helpers shared by the board's slides. No timezone maths here —
 *  every date arrives as a WIB "YYYY-MM-DD" string from lib/time/jakarta. */

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const HARI_PENDEK = ["Ahd", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
] as const;
/** The masthead has room to spell the month out, so it does. */
const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

function parts(iso: string): { y: number; m: number; d: number; dow: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "2026-08-14" -> "Jumat, 14 Agustus" */
export function tanggalPanjang(iso: string): string {
  const { m, d, dow } = parts(iso);
  return `${HARI[dow]}, ${d} ${BULAN_PANJANG[m - 1]}`;
}

/** "2026-08-14" -> "Jum 14" */
export function tanggalPendek(iso: string): string {
  const { d, dow } = parts(iso);
  return `${HARI_PENDEK[dow]} ${d}`;
}

/** "2026-08-14" + "2026-08-20" -> "14–20 Agustus" (or with both months when they differ). */
export function rentang(startIso: string, endIso: string): string {
  const a = parts(startIso);
  const b = parts(endIso);
  return a.m === b.m
    ? `${a.d}–${b.d} ${BULAN[a.m - 1]}`
    : `${a.d} ${BULAN[a.m - 1]} – ${b.d} ${BULAN[b.m - 1]}`;
}

/** 1234 -> "1.234" */
export function angka(n: number): string {
  return n.toLocaleString("id-ID");
}

export function persen(n: number | null): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}
