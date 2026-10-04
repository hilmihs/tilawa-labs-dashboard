/**
 * Asia/Jakarta (WIB, UTC+7) calendar helpers.
 *
 * The database runs in `Etc/UTC`, so `current_date` is the *UTC* date — between
 * 00:00 and 07:00 WIB it still points at yesterday in Jakarta. Anything that
 * says "hari ini" to a human must therefore compute the date here, in TS, and
 * pass it into SQL as a parameter. No `current_date` / `now()` in /tv queries.
 *
 * All functions are pure string arithmetic on `YYYY-MM-DD`: no Intl, no
 * timezone database, no dependence on the server's own TZ setting.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The WIB calendar date of an instant (default: now), as "YYYY-MM-DD". */
export function jakartaDate(at: Date = new Date()): string {
  return new Date(at.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today in WIB as "YYYY-MM-DD". */
export function todayJakarta(): string {
  return jakartaDate();
}

/** "2026-08-14" + 1 -> "2026-08-15". Negative n goes backwards. */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `b` to `a` (a − b): positive when `a` is later. */
export function diffDaysISO(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / DAY_MS);
}

/**
 * ISO weekday: 1 = Senin … 7 = Ahad. Same numbering Postgres `isodow` and the
 * Mabni upstream use, so a date computed here can be compared to either without
 * translation.
 */
export function isoDow(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Ahad
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * The Jumat→Kamis week containing `iso` — the cadence the Board uses for the
 * berita recap (dikumpulkan Jumat, tayang sepekan). `days` is the seven dates,
 * Jumat first.
 */
export function weekJumatKamis(iso: string): { start: string; end: string; days: string[] } {
  const back = (isoDow(iso) - 5 + 7) % 7; // Jumat(5) -> 0, Kamis(4) -> 6
  const start = addDaysISO(iso, -back);
  return {
    start,
    end: addDaysISO(start, 6),
    days: Array.from({ length: 7 }, (_, i) => addDaysISO(start, i)),
  };
}

/** "14:35" in WIB — for the "diperbarui" ticker. */
export function jamWib(at: Date = new Date()): string {
  return new Date(at.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(11, 16);
}

/** Whichever of the two ISO dates comes first. */
export function minISO(a: string, b: string): string {
  return a <= b ? a : b;
}
