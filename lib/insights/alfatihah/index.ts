/**
 * Read-only insight over the al-Fatihah assessment API.
 *
 * One record = one participant's al-Fatihah recitation scored 1..10 by a
 * `pemeriksa` at some `kegiatan`. The upstream is division-wide, not
 * program-scoped: `kegiatan` is uncontrolled free text ("Half Deen Series
 * 2026", "Assessment Al-Fatihah - RS Ummi", "HITS Juni 26") and carries no
 * program id, so this page reports the whole source and lets the reader filter
 * by `kegiatan` text rather than pretending a slug mapping exists.
 *
 * Counting rules are inherited from the scorecard resolver so a number here and
 * the number on KPI C312 cannot disagree:
 *   - a participant is `namaLengkap` (the API exposes no user id, and
 *     `uuid`/`kode_unik` are per-evaluation); unnamed rows (~15 %) cannot be
 *     merged and each counts as one participant.
 *   - "baik" is score ≥ 6, the `scoreMin` default in
 *     `lib/scorecard/metrics/alfatihah.ts`.
 *   - `classifyBucket` decides HITS Reguler Dasar vs Kolaborasi.
 *
 * One deliberate divergence: days here are Asia/Jakarta calendar days, while
 * the scorecard's `events` agg slices the raw UTC timestamp. A coordinator
 * reading "hari assessment" means their own calendar; rows created after 17.00
 * WIB would otherwise fall on the previous day.
 */
import { personKey } from "@/lib/maahir/name-match";
import { classifyBucket, type Evaluation } from "@/lib/scorecard/metrics/alfatihah";
import { jakartaDate, todayJakarta } from "@/lib/time/jakarta";
import type { StatusTone } from "@/lib/ui/status";
import { findKegiatanGroup, resolveKegiatan, type KegiatanGroup } from "./kegiatan";
import {
  buildPersons,
  examinerMeans,
  progressionSummary,
  retestByKegiatan,
  turunDalamKegiatan,
  type PersonRow,
  type ProgressionSummary,
  type RetestByKegiatan,
} from "./person";
import { buildPemeriksa, type PemeriksaInsight } from "./pemeriksa";
import { getEvaluations, type Rec } from "./source";

export type { Rec } from "./source";

/** score ≥ this is "baik" — same default as the scorecard resolver. */
export const SCORE_BAIK_MIN = 6;

export type Gender = "Ikhwan" | "Akhwat";
/**
 * Chips over the raw-row list. `rek-dasar` / `rek-lanjutan` ride here rather
 * than becoming their own query param: they are one-of-many cuts of the same
 * list, they inherit the chip row and the `#terbaru` drill-down for free, and
 * a second param would have to be reconciled against this one on every link.
 */
export type Flag =
  | "tanpa-nama"
  | "perlu-bimbingan"
  | "tanpa-rekomendasi"
  | "rek-dasar"
  | "rek-lanjutan"
  | "berulang";
export const FLAGS: Flag[] = [
  "perlu-bimbingan",
  "tanpa-rekomendasi",
  "tanpa-nama",
  "rek-dasar",
  "rek-lanjutan",
  "berulang",
];
export type PresetKey = "90h" | "tahun" | "semua";

export type Preset = { key: PresetKey; label: string; start: string; end: string };

/**
 * `semua` starts in 2015 rather than at an "earliest record" probe: the API has
 * no such endpoint, and a floor far below the first row (Jan 2026) costs
 * nothing because paging is driven by `last_page`.
 */
export function presets(today = todayJakarta()): Preset[] {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 89);
  return [
    { key: "90h", label: "90 hari", start: d.toISOString().slice(0, 10), end: today },
    { key: "tahun", label: "Tahun ini", start: `${today.slice(0, 4)}-01-01`, end: today },
    { key: "semua", label: "Semua data", start: "2015-01-01", end: today },
  ];
}

