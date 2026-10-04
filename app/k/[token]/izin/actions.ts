"use server";

import { revalidatePath } from "next/cache";
import { addDaysISO, jakartaDate } from "@/lib/time/jakarta";
import { CATATAN_MAKS, IZIN_HARI_MAKS, periksaIzin, type TolakIzin } from "@/lib/kantor/izin";
import { batalkanIzin, buatIzin, getPetugasByToken, izinPetugas } from "@/lib/kantor/queries";
import { tokenSah } from "@/lib/kantor/token";

export type HasilIzin = { ok: true; id: string } | { ok: false; alasan: TolakIzin | "tautan-tidak-sah" };

export async function ajukanIzin(
  token: string,
  v: { dari: string; sampai: string; alasan: string; catatan: string },
): Promise<HasilIzin> {
  if (!tokenSah(token)) return { ok: false, alasan: "tautan-tidak-sah" };
  const petugas = await getPetugasByToken(token);
  if (!petugas) return { ok: false, alasan: "tautan-tidak-sah" };

  const hariIni = jakartaDate(); // tanggal server, bukan HP
  const catatan = String(v.catatan ?? "").trim().slice(0, CATATAN_MAKS + 1);
  const isian = { dari: String(v.dari), sampai: String(v.sampai), alasan: String(v.alasan), catatan };
  // Irisan diperiksa terhadap izin yang menyentuh jendela yang mungkin (hari ini … +14 hari).
  const ada = await izinPetugas(petugas.id, hariIni, addDaysISO(hariIni, IZIN_HARI_MAKS * 2));
  const k = periksaIzin(isian, hariIni, ada);
  if (!k.ok) return k;

  const i = await buatIzin({
    petugasId: petugas.id,
    dari: isian.dari,
    sampai: isian.sampai,
    alasan: isian.alasan,
    catatan: catatan || null,
  });
  revalidatePath("/operating-office");
  return { ok: true, id: i.id };
}

export async function batalIzin(token: string, id: string): Promise<{ ok: boolean }> {
  if (!tokenSah(token)) return { ok: false };
  const petugas = await getPetugasByToken(token);
  if (!petugas) return { ok: false };
  const ok = await batalkanIzin(petugas.id, id, jakartaDate());
  revalidatePath("/operating-office");
  revalidatePath(`/k/${token}`);
  return { ok };
}
