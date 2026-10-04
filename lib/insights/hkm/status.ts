/**
 * Enrollment status of an HKM participant — app-owned, orthogonal to reading
 * progress. The the partner system API has no concept of "keluar" or "cuti": it keeps
 * serving a user row forever, so without this the dashboard keeps nagging
 * people who left, and keeps counting them against a halaqah's target.
 *
 * Three questions, three predicates:
 *   isTracked   — does this row belong on the dashboard at all?
 *   isMonitored — should a missed target count as a kendala (at-risk/WA nudge)?
 *   isCounted    = isTracked (KPI denominators follow the visible roster)
 */
export const HKM_STATUSES = ["aktif", "cuti", "keluar", "wafat"] as const;
export type HkmStatus = (typeof HKM_STATUSES)[number];

export function isHkmStatus(v: unknown): v is HkmStatus {
  return typeof v === "string" && (HKM_STATUSES as readonly string[]).includes(v);
}

/** Coerce a DB value (nullable, legacy rows) to a status. */
export function toHkmStatus(v: unknown): HkmStatus {
  return isHkmStatus(v) ? v : "aktif";
}

/**
 * On the dashboard? 'keluar' and 'wafat' are off it: they are no longer part of
 * the cohort, so leaving them in would understate every average. The rows stay
 * in the DB — history is not deleted, only excluded from the live view.
 */
export function isTracked(status: HkmStatus): boolean {
  return status === "aktif" || status === "cuti";
}

/**
 * Eligible to be flagged as a kendala setoran? 'cuti' is listed but never
 * chased: the reason for the gap is already known and accepted.
 */
export function isMonitored(status: HkmStatus): boolean {
  return status === "aktif";
}

export const HKM_STATUS_LABEL: Record<HkmStatus, string> = {
  aktif: "Aktif",
  cuti: "Cuti",
  keluar: "Keluar",
  wafat: "Wafat",
};
