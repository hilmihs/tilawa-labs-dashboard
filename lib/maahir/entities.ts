/**
 * Read layer over the raw `maahir_sync` entity mirror — the counterpart to
 * `lib/maahir/rekap.ts`.
 *
 * **What this layer is allowed to be used for.** The Maahir API docs forbid
 * re-deriving headline numbers from raw entities (`docs/API-PUBLIC.md` §9:
 * "ambil angka jadi dari route rekap, jangan menurunkannya ulang dari entitas
 * mentah"), because seven business rules — sick sessions leaving the attendance
 * denominator, pemutihan forcing 100%, mid-period joiners getting a truncated
 * denominator, two different definitions of "bulan" — live upstream and would
 * have to be cloned here to get the same answer. The design spec settles the
 * split: rekap payloads carry the numbers, raw entities carry **"daftar orang
 * dan drill-down, yang memang tidak disediakan route rekap"**.
 *
 * So: this module backs record lists and detail panels. It must not grow a
 * function that computes a percentage, an average, a ranking, or a score.
 * Counting the rows you are about to render is fine — that is a list length,
 * not a business metric. Anything that would end up next to a `%` belongs in
 * `rekap.ts`.
 *
 * **Scoping.** Every read is pinned to `dataSourceType = 'maahir_api'`. The
 * Maahir sync only ever writes the single `maahir` program row, but the join
 * keeps a future second Maahir-backed program from leaking across.
 *
 * **Enum values are observed, not documented.** `docs/API-PUBLIC.md` lists the
 * columns of each entity but no value sets for `kondisi`, `status_latihan`,
 * `pelanggaran.jenis`, `tabayyun.status` or `teguran.category` (checked 7 Sep
 * 2026; the only fully enumerated enums in the whole document are the shakwa
 * `kategori`/`status`). The unions below were read off the local mirror
 * instead, so they are typed as "known value | (string & {})": a value upstream
 * adds tomorrow must render as itself, never crash and never be dropped.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/** A string union that still accepts unknown upstream values without widening away the hints. */
type Open<T extends string> = T | (string & {});

export type MaahirGender = Open<"ikhwan" | "akhwat">;

/** `kondisi` observed on `hits/keterangan-harian`: KBBS, JKG, LIBUR, KMT, KBLA. */
export type MaahirKondisi = Open<"KBBS" | "JKG" | "LIBUR" | "KMT" | "KBLA">;
/** `status_latihan` observed: SML, PTML, TAL — and null on ~6% of rows. */
export type MaahirStatusLatihan = Open<"SML" | "PTML" | "TAL">;
/** `pelanggaran.jenis` / `tabayyun.kondisi` observed: TIDAK_LATIHAN, JKG, KMT, BADAL, KBLA. */
export type MaahirPelanggaranJenis = Open<"TIDAK_LATIHAN" | "JKG" | "KMT" | "BADAL" | "KBLA">;
/** `tabayyun.status` observed: decided, pending, awaiting_reason. */
export type MaahirTabayyunStatus = Open<"decided" | "pending" | "awaiting_reason">;
/** `teguran.category` observed: komitmen_jadwal, kedisiplinan_waktu, tanggung_jawab. */
export type MaahirTeguranCategory = Open<
  "komitmen_jadwal" | "kedisiplinan_waktu" | "tanggung_jawab"
>;

export type MaahirHitsHalaqah = {
  id: string;
  batch_id: string | null;
  name: string;
  gender: MaahirGender | null;
  pengajar_id: string | null;
  /** Kurikulum: qoidah_nuroniyyah | perbaikan_bacaan. Null on 18 of 464 rows. */
  level: string | null;
  /** Tingkat: dasar | lanjutan. */
  program: string | null;
  start_date: string | null;
  jadwal_hari: string[] | null;
  created_at: string | null;
};

export type MaahirHitsPengajar = {
  id: string;
  name: string;
  gender: MaahirGender | null;
  kelompok_id: string | null;
  is_ketua: boolean | null;
  /** Upstream's own opt-out: these teachers are left out of the matrix entirely. */
  matrix_exclude: boolean | null;
  active: boolean | null;
  created_at: string | null;
};

export type MaahirKelompokPengajar = {
  id: string;
  name: string;
  gender: MaahirGender | null;
  created_at: string | null;
};

