/**
 * Data for `/[program]/disiplin`.
 *
 * `rekap/hits-disiplin` is pulled once for the whole of HITS, so the program
 * scoping happens HERE, against the `hits/halaqah` mirror: the batch ids pinned
 * on the program → the halaqah ids in those batches → the teachers the screen
 * keeps. Doing it any other way (by name, by guessing from the teacher list)
 * would either leak other batches into a coordinator's table or drop rows
 * silently.
 *
 * Every failure mode gets its OWN outcome instead of an empty payload, because
 * the spec forbids rendering "not fetched", "scope refused" and "nobody
 * offended" as the same zero.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { maahirSyncState, programs } from "@/lib/db/schema";
import { periodLabel, readHitsDisiplin, type MaahirRekapRead } from "@/lib/maahir/rekap";
import { monthOf, rekapMonths, shiftMonth } from "@/lib/integrations/maahir/rekap-routes";
import type { MaahirHitsDisiplinPayload } from "@/lib/maahir/types";
import { maahirHitsBatchIds } from "@/lib/programs/nav";
import { buildDisiplinView, type DisiplinView } from "./view-model";

/**
 * The Maahir batch(es) a program covers, from `config.maahirHitsBatchId`.
 *
 * Re-exported from `lib/programs/nav.ts` rather than re-implemented. The two
 * used to be byte-identical copies, which is exactly how a nav and a route gate
 * drift apart: `app/[program]/shakwa/page.tsx` had a third copy that only
 * accepted a bare string, so its pin branch could never fire against the list
 * the pin script actually writes. One definition, one meaning of "pinned".
 */
export const hitsBatchIds = maahirHitsBatchIds;

/**
 * Halaqah ids belonging to those batches, from the `hits/halaqah` mirror.
 *
 * Scoped to the `maahir_api` program because that is the only one the Maahir
 * sync writes into — reading it from the HITS program's own row would find
 * nothing. All 356 halaqah referenced by the 3 Sep capture resolve here, so an
 * empty result means the mirror was never synced, not that the batch is empty.
 */
export async function halaqahIdsForBatches(batchIds: string[]): Promise<Set<string>> {
  if (batchIds.length === 0) return new Set();
  const db = getDb();
  // Expanded into one bind per id instead of `= any(${batchIds})`: drizzle binds a
  // JS array as a SINGLE parameter, which Postgres then tries to read as an array
  // literal and rejects with `array_in: malformed array literal`.
  const rows = await db.execute<{ maahir_id: string }>(sql`
    select ms.maahir_id
    from maahir_sync ms
    join programs p on p.id = ms.program_id and p.data_source_type = 'maahir_api'
    where ms.entity = 'hits/halaqah'
      and ms.raw->>'batch_id' in (${sql.join(batchIds.map((b) => sql`${b}`), sql`, `)})
  `);
  return new Set(rows.rows.map((r) => r.maahir_id));
}

/**
 * Did the API key get refused for this data? `maahir_sync_state.forbidden` is
 * set on a 403 `forbidden_scope` so later runs skip the request; without this
 * check the screen would blame a missing sync for a permission problem.
 * Tolerates the rekap pass not keeping a state row of its own.
 */
async function scopeDitolak(): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ entity: maahirSyncState.entity })
    .from(maahirSyncState)
    .innerJoin(programs, eq(programs.id, maahirSyncState.programId))
    .where(
      and(
        eq(programs.dataSourceType, "maahir_api"),
        eq(maahirSyncState.forbidden, true),
        sql`${maahirSyncState.entity} in ('rekap/hits-disiplin', 'hits/halaqah')`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export type DisiplinData =
  | { state: "tanpa-pin" }
  | { state: "scope-ditolak" }
  | { state: "belum-ditarik" }
  | { state: "mirror-kosong"; batchIds: string[] }
  | {
      state: "siap";
      view: DisiplinView;
      /** Straight from `meta` — the full calendar month, NOT Maahir's 28→27. */
      periode: string | null;
      fetchedAt: Date;
      dariCache: boolean;
    };

/** The two months the sync keeps warm, newest first (spec: bulan berjalan + lalu). */
export function bulanPilihan(today: Date = new Date()): string[] {
  return [...rekapMonths(today)];
}

/**
 * Which month to render: the requested one when it is a well-formed `YYYY-MM`
 * the sync actually pulls, otherwise the current one. An out-of-range month is
 * corrected rather than fetched, since nothing outside the two-month window is
 * ever stored and the screen would only be able to say "belum ditarik".
 */
export function resolveBulan(requested: string | undefined, today: Date = new Date()): string {
  const pilihan = bulanPilihan(today);
  return requested && pilihan.includes(requested) ? requested : pilihan[0];
}

export async function loadDisiplin(config: unknown, bulan: string): Promise<DisiplinData> {
  const batchIds = hitsBatchIds(config);
  if (batchIds.length === 0) return { state: "tanpa-pin" };

  const [halaqah, rekap] = await Promise.all([
    halaqahIdsForBatches(batchIds),
    readHitsDisiplin(bulan) as Promise<MaahirRekapRead<MaahirHitsDisiplinPayload> | null>,
  ]);

  if (!rekap) {
    return (await scopeDitolak()) ? { state: "scope-ditolak" } : { state: "belum-ditarik" };
  }
  if (halaqah.size === 0) return { state: "mirror-kosong", batchIds };

  return {
    state: "siap",
    view: buildDisiplinView(rekap.payload, halaqah),
    periode: periodLabel(rekap.meta),
    fetchedAt: rekap.fetchedAt,
    dariCache: rekap.meta?.dari_cache === true,
  };
}

/** Label for the month picker: "Agustus 2026". Only the picker uses it — the
 *  period the numbers cover always comes from `meta` via `periodLabel`. */
export function labelBulan(bulan: string): string {
  const nama = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const [y, m] = bulan.split("-").map(Number);
  return nama[m - 1] ? `${nama[m - 1]} ${y}` : bulan;
}

// Re-exported so the page imports its month helpers from one place.
export { monthOf, shiftMonth };
