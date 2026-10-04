"use server";

import { revalidatePath } from "next/cache";
import { catatAksesStaff, requireStaff } from "@/lib/acara/access";
import { isUuid } from "@/lib/acara/input";
import { getAcaraBySlug, getBarangById, updateBarangStaff } from "@/lib/acara/queries";
import { BARANG_APPROVAL, type BarangApproval } from "@/lib/acara/types";

/**
 * Persetujuan barang adalah peran, bukan kolom teks (spec §1.5). Hanya akun staff
 * yang sampai ke sini; papan token tidak punya jalur ke updateBarangStaff. Setiap
 * perubahan dicatat: siapa (staff_id), kapan, dari apa ke apa.
 *
 * Penyegaran: revalidatePath di sini (server-side); komponen klien tidak
 * memanggil router.refresh() — konvensi halaman staff, lihat tugas/actions.ts.
 */
export type AksiResult = { ok: true } | { ok: false; error: string };

export async function ubahApprovalBarang(slug: string, barangId: string, status: string, alasan: unknown): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  if (!(BARANG_APPROVAL as readonly string[]).includes(status)) return { ok: false, error: "Status tidak dikenal." };
  const s = status as BarangApproval;
  const alasanTolak = s === "ditolak" ? (typeof alasan === "string" && alasan.trim() ? alasan.trim().slice(0, 300) : null) : null;
  if (s === "ditolak" && !alasanTolak) return { ok: false, error: "Alasan penolakan wajib diisi — divisi harus tahu kenapa." };
  if (!isUuid(barangId)) return { ok: false, error: "Barang tidak ditemukan." };
  const sebelum = await getBarangById(barangId);
  if (!sebelum || sebelum.acaraId !== acara.id) return { ok: false, error: "Barang tidak ditemukan." };
  try {
    await updateBarangStaff(acara.id, barangId, {
      statusApproval: s,
      approvalOlehStaffId: s === "diajukan" ? null : user.sub,
      approvalAt: s === "diajukan" ? null : new Date(),
      alasanTolak,
    });
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  await catatAksesStaff(user.sub, acara.id, "approval", {
    tabel: "acara_barang", id: barangId, dari: { statusApproval: sebelum.statusApproval }, ke: { statusApproval: s, alasanTolak },
  });
  revalidatePath(`/acara/${slug}/barang`);
  revalidatePath(`/acara/${slug}`);
  return { ok: true };
}

export async function tandaiKembali(slug: string, barangId: string, sudahKembali: boolean): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  if (!isUuid(barangId)) return { ok: false, error: "Barang tidak ditemukan." };
  const sebelum = await getBarangById(barangId);
  if (!sebelum || sebelum.acaraId !== acara.id) return { ok: false, error: "Barang tidak ditemukan." };
  try {
    await updateBarangStaff(acara.id, barangId, { sudahKembali, waktuKembali: sudahKembali ? new Date() : null });
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "acara_barang", id: barangId, dari: { sudahKembali: sebelum.sudahKembali }, ke: { sudahKembali } });
  revalidatePath(`/acara/${slug}/barang`);
  return { ok: true };
}
