"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/acara/access";
import { isUuid, pilihan, teks } from "@/lib/acara/input";
import { FATROH, QISM } from "@/lib/hadir/qism";
import {
  listOrangIdDirektori,
  setGolonganOrang,
  tambahGolonganBorongan,
  updateAtributOrang,
} from "@/lib/hadir/queries-golongan";

export type OrangState = { ok?: true; pesan?: string; error?: string };

export async function simpanOrang(orangId: string, form: FormData): Promise<OrangState> {
  await requireStaff();
  if (!isUuid(orangId)) return { error: "Id tidak sah." };
  const golongan = form.getAll("golongan").map(String).filter(isUuid);
  await setGolonganOrang(orangId, golongan);
  await updateAtributOrang(orangId, {
    qism: pilihan(form.get("qism"), QISM),
    mustawa: teks(form.get("mustawa"), 20),
    fatroh: pilihan(form.get("fatroh"), FATROH),
    asalSekolah: teks(form.get("asal_sekolah"), 120),
    programMp: teks(form.get("program_mp"), 80),
  });
  revalidatePath("/acara/orang");
  return { ok: true, pesan: "Tersimpan." };
}

/**
 * Tandai SELURUH hasil saringan sekarang (bukan hanya yang tampil di halaman)
 * dengan satu golongan. Tanpa ini, ratusan orang hasil impor tidak mungkin
 * digolongkan satu per satu.
 */
export async function golongkanBorongan(_prev: OrangState, form: FormData): Promise<OrangState> {
  await requireStaff();
  const klasifikasiId = String(form.get("klasifikasi_id") ?? "");
  if (!isUuid(klasifikasiId)) return { error: "Pilih golongan tujuan." };
  const filterGolongan = String(form.get("filter_golongan") ?? "");
  const ids = await listOrangIdDirektori({
    q: teks(form.get("q"), 80) ?? undefined,
    golonganId: isUuid(filterGolongan) ? filterGolongan : undefined,
    qism: pilihan(form.get("filter_qism"), QISM) ?? undefined,
    gender: pilihan(form.get("filter_gender"), ["L", "P"] as const) ?? undefined,
  });
  const n = await tambahGolonganBorongan(ids, klasifikasiId);
  revalidatePath("/acara/orang");
  return { ok: true, pesan: `${n} keanggotaan baru dari ${ids.length} orang hasil saringan.` };
}
