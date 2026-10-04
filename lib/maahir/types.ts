/**
 * Payload types for the seven Maahir `rekap/*` responses.
 *
 * Every field below was DERIVED FROM the real responses captured on 3 Sep 2026
 * in `lib/maahir/__fixtures__/*.json` — key names, casing (the API mixes
 * `kelasName` with `pengajar_id`), and nullability were read off the whole
 * fixture, not just its first row. `lib/maahir/rekap.test.ts` re-checks these
 * claims against those files, so a rename upstream fails a test instead of
 * rendering `undefined` on a screen.
 *
 * Where a field was ONLY ever null in the capture, the comment says so: the type
 * is the honest guess and pages must guard, because we have not seen the filled
 * shape. Nothing here is invented from memory.
 *
 * The payloads are stored verbatim in `maahir_rekap.payload` (spec: "Bentuknya
 * milik upstream"), so these types describe upstream's shape — they are NOT view
 * models. Mapping to view models belongs in the page/report modules.
 */

// ── Shared ──────────────────────────────────────────────────────────────────

export type MaahirGender = "ikhwan" | "akhwat";

/** H hadir, I izin, S sakit, A alpa, T terlambat. */
export type MaahirKehadiranKode = "H" | "I" | "S" | "A" | "T";

/** Per-meeting cell; `-` means the session exists but presensi was never filled. */
export type MaahirPerPertemuanKode = MaahirKehadiranKode | "-";

export type MaahirCounts = Record<MaahirKehadiranKode, number>;

/**
 * `meta` of a rekap response, kept next to the payload so a screen can say WHEN
 * and FOR WHAT WINDOW the numbers hold. Which keys appear depends on the route:
 * `bulan`+`mulai`+`sampai` for the monthly reports, `cutoff` for `rekap/sp`,
 * `basi`+`snapshot_terakhir` for `rekap/matrix-guru`, `mode`+`periode` for
 * `rekap/hits-disiplin`. `dari_cache`/`umur_detik` are upstream's own cache age.
 */
export type MaahirRekapMeta = {
  bulan?: string; // "2026-08"
  mulai?: string; // "2026-07-28"
  sampai?: string; // "2026-08-27"
  cutoff?: string; // rekap/sp — effective end date of the cumulative count
  basi?: boolean; // matrix-guru — snapshot older than the requested month's end
  snapshot_terakhir?: string; // matrix-guru — ISO timestamp of the last recompute
  periode?: string; // hits-disiplin — "2026-08"
  mode?: string; // hits-disiplin — "bulan" | "minggu"
  total?: number; // shakwa — ticket count in the window
  dari_cache?: boolean;
  umur_detik?: number;
};

/** The API envelope: `{ data, meta }` (docs §2). */
export type MaahirRekapEnvelope<T> = { data: T; meta: MaahirRekapMeta };

// ── rekap/laporan-maahir ────────────────────────────────────────────────────

/** A pemutihan (SP whitewash) record. Docs §9: a whitewashed member is counted
 *  as 100% present for that period, which is why it travels with the numbers. */
export type MaahirPemutihan = {
  id: string;
  anggotaId: string;
  tanggal: string | null;
  month: string; // "2026-08"
  alasan: string;
  oleh: string;
  pada: string; // ISO timestamp
};

/** One member's attendance for the period, as used by every "di bawah target" list. */
export type MaahirAnggotaKehadiran = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: MaahirGender;
  counts: MaahirCounts;
  filled: number;
  terisi: number;
  tidakHadir: number;
  persen: number;
  /** Free-text reasons joined with "; " — sensitive (docs §7), do not export raw. */
  keterangan: string;
  /** Joined mid-period → the denominator starts here, not at the window start. */
  mulaiTanggal: string | null;
  online: number;
  /** Always null in the capture; the filled shape is the one in `MaahirSpRow`. */
  diputihkan: MaahirPemutihan[] | null;
};

export type MaahirSetoranPeserta = {
  anggotaId: string;
  name: string;
  gender: MaahirGender;
  kelasName: string;
  halaman: number;
  pertemuanSetor: number;
  rincian: string;
  sesiTarget: number;
  target: number;
  persen: number;
};

