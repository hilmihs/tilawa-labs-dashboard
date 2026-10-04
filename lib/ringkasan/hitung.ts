/**
 * Hitungan ceklis ringkasan kajian. Fungsi murni, semua tanggal "YYYY-MM-DD"
 * WIB. Server berjalan di UTC, jadi "hari ini" tidak pernah dari `new Date()`
 * lokal — selalu lewat hariIniWib().
 */

/** Bulan pertama fitur ini berlaku (ceklis mulai Senin 14 Sep 2026). */
export const BULAN_PERTAMA = "2026-09";

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export type Rentang = { mulai: string; selesai: string | null };

export type Ringkas = {
  setor: number;
  berlaku: number;
  /** null = belum ada hari berlaku; UI menampilkan "—". */
  persen: number | null;
  /** Hari berlaku berurutan tanpa setor, mundur dari hari berlaku terakhir. */
  tunggakan: number;
};

export function hariIniWib(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function bulanDari(tanggal: string): string {
  return tanggal.slice(0, 7);
}

export function tanggalBulan(bulan: string): string[] {
  const [y, m] = bulan.split("-").map(Number);
  const jumlah = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: jumlah }, (_, i) => `${bulan}-${String(i + 1).padStart(2, "0")}`);
}

export function geserBulan(bulan: string, delta: number): string {
  const [y, m] = bulan.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function labelBulan(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  return `${NAMA_BULAN[m - 1]} ${y}`;
}

export function berlaku(tanggal: string, r: Rentang, hariIni: string): boolean {
  if (tanggal < r.mulai) return false;
  if (r.selesai && tanggal > r.selesai) return false;
  return tanggal <= hariIni;
}

export function ringkas(bulan: string, r: Rentang, setor: Set<string>, hariIni: string): Ringkas {
  const hari = tanggalBulan(bulan).filter((t) => berlaku(t, r, hariIni));
  const jumlahSetor = hari.filter((t) => setor.has(t)).length;
  let tunggakan = 0;
  for (let i = hari.length - 1; i >= 0 && !setor.has(hari[i]); i--) tunggakan++;
  return {
    setor: jumlahSetor,
    berlaku: hari.length,
    persen: hari.length === 0 ? null : Math.round((jumlahSetor / hari.length) * 100),
    tunggakan,
  };
}
