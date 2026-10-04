"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperUser } from "@/lib/auth/require";
import { getDb } from "@/lib/db/client";
import { kantor } from "@/lib/db/schema";
import { getKantor } from "@/lib/kantor/queries";
import { batasValid } from "@/lib/kerja/sesi";
import type { BatasSesi } from "@/lib/kerja/types";

export type Hasil = { ok: true } | { ok: false; error: string };

/**
 * Simpan batas sesi logbook. Hanya mengubah cara tap BERIKUTNYA dibaca —
 * baris kerja_hadir yang sudah tercatat tidak dipindah sesi.
 */
export async function simpanSesi(v: BatasSesi): Promise<Hasil> {
  const u = await requireSuperUser();
  const b: BatasSesi = {
    pagiMulai: String(v.pagiMulai ?? "").slice(0, 5),
    siangMulai: String(v.siangMulai ?? "").slice(0, 5),
    soreMulai: String(v.soreMulai ?? "").slice(0, 5),
    selesai: String(v.selesai ?? "").slice(0, 5),
  };
  if (!batasValid(b)) return { ok: false, error: "Jam harus HH:MM dan urut naik: pagi < siang < sore < selesai." };
  const k = await getKantor();
  await getDb()
    .update(kantor)
    .set({
      sesiPagiMulai: b.pagiMulai,
      sesiSiangMulai: b.siangMulai,
      sesiSoreMulai: b.soreMulai,
      sesiSelesai: b.selesai,
      updatedAt: new Date(),
      updatedBy: u.email,
    })
    .where(eq(kantor.id, k.id));
  revalidatePath("/operating-office");
  revalidatePath("/operating-office/sesi");
  revalidatePath("/operating-office/kehadiran");
  return { ok: true };
}
