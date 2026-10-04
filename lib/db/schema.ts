import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  doublePrecision,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  unique,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Auth (app-managed cookie sessions; Postgres has no built-in auth) ─────

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().default("coordinator"), // 'coordinator' | 'super_coordinator'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Core ────────────────────────────────────────────────────────────────

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  dataSourceType: text("data_source_type").notNull(), // 'tilawah_api' | 'berkah_api' | 'mabni_api' | 'maahir_api' | 'google_sheet' | 'manual'
  tilawahProgramId: integer("tilawah_program_id"),
  tilawahBatchId: integer("tilawah_batch_id"), // pin a specific batch; null = newest batch
  // Per-program display config (see lib/programs/config.ts):
  //   { segmentation: { primary: 'marhalah'|'level', secondary: 'gender'|null },
  //     features: { piket: boolean } }
  config: jsonb("config"),
  // For dataSourceType='berkah_api' (HKM tilawah): the the partner system Board id to scope
  // the user pull (null = all business units). Progress params live in config.hkm.
  berkahBusinessUnitId: integer("berkah_business_unit_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Which coordinators may see which programs. A super_coordinator (staff.role)
// sees everything regardless of rows here; a coordinator sees only its programs.
export const staffPrograms = pgTable(
  "staff_programs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.staffId, t.programId)],
);

// ── Read-model tables refreshed by the sync engine ─────────────────────
// Never written to manually; always overwritten by the next sync run.

export const halaqahSync = pgTable(
  "halaqah_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahHalaqahId: integer("tilawah_halaqah_id").notNull(),
    tilawahBatchId: integer("tilawah_batch_id"),
    name: text("name"), // nama apa adanya dari upstream — JANGAN diubah
    /**
     * Nama yang ditampilkan koordinator, mis. "M1 - Usbu'i 1 (ikh)". Dihitung
     * dari seluruh himpunan halaqah program itu (penomoran butuh kelompoknya)
     * lalu DISIMPAN, supaya dashboard, laporan bulanan dan ekspor xlsx membaca
     * satu kolom yang sama — bukan mengulang logika penomoran di tiap query
     * dan berisiko menyebut nomor berbeda di dua halaman.
     *
     * Null = pakai `name`. Hanya program yang membawa `jenis_pertemuan` di
     * `raw.kelas` (mabni) yang terisi; nama HITS seperti "HITS 065 JUNI" tidak
     * berbentuk marhalah + kadensi dan dibiarkan apa adanya.
     *
     * `name` tetap sumber untuk penyimpulan gender lewat ilike '%akhwat%' di
     * lib/reports/queries.ts — jadi kolom ini murni tampilan.
     */
    namaTampil: text("nama_tampil"),
    type: text("type"),
    day: text("day"),
    session: text("session"),
    level: text("level"),
    guruId: integer("guru_id"), // main teacher (tilawah user id) — for halaqah health + accountability
    pengajar: text("pengajar"), // teacher display name
    guruPhone: text("guru_phone"), // main teacher phone (from /api/users?role=guru) — for wa.me reminders
    raw: jsonb("raw").notNull().default({}),
    // Hash of this halaqah's slice of /api/reports/absensi-murid at the last
    // sync. An unchanged hash means no presensi moved, so the detail call is
    // skipped. Its own column rather than a key inside `raw`, because `raw` is
    // overwritten wholesale with the upstream payload on every upsert.
    // See lib/sync/absensi-fingerprint.ts.
    absensiFingerprint: text("absensi_fingerprint"),
    // When /api/halaqah/{id} was last actually fetched, as opposed to skipped.
    // The oldest value across a program is when that program was last swept in
    // full, which is what schedules the nightly sweep — no extra state needed.
    detailSyncedAt: timestamp("detail_synced_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.programId, t.tilawahHalaqahId)],
);

export const studentsSync = pgTable(
  "students_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahUserId: integer("tilawah_user_id").notNull(),
    halaqahUserId: integer("halaqah_user_id"), // enrollment id, distinct from tilawah_user_id — needed for presensi write
    name: text("name"),
    userCode: text("user_code"),
    phone: text("phone"),
    halaqahId: integer("halaqah_id"), // tilawah halaqah id, joins to halaqah_sync.tilawah_halaqah_id
    pengajar: text("pengajar"),
    pertemuan: text("pertemuan"), // e.g. "6/26"
    kehadiranPercentage: numeric("kehadiran_percentage"), // tilawah's: hadir ÷ ALL planned meetings (semester progress)
    gender: integer("gender"), // 1=Laki-laki, 2=Perempuan — for HITS gender×level segmentation
    enrollmentStatusCode: integer("enrollment_status_code"), // pivot.status: 1=aktif, 0=tidak aktif
    enrollmentStatus: text("enrollment_status"), // pivot.reason free text (mengundurkan/dinonaktifkan/batal/...)
    // Enrollment row timestamps straight from tilawah's pivot. `updated_at` is the
    // only signal we have for WHEN someone left: an untouched enrollment keeps
    // updated_at == created_at (the import stamp), and deactivating a participant
    // moves it to that day. It means "last edited", not "left on" — a later edit to
    // a deactivated row (halaqah move, phone fix) shifts it. Used by the HITS
    // monthly report for "Peserta Keluar" and for reconstructing month-end active.
    enrollmentCreatedAt: timestamp("enrollment_created_at", { withTimezone: true }),
    enrollmentUpdatedAt: timestamp("enrollment_updated_at", { withTimezone: true }),
    // Date-relative attendance computed from attendance_sync (see tilawah-sync):
    // rate = hadirCount / effectiveMeetings; Izin(3) excluded; Telat(2) counts as hadir.
    attendanceRate: numeric("attendance_rate"), // 0..100, null when effectiveMeetings=0
    hadirCount: integer("hadir_count"), // status ∈ (1 Hadir, 2 Telat)
    effectiveMeetings: integer("effective_meetings"), // status ∈ (0 Alfa, 1, 2) — denominator
    recordedMeetings: integer("recorded_meetings"), // status ∈ (0,1,2,3) — meetings with presensi taken
    izinCount: integer("izin_count"), // status = 3 (Izin/Sakit)
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.tilawahUserId),
    // Roster-per-halaqah counts (halaqah health, /tv "terjadwal").
    index("students_sync_program_halaqah_idx").on(t.programId, t.halaqahId),
  ],
);

export const jadwalSync = pgTable(
  "jadwal_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahHalaqahId: integer("tilawah_halaqah_id").notNull(),
    tilawahJadwalId: integer("tilawah_jadwal_id").notNull(),
    name: text("name"),
    order: integer("order"),
    scheduleDate: date("schedule_date"),
    guruId: integer("guru_id"), // per-meeting teacher (may differ from halaqah's, e.g. badal)
    status: integer("status"),
    statusLabel: text("status_label"),
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.tilawahJadwalId),
    index("jadwal_sync_halaqah_date_idx").on(t.tilawahHalaqahId, t.scheduleDate),
    // Cross-program date scans ("which meetings fall on this date, everywhere")
    // can't use the halaqah-first index above. Added for lib/tv/queries.
    index("jadwal_sync_program_date_idx").on(t.programId, t.scheduleDate),
  ],
);

// Teachers (guru) as their own read-model, refreshed by the sync engine from
// /api/users?filters[role]=guru. Unlike the denormalized guru columns on
// halaqah_sync, this keeps the guru's EMAIL (dropped elsewhere) so the public
// /guru portal can verify a teacher by name + email/phone, and so the badal
// picker can list gurus without a live upstream call. Overwritten every sync.
export const guruSync = pgTable(
  "guru_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahBatchId: integer("tilawah_batch_id"),
    tilawahGuruId: integer("tilawah_guru_id").notNull(), // == halaqah_sync.guruId / jadwal_sync.guruId
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    // 1 = Laki-laki, 2 = Perempuan, straight from the CMS user record. The
    // teacher's own gender is the only reliable ikhwan/akhwat signal: most
    // students sync back with gender null, and a halaqah name is a naming
    // convention nobody enforces.
    gender: integer("gender"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.tilawahGuruId),
    index("guru_sync_program_name_idx").on(t.programId, t.name),
  ],
);

export const attendanceSync = pgTable(
  "attendance_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahPresensiId: integer("tilawah_presensi_id").notNull(),
    halaqahUserId: integer("halaqah_user_id"),
    halaqahJadwalId: integer("halaqah_jadwal_id"),
    status: text("status"),
    notes: text("notes"),
    lahnJaliy: text("lahn_jaliy"),
    lahnKhofiy: text("lahn_khofiy"),
    taskSubmissionDate: date("task_submission_date"),
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.tilawahPresensiId),
    // The two join keys every attendance query uses were unindexed until now:
    // presensi→jadwal (insights, reports, /tv) and presensi→peserta (rollups).
    index("attendance_sync_program_jadwal_idx").on(t.programId, t.halaqahJadwalId),
    index("attendance_sync_program_user_idx").on(t.programId, t.halaqahUserId),
  ],
);

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: uuid("program_id").references(() => programs.id, { onDelete: "cascade" }),
  runType: text("run_type").notNull(), // 'tilawah_full' etc.
  status: text("status").notNull(), // 'running' | 'success' | 'failed'
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// Global (cross-program) cursor for incremental bulk pulls that aren't scoped to
// one program. The tilawah /api/presensis stream is system-wide (36k+ rows) and
// keyed to a program only via jadwal, so its high-water `updated_at` lives here,
// not on a per-program state row. `key` = the stream name, e.g. "presensi".
export const tilawahSyncCursor = pgTable("tilawah_sync_cursor", {
  key: text("key").primaryKey(),
  highWaterUpdatedAt: timestamp("high_water_updated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Our own data (source of truth — nothing here comes from tilawah API) ──

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    fatherName: text("father_name"),
    motherName: text("mother_name"),
    birthDate: date("birth_date"),
    marhalah: text("marhalah"),
    tilawahUserId: integer("tilawah_user_id"), // link to students_sync.tilawah_user_id; set directly by the API roster seed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The sync engine upserts the enrolled-murid roster keyed on this pair.
  (t) => [unique().on(t.programId, t.tilawahUserId)],
);

/*
 * ── MABNI roster overlay (xlsx-sourced, app-owned) ───────────────────────
 *
 * Four tables carrying what the Mabni API does not expose at all: the family
 * a santri belongs to (including siblings who are not enrolled), and the
 * semester's teacher roster with its class pairing.
 *
 * All four are app-owned on purpose. They deliberately hold NO foreign key
 * into any `*_sync` table — those are truncated and re-pruned by
 * lib/sync/mabni-sync.ts on every run, so an FK there would either block the
 * sync or cascade these rows away. Links into the mirror are plain integer
 * columns re-resolved by name on each import.
 *
 * Source: docs/20260721_MABNI_Data Pengajar & Peserta_Data Semester 2 Tahun
 * Ajaran 2026.xlsx, parsed by lib/mabni/roster-xlsx.ts.
 */

/**
 * One family from the "Data Wali Santri" sheet.
 *
 * Keyed on the normalized (ayah, ibu) pair, not the sheet's own `No`: that
 * column is a sort artifact (row 2 carries No 43) and renumbers whenever
 * someone re-sorts the sheet, which would make every re-import insert
 * duplicates.
 */
export const studentGuardians = pgTable(
  "student_guardians",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    fatherName: text("father_name"), // display form, verbatim minus outer whitespace
    motherName: text("mother_name"),
    /*
     * norm()'d copies of the two names above — the actual identity of the row.
     * notNull + default '' rather than nullable: Postgres treats NULLs as
     * distinct inside a UNIQUE, so a father-only family would be free to
     * insert itself again on every run.
     */
    fatherKey: text("father_key").notNull().default(""),
    motherKey: text("mother_key").notNull().default(""),
    // "Jumlah Anak" verbatim. One row disagrees with its own listed slots —
    // both numbers are kept and the importer reports the difference rather
    // than silently picking a winner.
    childCount: integer("child_count"),
    sourceNo: integer("source_no"), // the sheet's `No`, provenance only
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.fatherKey, t.motherKey),
    index("student_guardians_program_idx").on(t.programId),
  ],
);

