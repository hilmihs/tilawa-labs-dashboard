import { cache } from "react";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getProgram, type Program } from "@/lib/programs/resolve";

/**
 * Batches *inside* one program row.
 *
 * Distinct from lib/programs/families.ts, where each batch is its own program
 * row (hits-regular-jan / -apr / …). Rolling-batch programs — LAZ spins up a new
 * Tahsin Al-Fatihah batch every 1–2 weeks — set `config.syncAllBatches` instead,
 * so every upstream batch of the same tilawah program lands in one program's
 * mirror, tagged by `halaqah_sync.tilawah_batch_id`. This module lists those
 * batches so the dashboard can offer one option per batch.
 */
export type ProgramBatch = {
  id: number; // tilawah batch id
  label: string; // upstream batch name, e.g. "LAZ #40"
  halaqahCount: number;
};

/** Does this program deliberately mirror every upstream batch at once? */
export function syncsAllBatches(program: Pick<Program, "config">): boolean {
  return (program.config as { syncAllBatches?: boolean } | null)?.syncAllBatches === true;
}

/**
 * Batches present in this program's halaqah mirror, newest (highest id) first.
 * Empty for a program whose halaqah carry no batch id (non-tilawah sources).
 */
export const getProgramBatches = cache(async (programSlug: string): Promise<ProgramBatch[]> => {
  const program = await getProgram(programSlug);
  if (!program) return [];
  const rows = await getDb().execute(sql`
    select h.tilawah_batch_id as id,
      -- Upstream batch name off the mirrored payload; some are typed with stray
      -- double spaces ("LAZ  #40"), hence the whitespace collapse.
      max(regexp_replace(btrim(h.raw->'batch'->>'name'), '\\s+', ' ', 'g')) as label,
      count(*)::int as halaqah_count
    from halaqah_sync h
    where h.program_id = ${program.id} and h.tilawah_batch_id is not null
    group by 1
    order by 1 desc
  `);
  return rows.rows.map((r) => ({
    id: Number(r.id),
    label: (r.label as string) || `Batch ${r.id}`,
    halaqahCount: Number(r.halaqah_count),
  }));
});

/**
 * The batch scope a program shows when nothing is selected.
 *
 * `null` means "every batch" — the default for a syncAllBatches program, where
 * pinning to `programs.tilawah_batch_id` would hide every batch opened after the
 * pin was seeded (tafm-laz was showing 7 halaqah of LAZ #40 while #41 and #42
 * ran unseen). A pinned single-batch program keeps its pin.
 */
export function defaultBatchScope(program: Pick<Program, "config" | "tilawahBatchId">): number | null {
  return syncsAllBatches(program) ? null : (program.tilawahBatchId ?? null);
}

/** Which batch the page should show, from the `?batch=` param. */
export function resolveBatchParam(
  program: Program,
  batches: ProgramBatch[],
  param: string | undefined,
): number | null {
  if (param === "semua") return null;
  if (param) {
    const id = Number(param);
    if (Number.isFinite(id) && batches.some((b) => b.id === id)) return id;
  }
  return defaultBatchScope(program);
}
