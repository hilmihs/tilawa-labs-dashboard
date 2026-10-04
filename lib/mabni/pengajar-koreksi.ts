/**
 * Koreksi pengampu kelas Mabni yang tidak bisa dibaca dari sumber mana pun.
 *
 * Dua sumber menjawab pertanyaan "siapa mengajar apa", dan per 8 September 2026
 * KEDUANYA punya baris yang basi — jadi tidak ada satu pun yang bisa dijadikan
 * pemenang otomatis:
 *
 *   - workbook "Data Pengajar"  → basi untuk Sidqi (masih menulis M2)
 *   - halaqah_sync.pengajar     → basi untuk halaqah 30 (masih menulis Rahmah)
 *
 * Karena itu koreksinya ditulis di sini sebagai daftar eksplisit dan bertanggal,
 * bukan sebagai aturan pintar yang menebak sumber mana yang lebih baru. Pola ini
 * sama dengan NAME_ALIASES di roster-xlsx.ts: satu baris kode yang bisa dibaca,
 * dibantah, dan dicabut — bukan heuristik yang diam-diam memilih.
 *
 * CARA MENCABUTNYA: begitu revisi workbook berikutnya sudah benar, hapus entri
 * yang bersangkutan dan jalankan importer. Kalau koreksinya memang sudah tidak
 * perlu, laporan importer akan tetap sama — itulah tandanya boleh dibuang.
 *
 * Sumber: koordinator, 8 September 2026.
 */
import { norm } from "@/lib/mabni/roster-xlsx";

export type KoreksiPengajar = {
  /** Nama seperti di workbook; dicocokkan lewat norm(). */
  nama: string;
  /**
   * Isi `program_teachers.status`. Kolom "Status" di workbook masih kosong,
   * jadi di sinilah peran non-pengampu dicatat.
   */
  status?: string;
  /** Pemetaan categoryKey lama → baru, untuk pengampu yang sudah pindah kelas. */
  ganti?: { dari: string; ke: string }[];
  /**
   * Lepaskan SEMUA pasangan kelas dari workbook. Untuk guru yang memang tidak
   * memegang kelas — assignment-nya akan salah baca sebagai pengampu tetap.
   */
  lepasSemuaKelas?: boolean;
  /** Dicetak di laporan importer supaya alasannya ikut terbawa, bukan cuma efeknya. */
  alasan: string;
};

export const KOREKSI_PENGAJAR: KoreksiPengajar[] = [
  {
    nama: "Sidqi Hilman Fahrezi",
    ganti: [{ dari: "M2-1-usbui", ke: "M1-1-usbui" }],
    alasan:
      "Sudah pindah ke M1 (halaqah 22, Senin & Kamis). Workbook masih menulis M2 Usbu'i Ikhwan.",
  },
  {
    nama: "Khadijah Hakim Ramadhan",
    status: "guru floating",
    lepasSemuaKelas: true,
    alasan:
      "Guru floating / guru badal — tidak memegang kelas tetap. Workbook menuliskannya " +
      "sebagai pengampu M3, padahal penempatannya belum tentu M3.",
  },
];

/** Catatan yang hanya dilaporkan: tidak bisa diperbaiki dari sisi dashboard. */
export const CATATAN_CERMIN: { halaqahId: number; isi: string }[] = [
  {
    halaqahId: 30,
    isi:
      "halaqah_sync masih mencatat Rokhmatun Khasanah sebagai pengajar (M3), padahal " +
      "beliau memegang M2. Perlu dibetulkan di the boarding CMS — halaqah_sync ditimpa penuh " +
      "tiap sync, jadi tidak bisa diperbaiki dari sini.",
  },
];

const byName = new Map(KOREKSI_PENGAJAR.map((k) => [norm(k.nama), k]));

export function koreksiUntuk(nama: string): KoreksiPengajar | undefined {
  return byName.get(norm(nama));
}