/**
 * One row per child SLOT on a wali row — not per enrolled santri.
 *
 * 14 of the 75 children listed in the sheet are siblings who are not enrolled
 * in the program; a plain FK column on `students` would have dropped them and
 * lost the sibling relationship the sheet exists to record. `studentId` null
 * means "not enrolled", and is re-resolved by name on every import so a
 * sibling who later enrols links itself with no manual step.
 */
export const studentGuardianChildren = pgTable(
  "student_guardian_children",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => studentGuardians.id, { onDelete: "cascade" }),
    // Denormalized from the guardian: every read of this table is
    // program-scoped, and it is what makes the childKey index selective.
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    // 1..3 = which "Nama Anak N" column. An empty slot does NOT renumber the
    // ones after it, so ordinal stays comparable across re-imports.
    ordinal: integer("ordinal").notNull(),
    childName: text("child_name").notNull(),
    childKey: text("child_key").notNull(), // norm()'d, after the alias map
    // set null, not cascade: a santri leaving the program does not stop them
    // being this family's second child.
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.guardianId, t.ordinal),
    index("student_guardian_children_student_idx").on(t.studentId),
    index("student_guardian_children_key_idx").on(t.programId, t.childKey),
  ],
);

/**
 * Teacher roster from the "Data Pengajar" sheet — an OVERLAY on guru_sync,
 * not a replacement: 2 of the 16 (Fariz Azhar Handayani, Khadijah Hakim Ramadhan) do
 * not exist upstream at all, so the mirror alone cannot answer "who teaches
 * here this semester".
 */
export const programTeachers = pgTable(
  "program_teachers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    nameKey: text("name_key").notNull(), // norm()'d — the only stable identifier the xlsx offers
    // Resolved by name against guru_sync on every import, so it fills itself
    // in the day the CMS gains the two missing teachers. Not an FK: guru_sync
    // is pruned wholesale by the sync.
    tilawahGuruId: integer("tilawah_guru_id"),
    // "Tanggal Masuk" / "Status" — both source columns are empty today.
    // Modelled now so the next revision of the workbook needs no migration.
    joinedAt: date("joined_at"),
    status: text("status"),
    sourceOrdinal: integer("source_ordinal"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.nameKey),
    index("program_teachers_guru_idx").on(t.programId, t.tilawahGuruId),
  ],
);

/**
 * Class↔teacher pairing from the first table of the "Data Pengajar" sheet.
 *
 * Stores the CATEGORY, never a halaqah id. The xlsx category is strictly
 * coarser than halaqah_sync — "Al Marhalah al-Ula Usbu'i Ikhwan" covers three
 * separate halaqah — so any single id written here would be a guess.
 * Resolution to ids happens at read time via lib/mabni/kelas-kategori.ts
 * against the live mirror, which also means the pairing survives a halaqah
 * being renamed or re-created upstream.
 */
export const programTeacherAssignments = pgTable(
  "program_teacher_assignments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => programTeachers.id, { onDelete: "cascade" }),
    categoryRaw: text("category_raw").notNull(), // exact xlsx text after \n-splitting
    categoryKey: text("category_key").notNull(), // canonical, e.g. "M1-1-usbui" / "MA-2"
    level: text("level").notNull(), // 'MA' | 'M1' | 'M2' | 'M3' — matches halaqah_sync.level
    gender: integer("gender").notNull(), // 1=Ikhwan, 2=Akhwat — the mirror's convention
    jenisPertemuan: text("jenis_pertemuan"), // 'yaumi' | 'usbui' | null (MA carries no qualifier)
    // Which teacher-team within the category. One category can hold two teams
    // holding two different halaqah; flattening them would lose that.
    groupOrdinal: integer("group_ordinal").notNull().default(1),
    sourceRow: integer("source_row"), // 1-indexed xlsx row, provenance
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.categoryKey, t.groupOrdinal, t.teacherId),
    index("program_teacher_assignments_teacher_idx").on(t.teacherId),
    index("program_teacher_assignments_cat_idx").on(t.programId, t.categoryKey),
  ],
);

export const lateIncidents = pgTable(
  "late_incidents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    occurredAt: date("occurred_at").notNull(),
    dayName: text("day_name"),
    marhalah: text("marhalah").notNull(),
    arrivalTime: time("arrival_time"),
    perizinan: text("perizinan").notNull(), // 'Izin' | 'Tidak Izin' | 'Terlambat Izin' | 'Udzur' | 'Rutin Kegiatan Sekolah'
    alasan: text("alasan"),
    keterangan: text("keterangan"),
    spRequired: boolean("sp_required").notNull().default(false),
    spGeneratedAt: timestamp("sp_generated_at", { withTimezone: true }),
    reportedByRole: text("reported_by_role").notNull().default("guru_piket"), // 'guru_piket' | 'guru_kelas'
    reportedByUserId: uuid("reported_by_user_id"),
    tilawahPresensiSynced: boolean("tilawah_presensi_synced").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("late_incidents_student_id_idx").on(t.studentId),
    index("late_incidents_occurred_at_idx").on(t.occurredAt),
  ],
);

export const warningLetters = pgTable("warning_letters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  lateIncidentId: uuid("late_incident_id").references(() => lateIncidents.id, {
    onDelete: "set null",
  }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  pdfPath: text("pdf_path"), // path under warning-letters/ (local FS or Azure Blob — see lib/storage)
  letterNumber: text("letter_number"), // e.g. EKT/MPN-MBN/VII/2026/16 — auto-assigned on generate
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  contentSnapshot: jsonb("content_snapshot").notNull().default({}),
});

/**
 * Letters generated by the HKM surat page (penerimaan + peringatan 1/2/3).
 *
 * One row per generated PDF, not per recipient: the feature deliberately turns
 * N selected peserta into ONE multi-page file, and that file is the artefact
 * that gets sent. Per-recipient detail lives in `contentSnapshot` — expand it
 * with jsonb_array_elements if a per-peserta history view is ever needed.
 *
 * Deliberately NOT reusing `warning_letters`: that one is FK-bound to
 * `late_incidents` + `students` (mabni piket) and carries a `letter_number`
 * these letters must not have. Deliberately no FK to `students`/`students_sync`
 * either — a recipient may be a manually typed name, and the sync tables are
 * overwritten read-models while an issued letter is a permanent record.
 */
export const hkmLetters = pgTable(
  "hkm_letters",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    letterType: text("letter_type").notNull(), // 'penerimaan' | 'peringatan'
    level: integer("level"), // 1|2|3 for peringatan, null for penerimaan
    recipientCount: integer("recipient_count").notNull().default(1),
    /** Names as printed, so the riwayat list needn't open the snapshot. PII. */
    recipientNames: jsonb("recipient_names").notNull().default([]),
    pdfPath: text("pdf_path").notNull(), // path under hkm-letters/ (see lib/storage)
    letterDate: date("letter_date").notNull(), // the operator-picked "Jakarta, <date>"
    signerName: text("signer_name").notNull(),
    generatedBy: uuid("generated_by").references(() => staff.id, { onDelete: "set null" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    contentSnapshot: jsonb("content_snapshot").notNull().default({}),
  },
  (t) => [index("hkm_letters_program_generated_idx").on(t.programId, t.generatedAt)],
);

export const attendanceThresholds = pgTable(
  "attendance_thresholds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    periodType: text("period_type").notNull(), // 'yaumiy' | 'usbuiy'
    pct70: numeric("pct_70").notNull().default("70"),
    pct30: numeric("pct_30").notNull().default("30"),
    pct15: numeric("pct_15").notNull().default("15"),
    hbeSource: text("hbe_source"),
    notes: text("notes"),
  },
  (t) => [unique().on(t.programId, t.periodType)],
);

// Teacher self-confirmation of a not-taught meeting, captured via the public
// /confirm/<token> magic link (see lib/auth/gap-token.ts). App-owned — survives
// the sync overwrite. Keyed on the stable tilawah jadwal id so one row per
// meeting; re-confirming updates it. Feeds the monthly teacher recap.
export const teacherMeetingConfirmations = pgTable(
  "teacher_meeting_confirmations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahHalaqahId: integer("tilawah_halaqah_id").notNull(),
    tilawahJadwalId: integer("tilawah_jadwal_id").notNull(),
    guruId: integer("guru_id"), // per-meeting teacher this confirmation is attributed to
    meetingOrder: integer("meeting_order"),
    scheduleDate: date("schedule_date"), // snapshot of the meeting date at confirm time
    status: text("status").notNull(), // 'tidak_mengajar' | 'mengajar_belum_input' | 'mengajar_kendala_sistem' | 'diisi_koordinator'
    reasonCode: text("reason_code"), // 'izin'|'sakit'|'badal'|'libur'|'kegiatan'|'lainnya'
    reasonText: text("reason_text"),
    confirmedByPhone: text("confirmed_by_phone"),
    confirmedBy: text("confirmed_by"), // coordinator email when force-filled (source='coordinator')
    source: text("source").notNull().default("wa_magiclink"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.tilawahJadwalId),
    index("tmc_program_schedule_idx").on(t.programId, t.scheduleDate),
  ],
);

