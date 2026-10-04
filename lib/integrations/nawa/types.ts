/**
 * Bentuk respons NAWA `GET /api/export` dan `GET /api/export/semua`
 * (docs NAWA: INTEGRASI-API-EXPORT.md).
 * Field bisa bertambah kapan saja — tipe ini hanya menyebut yang dipakai, dan
 * tidak ada validasi yang menolak key tambahan.
 */

export type NawaStatusAcara = "draft" | "pendaftaran" | "ditutup" | "berlangsung" | "selesai" | "batal";

export type NawaAcara = {
  slug: string;
  nama: string;
  tanggal: string; // YYYY-MM-DD
  status: NawaStatusAcara | string;
  kuota: number | null;
  /** "acara" | "kelas" | "seleksi" | … — belum ada di respons NAWA lama. */
  jenis?: string;
};

export type NawaPeserta = {
  id: string;
  nomor: string;
  nama: string;
  gender: "ikhwan" | "akhwat" | string;
  wa: string | null; // DATA PRIBADI
  email: string | null; // DATA PRIBADI
  statusLipia: string | null; // 'mahasiswa' | 'khirrij' | 'mutarabbish'
  nim: string | null;
  prodi: string | null;
  sesi: string | null;
  semester: string | null;
  tahunLulus: string | null;
  domisili: string | null;
  asalDaerah: string | null;
  asalSekolah: string | null;
  keahlian: string | null;
  transportasi: string | null;
  kebutuhanKhusus: string | null; // SENSITIF
  jenis: "pra" | "ots" | string;
  sumber: string;
  aktif: boolean;
  konfirmasi: boolean | null;
  konfirmasiAt: string | null;
  tiketDibukaAt: string | null;
  grupWaAt: string | null;
  urutOts: number | null;
  izinOtsAt: string | null;
  catatan: string | null; // SENSITIF
  createdAt: string;
  updatedAt: string;
};

export type NawaKehadiran = {
  pesertaId: string;
  acaraId: string;
  scannedAt: string;
  clientScannedAt: string | null;
  gate: string | null;
  petugas: string | null;
  metode: string;
  offline: boolean;
};

export type NawaExport = {
  acara: NawaAcara;
  diambilAt: string;
  peserta: NawaPeserta[];
  kehadiran: NawaKehadiran[];
};

/** Satu blok `program[i]` dari /api/export/semua — NawaExport tanpa `diambilAt`. */
export type NawaProgram = Omit<NawaExport, "diambilAt">;

export type NawaExportSemua = {
  diambilAt: string;
  jumlahProgram: number;
  program: NawaProgram[];
};

/** Salinan yang disimpan di acara_peserta_cache: tanpa WA, email, NIM, alamat, kebutuhan khusus, catatan. */
export type NawaPesertaPangkas = Pick<
  NawaPeserta,
  "id" | "nomor" | "nama" | "gender" | "prodi" | "statusLipia" | "jenis" | "aktif" | "konfirmasi" | "createdAt"
>;
export type NawaKehadiranPangkas = Pick<NawaKehadiran, "pesertaId" | "scannedAt" | "clientScannedAt" | "gate" | "metode" | "offline">;
export type NawaCachePayload = {
  acara: NawaAcara;
  diambilAt: string;
  peserta: NawaPesertaPangkas[];
  kehadiran: NawaKehadiranPangkas[];
};
