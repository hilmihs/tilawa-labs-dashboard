const ROMAN_MONTH = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

/** Configurable org prefix, e.g. "EKT/MPN-MBN". Overridable via env. */
export function letterPrefix(): string {
  return process.env.WARNING_LETTER_PREFIX?.trim() || "EKT/MPN-MBN";
}

/**
 * Build a warning-letter number: {PREFIX}/{ROMAN-MONTH}/{YEAR}/{seq}.
 * `seq` is the running number within the year (1-based); `date` defaults to now.
 * Example: EKT/MPN-MBN/VII/2026/16
 */
export function buildLetterNumber(seq: number, date = new Date()): string {
  const month = ROMAN_MONTH[date.getMonth()];
  const year = date.getFullYear();
  return `${letterPrefix()}/${month}/${year}/${seq}`;
}
