/**
 * Kenapa sebuah route rekap tidak punya baris: belum pernah ditarik, atau
 * ditolak scope-nya.
 *
 * `readRekap()` mengembalikan `null` untuk dua sebab yang sangat berbeda itu.
 * Keduanya haram dirender sebagai 0, tapi tindak lanjutnya beda: yang pertama
 * "jalankan sync", yang kedua "minta scope ke Maahir". Pass rekap menandai
 * kasus kedua di `maahir_sync_state` dengan `entity = <nama route>`, jadi flag
 * itu yang dibaca di sini.
 *
 * Tidak pernah melempar: keterangan diagnostik tidak boleh jadi penyebab
 * halamannya sendiri gagal dirender.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { maahirSyncState } from "@/lib/db/schema";
import type { MaahirRekapRouteName } from "@/lib/integrations/maahir/rekap-routes";

export async function isRouteForbidden(
  programId: string,
  route: MaahirRekapRouteName,
): Promise<boolean> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ forbidden: maahirSyncState.forbidden })
      .from(maahirSyncState)
      .where(and(eq(maahirSyncState.programId, programId), eq(maahirSyncState.entity, route)));
    return row?.forbidden === true;
  } catch {
    return false;
  }
}
