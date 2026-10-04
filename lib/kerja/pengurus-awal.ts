/**
 * Daftar awal logbook "Kehadiran Pengurus Pendidikan" — disalin dari lembar
 * kertas (29 Sep 2026). Dipakai tombol "Isi daftar awal" di
 * /operating-office/pengurus; nama dicocokkan ke `orang` (awalan kata unik,
 * gender sama) atau dibuat baru bila tak ada. Urutan = urutan di kertas.
 */
/**
 * `petunjuk`: nama kertas yang terlalu pendek untuk dicocokkan (mis. "Salma" —
 * ada 5 orang) dipastikan lewat tautan akun program yang disebut pemilik.
 */
export type EntriAwal = { nama: string; gender: "L" | "P"; petunjuk?: { sumber: string; peran: string } };

export const PENGURUS_AWAL: EntriAwal[] = [
  ...[
    "Abdul Muhsin",
    "Amina Fitri Wijaya",
    "Aisyah Shofia Safitri",
    "Akmal Shiddiq",
    "Al Fajar Mubarok",
    "Anas Hanifah Permata",
    "Azka Nabila Saputra",
    "Fishawar Fathan",
    "Hilmi Hanif",
    "Ilham Prayogo",
    "Izzuddin",
    "Muhammad Hamid",
    "Rai Pratama",
    "Rahmat Hidayat",
    "Syafiq Sa'id",
    "Sidqi Hilman",
    "Sofy Yurrohman",
    "Zahra Rahma Utami",
    "Zendraszka",
  ].map((nama) => ({ nama, gender: "L" as const })),
  ...["Amy Sholihaty", "Nur Hanifah", "Larasdya A", "Mia Khoirunnisa", "Rafi Qonita Lestari", "Putri Chairani"].map((nama) => ({ nama, gender: "P" as const })),
  // Pemilik, 29 Sep 2026: "Salma yang syaikh Maahir".
  { nama: "Salma", gender: "P", petunjuk: { sumber: "maahir", peran: "syaikh" } },
  { nama: "Zahra Wafa Lestari", gender: "P" },
];
