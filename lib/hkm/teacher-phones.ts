/**
 * WA numbers for HKM pengajar (teachers), keyed by the CANONICAL pengajar name.
 * The participant master has a few duplicate spellings for the same teacher
 * (e.g. "Ustadz Al Fajar" = "Ustadz Fajar"); NAME_ALIASES folds those so a
 * teacher's halaqah don't fragment into separate reminder rows.
 *
 * Fill numbers as they become available. Until a teacher has a number,
 * getTeacherPhone() returns null and the reminder button opens WhatsApp WITHOUT
 * a preset recipient (message prefilled; coordinator picks the contact).
 * Numbers may be in any format — normalizePhone() cleans them.
 */

/** Duplicate-spelling → canonical name. Confirmed with the owner 2026-07-20. */
export const NAME_ALIASES: Record<string, string> = {
  "Ustadz Al Fajar": "Ustadz Fajar", // same person as Ustadz Fajar (HKM 1 ikhwan)
  "Ustadz Qodriyanto": "Ustadz Qodri",
  // "Ustadz Hamzah Kamila Saputra" is a DIFFERENT person (HKM 10) — not aliased.
};

export function canonicalPengajar(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return NAME_ALIASES[n] ?? (n || "—");
}

export const TEACHER_PHONES: Record<string, string> = {
  // Ikhwan
  "Ustadz Hamid": "+6281760312404", // Ustadz Hamid Abu Hafshah
  "Ustadz Fajar": "+62 821-1385-0811",
  "Ustadz Abdul Khair": "+62 812-8067-2014", // Ustadz Abdul Muhsin Bachtar
  "Ustadz Qodri": "+62 896-7400-2335",
  "Ustadz Ibnu Al Khawarizmi": "+62 812-1266-5050", // Ustadz Ibnul Khawarizmi
  "Ustadz Taufiq": "+62 851-5745-0770", // Taufik bin sadiyo
  "Ustadz Abdussyukur": "+6281047738347", // Ahmad Abdussyakur
  // Akhwat
  "Ustadzah Hanifah": "+62 853-6837-7317", // Nur Hanifah Rasmani
  "Ustadzah Wilda": "+62 813-5343-0149", // Zahra Wafa Lestari
  "Ustadzah Naufal Wafa Wulandari": "+62 822-6909-2601", // Nur Affifah — HKM 7 & HKM 6 (took over from Nabilah Ulya 2026-07-26)
  "Ustadzah Nurlayla": "+6281697886921", // Layla
  "Ustadzah Reda": "+62 812-6130-6563",
  "Ustadzah Tasmiah": "+62816718189351", // HKM 6 akhwat sejak rotasi 24 Agu 2026
  "Ustadzah Salma": "+62 821-3657-3097", // HKM 3 akhwat sejak rotasi 24 Agu 2026
  "Ustadzah Jannah": "+6281411506252", // HKM 4 akhwat
  "Ustadz Hamzah Kamila Saputra": "+6281588378793", // HKM 10 ikhwan
  // Belum punya nomor (tombol reminder tetap jalan, tapi tanpa tujuan — lihat
  // getTeacherPhone): "Ustadzah Feni" (HKM 7 akhwat), "Ustadz Abdul Majid"
  // (HKM 3 ikhwan), "Ustadz Fishawar" (HKM 11 ikhwan).
  // (Ustadzah Nabilah Ulya dihapus — HKM 6 akhwat pindah ke Feni lalu Tasmiah.)
};

export function getTeacherPhone(pengajar: string | null | undefined): string | null {
  return TEACHER_PHONES[canonicalPengajar(pengajar)] ?? null;
}
