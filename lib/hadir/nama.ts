/**
 * Bentuk banding nama — port dari scripts/hitung_unik.py normalize_name(),
 * supaya pencocokan impor xlsx ↔ guru_sync ↔ orang memakai aturan yang sama
 * dengan penghitungan orang unik bulanan.
 *
 * Gelar dibuang hanya dari DEPAN dan tidak sampai nama habis; peta ejaan hanya
 * untuk varian yang jelas satu kata yang sama (fitri ≠ fitria).
 */
const GELAR = new Set([
  "ust", "usta", "ustad", "ustadz", "ustadzah", "ustz", "ustadah", "ustadzh",
  "ummu", "ummi", "abi", "abu", "mas", "mba", "mbak", "pak", "bu", "bapak",
  "ibu", "kak", "teh", "dr", "drs", "h", "hj", "ir", "st", "spd", "syaikh",
  "syekh", "al", "ak", "ss", "mpd", "lc",
]);

const EJAAN: Record<string, string> = {
  abd: "abdul",
  muhamad: "muhammad", mohamad: "muhammad", mohammad: "muhammad", mhd: "muhammad", moh: "muhammad",
  m: "muhammad", muh: "muhammad",
  achmad: "ahmad", achmat: "ahmad", ahmat: "ahmad",
  syarifudin: "syarifuddin",
  sitti: "siti",
  aisiyah: "aisyah", aisah: "aisyah",
  fathimah: "fatimah",
  khodijah: "khadijah",
  abdurahim: "abdurrahim",
  abdurahman: "abdurrahman",
};

export function namaKunci(raw: string | null | undefined): string {
  if (!raw) return "";
  let t = String(raw).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  t = t.replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  const tokens = t.split(" ").filter(Boolean);
  while (tokens.length > 1 && GELAR.has(tokens[0])) tokens.shift();
  return tokens.map((x) => EJAAN[x] ?? x).join(" ");
}
