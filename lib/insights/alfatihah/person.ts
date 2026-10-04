/**
 * Re-assessment trails over the al-Fatihah assessment API: who was scored more
 * than once, and what changed between the first and the last time.
 *
 * ── Why this module is mostly about refusing ────────────────────────────────
 * The upstream exposes no user id and no phone. `uuid` and `kode_unik` are
 * per-EVALUATION and never repeat. So the only key a person has is the bare
 * string a volunteer typed into `namaLengkap`, and the four laws in
 * `lib/maahir/name-match.ts` apply here with more force than they do there —
 * a wrong halaqah link is a bad hyperlink, a wrong person merge is a fabricated
 * human with a fabricated "progress".
 *
 *   1. A match is an affordance, not a fact. Nothing here invents a person.
 *   2. Ambiguity loses. A name whose rows disagree on gender is at least two
 *      humans; it is still listed, flagged `nama-ganda`, with `delta: null`.
 *   3. A miss never removes a row, changes a count, or reads as "no data".
 *      Single-word names are neither dropped nor merged with anyone — they are
 *      flagged and keep their arithmetic. The unnamed evaluations are reported
 *      in `unnamedEvaluations`, never quietly subtracted from a denominator.
 *   4. No fuzzy matching. Exact-after-`personKey` only, which is why
 *      `personKey` is imported rather than re-implemented.
 *
 * ── Measured on the full window 2026-01-01..2026-09-07 (4515 rows) ──────────
 * 3854 named / 661 unnamed, and 482 normalised names appear more than once.
 * Applying the honest-cohort filters (>= 2 words, gender consistent, repeats on
 * >= 2 distinct Jakarta calendar days) leaves **266 people**. The three drop
 * counters are reported independently, not as a partition — they overlap.
 *
 * | partition    |   n | raw Δ | adj Δ | up  | down | flat | same examiner |
 * |--------------|-----|-------|-------|-----|------|------|---------------|
 * | within-event | 172 | +1.90 | +1.02 | 137 |  11  |  24  |     ~41 %     |
 * | cross-event  |  94 | +0.29 | −0.02 |  42 |  34  |  18  |      ~2 %     |
 *
 * Re-test coverage (first AND last in the same canonical group, over that
 * group's unique participants): alfatihah-mei 33 %, ortu-abk 20 %, rs-ummi
 * 15 %, laz / hirs / half-deen 0 %. Within-cohort, `alfatihah-mei` gains
 * +2.12 raw and +2.12 adjusted at 100 % same examiner, while `rs-ummi` gains
 * +1.79 raw but only +0.29 adjusted at 1 % same examiner — see the blinding
 * note on {@link RetestByKegiatan.sameExaminerPct} before reading that as
 * "Mei taught better".
 *
 * These digits are a record of one reading, not an invariant. The live figures
 * are re-derived by `scripts/verify-asesmen-angka.ts`; `person.test.ts`
 * deliberately pins none of them, because a unit test that goes red when
 * upstream adds a row teaches people to ignore the suite.
 *
 * ── Purity ──────────────────────────────────────────────────────────────────
 * No db, no fetch, no React, and deliberately no import of `./kegiatan`: the
 * canonical-event resolver arrives as the `groupOf` parameter. That keeps this
 * file testable with a three-line stub and independent of how events are
 * bucketed today.
 */
import { personKey } from "@/lib/maahir/name-match";
import type { Evaluation } from "@/lib/scorecard/metrics/alfatihah";
import { jakartaDate } from "@/lib/time/jakarta";
import { normalizePhone } from "@/lib/wa";
import type { Rec } from "./source";

/** Canonical-event resolver, injected by the caller (`./kegiatan`). */
export type KegiatanGroupOf = (kegiatan: string | null) => { key: string; label: string };

export type PersonGender = "Ikhwan" | "Akhwat";

/** Why a row's identity or its delta cannot be taken at face value. */
export type PersonFlag = "nama-ganda" | "nama-satu-kata" | "hari-sama";

/** One assessment in a person's trail. */
export type PersonTrailEntry = {
  /** Asia/Jakarta calendar day, or "" when `created_at` is unparsable. */
  tanggal: string;
  kegiatanKey: string;
  kegiatanLabel: string;
  pemeriksa: string | null;
  /**
   * `null` when the row carries no finite score. Deliberately nullable rather
   * than 0 or NaN: a missing score must propagate to `delta: null`, not read as
   * "scored zero" (law 3).
   */
  score: number | null;
  rekomendasi: string | null;
};

