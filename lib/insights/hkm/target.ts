import { PAGES_PER_DAY, pagesToJuz } from "./constants";

/**
 * Time-proportional page target for a [start, end] window (inclusive), ported
 * from app_hkm.py:calculate_expected_pages — total_days = (end - start).days + 1,
 * target = total_days × pagesPerDay.
 */
export function expectedPages(
  startDate: string | Date,
  endDate: string | Date,
  pagesPerDay = PAGES_PER_DAY,
): number {
  const start = typeof startDate === "string" ? Date.parse(startDate) : startDate.getTime();
  const end = typeof endDate === "string" ? Date.parse(endDate) : endDate.getTime();
  const totalDays = Math.round((end - start) / 86_400_000) + 1;
  if (totalDays <= 0) return 0;
  return totalDays * pagesPerDay;
}

export function expectedJuz(
  startDate: string | Date,
  endDate: string | Date,
  pagesPerDay = PAGES_PER_DAY,
  pagesPerJuz?: number,
): number {
  return Math.round(pagesToJuz(expectedPages(startDate, endDate, pagesPerDay), pagesPerJuz) * 10) / 10;
}
