/**
 * HKM tilawah constants, ported from docs/HAR_dashboard/app_hkm.py.
 * All are overridable per-program via programs.config.hkm (see HkmParams).
 */
export const QURAN_PAGES = 604; // MAX_TARGET_PAGES — a full Quran (mushaf Madinah)
export const PAGES_PER_JUZ = 20; // app_hkm.py pages_to_juz: 1 juz = 20 pages (flat)
export const PAGES_PER_DAY = 4; // TILAWAH_PAGES_PER_DAY — default daily target

// Khatam wrap-around detection thresholds (app_hkm.py:97-100).
export const KHATAM_WRAP_HIGH = 570; // prev page ≥ this …
export const KHATAM_WRAP_LOW = 50; // … and current page < this ⇒ wrapped to a new khatam

// Names excluded from the participant display (panitia/admins), app_hkm.py:33-40.
export const EXCLUDED_NAMES = [
  "azka wafa wulandari",
  "hilmi sobandi",
  "abdul muhsin",
  "ibnu al khawarizmi",
  "nissa",
  "naufal rahman mahardika",
];

export type HkmParams = {
  pagesPerDay: number;
  quranPages: number;
  pagesPerJuz: number;
  excludedNames: string[];
};

export const DEFAULT_HKM_PARAMS: HkmParams = {
  pagesPerDay: PAGES_PER_DAY,
  quranPages: QURAN_PAGES,
  pagesPerJuz: PAGES_PER_JUZ,
  excludedNames: EXCLUDED_NAMES,
};

/** Merge a program's config.hkm block over the defaults. */
export function resolveHkmParams(config: unknown): HkmParams {
  const hkm =
    config && typeof config === "object" && "hkm" in config
      ? ((config as { hkm?: Partial<HkmParams> }).hkm ?? {})
      : {};
  return {
    pagesPerDay: hkm.pagesPerDay ?? DEFAULT_HKM_PARAMS.pagesPerDay,
    quranPages: hkm.quranPages ?? DEFAULT_HKM_PARAMS.quranPages,
    pagesPerJuz: hkm.pagesPerJuz ?? DEFAULT_HKM_PARAMS.pagesPerJuz,
    excludedNames: hkm.excludedNames ?? DEFAULT_HKM_PARAMS.excludedNames,
  };
}

export function pagesToJuz(pages: number, pagesPerJuz = PAGES_PER_JUZ): number {
  return pages / pagesPerJuz;
}

export function juzToPages(juz: number, pagesPerJuz = PAGES_PER_JUZ): number {
  return juz * pagesPerJuz;
}