export type PersonRow = {
  /** `personKey(namaLengkap)` — the only identity this source affords. */
  key: string;
  /** Display spelling: the raw name as typed on the earliest row. */
  nama: string;
  /** Chronological, oldest first. */
  entries: PersonTrailEntry[];
  count: number;
  firstScore: number | null;
  lastScore: number | null;
  /** `null` when identity is untrustworthy, there is no repeat, or a score is missing. */
  delta: number | null;
  adjustedDelta: number | null;
  sameExaminer: boolean;
  gender: PersonGender | null;
  /** `null` exactly when `delta` is null. */
  withinEvent: boolean | null;
  flags: PersonFlag[];
};

export type RetestByKegiatan = {
  key: string;
  label: string;
  /** Honest-cohort people whose FIRST and LAST assessment are both this group. */
  retested: number;
  /** Unique participants of the group — the denominator for `coverage`. */
  participants: number;
  /** `retested / participants` as a fraction, `null` when there is nothing to divide by. */
  coverage: number | null;
  up: number;
  down: number;
  flat: number;
  adjustedDelta: number | null;
  /**
   * Share (0..100) of the re-tested people scored by the SAME examiner at both
   * ends. **This is a blinding warning, not a quality score.** An examiner who
   * re-scores someone they already scored — and usually also taught in between
   * — produces *directional* bias: they know the person, they know what they
   * corrected, and they are marking their own work. Different examiners at the
   * two ends disagree in *undirected* ways that largely cancel across a cohort.
   * So `alfatihah-mei`'s +2.12 at 100 % same examiner is the LEAST trustworthy
   * gain in this dataset, not the most; `rs-ummi`'s +1.79 shrinks to +0.29 once
   * adjusted, but at 1 % same examiner it is the honest kind of number. Read a
   * high percentage as "unblinded", never as "consistent".
   */
  sameExaminerPct: number | null;
};

export type ProgressionStats = {
  n: number;
  rawDelta: number | null;
  adjustedDelta: number | null;
  up: number;
  down: number;
  flat: number;
  /** 0..100. Same blinding warning as {@link RetestByKegiatan.sameExaminerPct}. */
  sameExaminerPct: number | null;
};

export type ProgressionSummary = {
  cohort: number;
  within: ProgressionStats;
  cross: ProgressionStats;
  /**
   * The three drop counters OVERLAP — a single-word name can also be same-day.
   * Each counts people with >= 2 evaluations failing that one filter, so
   * `cohort + dropped*` does not add up to "names seen more than once" and must
   * never be rendered as a partition.
   */
  droppedSingleWord: number;
  droppedGenderConflict: number;
  droppedSameDay: number;
  /** Rows with no name at all. They are never merged and never dropped from view. */
  unnamedEvaluations: number;
};

// ── local folds ────────────────────────────────────────────────────────────
// `clean`, `dayOf`, `scoreOf` and `genderOf` mirror the private helpers in
// `./index.ts` line for line. They are re-stated rather than imported because
// `index.ts` does not export them and pulling it in would drag the network
// reader into a pure module. If the conventions there change, change them here.

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

/** Asia/Jakarta calendar day of a record — matches `index.ts:166`. */
function dayOf(r: Rec): string {
  const t = Date.parse(String(r.created_at ?? ""));
  return Number.isFinite(t) ? jakartaDate(new Date(t)) : "";
}

const scoreOf = (r: Rec): number | null => (Number.isFinite(r.score) ? Number(r.score) : null);

/** Gender lives on the account, and a few rows spell it "ikhwan" — fold case. */
function genderOf(r: Rec): PersonGender | null {
  const g = clean(r.asal_halaqah)?.toLowerCase();
  if (g === "ikhwan") return "Ikhwan";
  if (g === "akhwat") return "Akhwat";
  return null;
}

