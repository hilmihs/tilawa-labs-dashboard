/**
 * Teachers who exist twice in tilawah.
 *
 * The CMS has no merge, so the same person can hold two user ids: one that
 * teaches and one that carries the phone number — and because the phone column
 * is unique, the number CANNOT simply be copied onto the teaching account (the
 * write is accepted and silently dropped). Grouping the ids here lets the recap
 * treat them as one person: meetings merge into a single message, and the number
 * is found wherever it happens to live.
 *
 * Each group's FIRST id is canonical: the account that actually teaches, so the
 * recap keeps the halaqah under the identity the coordinator recognises.
 *
 * Every pair below was verified against the CMS on 16 Aug 2026 — by a phone
 * collision (the duplicate already held the number) or by the coordinator naming
 * the two accounts as one person. Do not add a pair on a name resemblance alone;
 * merging two different people would send one teacher's recap to the other.
 *
 * The groups stay here even after a duplicate is switched off: a deactivated
 * account keeps its old pertemuan, so the recap still has to fold it into the
 * canonical identity. On 7 Sep 2026 the coordinator confirmed the keeper email
 * for nine of these people and the empty copies were deactivated (status 0):
 * 2818, 2816, 2115, then 2817 and 2819 (2825 was already off). They cannot be
 * deleted — the CMS exposes no user-delete endpoint, see API_MAP.md.
 */
export const DUPLICATE_GURU_ACCOUNTS: readonly (readonly number[])[] = [
  // Teaching account vs. an empty copy that happens to hold the phone number.
  // Confirmed as one person by the coordinator, never by name resemblance.
  [2103, 2816],
  // The teaching account is canonical; the duplicate was a blank record from a
  // bulk import, deactivated once its meetings had been moved across.
  [2128, 2817],
  // One person, two spellings of the name; the second id holds the number.
  [1782, 1817],
  // Every halaqah was moved onto the first id at the coordinator's request, so
  // the second is history the recap still has to fold in.
  [1797, 1816],
  // Both accounts carry the SAME number - which is how the duplicate surfaced,
  // the CMS enforcing uniqueness on exactly that column.
  [1969, 2115],
  // A copy from a bulk import that never logged in, yet held two halaqah until
  // they were reassigned.
  [1800, 2825],
  // The duplicate held one halaqah and its meetings; it surfaced because the
  // owner could not see that class in their app.
  [2824, 4348],
  // A run of consecutive ids created in one batch with patterned placeholder
  // e-mails and numbers, each an empty copy of someone who already had a real
  // account. Finished meetings were moved to the real id before the copies
  // were switched off.
  [2754, 2818],
  [1899, 2819],
  // Same e-mail on both; the second has no number, no halaqah, no meetings.
  [16, 1804],
];

const canonicalById = new Map<number, number>();
const groupById = new Map<number, readonly number[]>();
for (const group of DUPLICATE_GURU_ACCOUNTS) {
  for (const id of group) {
    canonicalById.set(id, group[0]);
    groupById.set(id, group);
  }
}

/** The id this person should be counted and messaged as. Unknown ids map to themselves. */
export function canonicalGuruId(guruId: number): number {
  return canonicalById.get(guruId) ?? guruId;
}

/** Every id belonging to this person, canonical first. Always includes the input. */
export function guruIdGroup(guruId: number): readonly number[] {
  return groupById.get(guruId) ?? [guruId];
}

/** Flat list of every id involved in a duplicate group — for SQL `in (...)` lookups. */
export const ALL_DUPLICATE_IDS: readonly number[] = [...canonicalById.keys()];
