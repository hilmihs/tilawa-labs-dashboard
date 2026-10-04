/**
 * The shape of the monthly participant recap — which rows print, in what order,
 * under which columns, and how a column finds its teacher check-in figures.
 *
 * This module exists because the screen and the xlsx used to answer those four
 * questions differently, and a coordinator reading the export beside the page
 * saw four disagreements at once:
 *
 *   1. CHECK-IN LOOKUP. `getParticipantReport` returns `byJenis: []` for any
 *      scope with a single meeting cadence, so the sheet fell back to one table
 *      stamped `jenis: null` and then looked the check-in up by THAT null while
 *      the segments it was drawing carried a real "yaumi". Every Terlambat/Alpa
 *      cell printed "-" next to a screen showing the numbers.
 *   2. EMPTY STATUS ROWS. The screen drops a status bucket that is zero across
 *      every column; the sheet always printed all four, pushing Terlambat/Alpa
 *      four rows down from where the screen shows them.
 *   3. COLUMN ORDER. The sheet sorted gender descending (Akhwat first); the
 *      screen renders segments in the order the report hands them over (Ikhwan
 *      first on mabni), so the two read left-to-right differently.
 *   4. WORDING. "Sakit, kerjaan, mengundurkan diri, dll" vs the screen's
 *      "Sakit/kerjaan/mengundurkan diri".
 *
 * The screen is the source of truth for all four: it is what people compare the
 * export against. `app/[program]/report/ReportView.tsx` is a React client
 * component and cannot import from here without pulling the report renderer into
 * a server module, so the rules are stated here and locked against a transcript
 * of the UI's own predicates in lib/reports/participant-rows.test.ts.
 *
 * Pure and DB-free, on purpose — the whole point is that it can be tested.
 */
import type { GuruCheckinBlock, GuruCheckinSegment, ParticipantSegment } from "@/lib/reports/queries";

// ── status rows ──────────────────────────────────────────────────────────

export type StatusRowSpec = {
  label: string;
  /** Render as a percentage rather than a count. */
  pct?: boolean;
  get: (s?: ParticipantSegment) => number | null;
  /**
   * Buckets that only fill once the upstream source records a status. Until then
   * they are a row of zeros across every column, and both renderings drop them
   * rather than make the reader scan four empty lines to learn nothing.
   *
   * The rule is per TABLE, not per column: a bucket that is non-zero in one
   * column keeps the row for the whole table (mirrors `segs.some(...)` in
   * ParticipantStatusTable). In a cadence-split report each cadence table
   * decides for itself, so yaumi may print a row usbu'iy hides.
   */
  hideWhenEmpty?: (s: ParticipantSegment) => number;
};

/**
 * Labels are copied verbatim from STATUS_ROWS in ReportView.tsx. "Total" is not
 * here: both renderings draw it as an emphasised closing line, not as a body row
 * (the screen slices it off this list too), and the check-in rows sit between.
 */
export const STATUS_ROWS: readonly StatusRowSpec[] = [
  { label: "Kehadiran peserta", pct: true, get: (s) => s?.kehadiranPct ?? null },
  { label: "Kehadiran pengajar", pct: true, get: (s) => s?.teacherPct ?? null },
  { label: "Peserta aktif", get: (s) => s?.aktif ?? 0 },
  { label: "Peserta Tidak Aktif", get: (s) => s?.tidakAktif ?? 0, hideWhenEmpty: (s) => s.tidakAktif },
  { label: "Dikeluarkan", get: (s) => s?.dikeluarkan ?? 0, hideWhenEmpty: (s) => s.dikeluarkan },
  {
    label: "Sakit/kerjaan/mengundurkan diri",
    get: (s) => s?.mengundurkan ?? 0,
    hideWhenEmpty: (s) => s.mengundurkan,
  },
  { label: "Tidak ada Status", get: (s) => s?.tidakAdaStatus ?? 0, hideWhenEmpty: (s) => s.tidakAdaStatus },
];

/** The status rows one table actually prints, in order. */
export function visibleStatusRows(segs: readonly ParticipantSegment[]): StatusRowSpec[] {
  return STATUS_ROWS.filter(
    (row) => !row.hideWhenEmpty || segs.some((s) => row.hideWhenEmpty!(s) > 0),
  );
}

// ── columns ──────────────────────────────────────────────────────────────

export type SegmentColumn = { gender: number | null; level: string | null };

/**
 * One column per segment, in the order the report handed the segments over —
 * the same left-to-right the screen renders, because it simply maps over
 * `segments`.
 *
 * The one liberty the sheet has to take: its header band merges a gender across
 * its columns, which only works if a gender's columns are contiguous. Genders are
 * therefore taken in order of FIRST APPEARANCE and their segments kept in
 * relative order — identical to the screen whenever the segments arrive grouped
 * by gender (they do; the recap query aggregates on gender), and a stable,
 * printable fallback when they do not.
 */
export function segmentColumns(segs: readonly ParticipantSegment[]): {
  genders: (number | null)[];
  cols: SegmentColumn[];
} {
  const genders: (number | null)[] = [];
  for (const s of segs) if (!genders.includes(s.gender)) genders.push(s.gender);
  const cols: SegmentColumn[] = [];
  for (const g of genders) {
    const seen = new Set<string>();
    for (const s of segs) {
      if (s.gender !== g) continue;
      const key = String(s.level);
      if (seen.has(key)) continue; // a (gender, level) pair is one column
      seen.add(key);
      cols.push({ gender: g, level: s.level });
    }
  }
  return { genders, cols };
}

// ── teacher check-in rows ────────────────────────────────────────────────

/** The part of a participant segment that identifies its column. */
export type CheckinSegmentKey = Pick<ParticipantSegment, "jenis" | "gender" | "level">;

/**
 * The check-in figures for one column, or undefined when the source has none for
 * it — a distinct fact from zero, which is why callers render "-" rather than 0.
 *
 * Keyed on the column's OWN segment (jenis × gender × level), never on the
 * enclosing table's jenis: inside a cadence table the two are the same value, and
 * in a single-cadence report only the segment carries the cadence at all.
 */
export function findCheckinSegment(
  checkin: GuruCheckinBlock | null | undefined,
  seg: CheckinSegmentKey | undefined,
): GuruCheckinSegment | undefined {
  if (!checkin || !seg) return undefined;
  return checkin.segments.find(
    (x) => x.jenis === seg.jenis && x.gender === seg.gender && x.level === seg.level,
  );
}

/**
 * Label + value for each check-in line, in display order. In GURU-DAYS: a guru
 * scheduled on 8 recorded days contributes 8 (see GuruCheckinSegment). Shared so
 * the sheet cannot grow a row the screen does not have, or vice versa.
 */
export const CHECKIN_ROWS: readonly [string, (s: GuruCheckinSegment) => number][] = [
  ["Hari efektif belajar (hari-guru)", (s) => s.hariEfektif],
  ["Terlambat", (s) => s.telat],
  ["Alpa", (s) => s.alpa],
];
