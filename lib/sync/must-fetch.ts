/**
 * Which halaqah need their `/api/halaqah/{id}` detail pulled this run.
 *
 * Two independent reasons to fetch, unioned:
 *  - `changed`: the absensi fingerprint moved (attendance/teacher changed).
 *  - `hotWindow`: a meeting is scheduled in the last few days, so presensi is
 *    likely being edited — fetched regardless of the fingerprint, because the
 *    fingerprint's source (the absensi-murid summary) drifts from the real
 *    per-meeting presensi and would otherwise mask an edit until the full sweep.
 *
 * A full sweep overrides both and fetches every upstream halaqah. Pure — no DB,
 * no upstream — so the selection rule can be unit-tested on its own.
 */
export function selectMustFetch(input: {
  fullSweep: boolean;
  upstreamHalaqahIds: readonly number[];
  changed: ReadonlySet<number>;
  hotWindow: ReadonlySet<number>;
}): Set<number> {
  if (input.fullSweep) return new Set(input.upstreamHalaqahIds);
  return new Set<number>([...input.changed, ...input.hotWindow]);
}
