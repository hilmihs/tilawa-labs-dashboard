/**
 * The fixed text on the board. The visi changes at the speed of a mandate, so it
 * lives in code; the quote underneath rotates and IS editable (tv_quotes).
 *
 * The visi must set on one line in the masthead — roughly 72 characters. The
 * masthead is pinned so the table below it gets a fixed slot budget; a longer
 * visi ellipsises, which is loud, rather than quietly stealing a program row
 * off the bottom of the table.
 */
export const VISI =
  "A learning community that reads, understands and teaches the Qur'an.";

export const EYEBROW = "Education Board";

/**
 * Pages of kehadiran in the rotation: the day, then the week. The kabar page is
 * added on top of these when something is approved, so the cycle is 75 seconds
 * with kabar and 50 without.
 */
export const SLIDES_KEHADIRAN = 2;

/**
 * How long each slide stays up lives in tv.css as the `sweep` animation
 * duration, because that hairline both shows the countdown and drives it. Keep
 * the two in step: changing the beat means changing `animation: sweep 25s`.
 */
export const SLIDE_SECONDS = 25;

/** How often the page re-fetches. The syncs themselves run every 15 minutes. */
export const REFRESH_SECONDS = 180;

/** Fallback when nobody has written a quote yet. */
export const QUOTE_FALLBACK = {
  id: "fallback",
  text: "Barang siapa menempuh jalan untuk menuntut ilmu, Allah mudahkan baginya jalan menuju surga.",
  arabic: null as string | null,
  source: "HR. Muslim",
};
