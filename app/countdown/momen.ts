/**
 * Momen yang dipantau papan /countdown.
 *
 * Sengaja file, bukan tabel: daftarnya pendek, berubah beberapa kali setahun,
 * dan tiap perubahan pantas lewat review — bukan lewat form yang bisa membuat
 * layar aula menampilkan judul salah tanpa jejak.
 *
 * `date` = hari-H (atau hari pertama, kalau ada `end`). `end` hanya untuk momen
 * berdurasi; itulah yang memicu state "sedang berlangsung" dengan progress bar.
 * `hisab` menandai tanggal yang diturunkan dari Umm al-Qura dan belum melewati
 * sidang isbat — bisa bergeser ±1 hari, dan papan menyebutnya apa adanya.
 *
 * `time`/`endTime` ("HH:MM", waktu Jakarta) opsional. Momen yang punya jam
 * dihitung sebagai durasi sungguhan sampai detik keberangkatan — hari, jam,
 * menit — bukan selisih hari kalender. Tanpa itu "26 HARI" di sebelah jam 08.00
 * akan saling membantah: satu menghitung tanggal, satunya menghitung waktu.
 * Momen tanpa jam tetap dihitung per hari kalender.
 *
 * Acara sehari berjam (seminar 10.00–12.00) ditulis dengan `end` = `date`
 * plus `endTime`: dengan begitu ia punya state "sedang berlangsung" selama dua
 * jam itu dan lewat tepat saat selesai, bukan menggantung "0 HARI" sampai
 * tengah malam.
 *
 * `lokasi` opsional, tampil hanya di hero — slot kartu sudah penuh terisi.
 *
 * Aksen: palet design punya tujuh warna dan daftar ini punya empat belas momen,
 * jadi beberapa warna terpakai dua kali. Pengulangannya dipilih sekeluarga —
 * umrah ikut sky, hari raya ikut emas — dan tidak pernah bersebelahan pada
 * urutan saat ini.
 */
export type Momen = {
  name: string; // judul kartu (pendek)
  judul: string; // judul hero (boleh diawali "Menuju")
  kategori: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM waktu Jakarta
  end?: string; // YYYY-MM-DD, untuk momen berdurasi
  endTime?: string; // HH:MM waktu Jakarta
  lokasi?: string;
  accent: string;
  hisab?: boolean;
};

export const MOMEN: Momen[] = [
  {
    name: "Gently Parenting Seminar",
    judul: "Menuju Gently Parenting Seminar",
    kategori: "Seminar",
    date: "2026-09-27",
    time: "10:00",
    end: "2026-09-27",
    endTime: "12:00",
    lokasi: "Granada, Menara 165",
    accent: "#A78BFA",
  },
  {
    name: "Umroh September",
    judul: "Menuju Umroh September",
    kategori: "Perjalanan Umrah",
    date: "2026-09-29",
    time: "08:00",
    end: "2026-10-08",
    endTime: "14:05",
    accent: "#38BDF8",
  },
  {
    name: "Tabligh Akbar Bekasi",
    judul: "Menuju Tabligh Akbar Bekasi",
    kategori: "Tabligh Akbar",
    date: "2026-10-11",
    lokasi: "Bekasi",
    accent: "#F0A868",
  },
  {
    name: "Kajian Alumni Haji",
    judul: "Menuju Kajian Alumni Haji",
    kategori: "Kajian",
    date: "2026-10-18",
    lokasi: "Rumah Belajar",
    accent: "#D98E4A",
  },
  {
    name: "Open Lecture — Partner Venue",
    judul: "Menuju Open Lecture — Partner Venue",
    kategori: "Kajian",
    date: "2026-10-25",
    lokasi: "Partner Mosque",
    accent: "#818CF8",
  },
  {
    name: "Arkana Outing",
    judul: "Menuju Arkana Outing",
    kategori: "Outing",
    date: "2026-11-19",
    end: "2026-11-20",
    lokasi: "Ciawi",
    accent: "#34D399",
  },
  {
    name: "Umrah Akhir Tahun",
    judul: "Menuju Umrah Akhir Tahun",
    kategori: "Perjalanan Umrah",
    date: "2026-12-25",
    time: "08:00",
    end: "2027-01-02",
    endTime: "10:00",
    accent: "#818CF8",
  },
  {
    name: "Half Deen",
    judul: "Menuju Half Deen",
    kategori: "Momen Pribadi",
    date: "2027-01-17",
    accent: "#A78BFA",
  },
  {
    name: "Ramadhan 1448 H",
    judul: "Menuju Ramadhan 1448 H",
    kategori: "Bulan Mulia",
    date: "2027-02-08",
    accent: "#34D399",
    hisab: true,
  },
  {
    name: "Umroh Ramadhan",
    judul: "Menuju Umroh Ramadhan",
    kategori: "Perjalanan Umrah",
    date: "2027-02-14",
    time: "08:00",
    end: "2027-02-23",
    endTime: "06:35",
    accent: "#38BDF8",
  },
  {
    name: "Idul Fitri 1448 H",
    judul: "Menuju Idul Fitri 1448 H",
    kategori: "Hari Raya",
    date: "2027-03-09",
    accent: "#E9B949",
    hisab: true,
  },
  {
    name: "10 Hari Pertama Dzulhijjah",
    judul: "10 Hari Pertama Dzulhijjah",
    kategori: "Amalan Utama",
    date: "2027-05-07",
    end: "2027-05-16",
    accent: "#F0A868",
    hisab: true,
  },
  {
    name: "Musim Haji — Wukuf Arafah",
    judul: "Menuju Wukuf Arafah",
    kategori: "Haji",
    date: "2027-05-15",
    accent: "#D98E4A",
    hisab: true,
  },
  {
    // 10–12 Dzulhijjah 1448 H, diturunkan dari Umm al-Qura = 16–18 Mei 2027.
    name: "Qurban Plus",
    judul: "Qurban Plus",
    kategori: "Ibadah Qurban",
    date: "2027-05-16",
    end: "2027-05-18",
    accent: "#E9B949",
    hisab: true,
  },
];

export const TICKER_TEXT =
  "Tanggal Hijriah mengacu kalender Umm al-Qura. Awal Ramadhan, Syawal, dan Dzulhijjah menunggu hasil sidang isbat.";
export const TICKER_SOURCE = "Sumber: hisab Umm al-Qura · diperbarui otomatis";
export const BOARD_TITLE = "Tilawa Labs";
