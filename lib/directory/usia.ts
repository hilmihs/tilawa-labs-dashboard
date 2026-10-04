/**
 * Usia santri, diturunkan dari tanggal lahir saat baca.
 *
 * The roster workbook ships a "Usia (2026)" column holding strings like
 * "5 tahun 3 bulan". It is deliberately never imported: it was already stale
 * when the file was saved, and a stored age rots silently — every santri would
 * quietly get younger than the dashboard claims. Storing only `birth_date` and
 * deriving from it means the number is right on every render forever.
 *
 * Computed server-side (see getPesertaDirectory) rather than in the client
 * component: a client-side `new Date()` can disagree with the server's around
 * midnight, and the page and the xlsx export must read the same number.
 */

/** Today in Jakarta, as a UTC-shifted Date to be read with getUTC*. */
function todayJakarta(now: number): Date {
  // Same trick as todayJakarta() in lib/reports/directory-xlsx.ts: the server
  // may run in UTC, and a birthday must not flip a day early.
  return new Date(now + 7 * 3_600_000);
}

/**
 * Whole calendar months lived, or null when the birth date is unknown.
 *
 * Calendar months, not days/30.44: "5 tahun 3 bulan" has to match what a parent
 * counts on their fingers, and an averaged month drifts off that by a day or
 * two right around a birthday — exactly when someone checks.
 */
export function usiaMonths(birthDate: string | null | undefined, today?: Date): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate.trim());
  if (!m) return null;

  const [, y, mo, d] = m;
  const by = Number(y);
  const bm = Number(mo);
  const bd = Number(d);

  const ref = today ?? todayJakarta(Date.now());
  const ty = ref.getUTCFullYear();
  const tm = ref.getUTCMonth() + 1;
  const td = ref.getUTCDate();

  // Subtract a month while the day-of-month has not come round yet.
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  return months < 0 ? 0 : months;
}

/** "5 tahun 3 bulan" · "11 bulan" · "—" when unknown. */
export function formatUsia(months: number | null | undefined): string {
  if (months == null) return "—";
  const tahun = Math.floor(months / 12);
  const bulan = months % 12;
  if (tahun === 0) return `${bulan} bulan`;
  if (bulan === 0) return `${tahun} tahun`;
  return `${tahun} tahun ${bulan} bulan`;
}
