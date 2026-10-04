/**
 * Pembaca input formulir acara (buat acara & pengaturan acara). Ditaruh di lib,
 * bukan di komponen klien, supaya server action tidak pernah menarik berkas
 * "use client".
 *
 * Bentuknya mengikuti apa yang koordinator lihat, bukan apa yang DB simpan:
 * centang "wajib hadir" (bukan dropdown 3 pilihan per golongan), dan nama seri
 * ditulis sebagai kalimat biasa ("Kajian Rumah Belajar"), bukan slug.
 */
import { slugGolongan } from "./golongan";

export type SifatTarget = "wajib" | "diundang";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dua daftar centang → baris target. Golongan yang tercentang di dua-duanya
 * dihitung WAJIB saja: unique (acara, klasifikasi) melarang dua baris, dan
 * wajib adalah yang lebih kuat.
 */
export function bacaTargetCentang(
  wajib: readonly string[],
  diundang: readonly string[],
): { klasifikasiId: string; sifat: SifatTarget }[] {
  const out: { klasifikasiId: string; sifat: SifatTarget }[] = [];
  const sudah = new Set<string>();
  const tambah = (ids: readonly string[], sifat: SifatTarget) => {
    for (const id of ids) {
      if (!UUID_RE.test(id) || sudah.has(id)) continue;
      sudah.add(id);
      out.push({ klasifikasiId: id, sifat });
    }
  };
  tambah(wajib, "wajib");
  tambah(diundang, "diundang");
  return out;
}

/** Nilai pilihan "seri" yang berarti "buat seri baru". */
export const SERI_BARU = "__baru__";

/** Slug seri yang sah: huruf kecil, angka, tanda hubung. */
function seriSah(s: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 60 ? s : null;
}

/**
 * Dropdown seri + (bila "seri baru") nama yang ditulis koordinator.
 * Koordinator menulis "Kajian Rumah Belajar"; slug dibuat di sini.
 * Memilih seri baru tapi lupa mengisi namanya = tanpa seri, bukan galat:
 * seri hanya memengaruhi pembanding di rekap, tidak layak memblokir pembuatan acara.
 */
export function bacaSeriDariForm(pilih: unknown, namaBaru: unknown): string | null {
  const p = String(pilih ?? "").trim();
  if (!p) return null;
  if (p === SERI_BARU) {
    const slug = slugGolongan(String(namaBaru ?? ""));
    return slug ? seriSah(slug) : null;
  }
  return seriSah(p.toLowerCase());
}

/** Slug seri ditampilkan sebagai kata biasa: 'kajian-rumah-belajar' → 'Kajian Rumah Belajar'. */
export function labelSeri(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
