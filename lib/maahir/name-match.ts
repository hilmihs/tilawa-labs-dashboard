/**
 * Matching Maahir's HITS rows onto the dashboard's own tilawah rows — by name,
 * because there is nothing else.
 *
 * `hits/halaqah.batch_id` is a uuid into Maahir's own `hits/batch`; no tilawah
 * halaqah id, no tilawah user id, and no phone or email appears anywhere in the
 * `hits/*` mirror. `programs.config.maahirHitsBatchId` bridges the two systems
 * at the *batch* level (set once by scripts/pin-maahir-batches.ts), and that is
 * enough to scope a screen — but not to turn a row into a link. For the link,
 * the name is the only key available.
 *
 * **Measured on the live mirror, 7 Sep 2026** (464 Maahir halaqah, 323 dashboard
 * HITS halaqah):
 *
 * | rule | maahir → dashboard | dashboard → maahir |
 * |---|---|---|
 * | exact string | 264 / 464 (57%) | — |
 * | + upper/whitespace/underscore | 264 (no gain — names are already uppercase) | — |
 * | + strip leading `Lanjutan ` | 322 / 464 (69%), 12 collisions | **315 / 323 (97.5%)** |
 *
 * The direction that matters is the second one: every row we render comes from
 * Maahir and wants a link *into* the dashboard, and 97.5% of dashboard halaqah
 * are reachable. The 142 unmatched Maahir halaqah are not join failures — they
 * are classes the dashboard never synced (43 in the `…0347` Januari Khusus
 * batch, 29 named `HITS NN (observasi)`, ~50 April `Lanjutan_` rows).
 *
 * The `Lanjutan ` strip is not a hack: Maahir splits dasar/lanjutan into two
 * halaqah rows and prefixes the name, while the dashboard keeps one row and
 * carries the distinction in `level` ("HITS Dasar" / "HITS Lanjutan"). Of the 52
 * `hits-regular` halaqah with no exact match, 50 have `level = "HITS Lanjutan"`.
 *
 * **Consequences you must respect when using this module:**
 *
 * - A match is an affordance, not a fact. `matchHalaqah` returns `null` freely;
 *   the caller renders plain text instead of a link. Never let a miss remove a
 *   row, change a count, or read as "no data".
 * - Ambiguity loses. A normalised name that hits more than one dashboard halaqah
 *   yields `null` — 12 such collisions exist and guessing one would deep-link a
 *   coordinator into the wrong class.
 * - `level` is not a tiebreaker. On matched pairs the two systems disagree 31
 *   times (18 `dasar` → "HITS Lanjutan", 13 the other way).
 * - Teacher names are weaker (132 / 183 normalised, ~76%) and carry real
 *   spelling drift — "Laila Lestari" vs "LAILA WAFA ANGGRAINI". Only
 *   exact-after-normalisation is accepted here; fuzzy matching is deliberately
 *   not done, because a wrong teacher link is worse than no link.
 */

/**
 * Fold a halaqah name to its comparison key: underscores to spaces, whitespace
 * collapsed, uppercased, and the `LANJUTAN ` prefix removed.
 *
 * Uppercasing is done with a plain `toUpperCase()` — these names are ASCII plus
 * digits, and a locale-aware fold would risk the Turkish dotless-i on a machine
 * whose locale we don't control.
 */
export function halaqahKey(name: string): string {
  const flat = name.replace(/_/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  return flat.replace(/^LANJUTAN /, "");
}

/** Same fold, minus the prefix strip — person names have no such prefix. */
export function personKey(name: string): string {
  return name.replace(/_/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

/** One dashboard-side row a Maahir row can point at. */
export type MatchTarget = { id: string; name: string };

/**
 * Index dashboard rows by comparison key, dropping every key that more than one
 * row claims.
 *
 * Collisions are recorded rather than silently discarded so a caller (or a
 * probe script) can report "12 nama bertabrakan" instead of quietly linking
 * fewer rows each time upstream renames a class.
 */
export type NameIndex = {
  byKey: Map<string, MatchTarget>;
  /** Keys seen more than once — deliberately unmatchable. */
  collisions: Map<string, MatchTarget[]>;
};

function buildIndex(rows: MatchTarget[], key: (name: string) => string): NameIndex {
  const seen = new Map<string, MatchTarget[]>();
  for (const row of rows) {
    const k = key(row.name);
    if (!k) continue;
    const bucket = seen.get(k);
    if (bucket) bucket.push(row);
    else seen.set(k, [row]);
  }
  const byKey = new Map<string, MatchTarget>();
  const collisions = new Map<string, MatchTarget[]>();
  for (const [k, bucket] of seen) {
    if (bucket.length === 1) byKey.set(k, bucket[0]);
    else collisions.set(k, bucket);
  }
  return { byKey, collisions };
}

/** Index dashboard halaqah (`halaqah_sync`) for lookup by Maahir halaqah name. */
export function halaqahIndex(rows: MatchTarget[]): NameIndex {
  return buildIndex(rows, halaqahKey);
}

/** Index dashboard teachers (`guru_sync`, or the `pengajar` name on a halaqah). */
export function personIndex(rows: MatchTarget[]): NameIndex {
  return buildIndex(rows, personKey);
}

/** The dashboard row a Maahir halaqah name points at, or `null` when unknown/ambiguous. */
export function matchHalaqah(index: NameIndex, maahirName: string): MatchTarget | null {
  return index.byKey.get(halaqahKey(maahirName)) ?? null;
}

/** The dashboard row a Maahir person name points at, or `null`. */
export function matchPerson(index: NameIndex, maahirName: string): MatchTarget | null {
  return index.byKey.get(personKey(maahirName)) ?? null;
}