export function resolvePreset(key: string | undefined, today = todayJakarta()): Preset {
  const all = presets(today);
  return all.find((p) => p.key === key) ?? all[1];
}

// ── score bands ────────────────────────────────────────────────────────────
export type Band = { key: string; label: string; tone: StatusTone; min: number; max: number };

/**
 * Three reading bands. The upstream ships its own `scoreLabel.tone`, but it is
 * not monotonic in the score (level 5 is "success", level 6 "info"), so colour
 * is decided here while the *wording* of a level stays the upstream's.
 *
 * There used to be a fourth band, splitting "Baik" 6–7 from "Sangat baik" 8–10.
 * That boundary was wrong and is why it is gone: **the upstream titles levels 6,
 * 7 AND 8 all "Baik"** — it does not distinguish them, so neither can we. The
 * consequence is visible in the data (measured 2026-09-07, 4515 rows): score 6
 * has 1252 rows, score 7 has **88**, score 8 has 179, and 25 of the 51 examiners
 * with ≥30 evaluations never once gave a 7. So part of the old "Sangat baik"
 * population was there only because raters who avoid the unlabelled middle jump
 * from 6 to 8 — the split was drawing a distinction made by examiner habit, not
 * by reading quality, and then colour-coding it.
 *
 * Anything at or above {@link SCORE_BAIK_MIN} is therefore one band. That also
 * keeps the band chips consistent with the "Bacaan baik ≥ 6" KPI, which feeds
 * scorecard C312.
 */
export const BANDS: Band[] = [
  // These three tones are a SCALE, not alerts: they mark where a reading sits
  // on 1..10, so the bottom band is red the same way `attendanceStatus` marks
  // Alfa red in `lib/ui/status.ts`. That is deliberately not the same job as the
  // KPI issue chip for the same population, which is `warning` — a chip is an
  // action prompt ("look at this today"), and `docs/UI-REVIEW-2026-09.md` §1
  // is about red spent on prompts, not about a scale legend needing three
  // distinguishable steps. Flattening the bottom two bands to one tone would
  // make the scale unreadable, which is the worse failure.
  { key: "bimbingan", label: "Perlu bimbingan", tone: "danger", min: 1, max: 2 },
  { key: "belum", label: "Belum memadai", tone: "warning", min: 3, max: 5 },
  { key: "baik", label: "Baik", tone: "success", min: SCORE_BAIK_MIN, max: 10 },
];

export function bandOf(score: number): Band | null {
  return BANDS.find((b) => score >= b.min && score <= b.max) ?? null;
}

// ── shapes ─────────────────────────────────────────────────────────────────
export type Totals = {
  evaluations: number;
  participants: number;
  kegiatan: number;
  days: number;
  pemeriksa: number;
  baik: number;
  /**
   * Share of the SCORED rows that reached {@link SCORE_BAIK_MIN} — the
   * denominator excludes rows whose score is unreadable, matching `avgScore`.
   * Dividing by every row instead would fold "we could not read this" in as
   * "not baik", i.e. count an absence as a bad reading. null when nothing was
   * scored — never render 0 % for "no data".
   */
  baikPct: number | null;
  /** Rows whose score is unreadable — the denominator gap, named rather than hidden. */
  tanpaSkor: number;
  avgScore: number | null;
};

export type Flags = { tanpaNama: number; perluBimbingan: number; tanpaRekomendasi: number };

export type LevelRow = { score: number; title: string; count: number; pct: number; tone: StatusTone };

export type BandRow = { band: Band; count: number; pct: number };

export type KegiatanRow = {
  kegiatan: string;
  bucket: "hits" | "kolaborasi";
  evaluations: number;
  participants: number;
  days: number;
  avgScore: number | null;
  baik: number;
  baikPct: number | null;
  ikhwan: number;
  akhwat: number;
  tanpaRekomendasi: number;
};

export type MonthRow = {
  month: string; // YYYY-MM (Asia/Jakarta)
  label: string;
  evaluations: number;
  participants: number;
  days: number;
  avgScore: number | null;
  baikPct: number | null;
};