/** Sort key for chronology. Undated rows sort last — they cannot be ordered. */
function timeOf(r: Rec): number {
  const t = Date.parse(String(r.created_at ?? ""));
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** `is_dummy` is filtered upstream; re-check so a server default cannot inflate this. */
const live = (r: Rec) => !r.is_dummy;

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ── examiner adjustment ────────────────────────────────────────────────────

/**
 * Mean score awarded by each examiner over ALL supplied rows, keyed by
 * `personKey(pemeriksa)` (upper-cased, whitespace-collapsed) so a spelling
 * wobble in the examiner column does not split one person into two baselines.
 *
 * This is a sanity check, not a truer number. It assumes every examiner faces
 * comparable participants, which is false in a division that assigns particular
 * examiners to particular events: an examiner posted to beginner classes looks
 * harsh for entirely real reasons, and subtracting their mean flatters that
 * cohort. Use `adjustedDelta` to ask "would this gain survive if the examiner
 * were the explanation?", never as the headline figure.
 */
export function examinerMeans(rows: Rec[]): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (!live(r)) continue;
    const p = clean(r.pemeriksa);
    const s = scoreOf(r);
    if (!p || s == null) continue;
    const k = personKey(p);
    if (!k) continue;
    const cur = acc.get(k);
    if (cur) {
      cur.sum += s;
      cur.n += 1;
    } else {
      acc.set(k, { sum: s, n: 1 });
    }
  }
  const out = new Map<string, number>();
  for (const [k, v] of acc) out.set(k, v.sum / v.n);
  return out;
}

/**
 * `(last − first) − (mean(lastExaminer) − mean(firstExaminer))`.
 *
 * `null` when the delta itself is null or either end has no named examiner —
 * an unknown examiner has no baseline and guessing one would be law 1 in
 * reverse.
 */
function adjustedFor(p: PersonRow, means: Map<string, number>): number | null {
  if (p.delta == null || !p.entries.length) return null;
  const first = p.entries[0];
  const last = p.entries[p.entries.length - 1];
  const a = first.pemeriksa ? means.get(personKey(first.pemeriksa)) : undefined;
  const b = last.pemeriksa ? means.get(personKey(last.pemeriksa)) : undefined;
  if (a == null || b == null) return null;
  return p.delta - (b - a);
}

// ── the build ──────────────────────────────────────────────────────────────

function buildPerson(
  key: string,
  recs: Rec[],
  groupOf: KegiatanGroupOf,
  means: Map<string, number>,
): PersonRow {
  const ordered = [...recs].sort(
    (a, b) => timeOf(a) - timeOf(b) || String(a.uuid ?? "").localeCompare(String(b.uuid ?? "")),
  );

  const entries: PersonTrailEntry[] = ordered.map((r) => {
    const g = groupOf(clean(r.kegiatan));
    return {
      tanggal: dayOf(r),
      kegiatanKey: g.key,
      kegiatanLabel: g.label,
      pemeriksa: clean(r.pemeriksa),
      score: scoreOf(r),
      rekomendasi: clean(r.rekomendasi_program),
    };
  });

  const days = new Set(ordered.map(dayOf));
  days.delete("");

  const genders = new Set(ordered.map(genderOf).filter((g): g is PersonGender => g != null));
  const genderConflict = genders.size > 1;
  const gender = genders.size === 1 ? [...genders][0] : null;

  const flags: PersonFlag[] = [];
  // Law 2: disagreeing gender means this key is at least two humans.
  if (genderConflict) flags.push("nama-ganda");
  // A single word is not an identity — but law 3 keeps the row and its numbers.
  if (key.split(" ").filter(Boolean).length < 2) flags.push("nama-satu-kata");
  // Two scores on the same day are a re-read, not progress over time.
  if (ordered.length >= 2 && days.size < 2) flags.push("hari-sama");

  const first = entries[0] ?? null;
  const last = entries.length ? entries[entries.length - 1] : null;
  const firstScore = first?.score ?? null;
  const lastScore = last?.score ?? null;

  const delta =
    ordered.length >= 2 && !genderConflict && firstScore != null && lastScore != null
      ? lastScore - firstScore
      : null;

  const sameExaminer =
    entries.length >= 2 &&
    first?.pemeriksa != null &&
    last?.pemeriksa != null &&
    personKey(first.pemeriksa) === personKey(last.pemeriksa);

  const row: PersonRow = {
    key,
    nama: clean(ordered[0]?.namaLengkap) ?? key,
    entries,
    count: ordered.length,
    firstScore,
    lastScore,
    delta,
    adjustedDelta: null,
    sameExaminer,
    gender,
    withinEvent: delta == null || !first || !last ? null : first.kegiatanKey === last.kegiatanKey,
    flags,
  };
  row.adjustedDelta = adjustedFor(row, means);
  return row;
}

/**
 * One row per distinct `personKey`, richest first.
 *
 * Unnamed rows are skipped here — not dropped from the world: they cannot be
 * keyed, must never be merged into one phantom participant, and are reported
 * by `progressionSummary().unnamedEvaluations`.
 */
