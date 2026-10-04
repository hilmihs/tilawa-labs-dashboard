/**
 * "Apakah `rekap/shakwa` ditolak scope-nya?"
 *
 * KENAPA perlu: `readShakwa()` mengembalikan `null` untuk dua sebab yang beda
 * jauh — belum pernah ditarik, atau API key tidak punya scope `shakwa` (403
 * `forbidden_scope`). Dua-duanya haram dirender sebagai 0, tapi tindak lanjutnya
 * beda: yang pertama "jalankan sync Maahir", yang kedua "minta scope ke Maahir".
 * `runMaahirRekapPass` menandai kasus kedua di `maahir_sync_state` dengan
 * `entity = 'rekap/shakwa'`, jadi flag itu yang dibaca di sini.
 *
 * Baris state-nya milik program ber-`dataSourceType = 'maahir_api'` (satu-satunya
 * program yang menarik rekap), bukan program HITS yang sedang dibuka — halaman
 * ini hidup di bawah `/[program]/` tapi datanya datang dari sana.
 *
 * Berkas ini kembar dengan `app/[program]/tibyan/scope.ts`; keduanya sengaja
 * berdiri sendiri karena ditulis paralel. Layar rekap berikutnya sebaiknya
 * memindahkan keduanya ke `lib/maahir/`.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { maahirSyncState, programs } from "@/lib/db/schema";

export async function isShakwaForbidden(): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ forbidden: maahirSyncState.forbidden })
    .from(maahirSyncState)
    .innerJoin(programs, eq(programs.id, maahirSyncState.programId))
    .where(
      and(
        eq(programs.dataSourceType, "maahir_api"),
        eq(maahirSyncState.entity, "rekap/shakwa"),
      ),
    );
  return rows.some((r) => r.forbidden === true);
}
