/**
 * Examiner calibration over the al-Fatihah assessment API: how much of a score is
 * the reading, and how much is who happened to be listening.
 *
 * ── Measured on the full window 2026-01-01..2026-09-07 (4515 rows, read 2026-09-07)
 * 210 distinct `pemeriksa` strings, of which **51** carry >= 30 evaluations. Across
 * those 51 the mean awarded score runs **1.63 to 7.47** against a global mean of
 * **5.10**, and **710 evaluations (16 %)** were scored by someone sitting >= 1.5
 * points off that global mean. A participant's band — "Perlu bimbingan" at <= 2,
 * "Baik" at >= 6, the cut that feeds scorecard C312 — is therefore partly a fact
 * about the examiner. This module exists to put that on screen instead of leaving
 * it dissolved into every other number on the page.
 *
 * These digits are a record of one reading, not an invariant; `pemeriksa.test.ts`
 * pins none of them, because a suite that goes red when upstream adds a row is a
 * suite people learn to ignore.
 *
 * ── Why duplicate spellings are DETECTED and never MERGED ────────────────────
 * **21** of the 210 are one person entered twice: "Ustadzah Inas Firdaus" and "Jesi
 * Alya", "Ustadz Hilmi" and "Hilmi". So "210 examiners" is an overcount, and an
 * earlier design proposed a `pemeriksaKey()` that strips honorifics and folds the
 * pairs together. That design is rejected, and must not come back:
 *
 *   Merging changes counts. The merged `n` is what the >= 30 threshold reads; the
 *   threshold decides who appears in the calibration table; and appearing in that
 *   table is the difference between a conversation with a coordinator happening
 *   and not happening. Worse, two *different* men entered as "Ust. Ahmad" and
 *   "Ahmad" would be fused into a single fabricated mean — and the merge would
 *   delete the evidence that it had happened.
 *
 * So {@link detectSpellingClusters} reports the likely duplicates as a list for a
 * human to fix upstream, while `rows` keeps one entry per spelling with its own
 * arithmetic. {@link PemeriksaRow.ejaanGanda} is a hint printed beside a row, never
 * an input to a sum. This is law 3 of `lib/maahir/name-match.ts` applied to the
 * miss itself: failing to realise two strings are one person must not remove a row,
 * change a count, or read as "no data". If you arrived here to "finish" the merge —
 * don't. Fix the spelling in the source system; this list is the worklist for that.
 *
 * Identity is `personKey`: the case/whitespace/underscore fold `person.ts` already
 * uses for `sameExaminer` and `examinerMeans`. That is why `examinerMeans` is
 * imported rather than re-implemented — its keys are these rows' keys. The fold
 * touches capitalisation and spacing only; it never touches an honorific, and the
 * honorific fold in `honorificFold` is used for cluster *detection* and nothing
 * else.
 *
 * ── Why the baseline is the examiner's own event mix, not the global mean ────
 * Comparing an examiner's mean to 5.10 would be a personal verdict built out of
 * someone else's staffing decision. The global mean is 42 % two days' worth of
 * rows, and most examiners worked only a couple of events: of the 51, **8** worked
 * exactly one calendar day and **13** exactly one kegiatan; **19** worked
 * 2026-01-18 and for them 70 % of all their evaluations come from that single day;
 * **22** worked 2026-02-18. Examiner and event are strongly correlated — but not
 * the same variable, which is the only reason this comparison is possible at all.
 *
 * So each examiner is compared to the events they actually worked, weighted by how
 * much of their own work fell in each:
 *
 *     expected(e) = Σ_g ( n(e,g) · mean(g) ) / n(e)
 *     deviation   = mean(e) − expected(e)
 *
 * where `mean(g)` is over ALL scored rows in group `g`, every examiner included,
 * and `n(e,g)` counts the scored rows examiner `e` contributed to `g`. For the 13
 * single-event examiners this collapses to exactly "how they differ from everyone
 * else who worked that same event" — the honest question. `globalMean` is still
 * reported, as context for the spread, never as the baseline.
 *
 * ── The "Tester" account ────────────────────────────────────────────────────
 * Production data contains a "Tester" / "Ustadz Tester" examiner. It is reported in
 * {@link PemeriksaInsight.akunUji} and **excluded from nothing** — not from `rows`,
 * not from `globalMean`, not from any group mean. Those rows are counted in
 * scorecard C312, so silently dropping them here would put this page out of sync
 * with the KPI and give two true-looking numbers that disagree. Visibility beats a
 * silent divergence: show the account, let a human delete it upstream.
 *
 * ── Purity ──────────────────────────────────────────────────────────────────
 * No db, no fetch, no React, and deliberately no import of `./kegiatan` or
 * `./index`: the canonical-event resolver arrives as the `groupOf` parameter, so
 * this file is testable with a three-line stub and pulling in `index.ts` would drag
 * the network reader into a pure module.
 */