/** Average attendance split by gender, against the program's benchmark. */
export type MaahirKehadiranRingkas = {
  avgIkhwan: number;
  avgAkhwat: number;
  aktual: number;
  benchmark: number;
};

/** Takhassus and Maahir count "di bawah target" as one number… */
export type MaahirDibawahTargetJumlah = {
  jumlah: number;
  list: MaahirAnggotaKehadiran[];
};

/** …At-Tibyan splits it by gender. Deliberately a different type: the two are
 *  not interchangeable and a page that assumes `jumlah` here renders undefined. */
export type MaahirDibawahTargetGender = {
  ikhwan: number;
  akhwat: number;
  total: number;
  list: MaahirAnggotaKehadiran[];
};

export type MaahirBlokTakhassus = {
  setoran: {
    benchmark: number;
    aktual: number;
    persen: number;
    adaTarget: boolean;
    peserta: MaahirSetoranPeserta[];
  };
  kehadiran: MaahirKehadiranRingkas;
  dibawahTarget: MaahirDibawahTargetJumlah;
  kehadiranPengajar: number;
  pengajarDibawahTarget: number;
  /** Always null in the capture; free text when a coordinator wrote one. */
  catatan: string | null;
};

export type MaahirBlokMaahir = {
  kehadiran: MaahirKehadiranRingkas;
  dibawahTarget: MaahirDibawahTargetJumlah;
  kehadiranPengajar: number;
  pengajarDibawahTarget: number;
};

/** At-Tibyan has no setoran and no teacher attendance in this report. */
export type MaahirBlokAtTibyan = {
  kehadiran: MaahirKehadiranRingkas;
  dibawahTarget: MaahirDibawahTargetGender;
};

/** A class whose presensi was never filled, with the dates it is missing. */
export type MaahirPresensiTakTerisi = {
  kelasName: string;
  gender: MaahirGender;
  jumlah: number;
  /**
   * BUKAN tanggal polos: tiap entri "<YYYY-MM-DD> <nama program>", mis.
   * "2026-08-04 Kelas Maahir" atau "2026-08-08 At-Tibyan" — satu kelas
   * menjalankan dua program dalam satu grid, jadi tanggalnya perlu penanda
   * program. Memperlakukannya sebagai tanggal akan gagal di-parse.
   */
  tanggal: string[];
};

export type MaahirSpPenetapan = {
  level: number; // 1 | 2 | 3
  tanggal: string;
  pemicu: string;
};

export type MaahirSpRow = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: MaahirGender;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  /** Net SP level after pemutihan. */
  sp: number;
  /** SP level before pemutihan — `sp` vs `spKotor` is the whole point of the list. */
  spKotor: number;
  penetapan: MaahirSpPenetapan[];
  diputihkan: MaahirPemutihan[];
};

export type MaahirSpSummary = {
  total: number;
  sp1: number;
  sp2: number;
  sp3: number;
  diputihkan: number;
};

/**
 * The SP block. It appears TWICE with different meanings and the two must never
 * be compared (docs §9): inside `laporan-maahir` it is `perBulan: true` and
 * covers that 28→27 period only; the `rekap/sp` payload is `perBulan: false`,
 * cumulative since `mulai` (program start) up to `cutoff`.
 */
export type MaahirSpPayload = {
  list: MaahirSpRow[];
  cutoff: string;
  mulai: string;
  perBulan: boolean;
  /** Always null in the capture; shape unknown — do not render. */
  dariTampilan: unknown;
  summary: MaahirSpSummary;
};

/**
 * Always an empty array in the capture, so the fields come from the
 * `laporan-note` ENTITY (docs §3.2), not from an observed rekap row — every
 * field is optional to stop a page claiming a value we have never seen.
 */
export type MaahirLaporanNote = {
  id?: string;
  month?: string;
  teks?: string;
  urutan?: number;
};

