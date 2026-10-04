/**
 * Aturan murni daftar pengurus logbook (/operating-office/pengurus): memilih
 * orang untuk nama dari lembar kertas, hitung ulang urutan, samaran UID.
 * Tanpa DB — diuji di anggota-view.test.ts; penulisan ada di ./anggota.ts.
 */
import { namaKunci } from "@/lib/hadir/nama";
import { kandidatNama, type OrangCalon } from "@/lib/orang/tautan-panitia";

export type Calon = OrangCalon & { nama: string; kategori?: string | null };

/**
 * Nama kertas → orang:
 *  - `pakai` (hanya nama ≥ 2 kata): nama kunci persis sama dan hanya satu
 *    (menang atas awalan), atau awalan katanya cocok ke tepat satu orang
 *    segender ("Hilmi Hanif" → "Ilham Kamila Anggraini");
 *  - `ambigu`: dua atau lebih kandidat, atau nama satu kata ("Salma",
 *    "Izzuddin") yang punya kandidat, sekalipun persis — tidak ditebak,
 *    manusia memilih;
 *  - `baru`: tak ada kandidat sama sekali → dibuatkan orang baru.
 */
export type Pilihan = { jenis: "pakai"; orang: Calon } | { jenis: "ambigu"; kandidat: Calon[] } | { jenis: "baru" };

export function pilihOrang(nama: string, gender: string, orang: Calon[]): Pilihan {
  const kunci = namaKunci(nama);
  const awal = kandidatNama(nama, gender, orang) as Calon[];
  // Satu kata: "Salma" persis ada, tapi "Syahid Qonita Wijaya" dkk. juga Salma —
  // yang persis belum tentu pengurus yang dimaksud. Selalu tanyakan.
  if (kunci.split(" ").length < 2) return awal.length === 0 ? { jenis: "baru" } : { jenis: "ambigu", kandidat: urutPersisDulu(awal, kunci) };
  const persis = orang.filter((o) => o.gender === gender && o.namaKunci === kunci);
  if (persis.length === 1) return { jenis: "pakai", orang: persis[0] };
  if (persis.length > 1) return { jenis: "ambigu", kandidat: persis };
  if (awal.length === 0) return { jenis: "baru" };
  if (awal.length === 1) return { jenis: "pakai", orang: awal[0] };
  return { jenis: "ambigu", kandidat: awal };
}

function urutPersisDulu(c: Calon[], kunci: string): Calon[] {
  return [...c].sort((a, b) => Number(b.namaKunci === kunci) - Number(a.namaKunci === kunci) || a.nama.localeCompare(b.nama, "id"));
}

/**
 * Nama kertas yang sudah terwakili di daftar anggota: tepat satu anggota
 * segender yang cocok (persis atau awalan kata). Dipakai supaya isi ulang
 * tidak menanyakan lagi nama yang dulu dipilih tangan, dan untuk menghitung
 * "N nama belum ada" di halaman.
 */
export function anggotaUntuk(nama: string, gender: string, anggota: Calon[]): Calon | null {
  const kunci = namaKunci(nama);
  const persis = anggota.filter((o) => o.gender === gender && o.namaKunci === kunci);
  if (persis.length === 1) return persis[0];
  if (persis.length > 1) return null;
  const awal = kandidatNama(nama, gender, anggota) as Calon[];
  return awal.length === 1 ? awal[0] : null;
}

/** Nama kertas yang belum punya anggota — untuk menampilkan tombol "Isi daftar awal". */
export function belumTerdaftar<T extends { nama: string; gender: string }>(awal: T[], anggota: { nama: string; gender: string }[]): T[] {
  const calon = anggota.map((a, i) => ({ id: String(i), nama: a.nama, namaKunci: namaKunci(a.nama), gender: a.gender, wa: null }));
  return awal.filter((p) => !anggotaUntuk(p.nama, p.gender, calon));
}

/**
 * Geser satu anggota naik/turun di dalam kelompoknya (urutan tampil). Nilai
 * `urutan` lama bisa kembar (tambah manual, isi awal), jadi kelompok dinomori
 * ulang 0..n-1 setelah ditukar; yang dikembalikan hanya baris yang berubah.
 */
export function urutanBaru(
  kelompok: { id: string; urutan: number }[],
  id: string,
  arah: "naik" | "turun",
): { id: string; urutan: number }[] {
  const i = kelompok.findIndex((a) => a.id === id);
  const j = arah === "naik" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= kelompok.length) return [];
  const baru = [...kelompok];
  [baru[i], baru[j]] = [baru[j], baru[i]];
  return baru.flatMap((a, n) => (a.urutan === n ? [] : [{ id: a.id, urutan: n }]));
}

/** UID chip untuk layar: "04A23F1B6C8091" → "04A2…8091". Pendek dibiarkan utuh. */
export function samarUid(uid: string | null): string {
  if (!uid) return "";
  return uid.length <= 8 ? uid : `${uid.slice(0, 4)}…${uid.slice(-4)}`;
}

/** UID yang masuk akal dari pembaca USB/ketik: 8–20 digit hex (4/7/10 bait; desimal 10 digit juga lolos). */
export function uidSah(uid: string): boolean {
  return /^[0-9A-F]{8,20}$/.test(uid);
}