export function buildPersons(
  rows: Rec[],
  groupOf: KegiatanGroupOf,
  /**
   * Examiner baselines. Pass the means of the WHOLE window, not of `rows`:
   * "how hard does this examiner mark?" is a property of the examiner, and a
   * baseline computed over a filtered slice measures each examiner against
   * their own handful of scores, shrinking every correction toward zero. Left
   * optional only so a caller with nothing else can fall back to the slice —
   * `index.ts` always passes the window-wide map, and `progressionSummary`
   * takes the same one, so the two "terkoreksi" figures on the page cannot come
   * from different baselines.
   */
  means: Map<string, number> = examinerMeans(rows),
): PersonRow[] {
  const byKey = new Map<string, Rec[]>();
  for (const r of rows) {
    if (!live(r)) continue;
    const nama = clean(r.namaLengkap);
    if (!nama) continue;
    const key = personKey(nama);
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }
  return [...byKey.entries()]
    .map(([key, recs]) => buildPerson(key, recs, groupOf, means))
    .sort((a, b) => b.count - a.count || a.nama.localeCompare(b.nama));
}

/**
 * People whose repeat can be read as one person progressing: at least two
 * evaluations, a name of at least two words, gender consistent across the rows,
 * and the repeats spread over at least two Jakarta calendar days.
 *
 * Everyone else stays in `buildPersons()` output, visible and flagged. This
 * function narrows what may be *summed*, never what may be *seen*.
 */
export function honestCohort(persons: PersonRow[]): PersonRow[] {
  return persons.filter((p) => p.count >= 2 && p.flags.length === 0);
}

function statsOf(group: PersonRow[], means: Map<string, number>): ProgressionStats {
  const deltas = group.map((p) => p.delta).filter((d): d is number => d != null);
  const adjusted = group
    .map((p) => adjustedFor(p, means))
    .filter((d): d is number => d != null);
  return {
    n: group.length,
    rawDelta: mean(deltas),
    adjustedDelta: mean(adjusted),
    up: group.filter((p) => (p.delta ?? 0) > 0).length,
    down: group.filter((p) => (p.delta ?? 0) < 0).length,
    flat: group.filter((p) => p.delta === 0).length,
    sameExaminerPct: group.length
      ? (group.filter((p) => p.sameExaminer).length / group.length) * 100
      : null,
  };
}

/**
 * The headline split: does the second assessment belong to the same canonical
 * event as the first?
 *
 * `means` is taken as a parameter rather than read off the rows so a caller can
 * hold examiner baselines fixed (computed over the whole year) while summarising
 * a filtered slice — otherwise a one-event slice would adjust every examiner
 * against themselves and the adjustment would collapse to the raw delta.
 *
 * `rows` is needed only for `unnamedEvaluations`: an unnamed evaluation has no
 * `personKey`, so it cannot be represented in `persons` at all, and law 3
 * forbids letting it vanish. It is a required argument on purpose — defaulting
 * it to zero would report "no unnamed rows" for a source that has 661 of them.
 */
export function progressionSummary(
  persons: PersonRow[],
  means: Map<string, number>,
  rows: Rec[],
): ProgressionSummary {
  const cohort = honestCohort(persons);
  // A cohort member with a missing score has `withinEvent: null` and joins
  // neither side, so `within.n + cross.n <= cohort`.
  const within = cohort.filter((p) => p.withinEvent === true);
  const cross = cohort.filter((p) => p.withinEvent === false);
  const repeats = persons.filter((p) => p.count >= 2);

  return {
    cohort: cohort.length,
    within: statsOf(within, means),
    cross: statsOf(cross, means),
    droppedSingleWord: repeats.filter((p) => p.flags.includes("nama-satu-kata")).length,
    droppedGenderConflict: repeats.filter((p) => p.flags.includes("nama-ganda")).length,
    droppedSameDay: repeats.filter((p) => p.flags.includes("hari-sama")).length,
    unnamedEvaluations: rows.filter((r) => live(r) && clean(r.namaLengkap) == null).length,
  };
}

/**
 * Unique participants of a set of rows — the C312 rule, byte for byte: distinct
 * trimmed lower-cased names, plus one for every unnamed row, because unnamed
 * rows cannot be merged and must not collapse into a single phantom
 * participant.
 *
 * It deliberately does NOT use `personKey`, even though the cohort arithmetic in
 * this module does. Two rules coexist on purpose and must not be folded:
 *
 *   - participant COUNTS use trim+lower-case, because that is what
 *     `countParticipants` in `index.ts` and `aggregate({agg:"participants"})` in
 *     `lib/scorecard/metrics/alfatihah.ts` do, and those feed scorecard C312.
 *   - participant IDENTITY for repeat detection uses `personKey`.
 *
 * Folding them here would put two different "peserta acara" numbers one panel
 * apart on the same screen: `retestByKegiatan().participants` (this function)
 * renders beside `byGroup[].participants` (the C312 rule) for the same event.
 */