export type MaahirLaporanPayload = {
  month: string; // "2026-08" — the requested month, NOT the window; label from meta
  takhassus: MaahirBlokTakhassus;
  maahir: MaahirBlokMaahir;
  atTibyan: MaahirBlokAtTibyan;
  presensiTakTerisi: MaahirPresensiTakTerisi[];
  sp: MaahirSpPayload;
  notes: MaahirLaporanNote[];
};

// ── rekap/kehadiran and rekap/tibyan (same class grid) ──────────────────────

export type MaahirProgramKelas = "kelas_maahir" | "at_tibyan" | "muallim_najih";

export type MaahirPertemuan = {
  id: string;
  program: MaahirProgramKelas;
  programLabel: string;
  tanggal: string; // "2026-08-05"
};

export type MaahirSesi = {
  tanggal: string;
  program: MaahirProgramKelas;
  programLabel: string;
  mingguan: boolean;
  /** false = presensi belum diisi for that session. */
  filled: boolean;
};

export type MaahirAnggotaKelas = {
  anggotaId: string;
  name: string;
  isKetua: boolean;
  isWakil: boolean;
  /** Keyed by `MaahirPertemuan.id`; a missing key means no row was recorded. */
  perPertemuan: Record<string, MaahirPerPertemuanKode>;
  /** Keyed by `MaahirPertemuan.id`. Sensitive free text (docs §7). */
  catatanPerPertemuan: Record<string, string>;
  keterangan: string;
  totals: MaahirCounts;
  /** null when the denominator is empty (no session counted for this member). */
  persenHadir: number | null;
};

export type MaahirKelasKehadiran = {
  kelasId: string;
  kelasName: string;
  gender: MaahirGender;
  jadwalHari: string[]; // "Senin", "Jum'at"
  pertemuan: MaahirPertemuan[];
  anggota: MaahirAnggotaKelas[];
  sessions: MaahirSesi[];
  /** Sessions in the window whose presensi is still empty. */
  belumDiisi: number;
};

/** `rekap/kehadiran` returns the class array directly as `data`. */
export type MaahirKehadiranPayload = MaahirKelasKehadiran[];

export type MaahirTibyanKpi = {
  overallPersen: number;
  totalSesi: number;
  totalAnggota: number;
  kelasDiBawahTarget: number;
};

export type MaahirTibyanRanking = {
  kelasId: string;
  kelasName: string;
  gender: MaahirGender;
  persen: number | null;
  anggota: number;
};

export type MaahirTibyanTrend = {
  tanggal: string;
  persen: number;
};

export type MaahirTibyanPerhatianAnggota = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: MaahirGender;
  persen: number;
  alphaBeruntun: number;
};

export type MaahirTibyanPerhatianKelas = {
  kelasName: string;
  gender: MaahirGender;
  persen: number;
};

export type MaahirTibyanPayload = {
  /** Same grid as `rekap/kehadiran`, narrowed to the At-Tibyan classes. */
  perKelas: MaahirKelasKehadiran[];
  kpi: MaahirTibyanKpi;
  ranking: MaahirTibyanRanking[];
  trend: MaahirTibyanTrend[];
  distribusi: MaahirCounts;
  perhatian: {
    anggota: MaahirTibyanPerhatianAnggota[];
    kelas: MaahirTibyanPerhatianKelas[];
  };
};

// ── rekap/matrix-guru ───────────────────────────────────────────────────────

/**
 * One monthly snapshot row. Docs §9: this is a SNAPSHOT, never recomputed on
 * read — a month that was never computed comes back with `matrix: null` for
 * everyone. Null scores mean "not assessed", never zero; see
 * `matrixSnapshotState()` in lib/maahir/rekap.ts.
 *
 * Snake_case is upstream's, kept verbatim — this mirrors the `matrix-rekap`
 * entity row rather than the camelCase used by the other rekap routes.
 */