/** One ketua-kelas observation for one halaqah on one meeting. */
export type MaahirKeteranganHarian = {
  id: string;
  halaqah_id: string;
  level: string | null;
  pertemuan_no: number | null;
  tanggal: string;
  kondisi: MaahirKondisi | null;
  status_latihan: MaahirStatusLatihan | null;
  /**
   * When the row was written, NOT when the meeting happened — the Jan/Apr rows
   * were backfilled on 21 Jun 2026, so the earliest `created_at` is months after
   * the earliest `tanggal`. Always order and window on `tanggal`.
   */
  created_at: string | null;
};

export type MaahirPelanggaran = {
  id: string;
  keterangan_id: string | null;
  jenis: MaahirPelanggaranJenis | null;
  /** Minutes owed/late, when the violation type carries a duration. */
  menit: number | null;
};

export type MaahirTabayyun = {
  id: string;
  keterangan_id: string | null;
  pengajar_id: string | null;
  status: MaahirTabayyunStatus | null;
  kondisi: MaahirPelanggaranJenis | null;
  deadline_at: string | null;
  created_at: string | null;
};

export type MaahirHutangBayar = {
  id: string;
  halaqah_id: string | null;
  pengajar_id: string | null;
  keterangan_id: string | null;
  menit: number | null;
  tanggal: string | null;
  created_at: string | null;
};

export type MaahirTeguran = {
  id: string;
  pengajar_id: string | null;
  category: MaahirTeguranCategory | null;
  year_month: string | null;
  nomor_teguran: number | null;
  created_at: string | null;
};

/**
 * The inspeksi form: one row per pengajar per month, filled by the ketua
 * kelompok. Every score is nullable and frequently null — `skor_kepatuhan_sop`
 * is present on 120 of 418 rows — so a missing score means "belum dinilai" and
 * must render as an em dash, never as 0.
 *
 * Note `skor_kepatuhan_sop` is collected on this form but upstream files it
 * under **soft skill** in `matrix-rekap`, not under pedagogis. Do not present it
 * as a component of `rata_rata_pedagogis`.
 */
export type MaahirPenilaianPedagogis = {
  id: string;
  pengajar_id: string | null;
  year_month: string | null;
  skor_metode_pengajaran: number | null;
  skor_kepatuhan_silabus: number | null;
  skor_manajemen_halaqah: number | null;
  skor_evaluasi_penguasaan: number | null;
  skor_kepatuhan_sop: number | null;
  updated_at: string | null;
};

/** The rubric: 14 rows, `kategori` ∈ hard_skill | pedagogis | soft_skill. */
export type MaahirIndikatorStandar = {
  kode: string;
  kategori: string;
  nama: string;
  standar: number | null;
};

// ── scope `maahir`: kelas Maahir itself, not HITS ──────────────────────────

/** A Maahir class-programme: "Maahir Takhassus Ikhwan", "Kajian At-Tibyan", … */
export type MaahirProgramKelas = {
  id: string;
  name: string;
  gender: MaahirGender | null;
  jadwal_hari: string[] | null;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  /** "harian" | … — how attendance is taken. */
  presensi_sifat: string | null;
  self_attendance: boolean | null;
  created_at: string | null;
};

/** Enrolment of one person into one `program-kelas`. `peserta_id` is often null. */
export type MaahirAnggota = {
  id: string;
  program_kelas_id: string | null;
  peserta_id: string | null;
  name: string;
  is_ketua: boolean | null;
  is_wakil: boolean | null;
  mulai_tanggal: string | null;
  created_at: string | null;
};

/** A person on the Maahir roster. `kelas_id` points at {@link MaahirKelas}. */
export type MaahirPeserta = {
  id: string;
  name: string;
  gender: MaahirGender | null;
  kelas_id: string | null;
  active: boolean | null;
  created_at: string | null;
};

/** A halaqah-like grouping inside Maahir ("Alif", "Ba"), led by a musyrif. */
export type MaahirKelas = {
  id: string;
  name: string;
  gender: MaahirGender | null;
  musyrif_id: string | null;
  created_at: string | null;
};

/** Person reference tables — id + name only, readable by any valid key. */
export type MaahirOrang = {
  id: string;
  name: string;
  gender: MaahirGender | null;
  active?: boolean | null;
};

/** A scheduled meeting of one `program-kelas`. `kelas_id` is null on every mirrored row. */
export type MaahirPertemuanEntity = {
  id: string;
  /** kelas_maahir | at_tibyan | muallim_najih. */
  program: string | null;
  program_kelas_id: string | null;
  kelas_id: string | null;
  tanggal: string;
  nama_kegiatan: string | null;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  keterangan: string | null;
  created_at: string | null;
};

/** `kehadiran.status` observed: hadir, izin, sakit, terlambat, tidak_ada_keterangan. */
export type MaahirKehadiranStatus = Open<
  "hadir" | "izin" | "sakit" | "terlambat" | "tidak_ada_keterangan"