// Guru-initiated change requests (reschedule / badal) from the public /guru
// portal. App-owned — survives the sync overwrite. A request only mutates the
// tilawah CMS after a coordinator approves it via the /persetujuan/<token> link.
export const guruChangeRequests = pgTable(
  "guru_change_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahHalaqahId: integer("tilawah_halaqah_id").notNull(),
    tilawahJadwalId: integer("tilawah_jadwal_id").notNull(),
    requestType: text("request_type").notNull(), // 'reschedule' | 'badal'
    requestedByGuruId: integer("requested_by_guru_id"),
    requestedByName: text("requested_by_name"),
    requestedByPhone: text("requested_by_phone"),
    // reschedule payload:
    newScheduleDate: date("new_schedule_date"),
    newStartAt: text("new_start_at"), // "YYYY-MM-DD HH:MM:SS"
    newEndAt: text("new_end_at"), // must be AFTER newStartAt
    // badal payload:
    newGuruId: integer("new_guru_id"),
    newGuruName: text("new_guru_name"),
    reasonText: text("reason_text"),
    status: text("status").notNull().default("pending"), // 'pending'|'approved'|'rejected'|'applied'|'failed'
    coordinatorPhone: text("coordinator_phone"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    appliedResult: jsonb("applied_result"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("gcr_status_idx").on(t.status),
    index("gcr_jadwal_idx").on(t.programId, t.tilawahJadwalId),
  ],
);

/**
 * Append-only ledger of per-meeting changes: a reschedule (date or time moved)
 * or a badal (per-meeting guru swapped).
 *
 * Needed because `jadwal_sync` is upsert-only — every sync overwrites the old
 * guru_id / schedule_date with no trace, so a change made straight in the
 * tilawah CMS is invisible 15 minutes later. Rows arrive from three writers:
 *   `upstream_log`  — imported from tilawah's own pertemuan-activity-logs, which
 *                     records `reschedule` (with old→new AND the actor) but NOT
 *                     guru changes;
 *   `diff`          — computed during sync by comparing the incoming jadwal to
 *                     the stored one; the only way badal is ever captured;
 *   `guru_request`  — stamped when a /persetujuan approval writes to the CMS,
 *                     the only path with a guaranteed-correct old value.
 *
 * `dedupeKey` is built in app code identically by all three so the same change
 * seen twice collapses; every insert uses onConflictDoNothing.
 */
export const jadwalChangeEvents = pgTable(
  "jadwal_change_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahHalaqahId: integer("tilawah_halaqah_id"),
    tilawahJadwalId: integer("tilawah_jadwal_id").notNull(),
    meetingOrder: integer("meeting_order"),
    meetingName: text("meeting_name"),
    // The meeting's date AFTER the change — the axis the monthly recap groups on.
    scheduleDate: date("schedule_date"),
    field: text("field").notNull(), // 'schedule_date' | 'session_time' | 'guru' | 'created' | 'deleted'
    oldValue: text("old_value"),
    newValue: text("new_value"),
    oldLabel: text("old_label"), // human form: guru name, formatted date/time
    newLabel: text("new_label"),
    affectedGuruId: integer("affected_guru_id"),
    affectedGuruName: text("affected_guru_name"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(), // 'upstream_log' | 'diff' | 'guru_request' | 'inferred'
    upstreamLogId: integer("upstream_log_id"),
    actorUserId: integer("actor_user_id"),
    actorName: text("actor_name"),
    guruRequestId: uuid("guru_request_id").references(() => guruChangeRequests.id, {
      onDelete: "set null",
    }),
    dedupeKey: text("dedupe_key").notNull(),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("jce_dedupe_uk").on(t.programId, t.dedupeKey),
    // Postgres allows many NULLs in a unique index, so imported rows dedupe on
    // the upstream id while diff-detected rows (null) are unconstrained.
    // `field` is part of the key because ONE upstream reschedule log can move
    // the day and the clock time at once, producing two events that share its
    // id — without it the second was silently dropped (189 of 1.683 events).
    uniqueIndex("jce_upstream_uk").on(t.programId, t.upstreamLogId, t.field),
    index("jce_schedule_idx").on(t.programId, t.scheduleDate),
    index("jce_changed_idx").on(t.programId, t.changedAt),
    index("jce_jadwal_idx").on(t.programId, t.tilawahJadwalId),
  ],
);

export const notificationLog = pgTable("notification_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  channel: text("channel").notNull().default("kirimi_wa"),
  recipient: text("recipient").notNull(),
  payload: jsonb("payload").notNull().default({}),
  kirimiMessageId: text("kirimi_message_id"),
  status: text("status").notNull(), // 'queued' | 'sent' | 'failed'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── HKM tilawah monitoring (source = cms.example.com / the partner system) ──────
// A second data pipeline, parallel to the tilawah_* one above, for programs with
// dataSourceType='berkah_api'. The *_sync tables mirror the the partner system API; the two
// non-sync tables (hkm_participants, hkm_daily_snapshots) are app-owned and
// survive the sync overwrite. See lib/sync/hkm-sync.ts + lib/insights/hkm/.

// Participant master — SOURCE OF TRUTH. Imported once from the reconciled roster
// CSV (participants_hkm_master_gabungan.csv, fuzzy-matched registration ↔ the partner system).
// halaqah/pengajar/gender live ONLY here — they are NOT in the the partner system API. Live
// reading data is joined to this table by normalized email.
export const hkmParticipants = pgTable(
  "hkm_participants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    namaPeserta: text("nama_peserta").notNull(),
    namaPengajar: text("nama_pengajar"),
    namaHalaqah: text("nama_halaqah"),
    hkm: text("hkm"), // registration cohort/flag from the master
    gender: text("gender"), // normalized 'Ikhwan' | 'Akhwat'
    usernameNafi: text("username_nafi"),
    emailMaster: text("email_master"), // normalized lower/trim — the join key (nullable: some rows have no email)
    statusEmail: text("status_email"),
    matchMethod: text("match_method"), // provenance: 'exact' | 'auto_fuzzy:0.86' | ...
    confidence: numeric("confidence"),
    berkahUserId: integer("berkah_user_id"), // stamped at sync when email matches a pulled user — durable link
    isCurated: boolean("is_curated").notNull().default(false), // true for hand-curated programs (HITS internal=No)
    active: boolean("active").notNull().default(true),
    // Enrollment status — app-owned, never touched by the sync (see HkmStatus in
    // lib/insights/hkm/status.ts). 'keluar'/'wafat' drop the row from the
    // dashboard entirely; 'cuti' keeps it listed but never flags it as kendala.
    // A participant is not a number: this is why the master survives a sync.
    status: text("status").notNull().default("aktif"), // 'aktif' | 'cuti' | 'keluar' | 'wafat'
    statusNote: text("status_note"), // human reason, shown in the non-aktif list
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    source: text("source"), // 'csv_import' | 'manual' | 'reconciled'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.emailMaster),
    index("hkm_participants_berkah_user_idx").on(t.programId, t.berkahUserId),
  ],
);

export const hkmUsersSync = pgTable(
  "hkm_users_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    berkahUserId: integer("berkah_user_id").notNull(),
    uuid: text("uuid"),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    gender: integer("gender"), // the partner system: 1=L, 2=P
    isInternal: boolean("is_internal"),
    progressKhatam: numeric("progress_khatam"), // API-computed current progress %
    totalKhatam: integer("total_khatam"), // API-computed khatam count (headline source of truth)
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    businessUnitId: integer("business_unit_id"),
    businessUnit: text("business_unit"),
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.programId, t.berkahUserId)],
);

// Per-day reading rows. Sourced from the /api/users/export CSV (the "Download
// CSV" button) — the only source that carries page numbers, which the khatam
// engine needs. Deduped keep-first per (user, date) to match app_hkm.py, so the
// natural key is (programId, berkahUserId, historyDate). Upserted (not
// full-overwrite) so history persists across syncs even if the pull window shrinks.
export const hkmReadingHistorySync = pgTable(
  "hkm_reading_history_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    berkahUserId: integer("berkah_user_id").notNull(),
    berkahHistoryId: integer("berkah_history_id"), // from /api/users/history when available; null for CSV-sourced rows
    targetKhatamKe: integer("target_khatam_ke"),
    historyDate: date("history_date").notNull(),
    email: text("email"), // normalized — CSV rows carry email, not always a user id
    fromSura: integer("from_sura"),
    toSura: integer("to_sura"),
    fromAyah: integer("from_ayah"),
    toAyah: integer("to_ayah"),
    fromJuz: numeric("from_juz"),
    toJuz: numeric("to_juz"),
    fromPage: integer("from_page"), // "Dari Halaman"
    toPage: integer("to_page"), // "Sampai Halaman" — the page reached (khatam detection)
    totalPages: integer("total_pages"), // "Total Halaman" — pages read that day
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.berkahUserId, t.historyDate),
    index("hkm_history_user_date_idx").on(t.programId, t.berkahUserId, t.historyDate),
    index("hkm_history_email_idx").on(t.programId, t.email),
  ],
);

export const hkmTargetsSync = pgTable(
  "hkm_targets_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    berkahTargetId: integer("berkah_target_id").notNull(),
    berkahUserId: integer("berkah_user_id"),
    targetType: text("target_type"), // 'khatam'
    targetDate: date("target_date"),
    targetPerDay: numeric("target_per_day"),
    targetTotal: numeric("target_total"),
    targetDone: numeric("target_done"),
    targetRemaining: numeric("target_remaining"),
    statusLabel: text("status_label"),
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.programId, t.berkahTargetId)],
);

// Daily progress snapshot — SOURCE OF TRUTH, append-only. The the partner system API exposes
// only *current* progress, so trend + period-comparison are built from these
// once-a-day upserts (idempotent per participant per day).
export const hkmDailySnapshots = pgTable(
  "hkm_daily_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => hkmParticipants.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    cumulativePages: numeric("cumulative_pages"),
    cumulativeJuz: numeric("cumulative_juz"),
    totalKhatam: integer("total_khatam"),
    targetPages: numeric("target_pages"),
    category: text("category"), // categorized bucket at snapshot time
    streakDays: integer("streak_days"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.participantId, t.snapshotDate),
    index("hkm_snapshots_program_date_idx").on(t.programId, t.snapshotDate),
  ],
);

/**
 * Setoran records from the Mabni API (`GET /hafalan`), one row per submission.
 *
 * Kept out of `attendance_sync` on purpose: a setoran is not a presence record,
 * it has its own dimension (`metrik`: Tasmi' / Murajaah) and its own upstream id
 * space. `siswaId`/`sesiId` mirror the ids already used by the mabni sync
 * (students_sync.tilawah_user_id and jadwal_sync.tilawah_jadwal_id) so the
 * existing read-model joins without a translation layer.
 *
 * `status` and the ayat columns are stored as they arrive even though upstream
 * currently leaves every status at "dalam_proses" and both ayat fields null —
 * the range is written free-form inside `surat`. Read this table as setoran
 * ACTIVITY, not memorisation progress, until that changes.
 */
export const mabniHafalanSync = pgTable(
  "mabni_hafalan_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    mabniHafalanId: integer("mabni_hafalan_id").notNull(),
    siswaId: integer("siswa_id"), // == students_sync.tilawah_user_id for this program
    sesiId: integer("sesi_id"), // == jadwal_sync.tilawah_jadwal_id for this program
    sesiTanggal: date("sesi_tanggal"),
    metrikId: integer("metrik_id"),
    metrik: text("metrik"), // "Tasmi'" | "Murajaah Qaribah" | "Muraja'ah Baidah"
    surat: text("surat"), // free-form, often carries the ayat range too
    status: text("status"),
    keterangan: text("keterangan"),
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.mabniHafalanId),
    index("mabni_hafalan_program_siswa_idx").on(t.programId, t.siswaId),
    index("mabni_hafalan_program_tanggal_idx").on(t.programId, t.sesiTanggal),
  ],
);

/**
 * Exam marks from the Mabni API (`GET /nilai`), stored as the upstream row.
 *
 * Only `id` and the student link get their own columns. The collection is empty
 * upstream, so its field names are genuinely unknown — inventing columns now
 * would bake in a guess that a later migration has to undo. `raw` keeps every
 * field; promote columns once real rows show what they are. `siswaId` is
 * extracted best-effort (`siswa.id` or `siswa_id`) and stays null when neither
 * shape appears.
 */
export const mabniNilaiSync = pgTable(
  "mabni_nilai_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    mabniNilaiId: integer("mabni_nilai_id").notNull(),
    siswaId: integer("siswa_id"),
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.mabniNilaiId),
    index("mabni_nilai_program_siswa_idx").on(t.programId, t.siswaId),
  ],
);

/**
 * Teacher daily attendance from the Mabni API (`GET /absensi-guru`). One row per
 * (guru, tanggal) upstream. Deliberately NOT linked to a jadwal/halaqah: upstream
 * carries no session or class id, so this is a separate axis from the per-meeting
 * `taught` figure — days a teacher checked in, not meetings held.
 */
export const guruAttendanceSync = pgTable(
  "guru_attendance_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    mabniAbsensiGuruId: integer("mabni_absensi_guru_id").notNull(),
    guruId: integer("guru_id"), // == guru_sync.tilawah_guru_id for this program
    tanggal: date("tanggal"),
    status: text("status"), // hadir | terlambat | izin
    jamMasuk: text("jam_masuk"),
    sudahIzin: boolean("sudah_izin"),
    keterangan: text("keterangan"),
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.mabniAbsensiGuruId),
    index("guru_attendance_program_guru_tgl_idx").on(t.programId, t.guruId, t.tanggal),
  ],
);

// ── Maahir Public API mirror (generic) ────────────────────────────────────
// One raw-faithful mirror for every Maahir entity we ingest (scopes maahir /
// hits / penilaian + person refs). Deliberately NOT modelled after the mabni
// typed tables: Maahir's data is wide (~30 entities) and its display shape is
// still open, so v1 keeps the upstream payload verbatim in `raw` and promotes
// hot entities to typed tables/views when the UI is designed. `entity` is the
// API path (e.g. "hits/pengajar"); `maahirId` is the upstream id (text — ids are
// a mix of uuid and int, and `indikator-standar` keys on `kode`).
export const maahirSync = pgTable(
  "maahir_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(),
    maahirId: text("maahir_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }), // upstream updated_at, when present
    raw: jsonb("raw").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.entity, t.maahirId),
    index("maahir_sync_program_entity_idx").on(t.programId, t.entity),
    index("maahir_sync_program_entity_updated_idx").on(t.programId, t.entity, t.updatedAt),
  ],
);

