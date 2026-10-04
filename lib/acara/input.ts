/**
 * Validator input modul acara — murni, tanpa DB. Satu tempat supaya dua jalur
 * tulis (token divisi dan akun staff) tidak saling menjauh: aturan tanggal,
 * panjang teks, dan whitelist pilihan harus sama di keduanya.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fase tugas yang ditawarkan formulir dan saringan. */
export const FASE_TUGAS = [1, 2, 3] as const;

/** Teks bebas: trim, kosong → null, dipotong ke `max`. */
export function teks(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** YYYY-MM-DD yang benar-benar ada di kalender ("2026-02-30" → null). */
export function tanggalISO(v: unknown): string | null {
  if (typeof v !== "string" || !DATE_RE.test(v)) return null;
  return new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v ? v : null;
}

/** Whitelist: anggota `opsi` atau null. */
export function pilihan<T extends string>(v: unknown, opsi: readonly T[]): T | null {
  return typeof v === "string" && (opsi as readonly string[]).includes(v) ? (v as T) : null;
}

/** Id dari klien diperiksa bentuknya sebelum ke DB: uuid rusak melempar di pg, bukan "tidak ditemukan". */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