>;

/**
 * One member's presensi for one pertemuan. Every mirrored row carries
 * `anggota_id`; `peserta_id` is filled on about a third.
 *
 * `catatan` is the absence REASON and is flagged sensitive (docs §7) — health
 * and family matters. It may only be shown on authenticated screens (the
 * Kehadiran grid already does, from the rekap copy of the same text) and never
 * exported.
 */
export type MaahirKehadiranEntity = {
  id: string;
  pertemuan_id: string | null;
  anggota_id: string | null;
  peserta_id: string | null;
  status: MaahirKehadiranStatus | null;
  /** online | offline | null (null on ~63% of rows — "not recorded", not offline). */
  mode: string | null;
  setoran_halaman: number | null;
  catatan: string | null;
  diisi_at: string | null;
  updated_at: string | null;
};

/** `setoran.status` observed: draft, submitted, checked. */
export type MaahirSetoranStatus = Open<"draft" | "submitted" | "checked">;

/** One peserta's weekly recitation submission. The recordings hang off it. */
export type MaahirSetoranEntity = {
  id: string;
  peserta_id: string | null;
  /** Monday of the week, `YYYY-MM-DD`. */
  week_start: string | null;
  status: MaahirSetoranStatus | null;
  submitted_at: string | null;
  checked_at: string | null;
  checked_by_musyrif_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/** `rekaman.nilai` observed: hijau, kuning, merah — null = belum dinilai. */
export type MaahirRekamanNilai = Open<"hijau" | "kuning" | "merah">;

/** One recording inside a setoran. `audio_url` never leaves the API (docs §6). */
export type MaahirRekamanEntity = {
  id: string;
  setoran_id: string | null;
  /** Observed: jazariyyah, syawahid, tuhfatul_athfal. */
  jenis: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  nilai: MaahirRekamanNilai | null;
  checked_at: string | null;
  created_at: string | null;
};

/** Monthly bacaan/hafalan score for a peserta. Free-text comments never leave the API. */
export type MaahirPenilaianPesertaEntity = {
  id: string;
  peserta_id: string | null;
  year_month: string | null;
  skor_bacaan: number | null;
  skor_hafalan: number | null;
  assessor_role: string | null;
  updated_at: string | null;
};

/** A pemutihan (SP whitewash) for one anggota and one month. */
export type MaahirPemutihanEntity = {
  id: string;
  anggota_id: string | null;
  month: string | null;
  tanggal: string | null;
  alasan: string | null;
  dibuat_oleh: string | null;
  /** Set when the whitewash was revoked — the row stays, the effect does not. */
  dibatalkan_pada: string | null;
  created_at: string | null;
};

/** A holiday range for one program-kelas. */
export type MaahirLiburEntity = {
  id: string;
  program_kelas_id: string | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  keterangan: string | null;
  created_at: string | null;
};

/** Entity path → the shape of its `raw` payload. Keys must match registry.ts paths. */
export type MaahirEntityMap = {
  "hits/halaqah": MaahirHitsHalaqah;
  "hits/pengajar": MaahirHitsPengajar;
  "hits/kelompok-pengajar": MaahirKelompokPengajar;
  "hits/keterangan-harian": MaahirKeteranganHarian;
  "hits/pelanggaran": MaahirPelanggaran;
  "hits/tabayyun": MaahirTabayyun;
  "hits/hutang-bayar": MaahirHutangBayar;
  "hits/teguran": MaahirTeguran;
  "penilaian-pedagogis": MaahirPenilaianPedagogis;
  "indikator-standar": MaahirIndikatorStandar;
  "program-kelas": MaahirProgramKelas;
  anggota: MaahirAnggota;
  peserta: MaahirPeserta;
  kelas: MaahirKelas;
  musyrif: MaahirOrang;
  koordinator: MaahirOrang;
  syaikh: MaahirOrang;
  "koordinator-ketua-kelas": MaahirOrang;
  pertemuan: MaahirPertemuanEntity;
  kehadiran: MaahirKehadiranEntity;
  setoran: MaahirSetoranEntity;
  rekaman: MaahirRekamanEntity;
  "penilaian-peserta": MaahirPenilaianPesertaEntity;
  pemutihan: MaahirPemutihanEntity;
  libur: MaahirLiburEntity;
};

export type MaahirEntityName = keyof MaahirEntityMap;

type RawRow<E extends MaahirEntityName> = { raw: MaahirEntityMap[E] };

/**
 * Expand a list of ids into one bind per value.
 *
 * Drizzle binds a JS array as a SINGLE parameter, which Postgres then rejects
 * with `array_in: malformed array literal` — the same trap documented in
 * `app/[program]/disiplin/queries.ts`.
 */
function inList(values: string[]) {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

/**
 * Every mirrored row of one entity, optionally narrowed by a jsonb field.
 *
 * `where` entries are ANDed and compared as text against `raw->>key`, which is
 * how every id in this mirror is stored (uuids and ints alike land in `text`).
 * An empty id list short-circuits to `[]` rather than emitting `in ()`, which is
 * a syntax error in Postgres.
 */
export async function readEntities<E extends MaahirEntityName>(
  entity: E,
  opts: { whereIn?: Partial<Record<string, string[]>>; limit?: number } = {},
): Promise<MaahirEntityMap[E][]> {
  const filters = Object.entries(opts.whereIn ?? {}).filter(
    (pair): pair is [string, string[]] => Array.isArray(pair[1]),
  );
  if (filters.some(([, ids]) => ids.length === 0)) return [];

  const db = getDb();
  const conditions = filters.map(
    ([key, ids]) => sql`ms.raw->>${key} in (${inList(ids)})`,
  );
  const rows = await db.execute<RawRow<E>>(sql`
    select ms.raw as raw
    from maahir_sync ms
    join programs p on p.id = ms.program_id
    where p.data_source_type = 'maahir_api'
      and ms.entity = ${entity}
      ${conditions.length > 0 ? sql`and ${sql.join(conditions, sql` and `)}` : sql``}
    ${opts.limit ? sql`limit ${opts.limit}` : sql``}
  `);
  return rows.rows.map((r) => r.raw);
}

/** Halaqah belonging to the Maahir batches pinned onto a HITS program. */
export function readHitsHalaqah(batchIds: string[]): Promise<MaahirHitsHalaqah[]> {
  return readEntities("hits/halaqah", { whereIn: { batch_id: batchIds } });
}

/** All HITS teachers. Small table (183 rows) — pulled whole, filtered in code. */
export function readHitsPengajar(): Promise<MaahirHitsPengajar[]> {
  return readEntities("hits/pengajar");
}

export function readKelompokPengajar(): Promise<MaahirKelompokPengajar[]> {
  return readEntities("hits/kelompok-pengajar");
}

/**
 * Observations for the given halaqah. Date narrowing happens in the caller on
 * `tanggal` (a plain `YYYY-MM-DD` string) — see the `created_at` warning on
 * {@link MaahirKeteranganHarian} for why the timestamp is the wrong axis.
 */
export function readKeteranganHarian(halaqahIds: string[]): Promise<MaahirKeteranganHarian[]> {
  return readEntities("hits/keterangan-harian", { whereIn: { halaqah_id: halaqahIds } });
}

export function readPelanggaran(keteranganIds: string[]): Promise<MaahirPelanggaran[]> {
  return readEntities("hits/pelanggaran", { whereIn: { keterangan_id: keteranganIds } });
}

export function readTabayyun(keteranganIds: string[]): Promise<MaahirTabayyun[]> {
  return readEntities("hits/tabayyun", { whereIn: { keterangan_id: keteranganIds } });
}

export function readHutangBayar(keteranganIds: string[]): Promise<MaahirHutangBayar[]> {
  return readEntities("hits/hutang-bayar", { whereIn: { keterangan_id: keteranganIds } });
}

/** Warnings issued to a teacher. Not keyed to an observation — per pengajar per month. */
export function readTeguran(pengajarIds: string[]): Promise<MaahirTeguran[]> {
  return readEntities("hits/teguran", { whereIn: { pengajar_id: pengajarIds } });
}

export function readPenilaianPedagogis(): Promise<MaahirPenilaianPedagogis[]> {
  return readEntities("penilaian-pedagogis");
}

/** The 14-indicator rubric. Reference table — used as the legend, never as data. */
export function readIndikatorStandar(): Promise<MaahirIndikatorStandar[]> {
  return readEntities("indikator-standar");
}

// ── scope `maahir` ─────────────────────────────────────────────────────────
//
// These back the Maahir-side roster and the per-person page. The `kehadiran`
// reader is scoped to a list of anggota ids on purpose: its `catatan` column is
// flagged sensitive by the API docs (§7) — the *reason* for an absence, "demam"
// / "ibu sakit" — so the only screen that reads it is one person's own page,
// behind login, the same audience the Kehadiran grid already shows it to. The
// roster never reads it, and no export may carry it.

/** The Maahir class-programmes (Takhassus, Maahir, At-Tibyan …). */
export function readProgramKelas(): Promise<MaahirProgramKelas[]> {
  return readEntities("program-kelas");
}

/** Enrolments. Filter by `program_kelas_id` in the caller — the table is small. */
export function readAnggota(): Promise<MaahirAnggota[]> {
  return readEntities("anggota");
}

/** The Maahir roster. */
export function readPeserta(): Promise<MaahirPeserta[]> {
  return readEntities("peserta");
}

/** Musyrif-led groupings ("Alif", "Ba"). */
export function readKelas(): Promise<MaahirKelas[]> {
  return readEntities("kelas");
}

/** Musyrif reference list, for naming a `kelas.musyrif_id`. */
export function readMusyrif(): Promise<MaahirOrang[]> {
  return readEntities("musyrif");
}

/** Syaikh reference list, for naming whoever checked a musyrif's setoran. */
export function readSyaikh(): Promise<MaahirOrang[]> {
  return readEntities("syaikh");
}

/** Meetings by id. Small (~800 rows) but always narrowed to what a person attended. */
export function readPertemuan(ids: string[]): Promise<MaahirPertemuanEntity[]> {
  return readEntities("pertemuan", { whereIn: { id: ids } });
}

/** One person's presensi rows — see the `catatan` note above before widening this. */
export function readKehadiranAnggota(anggotaIds: string[]): Promise<MaahirKehadiranEntity[]> {
  return readEntities("kehadiran", { whereIn: { anggota_id: anggotaIds } });
}

export function readSetoranPeserta(pesertaIds: string[]): Promise<MaahirSetoranEntity[]> {
  return readEntities("setoran", { whereIn: { peserta_id: pesertaIds } });
}

export function readRekaman(setoranIds: string[]): Promise<MaahirRekamanEntity[]> {
  return readEntities("rekaman", { whereIn: { setoran_id: setoranIds } });
}

export function readPenilaianPeserta(pesertaIds: string[]): Promise<MaahirPenilaianPesertaEntity[]> {
  return readEntities("penilaian-peserta", { whereIn: { peserta_id: pesertaIds } });
}

export function readPemutihan(anggotaIds: string[]): Promise<MaahirPemutihanEntity[]> {
  return readEntities("pemutihan", { whereIn: { anggota_id: anggotaIds } });
}

export function readLibur(programKelasIds: string[]): Promise<MaahirLiburEntity[]> {
  return readEntities("libur", { whereIn: { program_kelas_id: programKelasIds } });
}

/**
 * When the Maahir mirror was last written, so a drill-down screen can say
 * "terakhir ditarik <waktu>" the same way the rekap screens do. `null` = the
 * entity was never pulled, which the caller must render as "belum ditarik"
 * rather than as an empty list.
 */
export async function entityLastSync(entity: MaahirEntityName): Promise<Date | null> {
  const db = getDb();
  // `db.execute` with raw SQL returns whatever the pg driver parsed, and for a
  // `max(timestamptz)` that is a **string** — the aggregate loses the column
  // type the driver would otherwise use to pick a parser. Declaring the row as
  // `Date` compiles and then throws `getTime is not a function` at the first
  // caller that treats it as one. (`<SyncStatus at>` accepts a string, which is
  // why the observasi screen never noticed.) Parse here, once, so no caller has
  // to defend itself; an unparseable value degrades to "never synced", which
  // reads as "belum ditarik" rather than silently claiming freshness.
  const rows = await db.execute<{ synced_at: string | Date | null }>(sql`
    select max(ms.synced_at) as synced_at
    from maahir_sync ms
    join programs p on p.id = ms.program_id
    where p.data_source_type = 'maahir_api' and ms.entity = ${entity}
  `);
  const raw = rows.rows[0]?.synced_at;
  if (!raw) return null;
  const at = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Whether the API key was refused the scope backing an entity, so a screen can
 * say "scope belum diberikan" instead of showing an empty table. Mirrors
 * `app/[program]/sp/scope.ts`, but keyed on an entity path rather than a rekap
 * route — `maahir_sync_state.entity` holds both.
 *
 * Never throws: a diagnostic must not be able to break the page it explains.
 */
export async function isEntityForbidden(entity: MaahirEntityName): Promise<boolean> {
  try {
    const db = getDb();
    const rows = await db.execute<{ forbidden: boolean | null }>(sql`
      select mss.forbidden
      from maahir_sync_state mss
      join programs p on p.id = mss.program_id
      where p.data_source_type = 'maahir_api' and mss.entity = ${entity}
      limit 1
    `);
    return rows.rows[0]?.forbidden === true;
  } catch {
    return false;
  }
}
