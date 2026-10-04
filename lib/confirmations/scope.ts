import { and, asc, eq, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { programs } from "@/lib/db/schema";

/**
 * Which programs the monthly recap blast covers.
 *
 * Only tilawah-sourced programs qualify: the recap counts *meetings taught*,
 * and jadwal_sync (the per-meeting spine the recap reads) is only populated for
 * `data_source_type = 'tilawah_api'`. A google_sheet or manual program has no
 * meeting rows to confirm, and `hkm` is measured in pages rather than
 * attendance, so neither belongs in this flow.
 */

export type RecapProgram = { id: string; slug: string; name: string };

/**
 * Program yang ikut blast: semua sumber tilawah KECUALI hkm-presensi.
 *
 * Two independent reasons, both from HERMES.md §11:
 *  1. The owner asked that `hkm` and `hkm-presensi` stay out of every automated
 *     reminder — the existing presensi-nudge tool refuses them outright, and a
 *     recap blast is the same kind of unsolicited message.
 *  2. `hkm-presensi`'s upstream batch was reset on 27 Juli 2026, wiping the old
 *     attendance history. Its numbers for a window that starts 16 Juli are not
 *     comparable with any other program's, so asking its teachers to confirm
 *     them would be asking them to vouch for a broken record.
 *
 * `hkm` itself needs no entry here: it is sourced from berkah_api, so the
 * tilawah filter already excludes it.
 */
export const RECAP_EXCLUDED_SLUGS: readonly string[] = ["hkm-presensi"];

/**
 * The blast's program list, ordered by name so the agent's report and any
 * operator-facing listing read in a stable order.
 */
export async function getRecapPrograms(): Promise<RecapProgram[]> {
  const db = getDb();
  const excluded = [...RECAP_EXCLUDED_SLUGS];
  // drizzle's notInArray throws on an empty list, and an empty exclusion list is
  // a legitimate configuration ("blast everything tilawah").
  const where =
    excluded.length > 0
      ? and(eq(programs.dataSourceType, "tilawah_api"), notInArray(programs.slug, excluded))
      : eq(programs.dataSourceType, "tilawah_api");

  return db
    .select({ id: programs.id, slug: programs.slug, name: programs.name })
    .from(programs)
    .where(where)
    .orderBy(asc(programs.name));
}
