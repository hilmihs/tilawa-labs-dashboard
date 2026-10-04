import { sql } from "drizzle-orm";

/**
 * "Current batch only" guard for queries over the halaqah mirror. Requires `h`
 * (halaqah_sync) and `p` (programs) in scope.
 *
 * The sync is upsert-only, so halaqah of batches deleted upstream stay mirrored
 * (HITS Reguler Jan 11→21, Apr 13→23: 205 dead halaqah, 1.580 meetings in one
 * month), and a stray halaqah can land under the wrong program (seven TAFM LAZ
 * halaqah stamped with HKM's batch). The pin weeds both out: keep a row when its
 * batch is null (non-tilawah source), the program is unpinned, or the two agree.
 *
 * A rolling-batch program (config.syncAllBatches) is exempt. It mirrors every
 * upstream batch on purpose, and its `tilawah_batch_id` is a stale fallback that
 * seeding never advances — judged by the pin, Tahsin al-Fatihah LAZ's teacher
 * recap counted batch 10 alone and dropped every batch opened since (#41, #42,
 * #43…), so its teachers' later meetings never reached the recap.
 */
export const currentBatchOnly = sql`(h.tilawah_batch_id is null or p.tilawah_batch_id is null
  or coalesce((p.config->>'syncAllBatches')::boolean, false)
  or h.tilawah_batch_id = p.tilawah_batch_id)`;
