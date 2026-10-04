/**
 * Daftar pengingat kegiatan untuk isian riwayat mandiri 2022–2025 (hearing
 * 7 Sep: kegiatan rutin dihitung kehadirannya, kegiatan eventual cukup
 * disebut). Orangnya mencentang, tidak mengetik — nama kegiatan di sini
 * sengaja pendek dan dikenal semua pengurus. Tambah baris di sini bila tim
 * kaderisasi menambah jenis kegiatan; kode tidak boleh diubah setelah dipakai.
 */
export const TAHUN_RIWAYAT = [2022, 2023, 2024, 2025] as const;

export type JenisKegiatan = "rutin" | "eventual";

export const KEGIATAN: readonly { kode: string; nama: string; jenis: JenisKegiatan }[] = [
  { kode: "kajian_rutin", nama: "Kajian rutin pekanan", jenis: "rutin" },
  { kode: "khutbah", nama: "Khutbah Jumat", jenis: "rutin" },
  { kode: "nurim", nama: "Halaqah Community Mosque", jenis: "rutin" },
  { kode: "pembinaan", nama: "Pembinaan pengajar", jenis: "rutin" },
  { kode: "mengajar_hits", nama: "Mengajar HITS", jenis: "rutin" },
  { kode: "kurban", nama: "Kurban", jenis: "eventual" },
  { kode: "kajian_lipia", nama: "Student open lecture", jenis: "eventual" },
  { kode: "tabligh_akbar", nama: "Tabligh Akbar", jenis: "eventual" },
  { kode: "ramadhan", nama: "Program Ramadhan", jenis: "eventual" },
  { kode: "dauroh", nama: "Dauroh / pelatihan", jenis: "eventual" },
];

export const PERAN_RIWAYAT = ["peserta", "panitia", "pengisi"] as const;
export type PeranRiwayat = (typeof PERAN_RIWAYAT)[number];
export const LABEL_PERAN_RIWAYAT: Record<PeranRiwayat, string> = { peserta: "Peserta", panitia: "Panitia", pengisi: "Pengisi / pemateri" };

/** "lain:Bakti sosial" → "Bakti sosial"; kode template → namanya. */
export function namaKegiatan(kode: string): string {
  if (kode.startsWith("lain:")) return kode.slice(5);
  return KEGIATAN.find((k) => k.kode === kode)?.nama ?? kode;
}
