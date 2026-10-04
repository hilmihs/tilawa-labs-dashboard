import type { AlasanTolak } from "./aturan";
import type { AlasanIzin, StatusIzin, TolakIzin } from "./izin";

/** "16:05" → "٤:٠٥" (12 jam, angka Arab-Hindi); `denganPeriode` → "٤:٠٥ م". */
export function jamAr(hhmm: string, denganPeriode = false): string {
  const [h, m] = hhmm.split(":").map(Number);
  const teks = `${h % 12 || 12}:${String(m).padStart(2, "0")}`.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  return denganPeriode ? `${teks} ${h < 12 ? "ص" : "م"}` : teks;
}

export function angkaAr(n: number): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** Teks alur kabar tidak hadir (ikhbar) & beranda. Syaikh mengabarkan — tidak ada persetujuan. */
export const AR_IZIN = {
  tekanUntukMencatat: "اضغط للتسجيل",
  dinas: (jam: string) => `الدوام ${jamAr(jam, true)}`,
  pekanIni: "هذا الأسبوع",
  ringkasPekan: (hadir: number, izin: number) =>
    izin > 0 ? `${angkaAr(hadir)} حضور · ${angkaAr(izin)} غياب` : `${angkaAr(hadir)} حضور`,
  hariIni: "اليوم",
  izin: "غياب",
  hariPendek: ["إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"],
  mintaIzin: "إخبار بالغياب",
  kapan: "متى؟",
  besok: "غدًا",
  beberapaHari: "عدة أيام",
  dari: "من",
  sampai: "إلى",
  sebab: "السبب",
  catatan: "ملاحظة",
  opsional: "(اختياري)",
  catatanContoh: "اكتب ملاحظة قصيرة للمسؤول…",
  keMasul: "يُسجَّل غيابك مباشرة دون حاجة إلى موافقة، ثم تُرسل الخبر إلى المسؤول عبر واتساب.",
  kirim: "تسجيل الغياب",
  mengirim: "جارٍ التسجيل…",
  gagalKirim: "تعذّر التسجيل. تأكد من الاتصال وحاول مرة أخرى.",
  kembali: "رجوع",
  tercatat: "تم تسجيل غيابك",
  doaSakit: "شفاكم الله وعافاكم.",
  doaUmum: "يسّر الله أمركم.",
  kirimKeMasul: "بقي أن تُرسل الخبر إلى المسؤول عبر واتساب.",
  tanpaMasul: "وصل الخبر إلى الإدارة.",
  tombolWa: "إرسال الخبر عبر واتساب",
  sudahDibatalkan: "تم إلغاء هذا الخبر.",
  tanggal: "التاريخ",
  status: "الحالة",
  keBeranda: "العودة إلى الرئيسية",
  batalkan: "إلغاء الخبر",
  pesanIzinTerakhir: "إخبار بالغياب",
  lihat: "عرض",
  terimaKasih: "جزاكم الله خيرًا",
  tercatatHadir: "تم تسجيل حضورك اليوم",
  tercatatPulang: "تم تسجيل انصرافك اليوم",
  waktu: "الوقت",
  tepatWaktu: "في الوقت",
  terlambat: "متأخر",
  selesai: "تم",
  sudahPulangHariIni: "انتهى دوامك اليوم",
  alasan: {
    sakit: "مرض",
    keluarga: "ظرف عائلي",
    safar: "سفر",
    lain: "سبب آخر",
  } satisfies Record<AlasanIzin, string>,
  statusIzin: {
    dikabarkan: "مُسجَّل",
    dibatalkan: "ملغى",
    // Baris dari alur izin lama (sebelum 0048).
    menunggu: "مُسجَّل",
    disetujui: "مُسجَّل",
    ditolak: "مرفوض",
  } satisfies Record<StatusIzin, string>,
  tolak: {
    "alasan-tidak-sah": "يرجى اختيار السبب.",
    "tanggal-tidak-sah": "التاريخ غير صحيح.",
    "sudah-lewat": "لا يمكن الإخبار عن يوم مضى. يرجى التواصل مع الإدارة.",
    "terlalu-panjang": "أقصى مدة ١٤ يومًا. يرجى التواصل مع الإدارة.",
    "catatan-terlalu-panjang": "الملاحظة طويلة جدًا.",
    bertumpuk: "سبق أن أخبرت بغيابك في هذه الأيام.",
  } satisfies Record<TolakIzin, string>,
};

/** Semua teks halaman petugas (/k/[token]). Satu tempat supaya mudah dikoreksi penutur Arab. */
export const AR = {
  salam: "السلام عليكم",
  judul: "تسجيل الحضور — المكتب",
  belumHadir: "لم تسجّل حضورك اليوم بعد",
  hadirSejak: (jam: string) => `حاضر منذ الساعة ${jam}`,
  sudahPulang: (masuk: string, keluar: string) => `حضرت ${masuk} وانصرفت ${keluar}`,
  tombolMasuk: "تسجيل الحضور",
  tombolKeluar: "تسجيل الانصراف",
  memintaLokasi: "جارٍ تحديد موقعك…",
  berhasilMasuk: (jam: string) => `تم تسجيل حضورك الساعة ${jam}`,
  berhasilKeluar: (jam: string) => `تم تسجيل انصرافك الساعة ${jam}`,
  izinDitolak: "يرجى السماح للمتصفح بالوصول إلى موقعك ثم المحاولة مرة أخرى.",
  caraAndroid: "أندرويد (كروم): اضغط على رمز القفل بجانب العنوان ← الأذونات ← الموقع ← السماح.",
  caraIphone: "آيفون (سفاري): الإعدادات ← الخصوصية ← خدمات الموقع ← سفاري ← أثناء الاستخدام.",
  lokasiGagal: "تعذّر تحديد موقعك. تأكد من تشغيل GPS وحاول مرة أخرى.",
  tautanTidakSah: "هذا الرابط غير صالح. يرجى التواصل مع الإدارة.",
  tolak: (alasan: AlasanTolak, jarakM?: number): string => {
    switch (alasan) {
      case "di-luar-radius":
        return `أنت على بعد ${Math.round(jarakM ?? 0)} متر من المكتب. يجب أن تكون داخل المكتب.`;
      case "akurasi-buruk":
        return "دقة الموقع ضعيفة. شغّل GPS (الموقع الدقيق) وحاول مرة أخرى.";
      case "kantor-belum-disetel":
        return "لم يتم تحديد موقع المكتب بعد. يرجى التواصل مع الإدارة.";
      case "sudah-masuk":
        return "تم تسجيل حضورك اليوم مسبقاً.";
      case "belum-masuk":
        return "يجب تسجيل الحضور أولاً.";
      case "sudah-keluar":
        return "تم تسجيل انصرافك اليوم مسبقاً.";
      case "posisi-tidak-sah":
        return "الموقع غير صالح. حاول مرة أخرى.";
    }
  },
};
