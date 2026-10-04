import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Free-text notes a teacher leaves on the monthly recap page (/rekap/<token>),
 * for anything the per-meeting answers cannot express — "halaqah ini bukan
 * saya", "tanggalnya salah", "saya badal di kelas lain".
 *
 * Writes are append-only (see recap_confirmation_notes in lib/db/schema.ts): a
 * teacher may send several notes for one period and a later correction must not
 * overwrite the first report.
 */

/** Longest note we store. See addRecapNote for why. */
const NOTE_MAX_CHARS = 4000;

export type RecapNoteInput = {
  guruId: number;
  guruName: string | null;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  note: string;
  phone: string | null;
};

/**
 * Append one note. A blank or whitespace-only note is silently ignored — the
 * textarea is optional, and the caller submits the whole recap form in one go.
 *
 * The column is unbounded `text`, so a stray paste (a whole chat log, a base64
 * blob) would land in the table and then in every coordinator view that renders
 * it. Truncating here rather than with a DB constraint keeps the submit working
 * instead of failing the teacher's confirmation over a formatting accident.
 */
export async function addRecapNote(input: RecapNoteInput): Promise<void> {
  const note = input.note.trim().slice(0, NOTE_MAX_CHARS);
  if (!note) return;

  const db = getDb();
  // Append-only, but not append-blindly. The note travels with the whole form,
  // so a teacher who presses "kirim" again — to fix one meeting, or because the
  // first tap looked unanswered — resends the same sentence. On 17 Aug that
  // turned single notes into walls of twenty identical lines in the coordinator
  // view, burying the one line that mattered. Re-sending the same text is not
  // new information, so it writes nothing; a CHANGED note still appends, which
  // is what append-only was for.
  await db.execute(sql`
    insert into recap_confirmation_notes
      (guru_id, guru_name, period_start, period_end, note, confirmed_by_phone)
    select ${input.guruId}, ${input.guruName}, ${input.periodStart}, ${input.periodEnd},
           ${note}, ${input.phone}
    where not exists (
      select 1 from recap_confirmation_notes
      where guru_id = ${input.guruId}
        and period_start = ${input.periodStart}
        and period_end = ${input.periodEnd}
        and note = ${note}
    )
  `);
}
