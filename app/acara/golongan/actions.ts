"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/acara/access";
import { isUuid, teks } from "@/lib/acara/input";
import { insertKlasifikasi, updateKlasifikasi } from "@/lib/hadir/queries-golongan";

export type GolonganState = { ok?: true; error?: string };

function urutanDari(v: FormDataEntryValue | null): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
}

export async function buatGolongan(_prev: GolonganState, form: FormData): Promise<GolonganState> {
  await requireStaff();
  const nama = teks(form.get("nama"), 80);
  if (!nama || nama.length < 3) return { error: "Nama golongan minimal 3 huruf." };
  await insertKlasifikasi({ nama, keterangan: teks(form.get("keterangan"), 200), urutan: urutanDari(form.get("urutan")) });
  revalidatePath("/acara/golongan");
  return { ok: true };
}

/**
 * Nama boleh berubah, `slug` tidak: rekap sesi lampau mengenali golongan lewat
 * slug, dan mengubahnya akan memutus riwayat.
 */
export async function simpanGolongan(id: string, form: FormData): Promise<GolonganState> {
  await requireStaff();
  if (!isUuid(id)) return { error: "Id tidak sah." };
  const nama = teks(form.get("nama"), 80);
  if (!nama || nama.length < 3) return { error: "Nama golongan minimal 3 huruf." };
  await updateKlasifikasi(id, {
    nama,
    keterangan: teks(form.get("keterangan"), 200),
    urutan: urutanDari(form.get("urutan")),
    aktif: form.get("aktif") === "on",
  });
  revalidatePath("/acara/golongan");
  return { ok: true };
}
