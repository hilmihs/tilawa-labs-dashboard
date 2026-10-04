import type {
  acara,
  acaraBarang,
  acaraDivisi,
  acaraJobdesk,
  acaraPanitia,
  acaraTugas,
} from "@/lib/db/schema";

export type AcaraRow = typeof acara.$inferSelect;
export type DivisiRow = typeof acaraDivisi.$inferSelect;
export type PanitiaRow = typeof acaraPanitia.$inferSelect;
export type JobdeskRow = typeof acaraJobdesk.$inferSelect;
export type TugasRow = typeof acaraTugas.$inferSelect;
export type BarangRow = typeof acaraBarang.$inferSelect;

// Kosakata status — dipakai untuk validasi input server action dan dropdown.
// Diterjemahkan dari sheet "Dropdown Keys" the institute 2; panitia sudah hafal.
export const TUGAS_STATUS = ["belum_mulai", "berjalan", "selesai", "perlu_tinjau", "disetujui", "ditahan"] as const;
export type TugasStatus = (typeof TUGAS_STATUS)[number];
export const TUGAS_PRIORITAS = ["rendah", "sedang", "tinggi"] as const;
export type TugasPrioritas = (typeof TUGAS_PRIORITAS)[number];

/** Status yang berarti tugas sudah beres — dua-duanya keluar dari hitungan terlambat. */
export const TUGAS_STATUS_BERES: readonly TugasStatus[] = ["selesai", "disetujui"];

/**
 * Status yang merupakan keputusan koordinator. Token divisi tidak boleh
 * mengubahnya — "buka kembali" dari papan divisi akan diam-diam membatalkan
 * persetujuan atau penahanan. Cermin aturan barang: status_approval hanya
 * bergerak lewat akun staff.
 */
export const TUGAS_STATUS_TERKUNCI: readonly TugasStatus[] = ["disetujui", "ditahan"];

export const BARANG_KRITERIA = ["harus_kembali", "boleh_habis"] as const;
export type BarangKriteria = (typeof BARANG_KRITERIA)[number];
export const BARANG_SUMBER = ["beli", "pinjam", "pinjam_rb", "disediakan_venue", "sudah_ada"] as const;
export type BarangSumber = (typeof BARANG_SUMBER)[number];
export const BARANG_PERUNTUKAN = ["divisi", "ustadz_keluarga", "panitia", "peserta", "internal"] as const;
export type BarangPeruntukan = (typeof BARANG_PERUNTUKAN)[number];
export const BARANG_APPROVAL = ["diajukan", "disetujui", "ditolak"] as const;
export type BarangApproval = (typeof BARANG_APPROVAL)[number];

// Peta label: satu sumber untuk <select> di UI dan (nanti) dropdown XLSX.
// Kata-katanya mengikuti kosakata sheet the institute 2 supaya panitia lama tidak
// perlu belajar istilah baru.
export const LABEL_PRIORITAS: Record<TugasPrioritas, string> = {
  rendah: "Rendah",
  sedang: "Sedang",
  tinggi: "Tinggi",
};

export const LABEL_KRITERIA: Record<BarangKriteria, string> = {
  harus_kembali: "Harus kembali",
  boleh_habis: "Boleh habis",
};

export const LABEL_SUMBER: Record<BarangSumber, string> = {
  beli: "Beli",
  pinjam: "Pinjam",
  pinjam_rb: "Pinjam RB",
  disediakan_venue: "Disediakan venue",
  sudah_ada: "Sudah ada",
};

export const LABEL_PERUNTUKAN: Record<BarangPeruntukan, string> = {
  divisi: "Untuk divisi",
  ustadz_keluarga: "Untuk ustadz & keluarga",
  panitia: "Untuk panitia",
  peserta: "Untuk peserta",
  internal: "Internal",
};

export const LABEL_STATUS_TUGAS: Record<TugasStatus, string> = {
  belum_mulai: "Belum mulai",
  berjalan: "Berjalan",
  selesai: "Selesai",
  perlu_tinjau: "Perlu tinjau",
  disetujui: "Disetujui",
  ditahan: "Ditahan",
};

export const LABEL_APPROVAL: Record<BarangApproval, string> = {
  diajukan: "Diajukan",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};

/** Label status tugas; nilai di luar kosakata ditampilkan apa adanya, bukan disembunyikan. */
export function labelStatusTugas(s: string): string {
  return (LABEL_STATUS_TUGAS as Record<string, string>)[s] ?? s;
}
