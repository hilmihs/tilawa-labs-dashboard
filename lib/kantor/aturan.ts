/**
 * Aturan absen Operating Office — satu-satunya tempat keputusan terima/tolak.
 * Murni: tanpa DB, tanpa next/*. Dipakai server action dan diuji unit.
 * Rancangan: docs/superpowers/specs/2026-09-23-operating-office-kehadiran-design.md §2.
 */
export const KELONGGARAN_MAKS_M = 50;
export const AKURASI_MAKS_M = 500;

export type JenisAbsen = "masuk" | "keluar";
export type Titik = { lat: number; lng: number };
export type KantorTitik = { lat: number | null; lng: number | null; radiusM: number };
export type Posisi = Titik & { akurasi: number };
export type StatusHari = { masuk: Date | null; keluar: Date | null };

export type AlasanTolak =
  | "posisi-tidak-sah"
  | "belum-masuk"
  | "sudah-masuk"
  | "sudah-keluar"
  | "kantor-belum-disetel"
  | "akurasi-buruk"
  | "di-luar-radius";

export type Keputusan =
  | { ok: true; jarakM: number }
  | { ok: false; alasan: AlasanTolak; jarakM?: number };

/** Haversine, meter. */
export function jarakMeter(a: Titik, b: Titik): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Baris absen SATU hari (WIB) → jam masuk/keluar. */
export function statusHari(rows: { jenis: string; waktu: Date }[]): StatusHari {
  return {
    masuk: rows.find((r) => r.jenis === "masuk")?.waktu ?? null,
    keluar: rows.find((r) => r.jenis === "keluar")?.waktu ?? null,
  };
}

function sah(p: Posisi): boolean {
  return (
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.akurasi) &&
    Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && p.akurasi >= 0
  );
}

/**
 * Urutan pemeriksaan: posisi sah → urutan harian → kantor punya titik →
 * akurasi → radius. Urutan harian didahulukan supaya "sudah tercatat" tidak
 * disamarkan jadi "di luar kantor".
 */
export function putuskanAbsen(
  jenis: JenisAbsen,
  kantor: KantorTitik,
  posisi: Posisi,
  hari: StatusHari,
): Keputusan {
  if (!sah(posisi)) return { ok: false, alasan: "posisi-tidak-sah" };
  if (jenis === "masuk" && hari.masuk) return { ok: false, alasan: "sudah-masuk" };
  if (jenis === "keluar" && !hari.masuk) return { ok: false, alasan: "belum-masuk" };
  if (jenis === "keluar" && hari.keluar) return { ok: false, alasan: "sudah-keluar" };
  if (kantor.lat == null || kantor.lng == null) return { ok: false, alasan: "kantor-belum-disetel" };
  if (posisi.akurasi > AKURASI_MAKS_M) return { ok: false, alasan: "akurasi-buruk" };
  const jarakM = jarakMeter(posisi, { lat: kantor.lat, lng: kantor.lng });
  const efektif = Math.max(0, jarakM - Math.min(posisi.akurasi, KELONGGARAN_MAKS_M));
  if (efektif > kantor.radiusM) return { ok: false, alasan: "di-luar-radius", jarakM };
  return { ok: true, jarakM };
}
