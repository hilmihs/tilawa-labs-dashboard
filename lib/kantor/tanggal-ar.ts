/** Tanggal untuk halaman petugas (Arab). Semua dihitung di zona WIB. */
const WIB = { timeZone: "Asia/Jakarta" } as const;

/** Tengah hari WIB supaya tanggal "YYYY-MM-DD" tidak bergeser zona. */
function dariIso(iso: string): Date {
  return new Date(`${iso}T12:00:00+07:00`);
}

/** "الجمعة، ١٤ ربيع الآخر" */
export function hijriPendek(at: Date | string): string {
  const d = typeof at === "string" ? dariIso(at) : at;
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    ...WIB,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/** "٢٥ سبتمبر ٢٠٢٦" */
export function masehiAr(at: Date | string): string {
  const d = typeof at === "string" ? dariIso(at) : at;
  return new Intl.DateTimeFormat("ar-EG", { ...WIB, day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Satu hari → hijri pendek; rentang → "من … إلى …". */
export function rentangAr(dari: string, sampai: string): string {
  return dari === sampai ? hijriPendek(dari) : `من ${hijriPendek(dari)} إلى ${hijriPendek(sampai)}`;
}

/** "الثلاثاء ٢٩ سبتمبر ٢٠٢٦" — untuk pesan WA ke mas'ul (Masehi lebih mudah dibaca di Indonesia). */
export function masehiHariAr(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG", { ...WIB, weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(dariIso(iso))
    .replace("،", "");
}