export type MaahirMatrixSkor = {
  id: string;
  pengajar_id: string;
  year_month: string; // "2026-08"
  // hard skill
  skor_bacaan: number | null;
  skor_hafalan: number | null; // always null in the capture
  skor_tajwid: number | null;
  skor_kehadiran_maahir: number | null;
  skor_kehadiran_tibyan: number | null;
  skor_kehadiran_muallim: number | null; // always null in the capture
  rata_rata_hard_skill: number | null;
  // pedagogis
  skor_metode_pengajaran: number | null;
  skor_kepatuhan_silabus: number | null;
  skor_manajemen_halaqah: number | null;
  skor_evaluasi_penguasaan: number | null;
  rata_rata_pedagogis: number | null;
  // soft skill
  skor_kedisiplinan_waktu: number | null;
  skor_komitmen_jadwal: number | null;
  skor_tanggung_jawab: number | null;
  skor_kepatuhan_sop: number | null;
  rata_rata_soft_skill: number | null;
  rata_rata_keseluruhan: number | null;
  ranking: number | null;
  total_teguran_bulan: number;
  total_teguran_kumulatif: number;
  finalized_at: string | null; // always null in the capture
  updated_at: string;
  created_at: string;
};

/** `pengajar_id` here is an id from `hits/pengajar`, not a Maahir musyrif
 *  (spec, temuan 2: 178/178 matched HITS). */
export type MaahirMatrixPengajar = {
  pengajar_id: string;
  nama: string;
  kelompok: string; // "Kelompok 3 Ikhwan" | "Belum Ada Kelompok (Akhwat)"
  gender: MaahirGender;
  active: boolean;
  /** null = no snapshot row for this teacher in that month. */
  matrix: MaahirMatrixSkor | null;
};

export type MaahirMatrixPayload = {
  pengajar: MaahirMatrixPengajar[];
};

// ── rekap/hits-disiplin ─────────────────────────────────────────────────────

export type MaahirDisiplinJenis = "KMT" | "KBLA" | "JKG" | "TIDAK_LATIHAN" | "BADAL";

/** One teacher's discipline row. The `pct*` fields and `rank` are null when the
 *  teacher had nothing to score in the window — that is the `noData` bucket. */
export type MaahirDisiplinRanked = {
  pengajarId: string;
  pengajarNama: string; // "—" when the halaqah has no teacher assigned
  gender: MaahirGender;
  halaqahCount: number;
  halaqahIds: string[];
  /** Kelas Berjalan Baik & Sesuai — meetings held as scheduled. */
  kbbs: number;
  nonLibur: number;
  kmt: number;
  kbla: number;
  jkg: number;
  tidakLatihan: number;
  onTimeBaik: number;
  onTimeTotal: number;
  stabilBaik: number;
  stabilTotal: number;
  hutangSaldo: number;
  pctOnTime: number | null;
  pctStabil: number | null;
  pctKbbs: number | null;
  rank: number | null;
};

export type MaahirDisiplinPelanggaran = {
  jenis: MaahirDisiplinJenis;
  detail: string;
};

/** A tabayyun case: what the ketua reported, what the teacher answered, and the
 *  coordinator's decision. */
export type MaahirDisiplinInsiden = {
  keteranganId: string;
  tabayyunId: string;
  halaqahId: string;
  halaqahName: string;
  tanggal: string;
  pertemuanNo: number;
  pelanggaran: MaahirDisiplinPelanggaran[];
  catatanKetua: string | null;
  status: "pending" | "nunggu_alasan" | "diputus";
  alasanPengajar: string | null;
  dariIzin: boolean;
  isUdzurSyari: boolean | null;
  keputusanCatatan: string | null;
  decidedAt: string | null;
};

export type MaahirDisiplinCakupanPertemuan = {
  tanggal: string;
  halaqahId: string;
  halaqahName: string;
  pertemuanNo: number;
  /** `pragenerate` = the meeting predates the kaldik generation, not a miss. */
  status: "sudah" | "belum" | "pragenerate";
  libur: boolean;
};

export type MaahirDisiplinCakupan = {
  pengajarId: string;
  pertemuan: MaahirDisiplinCakupanPertemuan[];
  sudah: number;
  belum: number;
  total: number;
  persen: number | null;
};

