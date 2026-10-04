/**
 * Teacher attendance for the monthly report: meetings taught ÷ meetings
 * scheduled, per segment.
 *
 * Kept apart from lib/reports/queries.ts so the arithmetic can be unit-tested
 * without a database — the same split every other tested helper in this repo
 * uses (see lib/confirmations/guru-attendance.ts).
 */

/** Meetings taught ÷ scheduled as a 0-100 percentage; null when none were scheduled. */
export function teacherPct(real: number, ideal: number): number | null {
  return ideal > 0 ? (100 * real) / ideal : null;
}

/**
 * The report's default period is the whole calendar month, so on 2 September the
 * denominator would otherwise include 28 meetings that have not happened yet and
 * every teacher would read as absent. Clamp the end to today (WIB — the caller
 * passes `todayJakarta()`), the same convention lib/reports/hkm-bulanan.ts:156-162
 * already applies to the HKM monthly sheet.
 *
 * Both arguments are "YYYY-MM-DD"; string comparison is date comparison for that
 * format, so no Date object is involved.
 */
export function clampEndToToday(end: string, today: string): string {
  return end > today ? today : end;
}