export type RecentRow = {
  uuid: string;
  tanggal: string; // YYYY-MM-DD, Asia/Jakarta
  nama: string | null;
  kegiatan: string | null;
  asalHalaqah: string | null;
  pemeriksa: string | null;
  /** null when upstream sent something unreadable — NOT 0. Kosong bukan nol. */
  score: number | null;
  levelTitle: string | null;
  tone: StatusTone;
  rekomendasi: string | null;
};

/** One canonical kegiatan group — the page's spine row. */
export type GroupRow = {
  key: string;
  label: string;
  /** Raw spellings actually seen in this window, with counts, for the folded map. */
  ejaan: Array<{ raw: string; evaluations: number }>;
  /** False for a spelling upstream has never sent before — badged, never hidden. */
  canonical: boolean;
  evaluations: number;
  participants: number;
  days: number;
  pemeriksa: number;
  avgScore: number | null;
  baik: number;
  baikPct: number | null;
  ikhwan: number;
  akhwat: number;
  rekDasar: number;
  rekLanjutan: number;
  rekBelum: number;
};

/** A single day that carried an outsized share of the window. */
export type HariSibuk = {
  tanggal: string;
  kegiatanLabel: string;
  evaluations: number;
  pemeriksa: number;
  avgScore: number | null;
  /** Share of the filtered window, 0..100. */
  pct: number;
};

export type AsesmenInsight = {
  preset: Preset;
  gender: Gender | null;
  q: string | null;
  flag: Flag | null;
  /** The canonical kegiatan group the page is scoped to, when one is picked. */
  kg: KegiatanGroup | null;
  /** Rows in the window before the gender/kg/q/flag filters — the honest denominator. */
  windowEvaluations: number;
  totals: Totals;
  flags: Flags;
  levels: LevelRow[];
  bands: BandRow[];
  /** Canonical groups — the spine. */
  byGroup: GroupRow[];
  /** Raw spellings, unmerged. Kept for the folded audit map; not the spine. */
  byKegiatan: KegiatanRow[];
  byMonth: MonthRow[];
  hariTersibuk: HariSibuk[];
  /** Re-test per event. The unit is the EVENT, not the person — see `./person`. */
  retest: RetestByKegiatan[];
  progression: ProgressionSummary;
  /** The few who went DOWN within one event: small, odd, checkable. */
  turun: PersonRow[];
  pemeriksa: PemeriksaInsight;
  /** Raw spellings in this window that the canonical map has never seen. */
  ejaanBaru: string[];
  recent: RecentRow[];
  recentTruncated: number;
};

export const RECENT_LIMIT = 60;

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

/** Asia/Jakarta calendar day of a record — see the divergence note up top. */
function dayOf(r: Rec): string {
  const t = Date.parse(String(r.created_at ?? ""));
  return Number.isFinite(t) ? jakartaDate(new Date(t)) : "";
}

/**
 * Unique participants: distinct case-folded `namaLengkap`, plus one for every
 * unnamed row (they cannot be merged and must not silently collapse to one).
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

const scoreOf = (r: Rec) => (Number.isFinite(r.score) ? Number(r.score) : null);

function avg(rows: Rec[]): number | null {
  const s = rows.map(scoreOf).filter((n): n is number => n != null);
  if (!s.length) return null;
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/**
 * Both score predicates fall back deliberately, and in opposite directions —
 * each toward NOT making a claim. An unreadable score is not counted as "baik"
 * (it would inflate the headline), and is not flagged as "perlu bimbingan"
 * either (that would invent a struggling participant by name). See
 * {@link matchesFlag}. Neither is a typo; the asymmetry is the point.
 */
const isBaik = (r: Rec) => (scoreOf(r) ?? 0) >= SCORE_BAIK_MIN;