// Per-entity sync bookkeeping: the ETag to send as If-None-Match next run, the
// high-water `updated_at` for `sejak` incremental pulls, and a `forbidden` flag
// set when the key lacks that entity's scope (so later runs skip it — no wasted
// request). One row per (program, entity).
export const maahirSyncState = pgTable(
  "maahir_sync_state",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(),
    etag: text("etag"),
    highWaterUpdatedAt: timestamp("high_water_updated_at", { withTimezone: true }),
    forbidden: boolean("forbidden").notNull().default(false),
    lastFullAt: timestamp("last_full_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.programId, t.entity)],
);

// Maahir's pre-aggregated `rekap/*` reports, cached one row per
// (program, route, periode, params). Separate from `maahir_sync` because these
// are not entities with an upstream id — they are whole report responses keyed
// by the window they were asked for, and each run overwrites the row for that
// window (last month is re-pulled because late presensi corrections move it).
//   `periode`   — '2026-08' | '2026-07-28..2026-08-27' | '' for cumulative (sp)
//   `paramsKey` — canonicalised gender/program/kelas_id; '' when unparameterised
//   `payload`   — the response's `data` VERBATIM, deliberately not flattened
//                 into columns: the shape belongs to upstream, so fields added
//                 there ride along without a migration here.
//   `meta`      — the response's `meta` (mulai, sampai, basi,
//                 snapshot_terakhir, dari_cache) — kept to show staleness.
export const maahirRekap = pgTable(
  "maahir_rekap",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    route: text("route").notNull(),
    periode: text("periode").notNull(),
    paramsKey: text("params_key").notNull(),
    payload: jsonb("payload").notNull().default({}),
    meta: jsonb("meta").notNull().default({}),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.programId, t.route, t.periode, t.paramsKey),
    index("maahir_rekap_program_route_periode_idx").on(t.programId, t.route, t.periode),
  ],
);

// ── Scorecard Review (CAT + OYP) ──────────────────────────────────────────
// The Balanced-Scorecard review, ported from the coordinator's
// `CAT, OYP & Weekly Review` spreadsheet. App-owned — nothing here is
// overwritten by a sync; the numbers that DO come from a sync are pulled in
// per line item (see `metricKind` below) and stored. Data flows BOTTOM-UP:
//   scorecard_workbook_items  (per-batch/program line items, the editable data)
//     └─ group by (kpi, status) → OYP KPI ach/outlook
//        └─ roll up by catCode → CAT scorecard.
// See lib/scorecard/rollup.ts for the aggregation and lib/scorecard/queries.ts
// for the read model.

// A review period: a quarter OR a month (`kind`). `startDate`/`endDate` are
// stored rather than derived because every metric query needs them and a closed
// period must keep the window its numbers were computed with.
export const scorecardPeriods = pgTable(
  "scorecard_periods",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    label: text("label").notNull(), // display, e.g. "Q1 2026" / "Agustus 2026"
    kind: text("kind").notNull().default("quarter"), // 'quarter' | 'month'
    year: integer("year").notNull(),
    seq: integer("seq").notNull(), // 1..4 for a quarter, 1..12 for a month
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    active: boolean("active").notNull().default(false), // the default period the /scorecard page opens on
    // Non-null = frozen: the auto-refresh skips it entirely, so a closed
    // period's numbers cannot drift when upstream backfills history.
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.kind, t.year, t.seq)],
);

// One row per KPI, across BOTH levels of the scorecard:
//   subdivision='cat'          → a row from the top-level "Scorecard Review CAT"
//                                sheet; its ach/outlook are stored as seeded
//                                (CAT is its own manual scorecard, not a numeric
//                                sum of the OYP KPIs — different KPI sets).
//   subdivision in hits|kba|maahir|dpq → an OYP KPI; its ach/outlook are
//                                COMPUTED from scorecard_workbook_items and the
//                                seeded columns act only as a fallback.
// A CAT row's achievement is rolled up from the OYP rows carrying the same
// `catCode` (excluding those with countsTowardCat=false); `achSeed` stays as
// the spreadsheet's own figure so the two can be compared.
export const scorecardKpis = pgTable(
  "scorecard_kpis",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    periodId: uuid("period_id")
      .notNull()
      .references(() => scorecardPeriods.id, { onDelete: "cascade" }),
    // 'financial' | 'customer' | 'ibp' | 'learning' — the BSC perspective band.
    perspective: text("perspective").notNull(),
    // 'cat' | 'hits' | 'kba' | 'maahir' | 'dpq'
    subdivision: text("subdivision").notNull(),
    catCode: text("cat_code"), // e.g. "C11" — the parent CAT KPI (KPI CAT column)
    oypCode: text("oyp_code"), // e.g. "C111" — the OYP KPI code (KPI OYP column). NB: reused across subdivisions, so never a key on its own.
    catName: text("cat_name"), // strategy objective / KPI-CAT label (columns B/D on CAT sheet)
    name: text("name").notNull(), // the KPI display name (column D)
    uom: text("uom"), // '#' | '%' | 'Jam/Minggu'
    target: numeric("target"), // full-year target (column F)
    weight: numeric("weight"), // 0..1 (column G; sheet sometimes wrote "7,5%")
    targetPeriod: numeric("target_period"), // this period's target (column H on the sheet, "TGT Q1")
    achSeed: numeric("ach_seed"), // the spreadsheet's own achievement (column I) — reference + fallback
    outlookSeed: numeric("outlook_seed"), // seeded full-year outlook (column K)
    problem: text("problem"), // problem identification (column M)
    corrective: text("corrective"), // corrective action (column N)
    pic: text("pic"), // column O
    // false = excluded from its CAT parent's rollup. Needed because the sheet
    // has mirror rows (oypCode == catCode, holding the same total as its own
    // children) and codes reused across subdivisions for the same population.
    countsTowardCat: boolean("counts_toward_cat").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("scorecard_kpis_period_sub_idx").on(t.periodId, t.subdivision),
    index("scorecard_kpis_period_cat_idx").on(t.periodId, t.catCode),
  ],
);

// The editable source-of-truth line items (the "Workbook" sheets). Each row is a
// batch/program breakdown that contributes its `kuantitas` to the parent OYP KPI
// when `status='achieved'` (or to the outlook when `status='outlook'`).
export const scorecardWorkbookItems = pgTable(
  "scorecard_workbook_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kpiId: uuid("kpi_id")
      .notNull()
      .references(() => scorecardKpis.id, { onDelete: "cascade" }),
    deskripsi: text("deskripsi"), // the KPI description repeated on the workbook (column C)
    detail: text("detail"), // the batch/program label (column D), e.g. "Batch September 2025"
    kuantitas: numeric("kuantitas"), // the contributing number (numerator when the KPI is a '%')
    pembagi: numeric("pembagi"), // denominator, '%' KPIs only — KPI% = Σkuantitas / Σpembagi
    hours: numeric("hours"), // teacher-hours column on Workbook KBA; annotation only, never summed
    status: text("status").notNull().default("achieved"), // 'achieved' | 'outlook'
    sumber: text("sumber"), // provenance note / URL (column H)
    // 'manual' — typed by hand; 'auto' — filled from a synced source described
    // by metricKind + metricParams (see lib/scorecard/metrics/).
    origin: text("origin").notNull().default("manual"),
    metricKind: text("metric_kind"), // null when manual
    metricParams: jsonb("metric_params").notNull().default({}), // program slug, batch, gender/type/level filters…
    // The last computed value is kept apart from `kuantitas` so the UI can show
    // "otomatis 512 · kamu isi 480" and a locked row can keep its override.
    autoValue: numeric("auto_value"),
    autoPembagi: numeric("auto_pembagi"),
    locked: boolean("locked").notNull().default(false), // true = refresh updates auto_* but not kuantitas
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
    refreshError: text("refresh_error"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scorecard_workbook_kpi_idx").on(t.kpiId)],
);

// ── Board Screen (/tv) ─────────────────────────────────────────────────
// The public TV board reads attendance straight from the sync tables; only the
// human-written parts live here: which division a staff member speaks for, the
// curated weekly news, and the rotating quotes.

// Which divisions a staff member speaks for. Mirrors staff_programs, but keyed
// on a division name rather than a program row — the news contributors (Zakat,
// Kaderisasi) have no program in this dashboard at all. `role` is scoped to the
// news flow: 'contributor' submits, 'curator' approves. A super_coordinator
// bypasses both regardless of rows here.
export const staffDivisions = pgTable(
  "staff_divisions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    division: text("division").notNull(), // see lib/tv/divisions.ts
    role: text("role").notNull().default("contributor"), // 'contributor' | 'curator'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.staffId, t.division)],
);

// One curated kabar shown on /tv for a single Jumat→Kamis week.
//
// `weekStart` (the Jumat) is stored rather than a publish-from/until range: the
// agreed cadence is exactly "the running week", so the board's predicate is one
// indexed equality and "what did we show in week X" stays answerable forever.
export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    division: text("division").notNull(),
    weekStart: date("week_start").notNull(), // the Jumat of the target week
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Free text on purpose: batch program rows get re-seeded, a kabar is a
    // permanent record and must not cascade with them.
    programSlug: text("program_slug"),
    status: text("status").notNull().default("submitted"), // draft|submitted|approved|rejected
    pinned: boolean("pinned").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    submittedBy: uuid("submitted_by").references(() => staff.id, { onDelete: "set null" }),
    submittedByName: text("submitted_by_name"), // snapshot; the staff row may be deleted later
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => staff.id, { onDelete: "set null" }),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("news_items_week_status_idx").on(t.weekStart, t.status),
    index("news_items_division_week_idx").on(t.division, t.weekStart),
  ],
);

// The reminder line under the visi on /tv. Small editable list; one is shown per
// rotation, so the board never reads the same twice in a row.
export const tvQuotes = pgTable(
  "tv_quotes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    text: text("text").notNull(),
    arabic: text("arabic"), // optional Arabic line, rendered in Amiri above the translation
    source: text("source"), // "HR. Bukhari", "QS. Al-Mujadilah: 11", …
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tv_quotes_active_idx").on(t.active, t.sortOrder)],
);

// ── Rekap kehadiran mengajar (/rekap) ───────────────────────────────────

// Free-text note a teacher writes on the monthly recap page ("kalau data tidak
// sesuai, infokan"). App-owned — survives the sync overwrite. Teacher-level, not
// meeting-level: the per-meeting answers live in teacher_meeting_confirmations,
// this is what does not fit in any of them.
//
// Append-only on purpose — no unique key on (guru_id, period_start), so a
// teacher may send several notes for the same period. A correction sent an hour
// later must sit next to the first report, not overwrite it; the coordinator
// reads the whole thread and decides.
export const recapConfirmationNotes = pgTable(
  "recap_confirmation_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    guruId: integer("guru_id").notNull(), // tilawah user id — stable across programs
    guruName: text("guru_name"), // snapshot; the guru_sync row is re-seeded every sync
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    note: text("note").notNull(),
    confirmedByPhone: text("confirmed_by_phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recap_notes_guru_period_idx").on(t.guruId, t.periodStart)],
);

/**
 * A teacher's sign-off on their whole monthly recap, written when they submit
 * /rekap/<token>. Distinct from teacher_meeting_confirmations, which answers ONE
 * meeting: the coordinator's question on the report page is "has this person
 * looked at their recap and said it is right?", and the absence of per-meeting
 * answers cannot distinguish "recap was already correct, nothing to answer" from
 * "never opened the link".
 *
 * `verdict` is 'tepat' when the teacher confirmed with no dispute and no note,
 * 'ada_koreksi' when they flagged a meeting as data_tidak_sesuai or wrote a note
 * — that is the follow-up queue. Counts are a snapshot at submit time so a later
 * sync changing the numbers cannot rewrite what the teacher actually saw.
 * One row per teacher per period; re-submitting updates it.
 */
export const recapAttestations = pgTable(
  "recap_attestations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    guruId: integer("guru_id").notNull(), // tilawah user id — stable across programs
    guruName: text("guru_name"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    verdict: text("verdict").notNull(), // 'tepat' | 'ada_koreksi'
    meetingsTotal: integer("meetings_total"),
    meetingsTaught: integer("meetings_taught"),
    meetingsGap: integer("meetings_gap"),
    answered: integer("answered"), // gap meetings answered in this submission
    disputed: integer("disputed"), // taught meetings flagged data_tidak_sesuai
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when a coordinator has acted on the teacher's correction — moved the
    // halaqah, added the missing meeting, decided nothing was wrong. Without it
    // a handled complaint keeps shouting "Ada koreksi" next to a row that is now
    // fine, and the list stops meaning anything.
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"), // coordinator email
  },
  (t) => [
    unique().on(t.guruId, t.periodStart, t.periodEnd),
    index("recap_attest_period_idx").on(t.periodStart, t.periodEnd),
  ],
);

