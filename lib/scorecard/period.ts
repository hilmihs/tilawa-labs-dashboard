/**
 * Period arithmetic for the scorecard. A period is either a quarter (seq 1..4)
 * or a month (seq 1..12); everything downstream only ever sees the resolved
 * [start, end] window, which is what the metric queries filter on.
 *
 * Pure — no DB, no Date.now(). The boundaries are built from the calendar, so a
 * quarter's end is the last day of its third month (leap years included).
 */

export type PeriodKind = "quarter" | "month" | "ytd";

const MONTH_LABEL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function isPeriodKind(v: unknown): v is PeriodKind {
  return v === "quarter" || v === "month" || v === "ytd";
}

/** 1..4 for a quarter, 1..12 for a month, 0 for a year-to-date snapshot. */
export function validateSeq(kind: PeriodKind, seq: number): boolean {
  if (!Number.isInteger(seq)) return false;
  if (kind === "ytd") return seq === 0;
  return kind === "quarter" ? seq >= 1 && seq <= 4 : seq >= 1 && seq <= 12;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Last day of a 1-based month — day 0 of the next month. */
function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Inclusive window, `YYYY-MM-DD` (the format every reports query takes). */
export function periodRange(
  kind: PeriodKind,
  year: number,
  seq: number,
): { start: string; end: string } {
  // A YTD snapshot spans the whole calendar year here; the caller narrows the
  // end to "today" (this module stays pure, no Date.now()).
  if (kind === "ytd") return { start: `${year}-01-01`, end: `${year}-12-31` };
  const firstMonth = kind === "quarter" ? (seq - 1) * 3 + 1 : seq;
  const lastMonth = kind === "quarter" ? firstMonth + 2 : seq;
  return {
    start: `${year}-${pad(firstMonth)}-01`,
    end: `${year}-${pad(lastMonth)}-${pad(lastDayOfMonth(year, lastMonth))}`,
  };
}

export function periodLabel(kind: PeriodKind, year: number, seq: number): string {
  if (kind === "ytd") return `${year} (YTD)`;
  return kind === "quarter" ? `Q${seq} ${year}` : `${MONTH_LABEL[seq - 1]} ${year}`;
}

/** The label the sheet uses for a period's target column ("TGT Q1" / "TGT Agu"). */
export function periodTargetLabel(kind: PeriodKind, seq: number): string {
  if (kind === "ytd") return "Tgt Thn";
  return kind === "quarter" ? `Tgt Q${seq}` : `Tgt ${MONTH_LABEL[seq - 1].slice(0, 3)}`;
}
