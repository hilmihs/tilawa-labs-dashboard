/**
 * Nama tampil yang rapi untuk tabel `orang`. Murni.
 *
 * Nama masuk dari tiga tempat yang masing-masing diketik bebas: akun tilawah,
 * roster Maahir, dan Google Form kajian — "muhammad hanif alhafiz",
 * "Rafi Saputra", "Putri Camelia ulfah". Pembanding identitas tetap
 * `namaKunci`; fungsi di sini hanya soal bagaimana nama ditulis.
 */

const PARTIKEL_KECIL = new Set(["bin", "binti", "bint"]);

function kapital(kata: string): string {
  // "al-giffari" → "Al-Giffari", "fa'iqoh" → "Fa'iqoh"
  return kata
    .split("-")
    .map((bagian) => bagian.toLowerCase().replace(/[a-z]/, (h) => h.toUpperCase()))
    .join("-");
}

export function rapikanNama(raw: string | null | undefined): string {
  if (!raw) return "";
  const kata = String(raw).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const hasil: string[] = [];
  for (const k of kata) {
    // "Rafi Saputra": nama depan diulang untuk memenuhi kolom nama belakang CMS.
    if (hasil.length && hasil[hasil.length - 1].toLowerCase() === k.toLowerCase()) continue;
    const kecil = k.toLowerCase();
    if (hasil.length && PARTIKEL_KECIL.has(kecil)) hasil.push(kecil);
    else if (/^[a-z]\.$/i.test(k)) hasil.push(k.toUpperCase()); // "M." / "H."
    else hasil.push(kapital(k));
  }
  return hasil.join(" ");
}

/** Kata yang membuat nama "lebih lengkap": inisial ("A", "M.") dan kurung tidak dihitung. */
function jumlahKataBermakna(nama: string): number {
  return nama.split(" ").filter((k) => /^[A-Za-z][A-Za-z'-]+$/.test(k)).length;
}

/**
 * Pilih satu nama tampil dari beberapa ejaan orang yang sama: yang kata
 * bermaknanya paling banyak (nama lengkap mengalahkan panggilan), seri →
 * urutan masukan (pemanggil menaruh sumber paling tepercaya lebih dulu).
 */
export function pilihNamaTampil(kandidat: readonly string[]): string {
  let terbaik = "";
  let jumlah = -1;
  for (const k of kandidat) {
    const rapi = rapikanNama(k);
    const n = rapi ? jumlahKataBermakna(rapi) : -1;
    if (n > jumlah) {
      terbaik = rapi;
      jumlah = n;
    }
  }
  return terbaik;
}