import { personKey } from "@/lib/maahir/name-match";
import { jakartaDate } from "@/lib/time/jakarta";
import { examinerMeans, type KegiatanGroupOf, type Rec } from "./person";

/** Re-exported so callers can type their fixtures without reaching into `./person`. */
export type { KegiatanGroupOf, Rec };

/** Default gate on `n`. Below this a mean is noise being read as a verdict. */
export const MIN_EVALUATIONS = 30;

/**
 * score >= this is "baik" — the `scoreMin` default in
 * `lib/scorecard/metrics/alfatihah.ts`, re-stated rather than imported from
 * `./index` for the purity reason above. If it changes there, change it here.
 */
const SCORE_BAIK_MIN = 6;

/**
 * Spellings that fold to the same name once a leading honorific is removed.
 *
 * Output only. Nothing in this module sums, averages, or thresholds across a
 * cluster — see the merge refusal in the module doc.
 */
export type SpellingCluster = {
  /** The longest spelling in the cluster: the most informative one, not the truest. */
  canonical: string;
  /** Every spelling that folded here, most evaluations first. */
  spellings: Array<{ nama: string; evaluations: number }>;
};

export type PemeriksaRow = {
  /** The raw string as typed, unmerged. Never an honorific-stripped rewrite. */
  nama: string;
  evaluations: number;
  /** Distinct participants, same rule as `index.ts` `countParticipants`. */
  peserta: number;
  /** `null` when not one row of theirs carries a readable score — not 0. */
  meanScore: number | null;
  /** Event-mix baseline: what this examiner's mix of events scored overall. */
  expected: number | null;
  /** `meanScore − expected`; `null` when either side is null. */
  deviation: number | null;
  baik: number;
  baikPct: number | null;
  /** Distinct canonical groups worked. */
  kegiatan: number;
  /** Distinct Asia/Jakarta calendar days worked. */
  hari: number;
  /** True when this spelling is part of a detected duplicate cluster — a HINT for the reader, never used in arithmetic. */
  ejaanGanda: boolean;
};

export type PemeriksaInsight = {
  /** Only examiners meeting `minEvaluations`, sorted by |deviation| desc. */
  rows: PemeriksaRow[];
  /**
   * Examiners held back by the threshold.
   *
   * This is an ABSENCE, not a zero, and the UI renders it as one: their mean is
   * too unstable to compare — five readings can average 8 on luck alone — **not**
   * missing. Their evaluations are still in `globalMean`, still in every group
   * mean, and still on every other panel of this page. Nothing was dropped from
   * the world; one column was withheld because it would lie at that `n`.
   */
  belowThreshold: number;
  minEvaluations: number;
  /** Mean over every scored row, examiner named or not. Context for the spread, never the baseline. */
  globalMean: number | null;
  /** Min/max `meanScore` over `rows` only; `null` when no listed row has a mean. */
  spread: { min: number; max: number } | null;
  spellingClusters: SpellingCluster[];
  /** Non-human accounts found by name, e.g. "Tester". Reported, never excluded from counts. */
  akunUji: Array<{ nama: string; evaluations: number }>;
};

// ── local folds ────────────────────────────────────────────────────────────
// `clean`, `dayOf`, `scoreOf` and `live` mirror the private helpers in `./index.ts`
// and `./person.ts` line for line, re-stated for the same reason `person.ts`
// re-states them: neither module exports them, and importing `index.ts` would pull
// the network reader in here.

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

/** Asia/Jakarta calendar day of a record — matches `index.ts:180`. */
function dayOf(r: Rec): string {
  const t = Date.parse(String(r.created_at ?? ""));
  return Number.isFinite(t) ? jakartaDate(new Date(t)) : "";
}

const scoreOf = (r: Rec): number | null => (Number.isFinite(r.score) ? Number(r.score) : null);

/** `is_dummy` is filtered upstream; re-check so a server default cannot inflate this. */
const live = (r: Rec) => !r.is_dummy;

/** An unreadable score is not "baik" — it must not inflate the headline (`index.ts:219`). */
const isBaik = (r: Rec) => (scoreOf(r) ?? 0) >= SCORE_BAIK_MIN;

function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/**
 * Unique participants, following `index.ts:189`: distinct case-folded
 * `namaLengkap`, plus one for every unnamed row, because unnamed rows cannot be
 * merged and must not collapse into a single phantom participant.
 *
 * `person.ts`'s private copy folds with `personKey` instead, so the two disagree
 * only on doubled internal whitespace. `index.ts` is the rule quoted here because
 * this column sits on the same page as that header and must not contradict it.
 */
