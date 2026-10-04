"use server";

import { revalidatePath } from "next/cache";
import { catatAksesStaff, requireStaff } from "@/lib/acara/access";
import { isUuid, pilihan, tanggalISO, teks } from "@/lib/acara/input";
import { getAcaraBySlug, getDivisiById, getTugasById, insertTugasStaff, updateTugasStaff } from "@/lib/acara/queries";
import { TUGAS_PRIORITAS, TUGAS_STATUS, TUGAS_STATUS_BERES, TUGAS_STATUS_TERKUNCI } from "@/lib/acara/types";

/**
 * Jalur tulis staff untuk tugas. Staff boleh menyetel status apa pun termasuk
 * disetujui/ditahan (keputusan koordinator) — itulah yang membedakannya dari
 * jalur token. Setiap perubahan dicatat dengan staff_id.
 *
 * Penyegaran: halaman staff memanggil revalidatePath di action (server-side);
 * papan token (force-dynamic, tanpa revalidatePath) menyegarkan di klien lewat
 * router.refresh(). Dua konvensi ini disengaja, jangan digabung.
 */
export type AksiResult = { ok: true } | { ok: false; error: string };

export async function ubahStatusTugasStaff(slug: string, tugasId: string, status: string): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  const s = pilihan(status, TUGAS_STATUS);
  if (!s) return { ok: false, error: "Status tidak dikenal." };
  if (!isUuid(tugasId)) return { ok: false, error: "Tugas tidak ditemukan." };
  const sebelum = await getTugasById(tugasId);
  if (!sebelum || sebelum.acaraId !== acara.id) return { ok: false, error: "Tugas tidak ditemukan." };
  try {
    const row = await updateTugasStaff(acara.id, tugasId, {
      status: s,
      selesaiAt: (TUGAS_STATUS_BERES as readonly string[]).includes(s) ? (sebelum.selesaiAt ?? new Date()) : null,
    });
    if (!row) return { ok: false, error: "Tugas tidak ditemukan." };
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  // Masuk ke atau keluar dari status terkunci (disetujui/ditahan) adalah
  // keputusan koordinator — dicatat sebagai "approval" supaya bisa ditanya
  // terpisah dari perubahan status biasa.
  const terkunci = TUGAS_STATUS_TERKUNCI as readonly string[];
  const aksi = terkunci.includes(s) || terkunci.includes(sebelum.status) ? "approval" : "ubah";
  await catatAksesStaff(user.sub, acara.id, aksi, { tabel: "acara_tugas", id: tugasId, dari: { status: sebelum.status }, ke: { status: s } });
  revalidatePath(`/acara/${slug}/tugas`);
  return { ok: true };
}

export async function tambahTugasStaff(
  slug: string,
  input: { judul: unknown; divisiId: unknown; fase: unknown; prioritas: unknown; tenggat: unknown; ditugaskanKe: unknown; deskripsi: unknown },
): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  const judul = teks(input.judul);
  if (!judul) return { ok: false, error: "Judul wajib diisi." };
  // divisiId dari klien harus milik acara ini — FK hanya menjamin ada.
  let divisiId: string | null = null;
  if (typeof input.divisiId === "string" && input.divisiId) {
    const divisi = isUuid(input.divisiId) ? await getDivisiById(input.divisiId) : null;
    if (!divisi || divisi.acaraId !== acara.id) return { ok: false, error: "Divisi bukan milik acara ini." };
    divisiId = divisi.id;
  }
  const fase = Number(input.fase);
  try {
    const row = await insertTugasStaff({
      acaraId: acara.id,
      divisiId,
      judul,
      deskripsi: teks(input.deskripsi, 2000),
      fase: Number.isInteger(fase) && fase >= 1 && fase <= 9 ? fase : 1,
      prioritas: pilihan(input.prioritas, TUGAS_PRIORITAS) ?? "sedang",
      tenggat: tanggalISO(input.tenggat),
      ditugaskanKe: teks(input.ditugaskanKe, 100),
    });
    await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "acara_tugas", id: row.id, ke: { judul } });
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  revalidatePath(`/acara/${slug}/tugas`);
  return { ok: true };
}