/**
 * Free-text search: participant name, the raw `kegiatan` string, the canonical
 * group label (so "half deen" finds all three spellings), and the examiner.
 *
 * `divisi` is deliberately excluded — it holds 86 rows of qurban team names and
 * nothing else, so searching it returns noise.
 *
 * Substring, case-folded, one needle, OR across fields. No fuzzy matching and no
 * relevance ranking: a scoring function over participant names would be an
 * unauditable person-matcher by the back door, which `lib/maahir/name-match.ts`
 * rules out for this kind of data.
 */
function matchesNeedle(r: Rec, needle: string): boolean {
  const label = resolveKegiatan(r.kegiatan).group.label;
  return [r.namaLengkap, r.kegiatan, label, r.pemeriksa].some((f) =>
    (f ?? "").toLowerCase().includes(needle),
  );
}

/** Gender lives on the account, and three rows spell it "ikhwan" — fold case. */
function genderOf(r: Rec): Gender | null {
  const g = clean(r.asal_halaqah)?.toLowerCase();
  if (g === "ikhwan") return "Ikhwan";
  if (g === "akhwat") return "Akhwat";
  return null;
}

/**
 * `berulang` is the one flag that is not a property of the row: it asks whether
 * this row's person was assessed more than once, which only the person index
 * knows. Callers that want it pass `repeatKeys` (from
 * {@link buildPersons}/{@link personKey}); without it the flag matches nothing
 * rather than silently matching everything.
 */
export function matchesFlag(r: Rec, flag: Flag, repeatKeys?: ReadonlySet<string>): boolean {
  if (flag === "tanpa-nama") return clean(r.namaLengkap) == null;
  if (flag === "perlu-bimbingan") return (scoreOf(r) ?? 99) <= 2;
  if (flag === "rek-dasar") return clean(r.rekomendasi_program) === "HITS Dasar";
  if (flag === "rek-lanjutan") return clean(r.rekomendasi_program) === "HITS Lanjutan";
  if (flag === "berulang") {
    const nama = clean(r.namaLengkap);
    return nama != null && (repeatKeys?.has(personKey(nama)) ?? false);
  }
  return clean(r.rekomendasi_program) == null;
}

// ── the build ──────────────────────────────────────────────────────────────
export type InsightQuery = {
  preset?: string;
  gender?: string;
  q?: string;
  flag?: string;
  /** Canonical kegiatan group key — see `./kegiatan`. */
  kg?: string;
};

export async function getAsesmenAlfatihah(query: InsightQuery = {}): Promise<AsesmenInsight> {
  const preset = resolvePreset(query.preset);
  const gender: Gender | null =
    query.gender?.toLowerCase() === "ikhwan"
      ? "Ikhwan"
      : query.gender?.toLowerCase() === "akhwat"
        ? "Akhwat"
        : null;
  const q = clean(query.q);
  const flag: Flag | null = FLAGS.includes(query.flag as Flag) ? (query.flag as Flag) : null;
  const kg = query.kg ? findKegiatanGroup(query.kg) : null;

  const all = await getEvaluations({ start: preset.start, end: preset.end });
  return buildInsight(all, { preset, gender, q, flag, kg });
}

