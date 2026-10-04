import { PAGES_PER_DAY, pagesToJuz } from "./constants";
import type { ReadingRow } from "./cumulative";

/**
 * Monthly progress — a volume/consistency view, distinct from the cumulative
 * khatam engine. Progress = pages read WITHIN the month; target = days × pagesPerDay.
 * No khatam-wrap logic here.
 *
 * "Month" here is the REPORTING month the coordinators actually use: the 28th of
 * the previous month through the 27th of the named one, matching the period every
 * other monthly report in this app is run over. "Agu 2026" therefore means
 * 28 Jul – 27 Agu 2026, not 1–31 Aug.
 */

export type MonthlyCategory = "Tercapai" | "Belum Tercapai" | "Tidak Aktif";

export type MonthBounds = {
  start: string;
  end: string;
  /** Days in the reporting window (28th → 27th), i.e. 28–31 depending on the month. */
  days: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Day the reporting month named `ym` opens: the 28th of the PREVIOUS month. */
function windowStart(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 28)); // m-2 = previous month, 0-indexed
}

/** `ym` = "YYYY-MM" → inclusive [start,end] of its reporting window + day count. */
export function monthBounds(ym: string): MonthBounds {
  const [y, m] = ym.split("-").map(Number);
  const start = windowStart(ym);
  const end = `${y}-${pad(m)}-27`;
  const days = Math.round((Date.UTC(y, m - 1, 27) - start.getTime()) / 86_400_000) + 1;
  return { start: iso(start), end, days };
}

/**
 * The reporting month `date` falls in: on or after the 28th we are already in the
 * NEXT month's window, so 2026-08-28 belongs to "2026-09".
 */
export function reportingMonthOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (d < 28) return `${y}-${pad(m)}`;
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** Human wording for the window, e.g. "28 Jul – 27 Agu 2026". */
export function monthRangeLabel(ym: string): string {
  const { start, end } = monthBounds(ym);
  const short = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS_ID[Number(d.slice(5, 7)) - 1]}`;
  return `${short(start)} – ${short(end)} ${end.slice(0, 4)}`;
}

export function monthlyTarget(days: number, pagesPerDay = PAGES_PER_DAY): number {
  return days * pagesPerDay;
}

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-07" → "Jul 2026". Pure (server + client safe). */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_ID[m - 1]} ${y}`;
}

export type MonthlyResult = {
  realisasiPages: number;
  realisasiJuz: number;
  targetPages: number;
  capaianPct: number; // realisasi / target × 100 (rounded to 1)
  activeDays: number; // distinct reading days in the month
  category: MonthlyCategory;
};

/**
 * Effective days for the target: only the days of the window that have actually
 * elapsed, so a window still running is judged on what it has had so far rather
 * than on days nobody has lived yet. A closed window counts in full; a window
 * that has not opened counts 0 (target 0 — nothing to have read).
 * `today` = "YYYY-MM-DD".
 */
export function effectiveDays(ym: string, days: number, today?: string): number {
  if (!today) return days;
  const { start, end } = monthBounds(ym);
  if (today > end) return days;
  if (today < start) return 0;
  const elapsed =
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  return Math.min(Math.max(elapsed, 1), days);
}

/**
 * Sum a participant's reading for the given month. `readings` may span all time;
 * only rows whose date falls in the month are counted. Pass `today` so the
 * current month's target tracks the running date instead of the full month.
 */
export function computeMonthly(
  readings: ReadingRow[],
  ym: string,
  opts: { pagesPerDay?: number; pagesPerJuz?: number; today?: string } = {},
): MonthlyResult {
  const { start, end, days } = monthBounds(ym);
  // Only count positive daily pages — the export occasionally has non-positive
  // "Total Halaman" (backward re-reads / corrections); the cumulative engine
  // skips those too, so monthly volume matches.
  const inMonth = readings.filter((r) => r.date >= start && r.date <= end && (Number(r.totalPages) || 0) > 0);

  const realisasiPages = round1(inMonth.reduce((s, r) => s + (Number(r.totalPages) || 0), 0));
  const targetPages = monthlyTarget(effectiveDays(ym, days, opts.today), opts.pagesPerDay);
  const activeDays = new Set(inMonth.map((r) => r.date)).size;
  const capaianPct = targetPages > 0 ? round1((realisasiPages / targetPages) * 100) : 0;

  const category: MonthlyCategory =
    realisasiPages >= targetPages ? "Tercapai" : realisasiPages > 0 ? "Belum Tercapai" : "Tidak Aktif";

  return {
    realisasiPages,
    realisasiJuz: round1(pagesToJuz(realisasiPages, opts.pagesPerJuz)),
    targetPages,
    capaianPct,
    activeDays,
    category,
  };
}

/** Month options from `startYm` (e.g. program start) up to `nowYm`, newest first. */
export function monthOptions(startYm: string, nowYm: string): string[] {
  const out: string[] = [];
  const [sy, sm] = startYm.split("-").map(Number);
  const [ny, nm] = nowYm.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ny || (y === ny && m <= nm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out.reverse();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