/**
 * Shared-password gate for pages that are public in the sense that no staff
 * account exists for the viewer, but should not be world-readable either.
 *
 * One row per page slug ('countdown' today). The password is shared by everyone
 * who opens the page — there is no per-viewer identity, so nothing here can be
 * used for attribution. Stored as a bcrypt hash for the same reason staff
 * passwords are: a leaked dump should not hand over the live password.
 *
 * Rotate with `pnpm set:page-password countdown '<new password>'`.
 */
export const pagePasswords = pgTable("page_passwords", {
  slug: text("slug").primaryKey(), // 'countdown'
  passwordHash: text("password_hash").notNull(),
  label: text("label"), // human note: what this password opens
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"), // coordinator email or 'cli'
});

/**
 * Board Directives — the standing directives shown on the /arahan wall board and
 * maintained through /arahan/isi. Both routes are open (no staff session, no
 * shared password), so nothing here may hold PII: `pic` and `stakeholders` are
 * role or team labels ("Tim Program", "Board Chair"), not personal records.
 *
 * `requestedAt` is a date, not a timestamp: usia arahan is counted in whole
 * Asia/Jakarta days and a time component would only invite off-by-one drift.
 *
 * `checkpointUpdatedAt` is the age of the *progress note*, which the board
 * scores separately from the age of the directive itself — an arahan can be new
 * and already stale, or old but actively moving. It is only stamped when the
 * checkpoint text actually changes; touching any other field must not reset it,
 * otherwise "diperbarui 2 hari lalu" stops meaning anything.
 */
export const directives = pgTable(
  "directives",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    source: text("source").notNull(), // 'Dewan' | 'Board Chair' | 'Internal' | free text
    pic: text("pic").notNull(), // team or role label
    stakeholders: jsonb("stakeholders").notNull().default(sql`'[]'::jsonb`), // string[]
    requestedAt: date("requested_at").notNull(),
    checkpoint: text("checkpoint"),
    checkpointUpdatedAt: timestamp("checkpoint_updated_at", { withTimezone: true }),
    status: text("status").notNull().default("aktif"), // 'aktif' | 'selesai'
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("directives_status_requested_idx").on(t.status, t.requestedAt)],
);

/**
 * Fokus pekanan tiap program — halaman kedua rotasi /arahan, sesudah arahan
 * Dewan. Satu baris per (pekan, program). `weekStart` selalu hari Senin
 * (kalender Jakarta); "Pekan ke-N" dan rentang tanggalnya dihitung dari situ
 * di lib/arahan/program.ts, bukan disimpan. Sama terbukanya dengan `directives`:
 * isinya kalimat kerja, bukan data pribadi.
 */
export const programTasks = pgTable(
  "program_tasks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    weekStart: date("week_start").notNull(),
    program: text("program").notNull(),
    task: text("task").notNull(),
    urutan: integer("urutan").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("program_tasks_week_program_uq").on(t.weekStart, t.program)],
);

// ── Acara: administrasi kepanitiaan ──────────────────────────────────────
// Rancangan: docs/superpowers/specs/2026-09-10-modul-acara-design.md
//
// Dua keputusan yang membentuk seluruh blok ini:
//  1. Tidak ada kolom turunan. total_harga (jumlah × harga_satuan), total_hari
//     (tanggal_akhir − tanggal_mulai) dan status "terlambat" dihitung di
//     lib/acara/view-model.ts. Di berkas the institute 2 kolom total sering tidak
//     sinkron dengan harga × jumlah — kolom turunan yang disimpan adalah kolom
//     yang bisa salah.
//  2. RAB dan rekap barang BUKAN tabel. Keduanya query di atas acara_barang.
//     Berkas the institute 2 mengetik barang yang sama di tiga sheet dan angkanya sudah
//     menyimpang (parfum peserta: 3 pcs disetujui vs 2 pcs tidak disetujui).
//
// Kosakata status disimpan sebagai text + komentar, bukan pg enum — mengikuti
// staff.role dan programs.data_source_type. Divisi adalah baris, bukan enum:
// struktur kepanitiaan berubah tiap acara dan peran lahir saat pelaksanaan.

export const acara = pgTable("acara", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(), // 'kajian-lipia-3'
  nama: text("nama").notNull(),
  judul: text("judul"), // nullable: tanggal diumumkan sebelum judul fix
  pemateri: text("pemateri"),
  penyelenggara: text("penyelenggara").notNull().default("Education Board"),
  tanggal: date("tanggal").notNull(),
  lokasi: text("lokasi"),
  alamat: text("alamat"),
  status: text("status").notNull().default("draft"), // 'draft' | 'persiapan' | 'berlangsung' | 'selesai'
  // Menyambungkan acara ini ke evaluasi acara sebelumnya (tab Warisan).
  acaraSebelumnyaId: uuid("acara_sebelumnya_id").references((): AnyPgColumn => acara.id),
  // Presensi QR. Terlambat = waktu scan > jam_mulai + toleransi_menit (dihitung, tidak disimpan).
  jamMulai: time("jam_mulai"),
  toleransiMenit: integer("toleransi_menit").notNull().default(15),
  // Jendela scan; null = tanpa batas. Jam server yang menentukan, klien hanya menolak lebih dulu.
  scanBukaAt: timestamp("scan_buka_at", { withTimezone: true }),
  scanTutupAt: timestamp("scan_tutup_at", { withTimezone: true }),
  // Halaman /daftar/[slug] hanya terbuka bila true.
  terimaPendaftaran: boolean("terima_pendaftaran").notNull().default(false),
  // Tema/kitab pembahasan sesi (diisi panitia; tidak ada di berkas impor).
  tema: text("tema"),
  // Pengelompok sesi yang sebanding: 'kajian-rumah-belajar', 'kajian-pengajar',
  // 'kajian-lipia-nawa'. bandingSesi() hanya membandingkan dalam satu seri.
  seri: text("seri"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const acaraDivisi = pgTable(
  "acara_divisi",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    kode: text("kode").notNull(), // 'registrasi', 'panjam', 'lo'
    nama: text("nama").notNull(), // 'Registrasi dan Administrasi'
    sisi: text("sisi").notNull(), // 'ikhwan' | 'akhwat' | 'bersama'
    // Divisi ikhwan menunjuk pasangan akhwatnya (dan sebaliknya). Menutup
    // keluhan evaluasi the institute 2: "tidak ada komunikasi antar PIC Ikhwan dan Akhwat".
    pasanganDivisiId: uuid("pasangan_divisi_id").references((): AnyPgColumn => acaraDivisi.id, { onDelete: "set null" }),
    urutan: integer("urutan").notNull().default(0),
    warna: text("warna"),
    // Ikut ditandatangani ke dalam token divisi. Menaikkan angka ini mematikan
    // seluruh tautan lama divisi itu — satu kolom, satu tombol, tanpa daftar hitam.
    tokenVersi: integer("token_versi").notNull().default(1),
    waGrup: text("wa_grup"), // id grup WhatsApp untuk pengingat; null = tidak ada grup
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("acara_divisi_kode_uk").on(t.acaraId, t.kode, t.sisi)],
);

export const acaraPanitia = pgTable(
  "acara_panitia",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    divisiId: uuid("divisi_id").references(() => acaraDivisi.id), // null untuk ketua/pengawas
    // Sebagian besar panitia tidak akan pernah punya akun; hanya pemegang akun
    // staff yang terisi di sini.
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    nama: text("nama").notNull(),
    gelar: text("gelar"), // 'Ustadz', 'Mas'
    gender: text("gender").notNull(), // 'L' | 'P'
    wa: text("wa"), // dinormalkan 62…; tidak pernah masuk log
    // Orang di Daftar Individu (Div. Kaderisasi). Diisi otomatis dari WA / nama
    // (lib/orang/tautan-panitia.ts) supaya kepanitiaan & penilaian masuk CV.
    orangId: uuid("orang_id").references((): AnyPgColumn => orang.id, { onDelete: "set null" }),
    peran: text("peran").notNull().default("anggota"), // 'pengawas' | 'ketua' | 'koordinator' | 'pic' | 'anggota' | 'bendahara' | 'sekretaris'
    kodePos: text("kode_pos"), // posisi hari-H: 'IKH-1', 'SAP-A1'
    status: text("status").notNull().default("calon"), // 'calon' | 'dihubungi' | 'terkonfirmasi' | 'aktif' | 'mundur' | 'cadangan'
    bisaTm: boolean("bisa_tm"),
    bisaGladi: boolean("bisa_gladi"),
    punyaPowerbank: boolean("punya_powerbank"),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("acara_panitia_divisi_idx").on(t.acaraId, t.divisiId)],
);

// Satu poin jobdesk = satu baris, supaya satu poin bisa menjadi satu tugas
// dengan sekali klik, dan poin yang tidak pernah jadi tugas terlihat sebagai lubang.
export const acaraJobdesk = pgTable(
  "acara_jobdesk",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    divisiId: uuid("divisi_id").notNull().references(() => acaraDivisi.id, { onDelete: "cascade" }),
    urutan: integer("urutan").notNull(),
    isi: text("isi").notNull(),
    berlakuUntuk: text("berlaku_untuk").notNull().default("divisi"), // 'divisi' | 'pic' | 'anggota'
    dariAcaraId: uuid("dari_acara_id").references(() => acara.id), // disalin dari acara sebelumnya
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("acara_jobdesk_divisi_idx").on(t.divisiId)],
);