/** Pure — exported so the shape can be exercised without touching the network. */
export function buildInsight(
  all: Rec[],
  opts: {
    preset: Preset;
    gender: Gender | null;
    q: string | null;
    flag: Flag | null;
    kg?: KegiatanGroup | null;
  },
): AsesmenInsight {
  const { preset, gender, q, flag } = opts;
  const kg = opts.kg ?? null;
  const needle = q?.toLowerCase() ?? null;
  const groupOf = (kegiatan: string | null) => {
    const g = resolveKegiatan(kegiatan).group;
    return { key: g.key, label: g.label };
  };

  // `is_dummy` is already excluded upstream; re-check so a server-side default
  // change cannot quietly inflate every number on this page.
  const scoped = all.filter((r) => {
    if (r.is_dummy) return false;
    if (gender && genderOf(r) !== gender) return false;
    if (kg && groupOf(r.kegiatan).key !== kg.key) return false;
    if (needle && !matchesNeedle(r, needle)) return false;
    return true;
  });

  const days = new Set(scoped.map(dayOf));
  days.delete("");
  // Rows with no kegiatan still get a row in `byKegiatan` (they must not vanish),
  // but they are not a kegiatan and must not inflate this count — a window of
  // purely unlabelled rows used to report "1 kegiatan".
  const kegiatanKeys = new Set(
    scoped.map((r) => clean(r.kegiatan)?.toLowerCase()).filter((k): k is string => k != null),
  );
  const pemeriksaKeys = new Set(scoped.map((r) => clean(r.pemeriksa)?.toLowerCase()).filter(Boolean));
  const baik = scoped.filter(isBaik).length;
  const terskor = scoped.filter((r) => scoreOf(r) != null).length;

  const totals: Totals = {
    evaluations: scoped.length,
    participants: countParticipants(scoped),
    kegiatan: kegiatanKeys.size,
    days: days.size,
    pemeriksa: pemeriksaKeys.size,
    baik,
    baikPct: pct(baik, terskor),
    tanpaSkor: scoped.length - terskor,
    avgScore: avg(scoped),
  };

  const flags: Flags = {
    tanpaNama: scoped.filter((r) => matchesFlag(r, "tanpa-nama")).length,
    perluBimbingan: scoped.filter((r) => matchesFlag(r, "perlu-bimbingan")).length,
    tanpaRekomendasi: scoped.filter((r) => matchesFlag(r, "tanpa-rekomendasi")).length,
  };

  // Levels 1..10 — title taken from whichever record carries one, so the
  // wording stays the upstream's and is never invented here.
  const levels: LevelRow[] = [];
  for (let s = 1; s <= 10; s++) {
    const rows = scoped.filter((r) => scoreOf(r) === s);
    if (!rows.length) continue;
    const title = clean(rows.find((r) => clean(r.scoreLabel?.title))?.scoreLabel?.title) ?? `Level ${s}`;
    levels.push({
      score: s,
      title,
      count: rows.length,
      pct: pct(rows.length, scoped.length) ?? 0,
      tone: bandOf(s)?.tone ?? "neutral",
    });
  }

  const bands: BandRow[] = BANDS.map((band) => {
    const count = scoped.filter((r) => {
      const s = scoreOf(r);
      return s != null && s >= band.min && s <= band.max;
    }).length;
    return { band, count, pct: pct(count, scoped.length) ?? 0 };
  });

  // ── per kegiatan ─────────────────────────────────────────────────────────
  const byKeg = new Map<string, Rec[]>();
  for (const r of scoped) {
    const key = clean(r.kegiatan) ?? "(tanpa kegiatan)";
    const bucket = byKeg.get(key.toLowerCase());
    if (bucket) bucket.push(r);
    else byKeg.set(key.toLowerCase(), [r]);
  }
  const byKegiatan: KegiatanRow[] = [...byKeg.values()]
    .map((rows) => {
      const label = clean(rows[0].kegiatan) ?? "(tanpa kegiatan)";
      const d = new Set(rows.map(dayOf));
      d.delete("");
      const b = rows.filter(isBaik).length;
      return {
        kegiatan: label,
        bucket: classifyBucket(rows[0].kegiatan),
        evaluations: rows.length,
        participants: countParticipants(rows),
        days: d.size,
        avgScore: avg(rows),
        baik: b,
        baikPct: pct(b, rows.length),
        ikhwan: rows.filter((r) => genderOf(r) === "Ikhwan").length,
        akhwat: rows.filter((r) => genderOf(r) === "Akhwat").length,
        tanpaRekomendasi: rows.filter((r) => matchesFlag(r, "tanpa-rekomendasi")).length,
      } satisfies KegiatanRow;
    })
    .sort((a, b) => b.evaluations - a.evaluations || a.kegiatan.localeCompare(b.kegiatan));

  // ── per bulan ────────────────────────────────────────────────────────────
  const byM = new Map<string, Rec[]>();
  for (const r of scoped) {
    const day = dayOf(r);
    if (!day) continue;
    const key = day.slice(0, 7);
    const bucket = byM.get(key);
    if (bucket) bucket.push(r);
    else byM.set(key, [r]);
  }
  const byMonth: MonthRow[] = [...byM.entries()]
    .map(([month, rows]) => {
      const d = new Set(rows.map(dayOf));
      d.delete("");
      const mi = Number(month.slice(5, 7)) - 1;
      return {
        month,
        label: `${BULAN[mi] ?? month.slice(5, 7)} ${month.slice(0, 4)}`,
        evaluations: rows.length,
        participants: countParticipants(rows),
        days: d.size,
        avgScore: avg(rows),
        baikPct: pct(rows.filter(isBaik).length, rows.length),
      } satisfies MonthRow;
    })
    .sort((a, b) => b.month.localeCompare(a.month));

  // ── kelompok kegiatan kanonik (tulang punggung) ──────────────────────────
  const byGroupMap = new Map<string, { g: ReturnType<typeof resolveKegiatan>; rows: Rec[] }>();
  for (const r of scoped) {
    const res = resolveKegiatan(r.kegiatan);
    // Canonical groups bucket by key. Unknown spellings all share the key
    // "belum-dikelompokkan" but carry their own raw label, so they must bucket
    // by label instead — otherwise every unseen spelling collapses into one row
    // labelled with whichever arrived first, which is precisely the "Lainnya"
    // lumping the map exists to avoid. One unseen spelling, one visible row.
    const bucketKey = res.canonical ? res.group.key : `?${res.group.label.toLowerCase()}`;
    const cur = byGroupMap.get(bucketKey);
    if (cur) cur.rows.push(r);
    else byGroupMap.set(bucketKey, { g: res, rows: [r] });
  }
  const rekCount = (rows: Rec[], v: string | null) =>
    rows.filter((r) => clean(r.rekomendasi_program) === v).length;
  const byGroup: GroupRow[] = [...byGroupMap.values()]
    .map(({ g, rows }) => {
      const d = new Set(rows.map(dayOf));
      d.delete("");
      const b = rows.filter(isBaik).length;
      const ejaanMap = new Map<string, number>();
      for (const r of rows) {
        const raw = clean(r.kegiatan) ?? "(tanpa kegiatan)";
        ejaanMap.set(raw, (ejaanMap.get(raw) ?? 0) + 1);
      }
      return {
        key: g.group.key,
        label: g.group.label,
        ejaan: [...ejaanMap.entries()]
          .map(([raw, evaluations]) => ({ raw, evaluations }))
          .sort((a, b2) => b2.evaluations - a.evaluations),
        canonical: g.canonical,
        evaluations: rows.length,
        participants: countParticipants(rows),
        days: d.size,
        pemeriksa: new Set(rows.map((r) => clean(r.pemeriksa)?.toLowerCase()).filter(Boolean)).size,
        avgScore: avg(rows),
        baik: b,
        baikPct: pct(b, rows.length),
        ikhwan: rows.filter((r) => genderOf(r) === "Ikhwan").length,
        akhwat: rows.filter((r) => genderOf(r) === "Akhwat").length,
        rekDasar: rekCount(rows, "HITS Dasar"),
        rekLanjutan: rekCount(rows, "HITS Lanjutan"),
        rekBelum: rekCount(rows, null),
      } satisfies GroupRow;
    })
    .sort((a, b2) => b2.evaluations - a.evaluations || a.label.localeCompare(b2.label));

  const ejaanBaru = byGroup.filter((g) => !g.canonical).flatMap((g) => g.ejaan.map((e) => e.raw));

  // ── hari tersibuk ────────────────────────────────────────────────────────
  // Two days carried 42 % of the whole source when this was measured, so a
  // month table reads as "which month held the big event". The days say it
  // directly; a month row cannot.
  const byDay = new Map<string, Rec[]>();
  for (const r of scoped) {
    const d = dayOf(r);
    if (!d) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const hariTersibuk: HariSibuk[] = [...byDay.entries()]
    .map(([tanggal, rows]) => {
      const top = [...rows.reduce((m, r) => {
        const label = resolveKegiatan(r.kegiatan).group.label;
        return m.set(label, (m.get(label) ?? 0) + 1);
      }, new Map<string, number>())].sort((a, b2) => b2[1] - a[1])[0];
      return {
        tanggal,
        kegiatanLabel: top?.[0] ?? "—",
        evaluations: rows.length,
        pemeriksa: new Set(rows.map((r) => clean(r.pemeriksa)?.toLowerCase()).filter(Boolean)).size,
        avgScore: avg(rows),
        pct: pct(rows.length, scoped.length) ?? 0,
      } satisfies HariSibuk;
    })
    .sort((a, b2) => b2.evaluations - a.evaluations)
    .slice(0, 5);

  // ── orang & progresi ─────────────────────────────────────────────────────
  // Examiner baselines are taken over the WHOLE window, deliberately NOT over
  // the filtered slice. "How hard does this examiner mark?" is a property of the
  // examiner, not of whatever the reader is currently looking at, and a
  // slice-local baseline degenerates: narrow the filter far enough and every
  // examiner is measured against their own handful of scores, so the correction
  // shrinks toward zero and a filtered page would quietly report less
  // examiner effect than an unfiltered one. See the note in `person.ts` on
  // `progressionSummary` taking `means` as an argument for exactly this reason.
  const live = all.filter((r) => !r.is_dummy);
  const means = examinerMeans(live);
  const persons = buildPersons(scoped, groupOf, means);
  const progression = progressionSummary(persons, means, scoped);
  const retest = retestByKegiatan(persons, scoped, groupOf);
  const turun = turunDalamKegiatan(persons);
  // "Ambiguity loses": a key whose rows disagree on gender is at least two
  // humans, so calling its rows "assessed more than once" would assert a repeat
  // that may never have happened. Those rows stay visible everywhere else — they
  // just do not carry this claim.
  const repeatKeys = new Set(
    persons.filter((p) => p.count > 1 && !p.flags.includes("nama-ganda")).map((p) => p.key),
  );
  const pemeriksa = buildPemeriksa(scoped, groupOf);

  // ── baris terbaru ────────────────────────────────────────────────────────
  const flagged = flag ? scoped.filter((r) => matchesFlag(r, flag, repeatKeys)) : scoped;
  const recent: RecentRow[] = flagged.slice(0, RECENT_LIMIT).map((r) => {
    // An unreadable score stays null all the way to the cell. It used to fall
    // back to 0, which rendered as the literal score "0" titled "Level 0" — a
    // missing value shown as the worst possible reading.
    const s = scoreOf(r);
    return {
      uuid: String(r.uuid),
      tanggal: dayOf(r),
      nama: clean(r.namaLengkap),
      kegiatan: clean(r.kegiatan),
      asalHalaqah: genderOf(r),
      pemeriksa: clean(r.pemeriksa),
      score: s,
      levelTitle: s == null ? null : (clean(r.scoreLabel?.title) ?? `Level ${s}`),
      tone: s == null ? "neutral" : (bandOf(s)?.tone ?? "neutral"),
      rekomendasi: clean(r.rekomendasi_program),
    } satisfies RecentRow;
  });

  return {
    preset,
    gender,
    q,
    flag,
    kg,
    windowEvaluations: all.filter((r: Evaluation) => !r.is_dummy).length,
    totals,
    flags,
    levels,
    bands,
    byGroup,
    byKegiatan,
    byMonth,
    hariTersibuk,
    retest,
    progression,
    turun,
    pemeriksa,
    ejaanBaru,
    recent,
    recentTruncated: Math.max(0, flagged.length - recent.length),
  };
}
