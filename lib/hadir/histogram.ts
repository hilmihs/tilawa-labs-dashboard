/**
 * Histogram kedatangan per 10 menit untuk panel hari-H (design "Acara" a3):
 * batang vertikal, garis jam mulai, arsir toleransi. Murni.
 *
 * `ringkasHadir` hanya mengembalikan bucket yang berisi; di sini celahnya
 * diisi nol supaya sumbu waktunya jujur (jeda 30 menit tanpa kedatangan
 * terlihat sebagai jeda, bukan dirapatkan).
 */
export type ZonaBin = "awal" | "toleransi" | "terlambat";
export type BinHistogram = { jam: string; jumlah: number; zona: ZonaBin };

const menit = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const jamDari = (mnt: number) => `${String(Math.floor(mnt / 60)).padStart(2, "0")}:${String(mnt % 60).padStart(2, "0")}`;

export function susunHistogram(
  histogram: readonly { jam: string; jumlah: number }[],
  jamMulai: string | null,
  toleransiMenit: number,
): { bins: BinHistogram[]; posisiMulai: number | null; lebarToleransi: number } {
  if (histogram.length === 0) return { bins: [], posisiMulai: null, lebarToleransi: 0 };
  const isi = new Map(histogram.map((h) => [menit(h.jam), h.jumlah]));
  const mulai = jamMulai ? menit(jamMulai.slice(0, 5)) : null;
  const awalBin = Math.floor(Math.min(...isi.keys(), ...(mulai != null ? [mulai] : [])) / 10) * 10;
  const akhirBin = Math.max(...isi.keys(), ...(mulai != null ? [mulai + toleransiMenit] : []));
  const bins: BinHistogram[] = [];
  for (let t = awalBin; t <= akhirBin; t += 10) {
    const zona: ZonaBin = mulai == null || t < mulai ? "awal" : t < mulai + toleransiMenit ? "toleransi" : "terlambat";
    bins.push({ jam: jamDari(t), jumlah: isi.get(t) ?? 0, zona });
  }
  const span = bins.length * 10;
  return {
    bins,
    posisiMulai: mulai == null ? null : (mulai - awalBin) / span,
    lebarToleransi: mulai == null ? 0 : toleransiMenit / span,
  };
}
