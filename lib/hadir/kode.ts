/**
 * Kode QR per orang. Alfabet Crockford-ish tanpa huruf yang mudah tertukar
 * (0/O, 1/I/L) supaya kode yang diketik manual dari kartu cetak tidak salah.
 * 10 huruf dari 30 = ~49 bit; cukup untuk tidak bisa ditebak, cukup pendek
 * untuk QR yang terbaca kamera tablet murah dari jarak lengan.
 */
export const KODE_ALFABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const KODE_PANJANG = 10;
const KODE_RE = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{10}$/;

/** Web Crypto (Node ≥ 19 dan browser) — berkas ini ikut ke bundel klien pemindai. */
export function buatKode(n = KODE_PANJANG): string {
  const buf = new Uint8Array(n * 2);
  globalThis.crypto.getRandomValues(buf);
  let s = "";
  // Tolak-sampling: 256 % 30 ≠ 0, jadi byte ≥ 240 dibuang agar tiap huruf sama peluangnya.
  for (let i = 0; i < buf.length && s.length < n; i++) if (buf[i] < 240) s += KODE_ALFABET[buf[i] % KODE_ALFABET.length];
  while (s.length < n) { const b = new Uint8Array(1); globalThis.crypto.getRandomValues(b); if (b[0] < 240) s += KODE_ALFABET[b[0] % KODE_ALFABET.length]; }
  return s;
}

/**
 * Ambil kode dari apa pun yang dibaca kamera: URL penuh `https://host/h/KODE`,
 * path `/h/KODE`, atau kode mentah. Huruf kecil diterima (di-upper-case).
 * Null bila bukan kode kita — pemindai lalu menampilkan "tidak dikenal".
 */
export function ekstrakKode(teks: string | null | undefined): string | null {
  if (!teks) return null;
  let t = teks.trim();
  const m = t.match(/\/h\/([A-Za-z0-9]+)(?:[/?#].*)?$/);
  if (m) t = m[1];
  t = t.toUpperCase();
  return KODE_RE.test(t) ? t : null;
}

export function urlQr(base: string, kode: string): string {
  return `${base.replace(/\/+$/, "")}/h/${kode}`;
}
