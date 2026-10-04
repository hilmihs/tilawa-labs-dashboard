/**
 * Reference list of common lateness reasons, transcribed verbatim from
 * "Kategori Udzur " sheet in 20260121_MABNI_..._Rekap Keterlambatan Santri 2026.xlsx
 * (source sheet has a trailing space in its name — noted here so it isn't
 * "fixed" by accident when re-syncing from the xlsx later).
 * Used to populate the ALASAN dropdown in the guru piket form; "Lainnya"
 * (freetext) is always offered as a fallback.
 */
export const KATEGORI_UDZUR = {
  "Kendala/Kondisi": [
    "Macet saat dijemput pulang sekolah",
    "Sepupu meninggal",
    "Menunggu driver menjemput",
    "Menunggu jemputan",
    "Mengkondisikan adik titip ke nenek",
    "Menjemput adik",
    "Keperluan ke RS",
    "Mengambil obat",
    "Ayah telat menjemput",
    "Ban bocor",
    "Songkok ketinggalan",
    "Persiapan pakai sepatu",
    "Menunggu Ibu belajar",
    "Menunggu ibu selesai ngajar",
    "Telat berangkat",
    "Susah dibangunin",
    "Habis dari dokter antar ibu berobat",
  ],
  "Kegiatan Sekolah": [
    "Tambahan di sekolah",
    "Ekskul",
    "Kegiatan sekolah penambahan materi",
    "Les",
    "Menghadap guru BK",
    "Kerja kelompok",
    "Menunggu adik tambahan di sekolah",
    "Menunggu kaka ekskul",
  ],
} as const;

export const PERIZINAN_OPTIONS = [
  "Izin",
  "Tidak Izin",
  "Terlambat Izin",
  "Udzur",
  "Rutin Kegiatan Sekolah",
] as const;

export type Perizinan = (typeof PERIZINAN_OPTIONS)[number];
