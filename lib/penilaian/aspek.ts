/** Aspek catatan cepat (design p3) — sama dengan KPI + beberapa aspek umum hearing 7 Sep. */
export const ASPEK = ["Inisiatif", "Ketepatan waktu", "Disiplin", "Memegang peserta", "Komunikasi", "Delegasi", "Adab"] as const;
export type Aspek = (typeof ASPEK)[number];
