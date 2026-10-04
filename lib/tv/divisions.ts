/**
 * Divisions that contribute kabar to the /tv board.
 *
 * Deliberately a TS constant rather than a table: there are four of them, they
 * change at the speed of the org chart, and the repo already models this kind of
 * enum as plain `text` + a const (staff.role, hkm_participants.status).
 */
export const DIVISIONS = ["program", "kajian", "zakat", "kaderisasi"] as const;

export type Division = (typeof DIVISIONS)[number];

export const DIVISION_LABEL: Record<Division, string> = {
  program: "Program",
  kajian: "Kajian",
  zakat: "Zakat / LAZ",
  kaderisasi: "Kaderisasi & Amaliah",
};

/** Chip colours on the board — one hue per division, defined in app/tv/tv.css. */
export const DIVISION_TONE: Record<Division, string> = {
  program: "emerald",
  kajian: "sky",
  zakat: "amber",
  kaderisasi: "violet",
};

export function isDivision(value: string): value is Division {
  return (DIVISIONS as readonly string[]).includes(value);
}

export function divisionLabel(value: string): string {
  return isDivision(value) ? DIVISION_LABEL[value] : value;
}
