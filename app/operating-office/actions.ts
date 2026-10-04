"use server";

import { revalidatePath } from "next/cache";
import { requireSuperUser } from "@/lib/auth/require";
import { buatUlangToken, catatAbsenManual, listPetugas, setelKantor, tambahPetugas, ubahPetugas } from "@/lib/kantor/queries";
import { addDaysISO, jakartaDate } from "@/lib/time/jakarta";

export type Hasil = { ok: true } | { ok: false; error: string };

/**
 * "+20 10 6768 2827" → "+201067682827"; "0812…" / "62812…" → "+62812…"; kosong → null.
 * Nomor tanpa kode negara selain format Indonesia ditolak (`undefined`): menebak
 * "+62" untuk "0106…" (Mesir, lokal) menghasilkan nomor orang lain.
 */
function normalWa(v: string): string | null | undefined {
  const d = v.replace(/[^\d+]/g, "");
  if (d === "") return null;
  if (/^\+\d{8,15}$/.test(d)) return d;
  if (/^08\d{7,12}$/.test(d)) return `+62${d.slice(1)}`;
  if (/^62\d{8,13}$/.test(d)) return `+${d}`;
  return undefined;
}

const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function simpanKantor(v: {
  lat: number;
  lng: number;
  radiusM: number;
  masulNama: string;
  masulWa: string;
}): Promise<Hasil> {
  const u = await requireSuperUser();
  const { lat, lng, radiusM } = v;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return { ok: false, error: "Koordinat tidak sah." };
  if (!Number.isInteger(radiusM) || radiusM < 20 || radiusM > 2000)
    return { ok: false, error: "Radius harus 20–2000 meter." };
  const masulWa = normalWa(v.masulWa);
  if (masulWa === undefined) return { ok: false, error: "Nomor WA mas'ul tidak dikenali. Tulis dengan kode negara, mis. +62 858…" };
  await setelKantor({ lat, lng, radiusM, masulNama: v.masulNama.trim() || null, masulWa, oleh: u.email });
  revalidatePath("/operating-office");
  return { ok: true };
}

export async function simpanPetugas(v: {
  id?: string;
  namaArab: string;
  namaLatin: string;
  wa: string;
  jamMasuk: string;
  aktif: boolean;
}): Promise<Hasil> {
  await requireSuperUser();
  if (!JAM.test(v.jamMasuk)) return { ok: false, error: "Jadwal masuk tidak sah (HH:MM)." };
  const namaArab = v.namaArab.trim();
  const namaLatin = v.namaLatin.trim();
  if (!namaArab || !namaLatin) return { ok: false, error: "Nama Arab dan nama Latin wajib diisi." };
  const wa = normalWa(v.wa);
  if (wa === undefined)
    return { ok: false, error: "Nomor WA tidak dikenali. Tulis dengan kode negara, mis. +20 10 6768 2827." };
  if (v.id) await ubahPetugas(v.id, { namaArab, namaLatin, wa, jamMasuk: v.jamMasuk, aktif: v.aktif });
  else await tambahPetugas({ namaArab, namaLatin, wa, jamMasuk: v.jamMasuk });
  revalidatePath("/operating-office");
  return { ok: true };
}

export async function gantiTautan(id: string): Promise<Hasil> {
  await requireSuperUser();
  await buatUlangToken(id);
  revalidatePath("/operating-office");
  return { ok: true };
}

/**
 * Admin mencatat kehadiran yang tak sempat ditekan syaikh (lupa, HP mati, GPS gagal).
 * Menimpa catatan hari itu; ditandai `dicatat_oleh` supaya tak tertukar dengan absen GPS.
 */
export async function catatManual(v: { petugasId: string; tanggal: string; masuk: string; keluar: string }): Promise<Hasil> {
  const u = await requireSuperUser();
  if (!(await listPetugas()).some((p) => p.id === v.petugasId)) return { ok: false, error: "Syaikh tidak ditemukan." };
  if (!ISO.test(v.tanggal) || addDaysISO(v.tanggal, 0) !== v.tanggal) return { ok: false, error: "Tanggal tidak sah." };
  if (v.tanggal > jakartaDate()) return { ok: false, error: "Tanggal belum tiba." };
  if (!JAM.test(v.masuk)) return { ok: false, error: "Jam masuk tidak sah (HH:MM)." };
  if (v.keluar && !JAM.test(v.keluar)) return { ok: false, error: "Jam keluar tidak sah (HH:MM)." };
  if (v.keluar && v.keluar <= v.masuk) return { ok: false, error: "Jam keluar harus sesudah jam masuk." };
  const wib = (jam: string) => new Date(`${v.tanggal}T${jam}:00+07:00`);
  try {
    await catatAbsenManual({
      petugasId: v.petugasId,
      tanggal: v.tanggal,
      masuk: wib(v.masuk),
      keluar: v.keluar ? wib(v.keluar) : null,
      oleh: u.email,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "kantor-belum-disetel") return { ok: false, error: "Titik kantor belum disetel." };
    throw e;
  }
  revalidatePath("/operating-office");
  return { ok: true };
}