export type MaahirDisiplinHutang = {
  keterangan_id: string;
  tanggal: string;
  jenis: MaahirDisiplinJenis;
  debit: number;
  terbayar: number;
  sisa: number;
  status: "belum" | "sebagian" | "lunas";
  halaqahId: string;
  halaqahName: string;
};

export type MaahirHitsDisiplinPayload = {
  mode: "bulan" | "minggu";
  /** Docs §9: for `mode=bulan` this is the FULL calendar month (1 Aug .. 1 Sep),
   *  not the 28→27 window used by `laporan-maahir`. */
  start: string;
  end: string;
  periodeLabel: string; // "2026-08"
  genderLabel: string; // "Ikhwan & Akhwat"
  filter: { masalah: boolean; obs: string };
  counts: { total: number; bermasalah: number; obsBelum: number; obsLengkap: number };
  ranked: MaahirDisiplinRanked[];
  /** Teachers with nothing to score — kept separate so they never rank last. */
  noData: MaahirDisiplinRanked[];
  /** Keyed by `pengajarId`; absent key = no incident. */
  insidenByPengajar: Record<string, MaahirDisiplinInsiden[]>;
  cakupanByPengajar: Record<string, MaahirDisiplinCakupan>;
  hutangByPengajar: Record<string, MaahirDisiplinHutang[]>;
};

// ── rekap/shakwa ────────────────────────────────────────────────────────────

export type MaahirShakwaKategori =
  | "evaluasi"
  | "pengajar"
  | "peserta"
  | "cerita_menarik"
  | "modul_kurikulum"
  | "ketidaksesuaian_aplikasi"
  | "izin"
  | "tali_kasih";

export type MaahirShakwaStatus = "submitted" | "in_review" | "resolved" | "closed";

/** An `izin` ticket carries the replacement schedule it asked for. */
export type MaahirShakwaIzin = {
  tanggal: string;
  jenis: string;
  jenisLabel: string;
  /** Always null in the capture; minutes for a partial (late/early) izin. */
  menit: number | null;
  jadwalGanti: string;
  halaqahName: string;
  sudahTerpakai: boolean;
};

export type MaahirShakwaItem = {
  id: string;
  nomorTiket: string;
  pelaporType: "pengajar" | "peserta";
  kategori: MaahirShakwaKategori;
  kategoriLabel: string;
  gender: MaahirGender;
  nama: string;
  halaqahLabel: string;
  pengajarNama: string | null;
  isi: string;
  /** Free-form per-category answers, e.g. `{ sudah_info_koordinator: "ya" }`.
   *  Keys vary by `kategori`, so this stays an open record. */
  jawaban: Record<string, string>;
  status: MaahirShakwaStatus;
  statusLabel: string;
  /** Always null in the capture. */
  catatanKoordinator: string | null;
  ditanganiAt: string | null;
  /** Attachments are counted, never exposed (docs §9). */
  jumlahLampiran: number;
  izin: MaahirShakwaIzin[];
  createdAt: string;
};

export type MaahirShakwaPayload = {
  mulai: string;
  sampai: string;
  total: number;
  belumDitangani: number;
  perKategori: { kategori: MaahirShakwaKategori; label: string; jumlah: number }[];
  /** All four statuses are always present, `jumlah: 0` included. */
  perStatus: { status: MaahirShakwaStatus; label: string; jumlah: number }[];
  items: MaahirShakwaItem[];
};

// ── Route → payload map ─────────────────────────────────────────────────────

/** Lets a generic helper resolve the payload type from a route name. */
export type MaahirRekapPayloadMap = {
  "rekap/laporan-maahir": MaahirLaporanPayload;
  "rekap/kehadiran": MaahirKehadiranPayload;
  "rekap/tibyan": MaahirTibyanPayload;
  "rekap/matrix-guru": MaahirMatrixPayload;
  "rekap/hits-disiplin": MaahirHitsDisiplinPayload;
  "rekap/sp": MaahirSpPayload;
  "rekap/shakwa": MaahirShakwaPayload;
};