function countParticipants(rows: Rec[]): number {
  const named = new Set<string>();
  let unnamed = 0;
  for (const r of rows) {
    if (!live(r)) continue;
    const n = clean(r.namaLengkap);
    if (n) named.add(n.toLowerCase());
    else unnamed += 1;
  }
  return named.size + unnamed;
}

/**
 * Re-test coverage per canonical event.
 *
 * Only people whose first AND last assessment sit in the same group are counted
 * for that group — a person who moved between events belongs to neither event's
 * gain, and attributing them to one would credit an event for teaching it did
 * not do. Every group present in `rows` is listed even when nobody was
 * re-tested, so a 0 reads as "nobody came back", not as a missing row.
 */
export function retestByKegiatan(
  persons: PersonRow[],
  rows: Rec[],
  groupOf: KegiatanGroupOf,
): RetestByKegiatan[] {
  const groups = new Map<string, { label: string; rows: Rec[] }>();
  for (const r of rows) {
    if (!live(r)) continue;
    const g = groupOf(clean(r.kegiatan));
    const cur = groups.get(g.key);
    if (cur) cur.rows.push(r);
    else groups.set(g.key, { label: g.label, rows: [r] });
  }

  const cohort = honestCohort(persons).filter((p) => p.withinEvent === true);

  return [...groups.entries()]
    .map(([key, g]) => {
      const mine = cohort.filter((p) => p.entries[0]?.kegiatanKey === key);
      const participants = countParticipants(g.rows);
      const adjusted = mine.map((p) => p.adjustedDelta).filter((d): d is number => d != null);
      return {
        key,
        label: g.label,
        retested: mine.length,
        participants,
        coverage: participants > 0 ? mine.length / participants : null,
        up: mine.filter((p) => (p.delta ?? 0) > 0).length,
        down: mine.filter((p) => (p.delta ?? 0) < 0).length,
        flat: mine.filter((p) => p.delta === 0).length,
        adjustedDelta: mean(adjusted),
        sameExaminerPct: mine.length
          ? (mine.filter((p) => p.sameExaminer).length / mine.length) * 100
          : null,
      } satisfies RetestByKegiatan;
    })
    .sort((a, b) => b.retested - a.retested || b.participants - a.participants || a.label.localeCompare(b.label));
}

/**
 * Honest-cohort people who scored LOWER the second time within the same event —
 * 11 of them in the measured window.
 *
 * These are the interesting rows, not the failures: within one event the same
 * material was re-read days apart, so a drop is either a real regression worth a
 * follow-up or evidence that the first score was generous. Either reading is
 * actionable; hiding them would leave only the flattering direction on screen.
 */
export function turunDalamKegiatan(persons: PersonRow[]): PersonRow[] {
  return honestCohort(persons)
    .filter((p) => p.withinEvent === true && p.delta != null && p.delta < 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0) || a.nama.localeCompare(b.nama));
}

/**
 * Comparison key for a FUTURE join against `students_sync.phone`. Nothing reads
 * it yet — it is here because the roster is the only other place these people
 * exist, and the join will need this exact fold.
 *
 * `lib/wa.ts` `normalizePhone` cannot be used alone: it treats any digits
 * starting with `62` as already international, so a doubled country prefix
 * passes through untouched and `"6262812345678"` never equals `"62812345678"`.
 * 1923 of 3213 roster phones are exactly that malformed shape, so a naive join
 * would miss most of the roster.
 *
 * The fix belongs here, not in `lib/wa.ts`: that function backs every WhatsApp
 * click-to-chat link in the app, and widening it would silently rewrite live
 * links for numbers nobody has re-verified. The roster-side data bug (the
 * doubled prefix at rest) is filed separately and must be fixed upstream — this
 * is a read-side workaround, not a repair.
 *
 * A repeated leading `62` is always spurious: an Indonesian mobile continues
 * with `8` after the country code, never with another `62`.
 */
export function rosterPhoneKey(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  while (d.startsWith("6262")) d = d.slice(2);
  return normalizePhone(d);
}

/** Re-exported so callers can type their fixtures without reaching into source.ts. */
export type { Evaluation, Rec };
