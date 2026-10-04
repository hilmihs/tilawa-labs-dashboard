import { QURAN_PAGES } from "./constants";

/**
 * Progress buckets, ported from app_hkm.py:categorize_participant_hkm.
 * `order` drives display sort (khatam first, "belum mulai" last).
 */
export type HkmCategory =
  | "Khatam 3x+"
  | "Khatam 2x"
  | "Khatam 1x"
  | "Sudah Mencapai Target"
  | "Belum Mencapai Target"
  | "Belum Sama Sekali";

export type Categorization = {
  category: HkmCategory;
  khatamCount: number;
  order: number; // 1 (best) … 6 (belum mulai)
};

export function categorizeParticipant(
  realPages: number,
  targetPages: number,
  quranPages = QURAN_PAGES,
): Categorization {
  const real = Number(realPages) || 0;
  if (real === 0) return { category: "Belum Sama Sekali", khatamCount: 0, order: 6 };

  const khatamCount = Math.floor(real / quranPages);
  if (khatamCount >= 3) return { category: "Khatam 3x+", khatamCount, order: 1 };
  if (khatamCount === 2) return { category: "Khatam 2x", khatamCount, order: 2 };
  if (khatamCount === 1) return { category: "Khatam 1x", khatamCount, order: 3 };
  if (real >= targetPages) return { category: "Sudah Mencapai Target", khatamCount: 0, order: 4 };
  return { category: "Belum Mencapai Target", khatamCount: 0, order: 5 };
}
