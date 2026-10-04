import { QURAN_PAGES, KHATAM_WRAP_HIGH, KHATAM_WRAP_LOW, pagesToJuz } from "./constants";

/**
 * One reading record for the cumulative engine. `totalPages` = pages read that
 * day ("Total Halaman"); `sampaiPages` = page reached ("Sampai Halaman"). `date`
 * is a `YYYY-MM-DD` string (or any Date-parseable value).
 */
export type ReadingRow = {
  date: string;
  totalPages: number;
  sampaiPages: number;
};

export type CumulativeResult = {
  cumulativePages: number;
  cumulativeJuz: number;
  firstDate: string | null; // YYYY-MM-DD of first reading with pages > 0
  lastDate: string | null;
  avgPerDay: number; // cumulativePages / (span days)
};

/**
 * Faithful port of app_hkm.py:calculate_cumulative_juz (per-participant loop).
 * Walks a participant's date-sorted readings, accumulating pages and detecting
 * khatam either by reaching page ≥ QURAN_PAGES or by a wrap-around (prev ≥ 570,
 * current < 50). Returns cumulative pages/juz plus first/last date and average.
 *
 * Pass rows for ONE participant. Order-independent (sorts internally by date).
 */
export function calculateCumulative(
  rows: ReadingRow[],
  opts: { quranPages?: number; pagesPerJuz?: number } = {},
): CumulativeResult {
  const quranPages = opts.quranPages ?? QURAN_PAGES;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  let cumulative = 0;
  let prevSampai = 0;
  let justKhatam = false;

  for (const row of sorted) {
    const total = Number(row.totalPages) || 0;
    const sampai = Number(row.sampaiPages) || 0;
    if (total <= 0) continue;

    const isKhatam =
      !justKhatam &&
      (sampai >= quranPages ||
        (prevSampai > 0 && prevSampai >= KHATAM_WRAP_HIGH && sampai < KHATAM_WRAP_LOW));

    if (isKhatam) {
      const remainingToKhatam = Math.max(0, quranPages - prevSampai);
      cumulative += sampai >= quranPages ? total : remainingToKhatam + total;
      justKhatam = true;
      prevSampai = 0;
    } else if (justKhatam && sampai >= quranPages) {
      continue;
    } else if (prevSampai > 0 && sampai < prevSampai - 50) {
      cumulative += total;
      prevSampai = sampai;
      justKhatam = false;
    } else {
      cumulative += total;
      prevSampai = sampai;
      justKhatam = false;
    }
  }

  const valid = sorted.filter((r) => (Number(r.totalPages) || 0) > 0);
  const firstDate = valid.length ? valid[0].date : null;
  const lastDate = valid.length ? valid[valid.length - 1].date : null;

  let avgPerDay = 0;
  if (firstDate && lastDate) {
    const days =
      Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000) + 1;
    if (days > 0) avgPerDay = cumulative / days;
  }

  return {
    cumulativePages: round1(cumulative),
    cumulativeJuz: round1(pagesToJuz(cumulative, opts.pagesPerJuz)),
    firstDate,
    lastDate,
    avgPerDay: round1(avgPerDay),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
