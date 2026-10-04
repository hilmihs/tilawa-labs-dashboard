import { createHash } from "node:crypto";

/** The slice of an /api/reports/absensi-murid item this module depends on. */
export type AbsensiFingerprintItem = {
  halaqah_id: number;
  pertemuan: string;
  kehadiran_percentage: number;
  user: { id: number };
  /** Teacher of record, as the report names them. Optional: older callers omit it. */
  pengajar?: string | null;
};

/**
 * One fingerprint per halaqah, over every enrolled student's attendance state.
 *
 * Why this report and not `/api/halaqah`'s `updated_at`: writing a presensi does
 * not touch the halaqah row. Measured on the April archive, 45 of 99 halaqah had
 * meetings updated after their halaqah row, some by two weeks — using that field
 * as a skip key would silently drop attendance for half the programme.
 *
 * `pertemuan` reads "x/y", where x counts that student's presensi rows excluding
 * Izin and y is the number of scheduled meetings. So any presensi written with
 * status Alfa/Hadir/Telat moves x, and a schedule change moves y. Across two
 * full batch archives, 631 meetings carried presensi: 0 were entirely Alfa and 2
 * were entirely Izin. Those 2 are the known blind spot, and the nightly full
 * sweep is what covers them.
 *
 * `pengajar` is hashed alongside attendance because a handover changes WHO a
 * halaqah's meetings belong to without touching a single presensi. HITS 067/068
 * were swapped upstream on 17 Aug 2026 and the mirror kept the old teacher for
 * hours — the fingerprint matched, so the detail call was skipped and the recap
 * went on billing the wrong person. The report already carries the name, so this
 * costs no extra request. It cannot see a change to one meeting's teacher inside
 * an otherwise unchanged halaqah; the nightly full sweep still covers that.
 *
 * Sorted before hashing so upstream pagination order cannot fake a change.
 */
export function buildFingerprints(
  items: readonly AbsensiFingerprintItem[],
): Map<number, string> {
  const rows = new Map<number, string[]>();
  for (const it of items) {
    const line = `${it.user.id}:${it.pertemuan}:${it.kehadiran_percentage}:${it.pengajar ?? ""}`;
    const bucket = rows.get(it.halaqah_id);
    if (bucket) bucket.push(line);
    else rows.set(it.halaqah_id, [line]);
  }

  const out = new Map<number, string>();
  for (const [halaqahId, lines] of rows) {
    lines.sort();
    out.set(halaqahId, createHash("sha1").update(lines.join("|")).digest("hex"));
  }
  return out;
}

/**
 * Which halaqah must have their detail fetched this run.
 *
 * Anything without a fingerprint on either side is included: a halaqah we have
 * never fetched, and one that does not appear in the report at all (no enrolled
 * students yet), both need the detail call. Only an exact match is skipped, so
 * the failure mode is a wasted fetch rather than missing data.
 */
export function changedHalaqahIds(
  halaqahIds: readonly number[],
  previous: ReadonlyMap<number, string>,
  next: ReadonlyMap<number, string>,
): Set<number> {
  const changed = new Set<number>();
  for (const id of halaqahIds) {
    const before = previous.get(id);
    const after = next.get(id);
    if (before === undefined || after === undefined || before !== after) changed.add(id);
  }
  return changed;
}
