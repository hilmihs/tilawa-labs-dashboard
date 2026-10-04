/**
 * Putusan manusia atas identitas pengajar — Div. Kaderisasi & Amaliyyah.
 * Diputuskan pemilik 17 Sep 2026 dari exports/kaderisasi-review-identitas-2026-09-17.md
 * (nomor item di komentar). Tambah di sini, jangan di skrip.
 */
import type { Keputusan } from "./klaster";

export const KEPUTUSAN_IDENTITAS: Keputusan = {
  gabung: [
    ["Naufal Kamila Handayani", "Nida ulkhusna"], // 1
    ["Atikah Azzahwa", "Fariz Hakim Utami"], // 2
    // 3 + 4 Okt: "Al Hafizh" = akun murid HITS April (Peserta HITS Reguler) orang yang sama.
    ["Maryam Rahma Cahyani", "muhammad hanif alhafiz", "Maryam Latif Pratamah"],
    ["Sholehudin Al-Giffari", "Sholehudin Algiffari"], // 4
    ["Azka Wafa Wulandari", "Bilal Azhar Permata"], // 5
    ["Nadia Rahman Syahputra", "Muthia Azzahra"], // 6
    ["Hafsah Aziz Nugroho", "Hafsah Aziz Nugroho Listiyo Pambudi"], // 7
    ["Nur Hanifah Rasmani", "Nur Hanifah"], // 8
    ["Najwa Azhar Wulandari", "Nabilla Putri"], // 9
    ["Abdul Muhsin", "Abdul Muhsin Bachtar"], // 10
    ["Fariz Sabil Safitri", "Aulia Khairunnisa", "Fikri Abdul Firdaus"], // 11
    ["Adiba Wafa Anggraini", "Ahmad Anisa Ramadhan"], // 12
    ["Ahmad Hakim Hidayat", "Abdurrahman Ibrahim"], // 13
    ["Amina Zahira Handayani", "Aisyah muhammad"], // 14
    ["Laila Wafa Anggraini", "Laila Lestari"], // 15
    ["Inas Wafa Lestari", "Lalu Muhammad Fauzul Azhim"], // 16
    // 17 + 39: "Reda" di Maahir adalah Radiatam Mardiyah.
    ["Radiatam Mardiyah", "Ruqayyah Haura Nugroho", "Radiatam Mardiah", "Reda"],
    ["Syahid Qonita Wijaya", "Salma Khoiriyyah"], // 18
    ["Ruqayyah Rahma Ramadhan", "Ruqayyah Nabila Anggraini", "Rafiqotus salma", "Salma Hakim Baswedan"], // 19
    ["Hanan Qonita Wijayaiqoh", "Hanan Shofia Permata"], // 20
    ["Sakinah Rahma Hidayat", "Rika Ramadona"], // 21
    ["Ilham Fitri Kurniawan", "Hanifa Adiani"], // 22
    ["anas azhar wulandari", "aisyah nurain"], // 23
    ["Zaki Sabil Nugroho", "Zulfah Masitoh"], // 24
    ["Putri Camelia ulfah", "Ridho Azhar Handayani"], // 25
    ["Nadia Zahira Handayani", "Nabilah Ulya Rizkiyah"], // 26
    ["Hadi Hakim Maulana", "Daan Nurroyyan A"], // 27
    ["Rafi Saputra", "Nurlaela", "Rafi Qonita Lestari"], // 28
    ["Khaulah Achmad", "Khaulah"], // 29
    ["Rosi", "Salma Kamila Saputra"], // 30
    ["Gibtin", "Mumakkitsy Gibthin Nabilly"], // 31
    ["Zendraszka Sandirama Rosdynur", "Zendraszka"], // 32
    ["Qodriyanto Mukarim", "Qodriyanto"], // 33
    ["Lalu M Saipul Idris", "Syahid Latif Mahardika"], // 34
    // 36 + 37: satu orang yang memang bernama "Salma" saja (HKM 3 Akhwat = syaikh/koordinator Maahir).
    ["Salma"],
    // 38: akun Maahir "Hilmi" = Ilham Kamila Anggraini (kategori pengurus, lihat KATEGORI_PENGURUS).
    ["Hilmi", "Ilham Kamila Anggraini"],
    // Poin 4 (roster HITS Maahir ↔ presensi kajian, disetujui bersama daftar E).
    ["Amina Rahman Syahputra", "Aisyah (Ahmad)"],
    ["Fikri Rahma Ramadhan", "azzahrah karimah"],
    ["Inas Abdul Lestari", "Jenifier Imania"],
    ["Khadijah Azhar Anggraini", "Khadijah Azhar Anggraini Zaida Zakaria"],
    ["Rania Haura Utami", "Nurul Nabiilah Azhar"],
    ["Rania Wafa Permata", "Puan Cahyani"],
    // Putusan kedua 17 Sep: nama mirip yang muncul di dry-run.
    ["Hanan Hanifah Saputra", "Hanan Hanifah Saputra Nisrina"],
    ["Rafi Hanifah Firdaus", "Rafi Hanifah Firdaush"],
    ["Adiba Abdul Anggraini", "Adiba Aziz Safitri"],
    // Maahir "bint Nazar Muharam" memegang HITS 028 AKHWAT JUNI — halaqah akun tilawah 70.
    ["Tamim Zahira Baswedan", "Umar Azhar Saputra"],
    // Tilawah 1899 "Sakinah Latif Syahputra" = roster HITS Maahir "Nadia Kamila Permata" (akun ganda 2819
    // bernama lengkap, lihat lib/guru/duplicates.ts). Tak bisa diandalkan lewat alias: di
    // dashboard.edu akun 2819 tidak tersinkron, jadi nama lengkapnya tak pernah terbaca.
    ["Sakinah Latif Syahputra", "Nadia Kamila Permata"],
    // dashboard.edu: walk-in 12 Sep "Azzah Tsabitah" (Pengajar Partner Mosque Matraman).
    ["Fikri Nabila Anggraini", "Azzah Tsabitah"],
    // Akun peran "Koordinator KK Ikhwan" dipegang Ahmad Nur Nugroho — satu-satunya Adam
    // Malik di data: "Ahmad Nur Nugroho" di roster HITS Maahir = akun tilawah 2821.
    ["Koordinator KK Ikhwan", "Ahmad Nur Nugroho", "Ahmad Sabil Cahyani"],
    // Putusan pemilik 29 Sep 2026: pendamping Mabni = akun HITS orang yang sama.
    ["Imran Qonita Firdaus", "Ismi Khoiriyyah"],
    ["Muhammad Afif", "Luthfi Anisa Ramadhan"],
    // Putusan pemilik 4 Okt 2026 (pembekalan 3 Okt): baris Pengajar HITS + NAWA satu orang.
    ["Aisyah Rahma Cahyani", "Ahlilla Hamra Zahratul Islam", "Ahilla Hamra", "Ahilla"],
    // Walk-in 26 Sep "Khoirunnisa" & "Khairun Nisa" (Lainnya) = Khoirun Nisa, Pengajar Al-Asas.
    ["Khoirun Nisa", "Khoirunnisa", "Khairun Nisa"],
  ],
  pisah: [
    ["Amina Zahira Handayani", "Amina Rahman Syahputra"], // 35 — dua orang
    ["Hidayati", "Zahra Firdaus"], // HP berbeda (…3826 vs …3665)
    ["Umar Azhar Saputra", "Umar Hanifah Lestari"], // Afrison: masuk 30 Jun, 0 halaqah
    ["Adiba Aziz Safitri", "Adiba Abdul Anggraini bin Dayat"],
  ],
  kecuali: [
    "Syaikh Ahmad", // 40
    "Koordinator KK Akhwat", // nomor umum, bukan orang
    // Akun guru_sync RBI (tilawah:6) yang orangnya tidak mengajar — nol halaqah.
    // Ditegaskan pemilik rekap 2 Sep 2026 (BUKAN_PENGAJAR di scripts/hitung_unik.py)
    // dan sekali lagi 18 Sep 2026.
    "Zaky Riko V",
  ],
};

/** Orang yang masuk kategori pengurus, bukan pengajar (dibandingkan lewat namaKunci). */
export const KATEGORI_PENGURUS: readonly string[] = ["Ilham Kamila Anggraini"];

/**
 * Gender yang ditetapkan manusia, menimpa sumber (dibandingkan lewat namaKunci).
 * Dipakai saat akun tak punya gender dan tebakan dari nama halaqah salah.
 */
export const GENDER_DITETAPKAN: Readonly<Record<string, "L" | "P">> = {
  "Putri Purnama Bintang": "P", // mabni: memegang kelas (MA) Ikhwan
};