export const acaraTimeline = pgTable("acara_timeline", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  acaraId: uuid("acara_id").notNull().references(() => acara.id),
  nomor: integer("nomor").notNull(),
  judul: text("judul").notNull(),
  pelaksana: text("pelaksana"), // 'Ketua', atau nama divisi
  divisiId: uuid("divisi_id").references(() => acaraDivisi.id),
  tanggalMulai: date("tanggal_mulai").notNull(),
  tanggalAkhir: date("tanggal_akhir").notNull(),
  persentase: integer("persentase").notNull().default(0), // 0–100
  catatan: text("catatan"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const acaraTugas = pgTable(
  "acara_tugas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    divisiId: uuid("divisi_id").references(() => acaraDivisi.id), // null = lintas divisi
    fase: integer("fase").notNull().default(1),
    judul: text("judul").notNull(),
    deskripsi: text("deskripsi"),
    prioritas: text("prioritas").notNull().default("sedang"), // 'rendah' | 'sedang' | 'tinggi'
    // 'terlambat' BUKAN status tersimpan: tenggat < hari ini AND status NOT IN
    // ('selesai','disetujui'), dihitung di view-model. Status tersimpan yang
    // bisa basi akan basi.
    status: text("status").notNull().default("belum_mulai"), // 'belum_mulai' | 'berjalan' | 'selesai' | 'perlu_tinjau' | 'disetujui' | 'ditahan'
    ditugaskanKe: text("ditugaskan_ke"), // nama bebas: the institute 2 menulis "Ke Bag. Humas"
    panitiaId: uuid("panitia_id").references(() => acaraPanitia.id),
    tenggat: date("tenggat"),
    selesaiAt: timestamp("selesai_at", { withTimezone: true }),
    dariJobdeskId: uuid("dari_jobdesk_id").references(() => acaraJobdesk.id),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("acara_tugas_divisi_status_idx").on(t.acaraId, t.divisiId, t.status),
    index("acara_tugas_tenggat_idx").on(t.acaraId, t.tenggat),
  ],
);

// Tabel terpenting di modul ini. Satu baris per barang; RAB, rekap, dan daftar
// pengembalian adalah tampilan di atasnya.
export const acaraBarang = pgTable(
  "acara_barang",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    divisiId: uuid("divisi_id").notNull().references(() => acaraDivisi.id), // siapa yang mengajukan
    nama: text("nama").notNull(),
    jumlah: numeric("jumlah", { precision: 10, scale: 2 }),
    satuan: text("satuan"), // 'pcs' | 'unit' | 'meter' | 'dus' | 'orang'
    hargaSatuan: numeric("harga_satuan", { precision: 12, scale: 2 }),
    kriteria: text("kriteria"), // 'harus_kembali' | 'boleh_habis'
    // 'disediakan_venue': diminta ke pengelola tempat, tidak masuk RAB tetapi
    // tetap dilacak — kalau pihak masjid tidak menyediakannya, tidak ada yang membelinya.
    sumber: text("sumber"), // 'beli' | 'pinjam' | 'pinjam_rb' | 'disediakan_venue' | 'sudah_ada'
    // UNTUK SIAPA barangnya, bukan siapa yang mengajukan. Empat sheet the institute 2
    // (Ustadz Dan Keluarga, Perlengkapan Panitia/Peserta/Internal) adalah
    // peruntukan, bukan divisi.
    peruntukan: text("peruntukan").notNull().default("divisi"), // 'divisi' | 'ustadz_keluarga' | 'panitia' | 'peserta' | 'internal'
    // Hanya akun staff yang boleh mengubah tiga kolom approval ini; pemegang
    // token divisi hanya mengajukan. Setiap perubahan dicatat di acara_log.
    statusApproval: text("status_approval").notNull().default("diajukan"), // 'diajukan' | 'disetujui' | 'ditolak'
    approvalOlehStaffId: uuid("approval_oleh_staff_id").references(() => staff.id, { onDelete: "set null" }),
    approvalAt: timestamp("approval_at", { withTimezone: true }),
    alasanTolak: text("alasan_tolak"),
    statusKetersediaan: text("status_ketersediaan").notNull().default("belum"), // 'belum' | 'ada' | 'tidak_ada'
    waktuAmbil: timestamp("waktu_ambil", { withTimezone: true }),
    waktuKembali: timestamp("waktu_kembali", { withTimezone: true }),
    sudahKembali: boolean("sudah_kembali").notNull().default(false),
    pertanyaan: text("pertanyaan"), // the institute 2: "Berapa mili/botol (ke Ustadz Adit)"
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("acara_barang_divisi_idx").on(t.acaraId, t.divisiId),
    index("acara_barang_approval_idx").on(t.acaraId, t.statusApproval),
    index("acara_barang_kembali_idx").on(t.acaraId, t.kriteria, t.sudahKembali),
  ],
);