function countParticipants(rows: Rec[]): number {
  const named = new Set<string>();
  let unnamed = 0;
  for (const r of rows) {
    const n = clean(r.namaLengkap)?.toLowerCase();
    if (n) named.add(n);
    else unnamed += 1;
  }
  return named.size + unnamed;
}

// ── duplicate-spelling detection ───────────────────────────────────────────

/**
 * Closed list, longest first so "Ustadzah" is not read as "Ustadz" and "Ummi" is
 * not read as "Umm". Deliberately closed and deliberately leading-only: this is a
 * fold for *suggesting* duplicates to a human, and a permissive rule would suggest
 * nonsense that the human then has to disprove.
 */
const HONORIFICS = ["USTADZAH", "USTADZ", "UST.", "UST", "UMMI", "UMM", "ABU"];

/**
 * `personKey` plus one leading honorific removed.
 *
 * Only ever used to *group suggestions*. `ABU` and `UMM` are part of a kunya, so
 * "Abu Bakar" folds to "BAKAR" and could pair with a genuinely different "Bakar" —
 * which is exactly why a cluster is a worklist and never an arithmetic merge.
 */
export function honorificFold(name: string): string {
  const flat = personKey(name);
  for (const h of HONORIFICS) {
    if (flat.startsWith(`${h} `)) return flat.slice(h.length + 1).trim() || flat;
    // "Ust.Hilmi" — the dot forms are written without a space often enough.
    if (h.endsWith(".") && flat.startsWith(h)) return flat.slice(h.length).trim() || flat;
  }
  return flat;
}

/** Non-human accounts, matched on the folded name so "Ustadz Tester" is caught too. */
const TESTER = /\btester\b/i;

type Bucket = { key: string; nama: string; rows: Rec[] };

/**
 * One bucket per `personKey(pemeriksa)`. Rows whose `pemeriksa` is blank cannot be
 * keyed and so cannot appear as a row here; they are NOT removed from the world —
 * they stay in `globalMean` and in every group mean, where they belong.
 */
function bucketByExaminer(rows: Rec[]): Bucket[] {
  const acc = new Map<string, { spellings: Map<string, number>; rows: Rec[] }>();
  for (const r of rows) {
    if (!live(r)) continue;
    const nama = clean(r.pemeriksa);
    if (!nama) continue;
    const key = personKey(nama);
    if (!key) continue;
    let cur = acc.get(key);
    if (!cur) {
      cur = { spellings: new Map(), rows: [] };
      acc.set(key, cur);
    }
    cur.rows.push(r);
    cur.spellings.set(nama, (cur.spellings.get(nama) ?? 0) + 1);
  }
  return [...acc.entries()].map(([key, v]) => ({
    key,
    // Display spelling: the one typed most often, ties broken alphabetically so the
    // label does not wobble with input order.
    nama: [...v.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    rows: v.rows,
  }));
}

function clustersOf(buckets: Bucket[]): { clusters: SpellingCluster[]; flagged: Set<string> } {
  const folds = new Map<string, Bucket[]>();
  for (const b of buckets) {
    const f = honorificFold(b.nama);
    const cur = folds.get(f);
    if (cur) cur.push(b);
    else folds.set(f, [b]);
  }

  const flagged = new Set<string>();
  const clusters: SpellingCluster[] = [];
  for (const group of folds.values()) {
    // One spelling is not a duplicate of anything.
    if (group.length < 2) continue;
    for (const b of group) flagged.add(b.key);
    const spellings = group
      .map((b) => ({ nama: b.nama, evaluations: b.rows.length }))
      .sort((a, b) => b.evaluations - a.evaluations || a.nama.localeCompare(b.nama));
    const canonical = [...spellings]
      .sort((a, b) => b.nama.length - a.nama.length || b.evaluations - a.evaluations || a.nama.localeCompare(b.nama))[0].nama;
    clusters.push({ canonical, spellings });
  }

  return {
    clusters: clusters.sort(
      (a, b) =>
        b.spellings.reduce((n, s) => n + s.evaluations, 0) -
          a.spellings.reduce((n, s) => n + s.evaluations, 0) ||
        a.canonical.localeCompare(b.canonical),
    ),
    flagged,
  };
}

/**
 * Spellings that are probably the same human — 21 such pairs in the measured
 * window, which is why "210 examiners" overcounts.
 *
 * A cluster is a suggestion addressed to a person, not a transformation of the
 * data: `buildPemeriksa().rows` still carries every spelling separately, with its
 * own `n`, its own mean, and its own place relative to the threshold.
 */
export function detectSpellingClusters(rows: Rec[]): SpellingCluster[] {
  return clustersOf(bucketByExaminer(rows)).clusters;
}

// ── the build ──────────────────────────────────────────────────────────────

/**
 * Mean score of every canonical group over ALL its rows — every examiner, plus the
 * rows whose examiner is blank. This is the pool an individual is measured against,
 * so narrowing it to "other examiners" would make each examiner's baseline depend
 * on themselves.
 */
function groupMeans(rows: Rec[], groupOf: KegiatanGroupOf): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (!live(r)) continue;
    const s = scoreOf(r);
    if (s == null) continue;
    const key = groupOf(clean(r.kegiatan)).key;
    const cur = acc.get(key);
    if (cur) {
      cur.sum += s;
      cur.n += 1;
    } else {
      acc.set(key, { sum: s, n: 1 });
    }
  }
  const out = new Map<string, number>();
  for (const [k, v] of acc) out.set(k, v.sum / v.n);
  return out;
}

