/**
 * Reading-consistency streaks from a participant's reading dates (not in the
 * Python prototype — added per the owner's "streak & konsistensi" request).
 */
export type StreakResult = {
  currentStreak: number; // consecutive days ending at the most recent reading date
  longestStreak: number;
  activeDays: number; // distinct days with a reading
};

/** `dates` = any list of YYYY-MM-DD (duplicates + nulls tolerated). */
export function computeStreak(dates: (string | null | undefined)[]): StreakResult {
  const uniq = Array.from(
    new Set(dates.filter((d): d is string => !!d).map((d) => d.slice(0, 10))),
  ).sort();
  if (uniq.length === 0) return { currentStreak: 0, longestStreak: 0, activeDays: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    const gap = Math.round((Date.parse(uniq[i]) - Date.parse(uniq[i - 1])) / 86_400_000);
    if (gap === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // Current streak = consecutive run ending at the last active day.
  let current = 1;
  for (let i = uniq.length - 1; i > 0; i--) {
    const gap = Math.round((Date.parse(uniq[i]) - Date.parse(uniq[i - 1])) / 86_400_000);
    if (gap === 1) current += 1;
    else break;
  }

  return { currentStreak: current, longestStreak: longest, activeDays: uniq.length };
}
