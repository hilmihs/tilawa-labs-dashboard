/**
 * Why a rekap route has no row: never pulled, or refused by the API key.
 *
 * The sync pass flags a `403 forbidden_scope` in `maahir_sync_state.forbidden`
 * and then SKIPS that route on later runs, so the absence becomes permanent and
 * silent. The spec is explicit that a screen must say "scope belum diberikan"
 * instead of showing nothing — this read is the only way to tell the two apart.
 *
 * `entity` is matched against both the route name and its scope name because
 * the flag is written per-route today but the scope is what a 403 is really
 * about; matching both keeps the message right either way.
 *
 * Never throws: a diagnostic must not be the thing that breaks the page.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { maahirSyncState } from "@/lib/db/schema";
import {
  maahirRekapRoute,
  type MaahirRekapRouteName,
} from "@/lib/integrations/maahir/rekap-routes";

export async function scopeDitolak(
  programId: string,
  route: MaahirRekapRouteName,
): Promise<boolean> {
  try {
    const db = getDb();
    const rows = await db
      .select({ forbidden: maahirSyncState.forbidden })
      .from(maahirSyncState)
      .where(
        and(
          eq(maahirSyncState.programId, programId),
          inArray(maahirSyncState.entity, [route, maahirRekapRoute(route).scope]),
          eq(maahirSyncState.forbidden, true),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}