/**
 * `Σ_g ( n(e,g) · mean(g) ) / n(e)`, over the examiner's SCORED rows only.
 *
 * Weighting by scored rows rather than all rows is what makes `deviation`
 * subtraction legal: both sides then describe the same set of readings. `null`
 * when the examiner has no scored row at all — the same condition that nulls
 * `meanScore`, so a deviation is never half-defined.
 */
function expectedFor(
  rows: Rec[],
  groupOf: KegiatanGroupOf,
  means: Map<string, number>,
): number | null {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (scoreOf(r) == null) continue;
    const m = means.get(groupOf(clean(r.kegiatan)).key);
    if (m == null) continue;
    sum += m;
    n += 1;
  }
  return n > 0 ? sum / n : null;
}

/**
 * The calibration table.
 *
 * `groupOf` is injected exactly as in `person.ts` — `./kegiatan` is not imported,
 * so a caller (or a test) decides what "the same event" means.
 */
export function buildPemeriksa(
  rows: Rec[],
  groupOf: KegiatanGroupOf,
  opts: { minEvaluations?: number } = {},
): PemeriksaInsight {
  const minEvaluations = opts.minEvaluations ?? MIN_EVALUATIONS;
  const liveRows = rows.filter(live);

  // Imported, not re-implemented: `examinerMeans` is keyed by `personKey`, the same
  // key the buckets below use, so a mean and its row can never drift apart.
  const means = examinerMeans(rows);
  const gMeans = groupMeans(rows, groupOf);
  const buckets = bucketByExaminer(rows);
  const { clusters, flagged } = clustersOf(buckets);

  const all: PemeriksaRow[] = buckets.map((b) => {
    const meanScore = means.get(b.key) ?? null;
    const expected = meanScore == null ? null : expectedFor(b.rows, groupOf, gMeans);
    const baik = b.rows.filter(isBaik).length;
    const days = new Set(b.rows.map(dayOf));
    days.delete("");
    return {
      nama: b.nama,
      evaluations: b.rows.length,
      peserta: countParticipants(b.rows),
      meanScore,
      expected,
      deviation: meanScore == null || expected == null ? null : meanScore - expected,
      baik,
      baikPct: pct(baik, b.rows.length),
      kegiatan: new Set(b.rows.map((r) => groupOf(clean(r.kegiatan)).key)).size,
      hari: days.size,
      ejaanGanda: flagged.has(b.key),
    } satisfies PemeriksaRow;
  });

  // Biggest gap first. An examiner with no readable score has no gap to rank, so
  // they sort last — never as a deviation of zero, which would read as "perfectly
  // calibrated" for someone we know nothing about.
  const rank = (d: number | null) => (d == null ? -1 : Math.abs(d));
  const listed = all
    .filter((r) => r.evaluations >= minEvaluations)
    .sort(
      (a, b) =>
        rank(b.deviation) - rank(a.deviation) ||
        b.evaluations - a.evaluations ||
        a.nama.localeCompare(b.nama),
    );

  const listedMeans = listed.map((r) => r.meanScore).filter((m): m is number => m != null);
  const scores = liveRows.map(scoreOf).filter((s): s is number => s != null);

  return {
    rows: listed,
    belowThreshold: all.length - listed.length,
    minEvaluations,
    globalMean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    spread: listedMeans.length
      ? { min: Math.min(...listedMeans), max: Math.max(...listedMeans) }
      : null,
    spellingClusters: clusters,
    akunUji: buckets
      .filter((b) => TESTER.test(honorificFold(b.nama)))
      .map((b) => ({ nama: b.nama, evaluations: b.rows.length }))
      .sort((a, b) => b.evaluations - a.evaluations || a.nama.localeCompare(b.nama)),
  };
}
