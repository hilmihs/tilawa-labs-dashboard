/**
 * Manual guru phone fallbacks for teachers whose number is missing or wrong in
 * tilawah, so the WA reminder button still works. Keyed by pengajar display name.
 */
export const GURU_PHONE_OVERRIDES: Record<string, string> = {
  "Amina Kamila Permata": "081351407327",
  "Ruqayyah Abdul Firdaus": "081562538979",
  // Both numbers are already registered in tilawah, but on a SECOND account, and
  // the CMS enforces a unique phone — so they cannot simply be copied onto the
  // teaching account (the write is silently dropped). Kept here until the
  // duplicates are merged upstream:
  //   Yusuf Handayani — id 1782 (teaching, no phone) vs id 1817
  //     "Yusuf Karim Safitri" / orang3425@example.com, which holds this number.
  "Yusuf Handayani": "081331947687",
  //   Rafi Saputra — id 1815 (teaching, no phone); the number is registered
  //     on id 1780 "Koodinator HITS" (sic). Confirmed by the coordinator
  //     16 Aug 2026 as the right way to reach her.
  "Rafi Saputra": "081697886921",
  // Rania Nabila Mahardika teaches in HITS Safar Januari + April, but tilawah's
  // per-batch guru list never returns her, so guru_sync has no row to carry the
  // number even though the CMS user record holds it (081375001884, written
  // 16 Aug 2026). Confirmed by the coordinator the same day.
  "Rania Nabila Mahardika": "081375001884",
  // Maryam Hanifah Wijaya (id 1810, HKM 2 & 5 Ikhwan) has no phone in tilawah.
  // Not written upstream: the account also holds the admin role and the user
  // update endpoint takes a full body including `role`. Given by the
  // coordinator 17 Sep 2026.
  "Maryam Hanifah Wijaya": "081760312404",
};

/** Prefer a manual override for this teacher, else the synced number. */
export function resolveGuruPhone(
  pengajar: string | null,
  synced: string | null,
): string | null {
  if (pengajar && GURU_PHONE_OVERRIDES[pengajar]) return GURU_PHONE_OVERRIDES[pengajar];
  return synced;
}