export const acaraEvaluasi = pgTable("acara_evaluasi", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  acaraId: uuid("acara_id").notNull().references(() => acara.id),
  divisiId: uuid("divisi_id").references(() => acaraDivisi.id),
  // Evaluasi the institute 2 menyebut "Korlap" dan "Kegiatan" yang tidak ada di struktur.
  // Peran lahir saat pelaksanaan; jangan menolak baris yang divisinya tidak cocok.
  divisiTeks: text("divisi_teks"),
  jenis: text("jenis").notNull(), // 'umum' | 'khusus'
  issue: text("issue").notNull(),
  poinPengembangan: text("poin_pengembangan"),
  solusi: text("solusi"),
  ditindaklanjutiDi: uuid("ditindaklanjuti_di").references(() => acara.id), // acara berikutnya
  tindakLanjutTugasId: uuid("tindak_lanjut_tugas_id").references(() => acaraTugas.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const acaraNotulen = pgTable("acara_notulen", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  acaraId: uuid("acara_id").notNull().references(() => acara.id),
  judul: text("judul").notNull(), // 'Meeting #3', 'Exit Briefing'
  waktu: timestamp("waktu", { withTimezone: true }).notNull(),
  tempat: text("tempat"),
  sisi: text("sisi"), // 'ikhwan' | 'akhwat' | 'bersama'
  isi: text("isi").notNull(), // markdown
  hadir: text("hadir"), // daftar nama, teks bebas
  dibuatOlehPanitiaId: uuid("dibuat_oleh_panitia_id").references(() => acaraPanitia.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Menyimpan status dan tautan dokumen, BUKAN berkasnya. Yang bernilai: melihat
// dokumen mana yang macet di tahap mana (broadcast the institute 2 lewat 4 revisi).
export const acaraDokumen = pgTable("acara_dokumen", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  acaraId: uuid("acara_id").notNull().references(() => acara.id),
  divisiId: uuid("divisi_id").references(() => acaraDivisi.id), // pemilik dokumen
  jenis: text("jenis").notNull(), // 'surat' | 'tatib' | 'broadcast' | 'poster' | 'denah' | 'imbauan' | 'faq' | 'feedback' | 'laporan' | 'survei' | 'lain'
  judul: text("judul").notNull(),
  versi: integer("versi").notNull().default(1),
  status: text("status").notNull().default("draft"), // 'draft' | 'revisi' | 'menunggu_persetujuan' | 'disetujui' | 'disebar' | 'batal'
  penyetuju: text("penyetuju"), // teks bebas: 'ketua', 'ustadzuna', 'majelis-pendidikan'
  disetujuiAt: timestamp("disetujui_at", { withTimezone: true }),
  tautan: text("tautan"), // URL Drive/Docs
  isi: text("isi"), // markdown, untuk dokumen yang ditulis di sini
  // Tata Tertib ada dua: sebelum kegiatan dan ketika kegiatan. Jangan paksa jadi satu.
  berlakuUntuk: text("berlaku_untuk"), // 'sebelum' | 'saat' | 'sesudah'
  catatan: text("catatan"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Persetujuan ke LUAR kepanitiaan (Education Board, Tilawa Labs, DKM) — terpisah
// dari persetujuan barang oleh staff, supaya "disetujui" tidak berarti dua hal.
// the institute 2 tidak pernah membuat Form Approval; tenggat di sini masuk pengingat H-7.
export const acaraPengajuan = pgTable("acara_pengajuan", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  acaraId: uuid("acara_id").notNull().references(() => acara.id),
  jenis: text("jenis").notNull(), // 'approval_majelis' | 'anggaran_tilawa' | 'izin_venue' | 'peminjaman' | 'lain'
  judul: text("judul").notNull(),
  kepada: text("kepada").notNull(), // 'Education Board', 'Tilawa Labs Pendidikan', 'DKM Al-Kautsar'
  nilai: numeric("nilai", { precision: 14, scale: 2 }),
  status: text("status").notNull().default("disiapkan"), // 'disiapkan' | 'diajukan' | 'ditanya_balik' | 'disetujui' | 'ditolak'
  diajukanAt: timestamp("diajukan_at", { withTimezone: true }),
  diputusAt: timestamp("diputus_at", { withTimezone: true }),
  tenggat: date("tenggat"),
  dokumenId: uuid("dokumen_id").references(() => acaraDokumen.id),
  catatan: text("catatan"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Satu tabel audit untuk dua kebutuhan: jejak akses tautan bertoken (kalau
// tautan bocor, jejaknya ada) dan jejak perubahan approval barang (siapa,
// kapan, dari apa ke apa). Persis salah satu dari divisi_id / staff_id harus
// terisi — ditegakkan di lib/acara/access.ts, bukan oleh CHECK (repo tidak
// memakai check constraint).
export const acaraLog = pgTable(
  "acara_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    divisiId: uuid("divisi_id").references(() => acaraDivisi.id, { onDelete: "set null" }), // lewat token divisi
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }), // lewat akun
    aksi: text("aksi").notNull(), // 'buka' | 'ubah' | 'approval'
    objekTabel: text("objek_tabel"), // 'acara_tugas' | 'acara_barang' | …
    objekId: uuid("objek_id"),
    dari: jsonb("dari"),
    ke: jsonb("ke"),
    ipHash: text("ip_hash"), // sha256(ip + AUTH_SECRET); IP mentah tidak disimpan
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("acara_log_acara_idx").on(t.acaraId, t.createdAt),
    index("acara_log_objek_idx").on(t.objekTabel, t.objekId),
  ],
);

// Mencegah pengingat ganda. Agen yang berjalan tiap jam tanpa ini mengirim pesan
// yang sama dua belas kali sehari dan seluruh grup membisukan notifikasi.
// kunci: '2026-09-14:tugas_terlambat:panitia:<id>' atau '…:divisi:<id>'.
export const acaraReminderLog = pgTable(
  "acara_reminder_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    kunci: text("kunci").notNull(),
    target: text("target").notNull(), // 'orang' | 'grup'
    penerimaWa: text("penerima_wa"),
    jenis: text("jenis").notNull(),
    dikirimAt: timestamp("dikirim_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("acara_reminder_kunci_uk").on(t.acaraId, t.kunci)],
);

// Tarikan terakhir data peserta dari situs registrasi (GET /api/export).
// Disimpan di DB, bukan memori proses, supaya "situs registrasi mati → halaman
// tetap menampilkan tarikan terakhir" bertahan lintas restart.
export const acaraPesertaCache = pgTable("acara_peserta_cache", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  acaraId: uuid("acara_id").notNull().unique().references(() => acara.id),
  ditarikAt: timestamp("ditarik_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull(),
  galatTerakhir: text("galat_terakhir"),
  galatAt: timestamp("galat_at", { withTimezone: true }),
});

// ── Presensi QR kajian (rancangan: docs/superpowers/specs/2026-09-11-presensi-qr-design.md)
//
// `orang` adalah tabel orang pertama di repo ini: identitas lintas program dan
// lintas acara, dipegang oleh satu kode QR yang tidak pernah berubah (dicetak,
// diunggah ke Drive, dibawa ke setiap kajian). Nomor HP boleh kosong — 59 dari
// 173 pengajar di form 3 Sep 2026 tidak dikenal DB mana pun — tapi kalau ada,
// unik: WA adalah kunci pencocokan saat impor dan saat daftar sendiri.

export const orang = pgTable(
  "orang",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nama: text("nama").notNull(),
    // Bentuk banding: huruf kecil, tanpa gelar, ejaan disamakan (lib/hadir/nama.ts).
    namaKunci: text("nama_kunci").notNull(),
    gender: text("gender").notNull(), // 'L' | 'P'
    wa: text("wa"), // 62…, dinormalkan lib/wa.ts; null = belum diketahui
    email: text("email"),
    programTeks: text("program_teks"), // deklarasi diri: 'Pengajar HITS', 'Pengurus Education Board'
    // Atribut the institute (berkas Pendataan Board Ta'dzhim & Form Kehadiran Rumah
    // Belajar). Kosong untuk pengajar non-the institute — diterima pemilik.
    // `mustawa` text, bukan integer: nilainya mencakup 'khirij' dan 'lainnya'.
    qism: text("qism"), // 'Syariah' | "I'dad" | 'Lughoh' | 'Idary' | 'Lainnya'
    // qism ini hasil pencocokan nama, bukan deklarasi orangnya sendiri. Rekap
    // memakainya untuk memberi tahu berapa banyak angka prodi yang bersumber tebakan.
    qismTaksiran: boolean("qism_taksiran").notNull().default(false),
    mustawa: text("mustawa"),
    fatroh: text("fatroh"), // 'Shobahi' | "Masa'i"
    asalSekolah: text("asal_sekolah"),
    programMp: text("program_mp"), // "Dauroh Ta'shil" | 'Maahir' | 'Takhosus' | 'Tidak Ada'
    kategori: text("kategori").notNull().default("pengajar"), // 'pengajar' | 'pengurus' | 'umum'
    // Isi QR. 10 huruf dari alfabet tanpa huruf ambigu (tanpa 0/O/1/I/L).
    kodeQr: text("kode_qr").notNull(),
    sumber: text("sumber").notNull().default("dashboard"), // 'impor_xlsx' | 'guru_sync' | 'situs' | 'dashboard'
    perluReview: boolean("perlu_review").notNull().default(false),
    // Duplikat yang sudah digabung menunjuk ke baris kanonik; kode lama tetap dikenali.
    gabungKeId: uuid("gabung_ke_id").references((): AnyPgColumn => orang.id, { onDelete: "set null" }),
    status: text("status").notNull().default("aktif"), // 'aktif' | 'nonaktif'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orang_kode_qr_unik").on(t.kodeQr),
    uniqueIndex("orang_wa_unik").on(t.wa).where(sql`${t.wa} is not null`),
    index("orang_nama_kunci_idx").on(t.namaKunci),
  ],
);

// RSVP per kajian ("InsyaAllah, bisa" / "Belum bisa"), dari impor form atau situs daftar.
export const acaraPendaftaran = pgTable(
  "acara_pendaftaran",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    orangId: uuid("orang_id").notNull().references(() => orang.id),
    konfirmasi: text("konfirmasi"), // 'bisa' | 'belum_bisa' | null (belum menjawab)
    alasan: text("alasan"),
    sumber: text("sumber").notNull().default("dashboard"), // 'impor_xlsx' | 'situs' | 'dashboard'
    dijawabAt: timestamp("dijawab_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("acara_pendaftaran_orang_unik").on(t.acaraId, t.orangId)],
);

// Satu baris = satu orang hadir di satu acara. Unik (acara, orang): scan pertama
// menang, scan berikutnya dijawab "sudah hadir", bukan galat dan bukan baris kedua.
// `terlambat` TIDAK disimpan — dihitung dari acara.jam_mulai + toleransi_menit.
export const acaraHadir = pgTable(
  "acara_hadir",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id").notNull().references(() => acara.id),
    orangId: uuid("orang_id").notNull().references(() => orang.id),
    // Jam di perangkat pemindai; berbeda dari diterima_at hanya saat antrean offline terkirim belakangan.
    waktu: timestamp("waktu", { withTimezone: true }).notNull(),
    diterimaAt: timestamp("diterima_at", { withTimezone: true }).notNull().defaultNow(),
    metode: text("metode").notNull().default("qr"), // 'qr' | 'cari_nama' | 'manual'
    perangkatId: text("perangkat_id"),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    // Id acak yang dibuat klien per kejadian scan; kunci idempotensi saat antrean dikirim ulang.
    klienId: text("klien_id"),
    catatan: text("catatan"),
  },
  (t) => [
    uniqueIndex("acara_hadir_orang_unik").on(t.acaraId, t.orangId),
    index("acara_hadir_waktu_idx").on(t.acaraId, t.waktu),
  ],
);

// ── Ringkasan kajian (HITS Ortu ABK) ──────────────────────────────────────
// Ceklis harian setoran ringkasan kajian Riyadus Shalihin. Hidup hanya di DB
// dashboard. Identitas peserta = tilawah_user_id, BUKAN nama: roster memuat
// "Sri Maryati" dan "Maryati" yang berbeda orang.

export const ringkasanPeserta = pgTable(
  "ringkasan_peserta",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    tilawahUserId: integer("tilawah_user_id").notNull(),
    mulai: date("mulai").notNull(),
    // null = masih aktif. Aktif lagi = selesai := null di baris yang sama, jadi
    // jeda nonaktif ikut terhitung hari berlaku (diterima, kasus jarang).
    selesai: date("selesai"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("ringkasan_peserta_program_user_unique").on(t.programId, t.tilawahUserId)],
);

export const ringkasanSetor = pgTable(
  "ringkasan_setor",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pesertaId: uuid("peserta_id")
      .notNull()
      .references(() => ringkasanPeserta.id, { onDelete: "cascade" }),
    tanggal: date("tanggal").notNull(), // tanggal WIB
    dicatatOleh: uuid("dicatat_oleh").references(() => staff.id, { onDelete: "set null" }),
    dicatatAt: timestamp("dicatat_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("ringkasan_setor_peserta_tanggal_unique").on(t.pesertaId, t.tanggal)],
);

// Jembatan orang ↔ identitas upstream: satu baris = satu akun/peran di satu sumber.
// Id upstream TIDAK global (tilawah 22 ≠ mabni 22), jadi kuncinya selalu
// (sumber, peran, id_upstream, program_slug). Diisi scripts/seed-orang-tautan.ts;
// baris yang sudah ada tidak dipindah ke orang lain oleh seed — koreksi manusia menang.
export const orangTautan = pgTable(
  "orang_tautan",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orangId: uuid("orang_id")
      .notNull()
      .references(() => orang.id, { onDelete: "cascade" }),
    sumber: text("sumber").notNull(), // 'tilawah' | 'mabni' | 'maahir'
    // tilawah/mabni: 'pengajar'; maahir: 'musyrif' | 'syaikh' | 'koordinator' | 'koordinator_ketua_kelas' | 'pengajar_hits'
    peran: text("peran").notNull(),
    idUpstream: text("id_upstream").notNull(), // tilawah_guru_id kanonik / uuid Maahir
    programSlug: text("program_slug").notNull().default(""), // '' bila peran tidak per program
    namaUpstream: text("nama_upstream"),
    aktif: boolean("aktif").notNull().default(true),
    metode: text("metode").notNull(), // 'email' | 'hp' | 'nama' | 'manual' | 'baru'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orang_tautan_unik").on(t.sumber, t.peran, t.idUpstream, t.programSlug),
    index("orang_tautan_orang_idx").on(t.orangId),
  ],
);

// ── Golongan orang & target peserta acara
// (rancangan: docs/superpowers/specs/2026-09-21-golongan-target-rekap-design.md)
//
// `orang.kategori` tunggal tidak bisa menampung orang yang sekaligus pengajar
// HITS dan peserta Board Ta'zhim, dan rekap per golongan butuh keanggotaan
// banyak-ke-banyak. Nonaktif BUKAN hapus: golongan yang pernah jadi target
// acara harus tetap ada, kalau tidak rekap sesi lampau bolong.

export const klasifikasi = pgTable(
  "klasifikasi",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(), // 'majelis-tazhim-rumah-belajar'
    nama: text("nama").notNull(), // "Open Lecture / Study Room"
    keterangan: text("keterangan"),
    urutan: integer("urutan").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("klasifikasi_slug_unik").on(t.slug)],
);

// `sumber` menentukan siapa yang berhak menghapus baris ini: sinkron pengajar
// hanya menambah/mencabut baris 'tautan' miliknya sendiri dan TIDAK PERNAH
// menyentuh baris 'manual' — aturan yang sama dengan seed-orang-tautan.ts.
export const orangKlasifikasi = pgTable(
  "orang_klasifikasi",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orangId: uuid("orang_id")
      .notNull()
      .references(() => orang.id, { onDelete: "cascade" }),
    klasifikasiId: uuid("klasifikasi_id")
      .notNull()
      .references(() => klasifikasi.id),
    sumber: text("sumber").notNull().default("manual"), // 'manual' | 'impor_xlsx' | 'tautan' | 'situs' | 'nawa'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orang_klasifikasi_unik").on(t.orangId, t.klasifikasiId),
    index("orang_klasifikasi_kls_idx").on(t.klasifikasiId),
  ],
);

// 'wajib' masuk hitungan mangkir; 'diundang' ikut dihitung tapi tidak pernah
// merah ("yang tidak wajib pun tidak mengapa"). Yang hadir di luar keduanya
// dihitung hadir tambahan, bukan galat.
export const acaraTarget = pgTable(
  "acara_target",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    acaraId: uuid("acara_id")
      .notNull()
      .references(() => acara.id),
    klasifikasiId: uuid("klasifikasi_id")
      .notNull()
      .references(() => klasifikasi.id),
    sifat: text("sifat").notNull().default("wajib"), // 'wajib' | 'diundang'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("acara_target_unik").on(t.acaraId, t.klasifikasiId)],
);

// ── Scan tanpa kegiatan
// (rancangan: docs/superpowers/specs/2026-09-22-scan-global-hadir-lepas-design.md)
//
// Panitia memindai di hari itu walaupun koordinator belum membuat kegiatannya.
// Barisnya menumpang di sini sampai ditautkan; penautan MEMINDAHKAN baris ke
// acara_hadir lalu menghapusnya dari sini, supaya hitungan "belum bertaut"
// tidak pernah bohong.
//
// `tanggal` diambil dari `waktu` scan, BUKAN dari jam server saat baris tiba:
// antrean offline yang baru terkirim lewat tengah malam harus tetap jatuh di
// hari kajiannya.
export const hadirLepas = pgTable(
  "hadir_lepas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tanggal: date("tanggal").notNull(),
    orangId: uuid("orang_id")
      .notNull()
      .references(() => orang.id),
    waktu: timestamp("waktu", { withTimezone: true }).notNull(),
    diterimaAt: timestamp("diterima_at", { withTimezone: true }).notNull().defaultNow(),
    metode: text("metode").notNull().default("qr"), // 'qr' | 'cari_nama' | 'manual'
    perangkatId: text("perangkat_id"),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    klienId: text("klien_id"),
    catatan: text("catatan"),
  },
  (t) => [
    // Unik per HARI, bukan per kegiatan: scan kedua di hari yang sama dijawab
    // "sudah", bukan baris kedua.
    uniqueIndex("hadir_lepas_orang_unik").on(t.tanggal, t.orangId),
    index("hadir_lepas_tanggal_idx").on(t.tanggal),
  ],
);

// ── Operating Office: kehadiran masyaikh
// (rancangan: docs/superpowers/specs/2026-09-23-operating-office-kehadiran-design.md)
export const kantor = pgTable("kantor", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  nama: text("nama").notNull(),
  // null sampai admin menyetelnya di tempat — tanpa titik, semua absen ditolak.
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  radiusM: integer("radius_m").notNull().default(100),
  // Tidak dipakai sejak 0048 — jadwal masuk kini per syaikh (kantor_petugas.jam_masuk).
  jamMasuk: text("jam_masuk").notNull().default("08:00"),
  // Mas'ul penerima kabar tidak hadir (ikhbar) lewat WA — tanpa persetujuan.
  masulNama: text("masul_nama"),
  masulWa: text("masul_wa"),
  // Batas sesi logbook pengurus ("HH:MM" WIB): pagi = mulai pagi s.d. sebelum siang,
  // siang = s.d. sebelum sore, sore = s.d. selesai. Di luar itu tap tercatat tapi tanpa sesi.
  sesiPagiMulai: text("sesi_pagi_mulai").notNull().default("05:00"),
  sesiSiangMulai: text("sesi_siang_mulai").notNull().default("11:00"),
  sesiSoreMulai: text("sesi_sore_mulai").notNull().default("15:00"),
  sesiSelesai: text("sesi_selesai").notNull().default("22:00"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const kantorPetugas = pgTable(
  "kantor_petugas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kantorId: uuid("kantor_id")
      .notNull()
      .references(() => kantor.id),
    namaArab: text("nama_arab").notNull(),
    namaLatin: text("nama_latin").notNull(),
    wa: text("wa"),
    // "HH:MM" WIB — jadwal masuk syaikh ini; masuk sesudahnya ditampilkan "متأخر", tidak ditolak.
    jamMasuk: text("jam_masuk").notNull().default("08:00"),
    // Acak 32 byte, disimpan (bukan JWT) supaya "buat ulang" langsung mematikan tautan lama.
    token: text("token").notNull(),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kantor_petugas_token_unik").on(t.token)],
);

export const kantorAbsen = pgTable(
  "kantor_absen",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    petugasId: uuid("petugas_id")
      .notNull()
      .references(() => kantorPetugas.id),
    jenis: text("jenis").notNull(), // 'masuk' | 'keluar'
    tanggal: date("tanggal").notNull(), // hari WIB dari `waktu`
    waktu: timestamp("waktu", { withTimezone: true }).notNull().defaultNow(), // jam server, bukan jam HP
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    akurasiM: doublePrecision("akurasi_m").notNull(),
    jarakM: doublePrecision("jarak_m").notNull(),
    userAgent: text("user_agent"),
    // null = syaikh menekan tombol sendiri (GPS); terisi = dicatat admin, lat/lng = titik kantor.
    dicatatOleh: text("dicatat_oleh"),
  },
  (t) => [
    // Satu masuk dan satu keluar per hari — pagar terakhir bila dua tekan berbarengan.
    uniqueIndex("kantor_absen_unik").on(t.petugasId, t.tanggal, t.jenis),
    index("kantor_absen_tanggal_idx").on(t.tanggal),
  ],
);

// Kabar tidak hadir (ikhbar) dari halaman syaikh — tercatat langsung, tanpa persetujuan.
// Status lama 'menunggu'/'disetujui'/'ditolak' berasal dari alur izin sebelum 0048.
export const kantorIzin = pgTable(
  "kantor_izin",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    petugasId: uuid("petugas_id")
      .notNull()
      .references(() => kantorPetugas.id),
    dari: date("dari").notNull(), // tanggal WIB, inklusif
    sampai: date("sampai").notNull(),
    alasan: text("alasan").notNull(), // 'sakit' | 'keluarga' | 'safar' | 'lain'
    catatan: text("catatan"),
    status: text("status").notNull().default("dikabarkan"), // 'dikabarkan' | 'dibatalkan' (+ lama: 'menunggu' | 'disetujui' | 'ditolak')
    dibuatAt: timestamp("dibuat_at", { withTimezone: true }).notNull().defaultNow(),
    diputusAt: timestamp("diputus_at", { withTimezone: true }),
    diputusOleh: text("diputus_oleh"),
  },
  (t) => [index("kantor_izin_petugas_idx").on(t.petugasId, t.dari)],
);

// ── Kehadiran pengurus 3 sesi lewat kartu (design "Kartu Kehadiran", 29 Sep 2026)
// Pengganti "Logbook Kehadiran Pengurus Pendidikan" kertas: jam datang per sesi
// Pagi / Siang / Sore. Tap mentah disimpan apa adanya (`tap_kartu`); arti
// "hadir kerja sesi X" diturunkan ke `kerja_hadir`, satu baris per orang×hari×sesi.
// Kelak tap yang sama juga bisa berarti "mengajar" — itu sebabnya dua tabel.

// Siapa yang mengisi logbook (daftar Ikhwan/Akhwat di kertas).
export const kerjaAnggota = pgTable(
  "kerja_anggota",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kantorId: uuid("kantor_id")
      .notNull()
      .references(() => kantor.id),
    orangId: uuid("orang_id")
      .notNull()
      .references(() => orang.id),
    bagian: text("bagian").notNull().default("Pengurus Pendidikan"),
    urutan: integer("urutan").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kerja_anggota_orang_unik").on(t.kantorId, t.orangId)],
);

// UID chip NFC yang tertanam di kartu (fase RFID). QR memakai orang.kode_qr.
export const kartuNfc = pgTable(
  "kartu_nfc",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orangId: uuid("orang_id")
      .notNull()
      .references(() => orang.id),
    uid: text("uid").notNull(), // hex huruf besar tanpa pemisah, mis. '04A23F1B6C8091'
    aktif: boolean("aktif").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    dicabutAt: timestamp("dicabut_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("kartu_nfc_uid_aktif_unik").on(t.uid).where(sql`${t.aktif}`)],
);

// Setiap tap/scan di kiosk, termasuk yang tak dikenal — tidak pernah diubah.
export const tapKartu = pgTable(
  "tap_kartu",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Dibuat di perangkat; antrean offline boleh mengirim ulang tanpa menggandakan.
    klienId: uuid("klien_id").notNull(),
    kantorId: uuid("kantor_id")
      .notNull()
      .references(() => kantor.id),
    orangId: uuid("orang_id").references(() => orang.id),
    dibaca: text("dibaca").notNull(), // teks QR / UID mentah
    metode: text("metode").notNull(), // 'qr' | 'nfc' | 'ketik'
    waktu: timestamp("waktu", { withTimezone: true }).notNull(), // jam scan di perangkat (dibatasi server)
    diterimaAt: timestamp("diterima_at", { withTimezone: true }).notNull().defaultNow(),
    hasil: text("hasil").notNull(), // HasilTap di lib/kerja/types.ts
    sesi: text("sesi"), // 'pagi' | 'siang' | 'sore' | null
    dicatatOleh: text("dicatat_oleh"),
  },
  (t) => [uniqueIndex("tap_kartu_klien_unik").on(t.klienId), index("tap_kartu_waktu_idx").on(t.waktu)],
);

// Arti satu tap (scan terpadu): satu tap bisa sekaligus check-in kerja, hadir
// kegiatan, dan mengajar. Satu baris per arti; status 'menunggu_sinkron' = belum
// ditulis ke sistem program (tilawah/Maahir) — fase berikutnya.
export const tapArti = pgTable(
  "tap_arti",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tapId: uuid("tap_id")
      .notNull()
      .references(() => tapKartu.id),
    jenis: text("jenis").notNull(), // 'kerja' | 'acara' | 'mengajar' | 'badal_mungkin' | 'belajar' | 'tak_terpetakan'
    status: text("status").notNull(), // 'tercatat' | 'sudah' | 'menunggu_sinkron' | 'perlu_tinjau'
    sesi: text("sesi"),
    acaraId: uuid("acara_id").references(() => acara.id),
    halaqahSyncId: uuid("halaqah_sync_id"),
    jadwalId: integer("jadwal_id"), // tilawah_jadwal_id pertemuan hari itu
    label: text("label").notNull(), // teks singkat untuk layar kiosk/admin
    alasan: text("alasan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // ── Antrean kirim ke sistem program (lib/kerja/kirim.ts). Hanya baris
    // 'menunggu_sinkron' yang punya sasaran; setelah dikirim status jadi
    // 'tersinkron' | 'dilewati' (sudah diisi di sana) | 'gagal' (menyerah).
    sasaran: text("sasaran"), // 'tilawah_selesai' | 'tilawah_presensi' | 'maahir_kehadiran'
    ref: jsonb("ref"), // id yang dibutuhkan sasaran (halaqah_user_id, program_kelas_id, anggota_id, …)
    kirimSetelah: timestamp("kirim_setelah", { withTimezone: true }), // mis. jam selesai kelas untuk 'tilawah_selesai'
    percobaan: integer("percobaan").notNull().default(0),
    terkirimAt: timestamp("terkirim_at", { withTimezone: true }),
    pesanKirim: text("pesan_kirim"),
  },
  (t) => [
    index("tap_arti_tap_idx").on(t.tapId),
    index("tap_arti_jenis_idx").on(t.jenis, t.status),
    index("tap_arti_antre_idx").on(t.sasaran, t.status, t.kirimSetelah),
  ],
);

// Isi logbook: jam datang per orang × tanggal × sesi.
export const kerjaHadir = pgTable(
  "kerja_hadir",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kantorId: uuid("kantor_id")
      .notNull()
      .references(() => kantor.id),
    orangId: uuid("orang_id")
      .notNull()
      .references(() => orang.id),
    tanggal: date("tanggal").notNull(), // hari WIB
    sesi: text("sesi").notNull(), // 'pagi' | 'siang' | 'sore'
    waktu: timestamp("waktu", { withTimezone: true }).notNull(), // jam datang (tap pertama di sesi itu)
    sumber: text("sumber").notNull(), // 'qr' | 'nfc' | 'ketik' | 'manual'
    tapId: uuid("tap_id").references(() => tapKartu.id),
    catatan: text("catatan"),
    dicatatOleh: text("dicatat_oleh"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("kerja_hadir_unik").on(t.kantorId, t.orangId, t.tanggal, t.sesi),
    index("kerja_hadir_tanggal_idx").on(t.kantorId, t.tanggal),
  ],
);

// ── Penilaian Div. Kaderisasi (Batch 1, rancangan: design "Rekomendasi" 28 Sep 2026)
// Tiga jalur input (grid massal, link PIC, catatan cepat) menulis ke tabel yang
// sama. Nilai B/C/D/E (hearing 7 Sep) disimpan bersama padanan angkanya 0–4
// supaya bisa disandingkan dengan skala matrix Maahir.

export const kpiRubrik = pgTable(
  "kpi_rubrik",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kode: text("kode").notNull(), // 'tepat_waktu', 'disiplin', 'pegang_peserta', 'inisiatif'
    nama: text("nama").notNull(),
    jenis: text("jenis").notNull(), // 'umum' | 'spesifik'
    berlakuUntuk: text("berlaku_untuk").notNull().default("panitia"), // 'panitia' | 'peserta' | 'pengemban_amal'
    // { B: "...", C: "...", D: "...", E: "..." } — contoh perilaku per tingkat.
    deskripsi: jsonb("deskripsi").notNull().default({}),
    // Saran nilai dihitung sistem (mis. ketepatan waktu dari presensi QR).
    otomatis: boolean("otomatis").notNull().default(false),
    urutan: integer("urutan").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    // Naik saat definisi berubah; nilai lama tetap menunjuk versinya lewat penilaian.kpi_versi.
    versi: integer("versi").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kpi_rubrik_kode_unik").on(t.kode, t.berlakuUntuk)],
);

export const penilaian = pgTable(
  "penilaian",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orangId: uuid("orang_id").notNull().references(() => orang.id, { onDelete: "cascade" }),
    acaraId: uuid("acara_id").references(() => acara.id, { onDelete: "cascade" }),
    panitiaId: uuid("panitia_id").references(() => acaraPanitia.id, { onDelete: "set null" }),
    kpiId: uuid("kpi_id").notNull().references(() => kpiRubrik.id),
    kpiVersi: integer("kpi_versi").notNull().default(1),
    nilai: text("nilai").notNull(), // 'B' | 'C' | 'D' | 'E'
    nilaiAngka: numeric("nilai_angka").notNull(), // B 4 · C 3 · D 2 · E 1 (lib/penilaian/skala.ts)
    // 'grid' (tim kaderisasi di laptop) | 'link_pic' | 'interview' | 'impor' | 'otomatis'
    sumber: text("sumber").notNull(),
    penilaiStaffId: uuid("penilai_staff_id").references(() => staff.id, { onDelete: "set null" }),
    penilaiPanitiaId: uuid("penilai_panitia_id").references(() => acaraPanitia.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Satu nilai per orang × acara × KPI × sumber; dua sumber (PIC & tim) boleh berdampingan.
    uniqueIndex("penilaian_unik").on(t.orangId, t.acaraId, t.kpiId, t.sumber),
    index("penilaian_orang_idx").on(t.orangId),
  ],
);

export const catatanOrang = pgTable(
  "catatan_orang",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orangId: uuid("orang_id").notNull().references(() => orang.id, { onDelete: "cascade" }),
    acaraId: uuid("acara_id").references(() => acara.id, { onDelete: "cascade" }),
    // 'kelebihan' | 'kekurangan' | 'evidence' (contoh kejadian pendamping nilai di grid)
    jenis: text("jenis").notNull(),
    aspek: text("aspek").array().notNull().default(sql`'{}'::text[]`),
    isi: text("isi").notNull(),
    olehStaffId: uuid("oleh_staff_id").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("catatan_orang_orang_idx").on(t.orangId, t.acaraId)],
);

// Riwayat kegiatan 2022–2025 yang diisi orangnya sendiri (Batch 3 rekomendasi
// 28 Sep 2026). Dicentang dari daftar pengingat, bukan diketik; tidak dihitung
// ke KPI sebelum tim kaderisasi memverifikasi.
export const riwayatMandiri = pgTable(
  "riwayat_mandiri",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orangId: uuid("orang_id").notNull().references(() => orang.id, { onDelete: "cascade" }),
    tahun: integer("tahun").notNull(),
    kegiatan: text("kegiatan").notNull(), // kode dari lib/orang/riwayat-template.ts, atau teks "lain:…"
    peran: text("peran").notNull().default("peserta"), // 'peserta' | 'panitia' | 'pengisi'
    keterangan: text("keterangan"),
    status: text("status").notNull().default("menunggu"), // 'menunggu' | 'terverifikasi' | 'ditolak'
    diverifikasiOleh: uuid("diverifikasi_oleh").references(() => staff.id, { onDelete: "set null" }),
    diverifikasiAt: timestamp("diverifikasi_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("riwayat_mandiri_unik").on(t.orangId, t.tahun, t.kegiatan, t.peran),
    index("riwayat_mandiri_status_idx").on(t.status),
  ],
);
