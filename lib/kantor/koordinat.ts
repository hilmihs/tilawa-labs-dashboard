/**
 * Membaca titik kantor dari teks bebas: "-6.27, 106.84" atau tautan Google Maps.
 *
 * Urutan penting. Tautan tempat (`/maps/place/...`) memuat DUA pasang angka:
 * `@lat,lng,zoom` adalah pusat TAMPILAN peta, sedangkan `!3dLAT!4dLNG` adalah
 * pin tempatnya. Keduanya bisa terpaut ratusan meter — tautan "Rumah Belajar"
 * (25 Sep 2026) berselisih ±285 m, cukup untuk menolak semua absen di radius
 * 100 m. Jadi pin dibaca lebih dulu, lalu parameter `q=`/`query=`/`ll=`, baru
 * `@`, dan terakhir pasangan angka mana pun.
 *
 * Satu tautan bisa memuat beberapa pin: membuka tempat kedua dari hasil
 * pencarian menyimpan pin tempat pertama di depan (`!1m7…!3d…` lalu
 * `!3m5…!3d…`). Tempat yang sedang dibuka — yang namanya ada di
 * `/place/<nama>` — adalah pin TERAKHIR.
 *
 * Tautan pendek (maps.app.goo.gl) tidak memuat koordinat sama sekali — hanya
 * bisa dibaca setelah dibuka di browser; itu yang dilaporkan `tautanPendek`.
 */
export type Koordinat = { lat: number; lng: number };

const ANGKA = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

const PIN = new RegExp(String.raw`!3d${ANGKA}!4d${ANGKA}`, "g");

const POLA: RegExp[] = [
  new RegExp(String.raw`[?&](?:q|query|ll|destination)=${ANGKA}\s*,\s*${ANGKA}`),
  new RegExp(String.raw`@${ANGKA},${ANGKA}`),
  new RegExp(String.raw`${ANGKA}\s*,\s*${ANGKA}`),
];

export function bacaKoordinat(teks: string): Koordinat | null {
  let s = teks.trim();
  try {
    s = decodeURIComponent(s); // "%2C" di q=-6.27%2C106.84
  } catch {
    // Teks biasa berisi "%" tak valid — pakai apa adanya.
  }
  const pins = [...s.matchAll(PIN)];
  const kandidat = [pins.at(-1), ...POLA.map((pola) => pola.exec(s))];
  for (const m of kandidat) {
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

/** maps.app.goo.gl / goo.gl/maps: tautan bagikan tanpa koordinat. */
export function tautanPendek(teks: string): boolean {
  return /\b(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(teks);
}
