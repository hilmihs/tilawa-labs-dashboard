/**
 * Aturan murni halaman publik (/publik) — tanpa DB, supaya bisa diuji dan
 * dipakai di server maupun klien.
 */

export type StatusKey = "sehat" | "pantau" | "kritis" | "idle";
export type Gender = "Ikhwan" | "Akhwat";

/** Ambang bawaan bila program tak punya baris `attendance_thresholds`. */
export const AMBANG_BAWAAN = 70;

/**
 * Sehat = kehadiran ≥ ambang · Pantau = ambang−10 … ambang · Kritis = di bawahnya.
 * Tanpa angka (belum ada presensi 30 hari) = idle, bukan kritis.
 */
export function statusOf(pct: number | null, ambang: number): StatusKey {
  if (pct == null) return "idle";
  if (pct >= ambang) return "sehat";
  if (pct >= ambang - 10) return "pantau";
  return "kritis";
}

export const STATUS_LABEL: Record<StatusKey, string> = {
  sehat: "Sehat",
  pantau: "Pantau",
  kritis: "Kritis",
  idle: "Belum ada data",
};

/** 82.44 → "82,4%"; null → "—". */
export function pctLabel(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`;
}

export function angka(n: number): string {
  return n.toLocaleString("id-ID");
}

/** "Januari 2026" → "Jan '26"; label lain apa adanya. */
export function labelBatchPendek(label: string): string {
  const m = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  return m ? `${m[1].slice(0, 3)} '${m[2].slice(2)}` : label;
}

/** Senin-pertama, sama dengan urutan kolom jadwal. */
export const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Ahd"] as const;

/**
 * Nama hari Indonesia (termasuk ejaan "Jum'at", "Minggu") → indeks 0..6
 * Senin-pertama, atau null.
 */
export function indeksHari(nama: string): number | null {
  const n = nama.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (n.startsWith("sen")) return 0;
  if (n.startsWith("sel")) return 1;
  if (n.startsWith("rab")) return 2;
  if (n.startsWith("kam")) return 3;
  if (n.startsWith("jum")) return 4;
  if (n.startsWith("sab")) return 5;
  if (n.startsWith("ahad") || n.startsWith("ahd") || n.startsWith("ming")) return 6;
  return null;
}

/** "20:00 - 21:30" → "20:00"; selain bentuk jam → null. */
export function jamMulai(session: string | null | undefined): string | null {
  const m = session?.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const jam = `${m[1].padStart(2, "0")}:${m[2]}`;
  return jam === "00:00" ? null : jam;
}

/** Label jenjang untuk kode marhalah Mabni; label lain apa adanya. */
const MARHALAH: Record<string, string> = {
  MA: "Aṭfāl",
  M1: "Marhalah 1",
  M2: "Marhalah 2",
  M3: "Marhalah 3",
};

export function labelJenjang(level: string): string {
  return MARHALAH[level] ?? level;
}
