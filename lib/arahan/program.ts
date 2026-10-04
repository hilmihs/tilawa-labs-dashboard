/**
 * Fokus pekanan program — halaman rotasi sesudah arahan Dewan di /arahan.
 *
 * Semua hitungan pekan di sini murni atas string 'YYYY-MM-DD' (Senin) dan satu
 * instant, dengan alasan yang sama seperti board.ts: server dan browser TV harus
 * sampai ke label yang sama persis.
 */

/**
 * Urutan baku program di papan, mengikuti papan tulis rapat. Program yang
 * tersimpan tapi tidak ada di sini tetap tampil, di urutan paling bawah.
 */
export const PROGRAM_PEKANAN = [
  "Maahir",
  "HITS",
  "ALS",
  "DPQ",
  "Tashil",
  "Sakan",
  "Disabilitas",
  "MLP",
  "SGA",
] as const;

export type ProgramTask = { program: string; task: string; urutan: number };
export type ProgramWeek = { weekStart: string; tasks: ProgramTask[] };

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const HARI_MS = 24 * 60 * 60 * 1000;

function parse(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Senin (kalender Jakarta) dari pekan yang memuat instant `ms`. */
export function seninPekanIni(ms: number): string {
  const j = new Date(ms + JAKARTA_OFFSET_MS);
  const hariKe = (j.getUTCDay() + 6) % 7; // Senin = 0
  return iso(new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - hariKe * HARI_MS));
}

/** Geser pekan `n` kali (negatif = mundur). */
export function geserPekan(senin: string, n: number): string {
  return iso(new Date(parse(senin).getTime() + n * 7 * HARI_MS));
}

/** `YYYY-MM-DD` yang valid dan jatuh pada hari Senin. */
export function isSenin(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parse(s);
  return !Number.isNaN(d.getTime()) && iso(d) === s && d.getUTCDay() === 1;
}

/**
 * Pekan ke berapa dalam bulan Senin-nya. Pekan pertama adalah pekan yang memuat
 * tanggal 1, walau terpotong — itu cara papan tulis rapat menghitung:
 * 1 September 2026 hari Selasa, jadi 14–20 September = Pekan ke-3.
 */
export function pekanKe(senin: string): number {
  const d = parse(senin);
  const tglSatu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const offset = (tglSatu.getUTCDay() + 6) % 7;
  return Math.floor((d.getUTCDate() - 1 + offset) / 7) + 1;
}

/** '14–20 September 2026', '28 September – 4 Oktober 2026', '29 Desember 2025 – 4 Januari 2026'. */
export function rentangPekan(senin: string): string {
  const a = parse(senin);
  const b = new Date(a.getTime() + 6 * HARI_MS);
  const [da, ma, ya] = [a.getUTCDate(), a.getUTCMonth(), a.getUTCFullYear()];
  const [db, mb, yb] = [b.getUTCDate(), b.getUTCMonth(), b.getUTCFullYear()];
  if (ya !== yb) return `${da} ${BULAN[ma]} ${ya} – ${db} ${BULAN[mb]} ${yb}`;
  if (ma !== mb) return `${da} ${BULAN[ma]} – ${db} ${BULAN[mb]} ${yb}`;
  return `${da}–${db} ${BULAN[mb]} ${yb}`;
}

/** 'Pekan ke-3 (14–20 September 2026)' */
export function labelPekan(senin: string): string {
  return `Pekan ke-${pekanKe(senin)} (${rentangPekan(senin)})`;
}

/** Urutkan menurut PROGRAM_PEKANAN; program di luar daftar menyusul menurut `urutan`. */
export function urutkanProgram(tasks: ProgramTask[]): ProgramTask[] {
  const rank = (p: string) => {
    const i = PROGRAM_PEKANAN.findIndex((x) => x.toLowerCase() === p.toLowerCase());
    return i === -1 ? PROGRAM_PEKANAN.length : i;
  };
  return [...tasks].sort(
    (a, b) => rank(a.program) - rank(b.program) || a.urutan - b.urutan || a.program.localeCompare(b.program),
  );
}
