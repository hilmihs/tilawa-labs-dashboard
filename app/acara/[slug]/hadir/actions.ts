"use server";

import { revalidatePath } from "next/cache";
import { catatAksesStaff, requireStaff } from "@/lib/acara/access";
import { isUuid } from "@/lib/acara/input";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { getOrangById, hapusHadir, insertHadirBatch, upsertPendaftaran } from "@/lib/hadir/queries";
import { cariAtauBuatOrang } from "@/lib/hadir/orang-baru";

export type AksiResult = { ok: true } | { ok: false; error: string };

/** Koreksi staff di panel: tandai hadir tanpa QR (tamu, HP mati) — metode 'manual', jam sekarang. */
export async function tandaiHadirManual(slug: string, orangId: string): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  if (!isUuid(orangId)) return { ok: false, error: "Orang tidak ditemukan." };
  const o = await getOrangById(orangId);
  if (!o) return { ok: false, error: "Orang tidak ditemukan." };
  try {
    const ditulis = await insertHadirBatch(acara.id, [{ klienId: `manual:${user.sub}:${Date.now()}`, orangId, waktu: new Date().toISOString(), metode: "manual" }], user.sub);
    if (ditulis.size === 0) return { ok: false, error: "Sudah tercatat hadir." };
  } catch (e) {
    console.error("tandai hadir gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "acara_hadir", id: orangId, dari: null, ke: { metode: "manual" } });
  revalidatePath(`/acara/${slug}/hadir`);
  return { ok: true };
}

/** Membatalkan scan yang salah orang. Baris dihapus; orang bisa discan lagi. */
export async function batalkanHadir(slug: string, orangId: string): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  if (!isUuid(orangId)) return { ok: false, error: "Orang tidak ditemukan." };
  let dari: unknown = null;
  try {
    const row = await hapusHadir(acara.id, orangId);
    if (!row) return { ok: false, error: "Belum tercatat hadir." };
    dari = { waktu: row.waktu.toISOString(), metode: row.metode };
  } catch (e) {
    console.error("batalkan hadir gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "acara_hadir", id: orangId, dari, ke: null });
  revalidatePath(`/acara/${slug}/hadir`);
  return { ok: true };
}

export type HasilTambah = { ok: true; orangId: string; nama: string; kode: string; sudahAda: boolean; hadirBaru: boolean } | { ok: false; error: string };

/**
 * Peserta yang belum ada di data (walk-in): buat orang + daftarkan + hadirkan
 * sekaligus. Nama persis (nama_kunci) yang sudah ada → orang itu yang dihadirkan,
 * tidak dibuat ganda. WA opsional; bila diisi dan sudah dipakai → orang itu yang dipakai.
 */
export async function tambahOrangHadir(
  slug: string,
  v: { nama: string; gender: string; programTeks: string; wa?: string | null },
): Promise<HasilTambah> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  const hasil = await cariAtauBuatOrang(v);
  if (!hasil.ok) return { ok: false, error: hasil.error };
  const { orang: o, sudahAda } = hasil;
  try {
    await upsertPendaftaran({ acaraId: acara.id, orangId: o.id, konfirmasi: null, sumber: "dashboard" });
    const ditulis = await insertHadirBatch(acara.id, [{ klienId: `tambah:${user.sub}:${Date.now()}`, orangId: o.id, waktu: new Date().toISOString(), metode: "manual" }], user.sub);
    await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "orang", id: o.id, dari: null, ke: { tambahDiLokasi: true, sudahAda, nama: o.nama, programTeks: o.programTeks } });
    revalidatePath(`/acara/${slug}/hadir`);
    revalidatePath(`/acara/${slug}/pendaftaran`);
    return { ok: true, orangId: o.id, nama: o.nama, kode: o.kodeQr, sudahAda, hadirBaru: ditulis.size > 0 };
  } catch (e) {
    console.error("tambah orang hadir gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
}
