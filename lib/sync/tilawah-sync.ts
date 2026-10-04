import { eq, isNull, and, sql } from "drizzle-orm";
import { sinkronOrangSetelahSync } from "@/lib/orang/sinkron-otomatis";
import { getDb } from "@/lib/db/client";
import {
  programs,
  syncRuns,
  halaqahSync,
  jadwalSync,
  studentsSync,
  students,
  attendanceSync,
  guruSync,
  tilawahSyncCursor,
} from "@/lib/db/schema";
import { loginToTilawah } from "@/lib/integrations/tilawah-auth";
import { kirimAntreanTilawah } from "@/lib/kerja/kirim";
import { recordFailedRuns } from "@/lib/sync/last-sync";
import { tilawahGet, tilawahGetAllPages } from "@/lib/integrations/tilawah-client";
import { buildFingerprints, changedHalaqahIds } from "@/lib/sync/absensi-fingerprint";
import { runDiscoveryQuietly } from "@/lib/sync/discover-programs";
import { selectMustFetch } from "@/lib/sync/must-fetch";
import { fetchPresensiSince } from "@/lib/sync/presensi-bulk";
import { studentsSyncUpdateSet } from "@/lib/sync/students-upsert";
import { decideRun } from "@/lib/sync/sync-window";
import { todayJakarta, addDaysISO } from "@/lib/time/jakarta";
import { guruUtama } from "@/lib/integrations/tilawah-guru";

/**
 * Sweep every halaqah, ignoring fingerprints, once a program's oldest detail
 * fetch is this stale. Covers what the absensi report cannot see: a meeting
 * where every student is Izin, a schedule moved without touching presensi, a
 * roster change before anyone attended.
 */
const FULL_SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Always re-fetch the detail of any halaqah with a meeting scheduled in the last
 * few days, regardless of the fingerprint. Presensi churn concentrates on
 * recent meetings, and the fingerprint's own source — the /api/reports/
 * absensi-murid summary — is a separately-aggregated view that drifts from the
 * per-meeting presensi (measured live: 8/8 sampled halaqah had the report's
 * `pertemuan`/`kehadiran_%` disagreeing with the detail, in both directions).
 * Gating a fresh source by a stale summary lets a presensi edit stay invisible
 * until the periodic full sweep. This forces the detail for the small, hot set of halaqah
 * where attendance actually moves — a handful of extra calls per run, not a full
 * sweep — so recent presensi is never more than one cron cycle behind.
 */
const HOT_WINDOW_DAYS = 3;

/**
 * Space out detail calls. A full sweep is hundreds of requests against a server
 * that has complained about the load; a run that takes a little longer and
 * arrives evenly is worth more than one that arrives all at once.
 */
const DETAIL_GAP_MS = 120;
const DETAIL_JITTER_MS = 120;

type Program = typeof programs.$inferSelect;
type TilawahSession = Awaited<ReturnType<typeof loginToTilawah>>;

type TilawahBatch = { id: number; name: string };
type TilawahHalaqoh = {
  id: number;
  batch_id: number;
  name: string;
  type: string;
  day?: { name: string } | null;
  session?: { name: string } | null;
  level?: { name: string } | null;
};
type TilawahAbsensiItem = {
  halaqah_id: number;
  pengajar: string;
  pertemuan: string;
  kehadiran_percentage: number;
  user: { id: number; name: string; user_code: string; phone: string };
};
type TilawahHalaqohDetailUser = {
  id: number; // tilawah_user_id
  name: string;
  birth_date: string | null; // "YYYY-MM-DD HH:mm:ss" or null
  gender: number | null; // 1=L, 2=P
  // pivot.id = halaqah_user_id (verified live 2026-07-12); status/reason describe
  // enrollment. created_at/updated_at are the enrollment row's own timestamps —
  // an untouched enrollment keeps them equal (the import stamp) and deactivating
  // a participant moves updated_at to that day, which is the only "when did they
  // leave" signal the API exposes (verified live 2026-07-30).
  pivot: {
    id: number;
    type: string;
    status?: number | null;
    reason?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
};
type TilawahPresensi = {
  id: number;
  halaqah_user_id: number;
  halaqah_jadwal_id: number;
  status: number | string | null;
  notes: string | null;
  lahn_jaliy: string | null;
  lahn_khofiy: string | null;
  task_submission_date: string | null;
};
type TilawahJadwal = {
  id: number;
  halaqah_id: number;
  name: string;
  order: number;
  schedule_date: string;
  guru_id: number | null;
  status: number;
  status_label: string;
  presensis?: TilawahPresensi[];
};
type TilawahHalaqohDetail = {
  users: TilawahHalaqohDetailUser[];
  jadwals: TilawahJadwal[];
};
// /api/users?filters[role]=guru&filters[batch_id]={id} — pulls the teacher's
// phone (not present in the halaqah detail user object) and email (dropped from
// the read model until the /guru portal needed it for name+email verification).
// `gender` (1=L, 2=P) is the teacher's OWN gender as tilawah records it — the
// only trustworthy ikhwan/akhwat signal we get, since most students come back
// with gender null and a halaqah name is a convention, not a field.
type TilawahGuruUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  gender: number | null;
};

export type SyncResult = {
  ok: boolean;
  programSlug: string;
  halaqahCount: number;
  studentCount: number;
  jadwalCount: number;
  attendanceCount: number;
  rosterCount: number;
  reconciledCount: number;
  /** Halaqah dropped because upstream no longer files them under this batch. */
  prunedHalaqah: number;
  /** Presensi rows dropped because upstream deleted them (meeting wiped in CMS). */
  prunedPresensi: number;
  error?: string;
};

export type PruneResult = {
  halaqah: { id: number; name: string | null }[];
  jadwal: number;
  attendance: number;
  studentsSync: number;
  students: number;
  /** Roster rows kept because they carry data the CMS never had (see below). */
  studentsKept: number;
  /** Set when strays were left in place; says which ones and why. */
  skipped?: string;
};

/**
 * Refuse to prune more than this share of a program in one run. A stray is a
 * handful of halaqah; a large batch of them means the upstream list came back
 * meaning something other than "every halaqah in this batch" — an archived-class
 * filter, a changed query contract — and deleting on that guess would take real
 * attendance history with it. Better to leave the strays visible and log.
 *
 * The cap only governs strays we have no second opinion on — see `rehomed`.
 */
const MAX_PRUNE_SHARE = 0.2;
const ALWAYS_ALLOWED_STRAYS = 2;

/**
 * Drop halaqah this program's batch no longer contains upstream.
 *
 * The upserts only add or update, so a halaqah filed into the wrong batch once —
 * a Tahsin Al-Fatihah LAZ class briefly entered under the HKM batch — keeps its
 * rows here forever, even after the CMS is corrected. It then shows up on the
 * program's dashboard as a class that isn't part of the program.
 *
 * Every statement is scoped to `program_id`, which is what makes this safe for a
 * halaqah that legitimately moved to ANOTHER program: those rows carry that
 * program's id and are never matched here, even though the tilawah halaqah id is
 * the same. Nothing is written upstream either — the CMS stays the source of
 * truth and a re-sync rebuilds anything removed in error.
 *
 * `keepIds` MUST be the full upstream list for the batch; the caller refuses to
 * prune on an empty list so a failed/partial fetch can never wipe a program.
 */
export async function pruneRemovedHalaqah(
  programId: string,
  keepIds: Set<number>,
): Promise<PruneResult> {
  const db = getDb();
  const empty: PruneResult = {
    halaqah: [],
    jadwal: 0,
    attendance: 0,
    studentsSync: 0,
    students: 0,
    studentsKept: 0,
  };
  if (keepIds.size === 0) return empty;

  const keep = sql.join([...keepIds], sql`, `);
  // `rehomed` = another program here holds the same tilawah halaqah id and saw it
  // upstream MORE RECENTLY than we did. A halaqah id belongs to exactly one batch
  // upstream, so that is a second, independent confirmation that this row is a
  // mis-file rather than a hole in our own fetch — the doubt the share cap exists
  // to protect against does not apply to it.
  const strayRows = await db.execute(sql`
    select h.tilawah_halaqah_id as id, h.name,
      exists (
        select 1 from halaqah_sync o
        join programs op on op.id = o.program_id
        where o.tilawah_halaqah_id = h.tilawah_halaqah_id
          and o.program_id <> h.program_id
          -- Same SOURCE only. A halaqah id is unique within one upstream, not
          -- across upstreams: Mabni numbers its classes from 16 and collides
          -- with 13 tilawah ids in this database alone. Comparing across sources
          -- would let a freshly-synced Mabni class vouch that an unrelated
          -- tilawah halaqah "moved" — and this branch deletes without the share
          -- cap, so a partial upstream fetch could take real attendance with it.
          and op.data_source_type = hp.data_source_type
          and o.synced_at > h.synced_at
      ) as rehomed
    from halaqah_sync h
    join programs hp on hp.id = h.program_id
    where h.program_id = ${programId} and h.tilawah_halaqah_id not in (${keep})
  `);
  if (strayRows.rows.length === 0) return empty;

  const totalRow = await db.execute(sql`
    select count(*)::int as n from halaqah_sync where program_id = ${programId}
  `);
  const total = Number(totalRow.rows[0]?.n ?? 0);
  const allowed = Math.max(ALWAYS_ALLOWED_STRAYS, Math.floor(total * MAX_PRUNE_SHARE));

  const rehomed = strayRows.rows.filter((r) => r.rehomed === true);
  const unclaimed = strayRows.rows.filter((r) => r.rehomed !== true);

  // Prune the re-homed strays always; the unclaimed ones only while they stay
  // under the cap. A run that hits the cap still cleans what it can prove.
  const doomed = [...rehomed];
  let skipped: string | undefined;
  if (unclaimed.length > allowed) {
    skipped =
      `${unclaimed.length} of ${total} halaqah are missing from the upstream batch list and no ` +
      `other program claims them (limit ${allowed}) — leaving them; check the upstream query ` +
      `before trusting this`;
  } else {
    doomed.push(...unclaimed);
  }
  if (doomed.length === 0) return { ...empty, skipped };

  const strayIds = doomed.map((r) => Number(r.id));
  const stray = sql.join(strayIds, sql`, `);

  // Attendance first: it reaches its halaqah only through jadwal_sync, so the
  // link has to still exist when we delete it.
  const att = await db.execute(sql`
    delete from attendance_sync
    where program_id = ${programId}
      and halaqah_jadwal_id in (
        select tilawah_jadwal_id from jadwal_sync
        where program_id = ${programId} and tilawah_halaqah_id in (${stray})
      )
  `);
  const jad = await db.execute(sql`
    delete from jadwal_sync
    where program_id = ${programId} and tilawah_halaqah_id in (${stray})
  `);

  // `students` is app-owned: parent names, birth date and marhalah are backfilled
  // from the CMS xlsx and exist nowhere upstream. Drop only the rows the sync
  // itself created (nothing enriched) — an enriched row is kept and reported
  // rather than silently destroyed.
  const stu = await db.execute(sql`
    delete from students
    where program_id = ${programId}
      and father_name is null and mother_name is null
      and tilawah_user_id in (
        select tilawah_user_id from students_sync
        where program_id = ${programId} and halaqah_id in (${stray})
      )
  `);
  const kept = await db.execute(sql`
    select count(*)::int as n from students
    where program_id = ${programId}
      and tilawah_user_id in (
        select tilawah_user_id from students_sync
        where program_id = ${programId} and halaqah_id in (${stray})
      )
  `);

  const ss = await db.execute(sql`
    delete from students_sync
    where program_id = ${programId} and halaqah_id in (${stray})
  `);
  await db.execute(sql`
    delete from halaqah_sync
    where program_id = ${programId} and tilawah_halaqah_id in (${stray})
  `);

  return {
    halaqah: doomed.map((r) => ({ id: Number(r.id), name: (r.name as string) ?? null })),
    jadwal: jad.rowCount ?? 0,
    attendance: att.rowCount ?? 0,
    studentsSync: ss.rowCount ?? 0,
    students: stu.rowCount ?? 0,
    studentsKept: Number(kept.rows[0]?.n ?? 0),
    skipped,
  };
}

type SyncCtx = {
  baseUrl: string;
  session: TilawahSession;
  absensiItems: TilawahAbsensiItem[];
  /**
   * Fetch every halaqah's detail regardless of fingerprint. The fingerprint asks
   * "did attendance move?", which is the wrong question after a correction that
   * only changed WHO owns a meeting: nothing about attendance moved, so the
   * detail is skipped and the mirror keeps yesterday's teacher until the periodic
   * full sweep. This is the knob to turn after fixing data upstream.
   */
  forceSweep?: boolean;
};

/**
 * Bulk-ingest the system-wide `/api/presensis` stream into `attendance_sync`,
 * incrementally by `updated_at`. This is the load fix: attendance no longer
 * needs a per-halaqah `/api/halaqah/{id}` detail call — a normal run reads 1–3
 * pages of 500 instead of ~357 details. Each presensi is mapped to a program via
 * `jadwal_sync` (jadwal id is globally unique upstream). A presensi whose jadwal
 * we haven't mirrored yet (a brand-new meeting) is left unmapped; the detail
 * path (hot-window / daily sweep) creates that jadwal and also writes its
 * presensi, so nothing is lost. Runs once per pass, before the per-program loop,
 * so each program's attendance recompute sees the fresh rows.
 */
export async function ingestBulkPresensi(
  db: ReturnType<typeof getDb>,
  baseUrl: string,
  session: TilawahSession,
): Promise<{ fetched: number; written: number; unmapped: number; pages: number; reachedCap: boolean }> {
  const [cursor] = await db
    .select({ hw: tilawahSyncCursor.highWaterUpdatedAt })
    .from(tilawahSyncCursor)
    .where(eq(tilawahSyncCursor.key, "presensi"));
  const since = cursor?.hw ?? null;

  const { rows, maxUpdatedAt, pages, reachedCap } = await fetchPresensiSince(baseUrl, session, since);
  if (rows.length === 0) return { fetched: 0, written: 0, unmapped: 0, pages, reachedCap };

  const jadwalRows = await db
    .select({ programId: jadwalSync.programId, jadwalId: jadwalSync.tilawahJadwalId })
    .from(jadwalSync);
  const programByJadwal = new Map<number, string>();
  for (const j of jadwalRows) programByJadwal.set(j.jadwalId, j.programId);

  type Val = typeof attendanceSync.$inferInsert;
  const byProgram = new Map<string, Val[]>();
  let unmapped = 0;
  // Dedupe by presensi id: offset pagination over rows sharing an `updated_at`
  // (the bulk-import blob) can return the same row on two pages, and two rows
  // with the same conflict key in one INSERT trip Postgres "ON CONFLICT DO UPDATE
  // cannot affect row a second time". Rows arrive newest-first, so keep the first.
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const programId = programByJadwal.get(r.halaqah_jadwal_id);
    if (!programId) {
      unmapped += 1;
      continue;
    }
    const v: Val = {
      programId,
      tilawahPresensiId: r.id,
      halaqahUserId: r.halaqah_user_id ?? null,
      halaqahJadwalId: r.halaqah_jadwal_id ?? null,
      status: r.status != null ? String(r.status) : null,
      notes: r.notes ?? null,
      lahnJaliy: r.lahn_jaliy ?? null,
      lahnKhofiy: r.lahn_khofiy ?? null,
      taskSubmissionDate: r.task_submission_date ?? null,
      raw: r as Record<string, unknown>,
      syncedAt: new Date(),
    };
    const bucket = byProgram.get(programId);
    if (bucket) bucket.push(v);
    else byProgram.set(programId, [v]);
  }

  let written = 0;
  const CHUNK = 500;
  for (const vals of byProgram.values()) {
    for (let i = 0; i < vals.length; i += CHUNK) {
      const chunk = vals.slice(i, i + CHUNK);
      await db
        .insert(attendanceSync)
        .values(chunk)
        .onConflictDoUpdate({
          target: [attendanceSync.programId, attendanceSync.tilawahPresensiId],
          set: {
            halaqahUserId: sql`excluded.halaqah_user_id`,
            halaqahJadwalId: sql`excluded.halaqah_jadwal_id`,
            status: sql`excluded.status`,
            notes: sql`excluded.notes`,
            lahnJaliy: sql`excluded.lahn_jaliy`,
            lahnKhofiy: sql`excluded.lahn_khofiy`,
            taskSubmissionDate: sql`excluded.task_submission_date`,
            raw: sql`excluded.raw`,
            syncedAt: sql`now()`,
          },
        });
      written += chunk.length;
    }
  }

  // Advance the cursor only on a complete pass. `>=` is inclusive so the boundary
  // rows re-appear next run — harmless, the upsert is idempotent by id.
  if (maxUpdatedAt && !reachedCap) {
    await db
      .insert(tilawahSyncCursor)
      .values({ key: "presensi", highWaterUpdatedAt: maxUpdatedAt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: tilawahSyncCursor.key,
        set: { highWaterUpdatedAt: maxUpdatedAt, updatedAt: new Date() },
      });
  }

  return { fetched: rows.length, written, unmapped, pages, reachedCap };
}

/**
 * Sync every tilawah-backed program in one pass. Logs in ONCE and reuses the
 * session across all programs (the tilawah prod server is small — see
 * API_MAP.md); the cross-program `absensi-murid` report is also fetched once and
 * filtered per program by its halaqah-id set.
 */
export async function runAllTilawahSyncs(opts: { forceSweep?: boolean } = {}): Promise<SyncResult[]> {
  const baseUrl = process.env.TILAWAH_BASE_URL;
  if (!baseUrl) throw new Error("TILAWAH_BASE_URL not set");

  const db = getDb();
  const all = await db.select().from(programs);
  const targets = all.filter(
    (p) =>
      p.dataSourceType === "tilawah_api" &&
      p.tilawahProgramId != null &&
      // config.syncPaused freezes a program's synced data (e.g. when its
      // upstream tilawah batch was corrupted) so the cron won't overwrite it.
      !(p.config as { syncPaused?: boolean } | null)?.syncPaused,
  );
  if (targets.length === 0) return [];

  // Which programs have a meeting scheduled today? One indexed query, no
  // upstream call. A program with none drops to an hourly lane rather than
  // every 15 minutes — but never to silence, because its schedule can change
  // upstream and nothing here would notice if we stopped looking entirely.
  const withMeetings = await db
    .selectDistinct({ programId: jadwalSync.programId })
    .from(jadwalSync)
    .where(eq(jadwalSync.scheduleDate, todayJakarta()));
  const hasMeetingToday = new Set(withMeetings.map((r) => r.programId));

  const lastRuns = await db
    .select({ programId: syncRuns.programId, at: sql<string | null>`max(${syncRuns.startedAt})` })
    .from(syncRuns)
    .groupBy(syncRuns.programId);
  const lastRunAt = new Map<string, number>();
  for (const r of lastRuns) {
    if (r.programId && r.at) lastRunAt.set(r.programId, new Date(r.at).getTime());
  }

  const now = new Date();
  const due = targets.filter((p) => {
    if (hasMeetingToday.has(p.id)) return true;
    const last = lastRunAt.get(p.id);
    const minutesSinceLastRun =
      last === undefined ? Number.POSITIVE_INFINITY : (now.getTime() - last) / 60_000;
    const decision = decideRun({
      now,
      hasMeetingToday: false,
      minutesSinceLastRun,
      allowSlowLane: true,
    });
    if (!decision.run) console.log(`[sync ${p.slug}] dilewati — tidak ada kelas hari ini`);
    return decision.run;
  });
  if (due.length === 0) return [];

  // Login dulu, sebelum ada run row satu pun. Kalau upstream tak bisa dihubungi,
  // catat kegagalannya untuk tiap program yang jatuh tempo — kalau tidak,
  // kemandekannya senyap total (lihat recordFailedRuns).
  let session: TilawahSession;
  try {
    session = await loginToTilawah(baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "login tilawah gagal";
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    await recordFailedRuns(
      due.map((p) => p.id),
      "tilawah_full",
      `login tilawah gagal: ${message}${cause ? ` (${cause})` : ""}`,
    );
    throw err;
  }

  // Does the CMS hold a program or batch we mirror nothing of? Throttled to a
  // few times a day inside, and it rides this login rather than opening its own.
  // Anything it finds lands paused and hidden, awaiting approval in
  // /admin/programs — see lib/sync/discover-programs.ts.
  await runDiscoveryQuietly(session);

  const absensiItems = await tilawahGetAllPages<TilawahAbsensiItem>(
    baseUrl,
    session,
    "/api/reports/absensi-murid",
    "items",
  );

  // Bulk-ingest attendance ONCE for all programs before the per-program loop, so
  // each program's recompute sees fresh presensi without a per-halaqah detail.
  try {
    const p = await ingestBulkPresensi(db, baseUrl, session);
    console.log(
      `[sync presensi] ${p.written} ditulis / ${p.fetched} ditarik (${p.pages} halaman, ${p.unmapped} tanpa jadwal` +
        (p.reachedCap ? ", CAP TERCAPAI — parsial" : "") +
        ")",
    );
  } catch (err) {
    // A bulk-presensi failure must not sink the whole run — the per-program
    // detail path still refreshes attendance for hot-window halaqah.
    console.warn(`[sync presensi] gagal, lanjut tanpa bulk: ${(err as Error).message.slice(0, 200)}`);
  }

  // Scan terpadu: kirim antrean hadir murid / pertemuan Selesai memakai login
  // ini, sesudah mirror presensi segar — lihat lib/kerja/kirim.ts.
  try {
    const k = await kirimAntreanTilawah(baseUrl, session);
    if (k.dikirim + k.dilewati + k.gagal > 0)
      console.log(`[kirim kehadiran] ${k.dikirim} terkirim · ${k.dilewati} dilewati · ${k.gagal} gagal (${k.request} request)`);
  } catch (err) {
    console.warn(`[kirim kehadiran] gagal, dicoba putaran berikut: ${(err as Error).message.slice(0, 200)}`);
  }

  const results: SyncResult[] = [];
  for (const program of due) {
    results.push(
      await runTilawahSyncForProgram(program, {
        baseUrl,
        session,
        absensiItems,
        forceSweep: opts.forceSweep,
      }),
    );
  }
  // Pengajar baru dari sync ini langsung mendapat baris `orang` (Kaderisasi).
  await sinkronOrangSetelahSync("tilawah");
  return results;
}

/** Sync just one program by slug (own login + absensi fetch). Returns null if it
 * isn't a syncable tilawah program. Useful to sync a newly-added program without
 * re-hammering the API for every other program. */
export async function runTilawahSyncForSlug(
  slug: string,
  opts: { forceSweep?: boolean } = {},
): Promise<SyncResult | null> {
  const baseUrl = process.env.TILAWAH_BASE_URL;
  if (!baseUrl) throw new Error("TILAWAH_BASE_URL not set");
  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!program || program.dataSourceType !== "tilawah_api" || program.tilawahProgramId == null) {
    return null;
  }
  const session = await loginToTilawah(baseUrl);
  const absensiItems = await tilawahGetAllPages<TilawahAbsensiItem>(
    baseUrl,
    session,
    "/api/reports/absensi-murid",
    "items",
  );
  try {
    const p = await ingestBulkPresensi(db, baseUrl, session);
    console.log(
      `[sync presensi] ${p.written} ditulis / ${p.fetched} ditarik (${p.pages} halaman, ${p.unmapped} tanpa jadwal)`,
    );
  } catch (err) {
    console.warn(`[sync presensi] gagal, lanjut tanpa bulk: ${(err as Error).message.slice(0, 200)}`);
  }
  const hasil = await runTilawahSyncForProgram(program, {
    baseUrl,
    session,
    absensiItems,
    forceSweep: opts.forceSweep,
  });
  await sinkronOrangSetelahSync(`tilawah ${slug}`);
  return hasil;
}

/** Sync a single tilawah-backed program using a shared login + prefetched absensi. */
export async function runTilawahSyncForProgram(
  program: Program,
  ctx: SyncCtx,
): Promise<SyncResult> {
  const { baseUrl, session, absensiItems, forceSweep } = ctx;
  const db = getDb();

  const empty = (over: Partial<SyncResult>): SyncResult => ({
    ok: false,
    programSlug: program.slug,
    halaqahCount: 0,
    studentCount: 0,
    jadwalCount: 0,
    attendanceCount: 0,
    rosterCount: 0,
    reconciledCount: 0,
    prunedHalaqah: 0,
    prunedPresensi: 0,
    ...over,
  });

  if (program.tilawahProgramId == null) {
    return empty({ error: `program "${program.slug}" has no tilawah_program_id — seed it first` });
  }

  const [runRow] = await db
    .insert(syncRuns)
    .values({ programId: program.id, runType: "tilawah_full", status: "running" })
    .returning({ id: syncRuns.id });

  try {
    const batchesBody = await tilawahGet<{ batches: TilawahBatch[] }>(
      baseUrl,
      session,
      `/api/batches?page=1&per_page=50&sort_by=id&sort=desc&filters[program_id]=${program.tilawahProgramId}`,
    );
    const allBatches = batchesBody.data.batches;

    // Rolling-batch programs (e.g. Tahsin Al-Fatihah LAZ spins up a new batch
    // every 1-2 weeks) set config.syncAllBatches so a fresh batch is picked up
    // automatically instead of staying pinned to one that goes stale. Otherwise
    // pin a specific batch (programs.tilawah_batch_id), else the newest — a
    // program often has several cohorts and the newest can be an empty upcoming
    // one, so pinning is the reliable single-batch path.
    const syncAllBatches =
      (program.config as { syncAllBatches?: boolean } | null)?.syncAllBatches === true;

    let batchesToSync: TilawahBatch[];
    if (syncAllBatches) {
      batchesToSync = allBatches;
      if (batchesToSync.length === 0) {
        throw new Error(`No batches found for tilawah program id ${program.tilawahProgramId}`);
      }
    } else {
      const activeBatch = program.tilawahBatchId
        ? allBatches.find((b) => b.id === program.tilawahBatchId)
        : allBatches[0];
      if (!activeBatch) {
        throw new Error(
          program.tilawahBatchId
            ? `batch ${program.tilawahBatchId} not found for tilawah program ${program.tilawahProgramId}`
            : `No batches found for tilawah program id ${program.tilawahProgramId}`,
        );
      }
      batchesToSync = [activeBatch];
    }

    // Halaqah list across every batch we sync (union, deduped by id). Each
    // halaqoh carries its own batch_id, so halaqah_sync rows land under the right
    // batch regardless of how many batches we pulled. Pruning below is scoped to
    // this UNION, so syncing batch B never prunes batch A's halaqah.
    const halaqohById = new Map<number, TilawahHalaqoh>();
    for (const b of batchesToSync) {
      const batchHalaqohs = await tilawahGetAllPages<TilawahHalaqoh>(
        baseUrl,
        session,
        `/api/halaqah?sort_by=id&sort=asc&simple=true&filters[batch_id]=${b.id}`,
        "halaqohs",
        // Small pages: tilawah times a list request out at ~15 s and this one
        // costs ~0.5 s per halaqah, so 100-row pages of a HITS batch never return.
        20,
      );
      for (const h of batchHalaqohs) halaqohById.set(h.id, h);
    }
    const halaqohs = [...halaqohById.values()];
    const programHalaqahIds = new Set(halaqohs.map((h) => h.id));

    // Which halaqah actually changed since last run. The absensi report is
    // already fetched once per run and covers every program, so this costs no
    // extra upstream request.
    const storedRows = await db
      .select({
        halaqahId: halaqahSync.tilawahHalaqahId,
        fingerprint: halaqahSync.absensiFingerprint,
        detailSyncedAt: halaqahSync.detailSyncedAt,
      })
      .from(halaqahSync)
      .where(eq(halaqahSync.programId, program.id));

    const storedFingerprints = new Map<number, string>();
    for (const r of storedRows) {
      if (r.fingerprint) storedFingerprints.set(r.halaqahId, r.fingerprint);
    }

    const nextFingerprints = buildFingerprints(
      absensiItems.filter((i) => programHalaqahIds.has(i.halaqah_id)),
    );

    // A halaqah upstream that we have never stored has no fingerprint to trust,
    // so a short row count forces the sweep rather than quietly skipping it.
    const knownIds = new Set(storedRows.map((r) => r.halaqahId));
    const anyUnknown = halaqohs.some((h) => !knownIds.has(h.id));
    const oldestDetailAt = storedRows.reduce<number | null>((acc, r) => {
      const t = r.detailSyncedAt ? r.detailSyncedAt.getTime() : null;
      if (t === null) return acc;
      return acc === null || t < acc ? t : acc;
    }, null);
    const fullSweep =
      forceSweep === true ||
      anyUnknown ||
      oldestDetailAt === null ||
      Date.now() - oldestDetailAt > FULL_SWEEP_AFTER_MS;

    // Halaqah with a meeting in the hot window (last HOT_WINDOW_DAYS up to today,
    // WIB): fetch these regardless of fingerprint. One indexed query on
    // (program_id, schedule_date), no upstream call. Scoped to the current
    // upstream halaqah set so a pruned/stale id is never requested.
    const today = todayJakarta();
    const hotFrom = addDaysISO(today, -HOT_WINDOW_DAYS);
    const hotRows = fullSweep
      ? []
      : await db
          .selectDistinct({ halaqahId: jadwalSync.tilawahHalaqahId })
          .from(jadwalSync)
          .where(
            and(
              eq(jadwalSync.programId, program.id),
              sql`${jadwalSync.scheduleDate} >= ${hotFrom}`,
              sql`${jadwalSync.scheduleDate} <= ${today}`,
            ),
          );
    const hotWindowIds = new Set(
      hotRows.map((r) => r.halaqahId).filter((id) => programHalaqahIds.has(id)),
    );

    const mustFetch = selectMustFetch({
      fullSweep,
      upstreamHalaqahIds: halaqohs.map((h) => h.id),
      changed: changedHalaqahIds([...programHalaqahIds], storedFingerprints, nextFingerprints),
      hotWindow: hotWindowIds,
    });

    let skippedHalaqah = 0;

    // Teacher phones are NOT on the halaqah detail user object — they only come
    // from /api/users (role=guru). Fetch per batch we sync and index by tilawah
    // user id (== the guru id stored on halaqah_sync.guruId). A guru that appears
    // in more than one batch is upserted once (first-seen batch wins its row).
    const guruPhoneById = new Map<number, string>();
    const guruSeen = new Set<number>();
    for (const b of batchesToSync) {
      const guruUsers = await tilawahGetAllPages<TilawahGuruUser>(
        baseUrl,
        session,
        `/api/users?filters[role]=guru&filters[batch_id]=${b.id}&sort_by=name&sort=asc&keyword=`,
        "users",
      );
      for (const g of guruUsers) {
        if (g.phone) guruPhoneById.set(g.id, g.phone);
        if (guruSeen.has(g.id)) continue;
        guruSeen.add(g.id);
        // Persist the guru roster (with email) so the /guru portal can verify a
        // teacher by name+email/phone and list gurus for the badal picker locally.
        await db
          .insert(guruSync)
          .values({
            programId: program.id,
            tilawahBatchId: b.id,
            tilawahGuruId: g.id,
            name: g.name,
            email: g.email ?? null,
            phone: g.phone ?? null,
            gender: g.gender ?? null,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [guruSync.programId, guruSync.tilawahGuruId],
            set: {
              tilawahBatchId: b.id,
              name: g.name,
              email: g.email ?? null,
              phone: g.phone ?? null,
              gender: g.gender ?? null,
              syncedAt: new Date(),
            },
          });
      }
    }

    // One pass per halaqah: the detail call carries guru, enrolled murid,
    // jadwals, and per-meeting presensis — everything below comes from it, at no
    // extra API cost beyond the one call the sync already made.
    // Every enrolled murid found across all halaqah detail calls, keyed by tilawah
    // user id. This is the authoritative "who is in which halaqah" roster — used
    // both for the `students` identity upsert and for students_sync (so a student
    // with no attendance yet is still counted as a peserta).
    const enrolledByUserId = new Map<
      number,
      {
        tilawahUserId: number;
        halaqahUserId: number;
        halaqahId: number;
        name: string;
        gender: number | null;
        enrollmentStatusCode: number | null;
        enrollmentStatus: string | null;
        enrollmentCreatedAt: Date | null;
        enrollmentUpdatedAt: Date | null;
        pengajar: string | null;
        birthDate: string | null;
        marhalah: string | null;
      }
    >();

    /** Enrollment pivot timestamps arrive as ISO strings; keep null over Invalid Date. */
    const pivotDate = (v: string | null | undefined): Date | null => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    let halaqahCount = 0;
    let jadwalCount = 0;
    let attendanceCount = 0;
    let prunedPresensi = 0;

    for (const h of halaqohs) {
      if (!mustFetch.has(h.id)) {
        // Nothing in this halaqah's attendance moved, so its existing rows stay
        // exactly as the last sync left them. That is safe by construction: the
        // jadwal delete below is scoped to this loop body, and pruning is driven
        // by the list endpoint above, not by which details we pulled.
        skippedHalaqah += 1;
        const fp = nextFingerprints.get(h.id);
        if (fp) {
          await db
            .update(halaqahSync)
            .set({ absensiFingerprint: fp, syncedAt: new Date() })
            .where(
              and(
                eq(halaqahSync.programId, program.id),
                eq(halaqahSync.tilawahHalaqahId, h.id),
              ),
            );
        }
        continue;
      }

      const detailBody = await tilawahGet<{ halaqoh: TilawahHalaqohDetail }>(
        baseUrl,
        session,
        `/api/halaqah/${h.id}`,
      );
      await new Promise((r) =>
        setTimeout(r, DETAIL_GAP_MS + Math.floor(Math.random() * DETAIL_JITTER_MS)),
      );
      const detail = detailBody.data.halaqoh;
      const guru = guruUtama(detail.users, detail.jadwals, h.name);

      await db
        .insert(halaqahSync)
        .values({
          programId: program.id,
          tilawahHalaqahId: h.id,
          tilawahBatchId: h.batch_id,
          name: h.name,
          type: h.type,
          day: h.day?.name ?? null,
          session: h.session?.name ?? null,
          level: h.level?.name ?? null,
          guruId: guru?.id ?? null,
          pengajar: guru?.name ?? null,
          guruPhone: guru?.id != null ? (guruPhoneById.get(guru.id) ?? null) : null,
          raw: h,
          absensiFingerprint: nextFingerprints.get(h.id) ?? null,
          detailSyncedAt: new Date(),
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [halaqahSync.programId, halaqahSync.tilawahHalaqahId],
          set: {
            tilawahBatchId: h.batch_id,
            name: h.name,
            type: h.type,
            day: h.day?.name ?? null,
            session: h.session?.name ?? null,
            level: h.level?.name ?? null,
            guruId: guru?.id ?? null,
            pengajar: guru?.name ?? null,
            guruPhone: guru?.id != null ? (guruPhoneById.get(guru.id) ?? null) : null,
            raw: h,
            absensiFingerprint: nextFingerprints.get(h.id) ?? null,
            detailSyncedAt: new Date(),
            syncedAt: new Date(),
          },
        });
      halaqahCount += 1;

      for (const u of detail.users) {
        if (u.pivot?.type !== "murid") continue;
        enrolledByUserId.set(u.id, {
          tilawahUserId: u.id,
          halaqahUserId: u.pivot.id,
          halaqahId: h.id,
          name: u.name,
          gender: u.gender ?? null,
          enrollmentStatusCode: u.pivot?.status ?? null,
          enrollmentStatus: u.pivot?.reason ?? null,
          enrollmentCreatedAt: pivotDate(u.pivot?.created_at),
          enrollmentUpdatedAt: pivotDate(u.pivot?.updated_at),
          pengajar: guru?.name ?? null,
          birthDate: u.birth_date ? u.birth_date.slice(0, 10) : null,
          marhalah: h.level?.name ?? null,
        });
      }

      for (const j of detail.jadwals) {
        await db
          .insert(jadwalSync)
          .values({
            programId: program.id,
            tilawahHalaqahId: j.halaqah_id,
            tilawahJadwalId: j.id,
            name: j.name,
            order: j.order,
            scheduleDate: j.schedule_date,
            guruId: j.guru_id ?? null,
            status: j.status,
            statusLabel: j.status_label,
            raw: j,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [jadwalSync.programId, jadwalSync.tilawahJadwalId],
            set: {
              name: j.name,
              order: j.order,
              scheduleDate: j.schedule_date,
              guruId: j.guru_id ?? null,
              status: j.status,
              statusLabel: j.status_label,
              raw: j,
              syncedAt: new Date(),
            },
          });
        jadwalCount += 1;

        for (const pr of j.presensis ?? []) {
          await db
            .insert(attendanceSync)
            .values({
              programId: program.id,
              tilawahPresensiId: pr.id,
              halaqahUserId: pr.halaqah_user_id,
              halaqahJadwalId: pr.halaqah_jadwal_id,
              status: pr.status != null ? String(pr.status) : null,
              notes: pr.notes ?? null,
              lahnJaliy: pr.lahn_jaliy ?? null,
              lahnKhofiy: pr.lahn_khofiy ?? null,
              taskSubmissionDate: pr.task_submission_date ?? null,
              raw: pr,
              syncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [attendanceSync.programId, attendanceSync.tilawahPresensiId],
              set: {
                halaqahUserId: pr.halaqah_user_id,
                halaqahJadwalId: pr.halaqah_jadwal_id,
                status: pr.status != null ? String(pr.status) : null,
                notes: pr.notes ?? null,
                lahnJaliy: pr.lahn_jaliy ?? null,
                lahnKhofiy: pr.lahn_khofiy ?? null,
                taskSubmissionDate: pr.task_submission_date ?? null,
                raw: pr,
                syncedAt: new Date(),
              },
            });
          attendanceCount += 1;
        }

        // Prune presensi deleted upstream. Same reason as the jadwal prune below
        // — the upserts only add or update — but the symptom is nastier: a wiped
        // presensi that lingers here keeps the meeting looking already-taken, so
        // it never returns to the "guru belum presensi" reminder and the teacher
        // is never asked to redo it. Found 5 Sep 2026 after erasing HITS 28
        // Akhwat April pertemuan 10 upstream: a full --sweep left all 7 rows
        // standing and both mirrors had to be cleaned by hand.
        //
        // `detail` is this halaqah's full upstream truth (every jadwal with every
        // presensi), so anything local under these jadwal ids that upstream no
        // longer lists is genuinely gone. A presensi filled in the gap between
        // the detail fetch and this delete is re-added by the next sync.
        const upstreamPresensiIds = (j.presensis ?? []).map((pr) => pr.id);
        const prunedRows = await db.execute(
          upstreamPresensiIds.length > 0
            ? sql`
                delete from attendance_sync
                where program_id = ${program.id}
                  and halaqah_jadwal_id = ${j.id}
                  and tilawah_presensi_id not in (${sql.join(upstreamPresensiIds, sql`, `)})
              `
            : sql`
                delete from attendance_sync
                where program_id = ${program.id} and halaqah_jadwal_id = ${j.id}
              `,
        );
        prunedPresensi += prunedRows.rowCount ?? 0;
      }

      // Prune jadwals that were deleted upstream: the upserts above only add or
      // update, so a meeting removed in tilawah (e.g. a disbanded halaqah's later
      // pertemuan) would otherwise linger in jadwal_sync and inflate counts.
      const syncedJadwalIds = detail.jadwals.map((j) => j.id);
      if (syncedJadwalIds.length > 0) {
        await db.execute(sql`
          delete from jadwal_sync
          where program_id = ${program.id}
            and tilawah_halaqah_id = ${detail.jadwals[0].halaqah_id}
            and tilawah_jadwal_id not in (${sql.join(syncedJadwalIds, sql`, `)})
        `);
      }
    }

    // The saving, stated per run so it can be shown to the upstream admin
    // instead of promised.
    console.log(
      `[sync ${program.slug}] halaqah: ${halaqahCount} ditarik, ${skippedHalaqah} dilewati` +
        (fullSweep ? " (sapu penuh)" : ` (${hotWindowIds.size} jendela-panas)`),
    );
    // Presensi yang dihapus upstream jarang terjadi dan selalu disengaja
    // (koordinator mengosongkan pertemuan). Dilaporkan supaya penghapusan diam-diam
    // di CMS tetap terlihat di log sync.
    if (prunedPresensi > 0) {
      console.log(`[sync ${program.slug}] prune ${prunedPresensi} presensi yang sudah hilang upstream`);
    }

    // Everything upstream still files under this batch has been upserted by now,
    // so anything left over here left the batch (or was mis-filed into it) and
    // must go, or it keeps showing on the program's dashboard forever.
    const pruned = await pruneRemovedHalaqah(program.id, programHalaqahIds);
    if (pruned.skipped) {
      console.warn(`[sync ${program.slug}] prune skipped: ${pruned.skipped}`);
    }
    if (pruned.halaqah.length > 0) {
      const names = pruned.halaqah.map((h) => `${h.name ?? "?"} (#${h.id})`).join(", ");
      console.log(
        `[sync ${program.slug}] pruned ${pruned.halaqah.length} halaqah no longer in batch(es) ` +
          `${batchesToSync.map((b) => b.id).join("/")}: ${names} — ${pruned.jadwal} jadwal, ${pruned.attendance} presensi, ` +
          `${pruned.studentsSync} peserta` +
          (pruned.studentsKept > 0 ? `; ${pruned.studentsKept} roster row(s) kept (enriched)` : ""),
      );
    }

    // Upsert the enrolled-murid roster into `students`. tilawah is the source of
    // truth for identity; parent names are NOT in the API (backfilled separately
    // from the CMS xlsx, scripts/import-roster.ts) so they are left untouched.
    let rosterCount = 0;
    for (const r of enrolledByUserId.values()) {
      await db
        .insert(students)
        .values({
          programId: program.id,
          fullName: r.name,
          birthDate: r.birthDate,
          marhalah: r.marhalah,
          tilawahUserId: r.tilawahUserId,
        })
        .onConflictDoUpdate({
          target: [students.programId, students.tilawahUserId],
          set: { fullName: r.name, birthDate: r.birthDate, marhalah: r.marhalah },
        });
      rosterCount += 1;
    }

    const programAbsensi = absensiItems.filter((item) => programHalaqahIds.has(item.halaqah_id));
    const absensiByUserId = new Map(programAbsensi.map((item) => [item.user.id, item]));

    // Write EVERY enrolled murid to students_sync — enrollment (detail.users) is
    // the source of truth for who is a peserta — then overlay the absensi report
    // where present (phone, user_code, semester percentage). Students with no
    // attendance are still listed; previously students_sync was built from the
    // absensi report alone, so zero-presensi halaqah showed 0 peserta even though
    // murid were enrolled. attendance_rate/hadir_count are (re)computed below from
    // attendance_sync, so a never-attended student simply keeps them null.
    const allUserIds = new Set<number>([
      ...enrolledByUserId.keys(),
      ...absensiByUserId.keys(),
    ]);
    let studentCount = 0;
    for (const uid of allUserIds) {
      const e = enrolledByUserId.get(uid);
      const a = absensiByUserId.get(uid);
      const values = {
        programId: program.id,
        tilawahUserId: uid,
        halaqahUserId: e?.halaqahUserId ?? null,
        name: e?.name ?? a?.user.name ?? null,
        userCode: a?.user.user_code ?? null,
        phone: a?.user.phone ?? null,
        halaqahId: e?.halaqahId ?? a?.halaqah_id ?? null,
        pengajar: e?.pengajar ?? a?.pengajar ?? null,
        pertemuan: a?.pertemuan ?? null,
        kehadiranPercentage: a != null ? String(a.kehadiran_percentage) : null,
        gender: e?.gender ?? null,
        enrollmentStatusCode: e?.enrollmentStatusCode ?? null,
        enrollmentStatus: e?.enrollmentStatus ?? null,
        enrollmentCreatedAt: e?.enrollmentCreatedAt ?? null,
        enrollmentUpdatedAt: e?.enrollmentUpdatedAt ?? null,
        raw: (a ?? e ?? {}) as Record<string, unknown>,
        syncedAt: new Date(),
      };
      // Only overwrite the columns this run actually learned — a run that skipped
      // this halaqah's detail holds no enrollment, and writing it anyway blanked
      // halaqah_user_id for 272 murid on 25 Agu 2026. See students-upsert.ts.
      await db
        .insert(studentsSync)
        .values(values)
        .onConflictDoUpdate({
          target: [studentsSync.programId, studentsSync.tilawahUserId],
          set: studentsSyncUpdateSet(values, {
            hasEnrollment: e != null,
            hasAbsensi: a != null,
          }),
        });
      studentCount += 1;
    }

    /**
     * A peserta with no enrollment id can never be joined to a presensi, so they
     * drop out of the halaqah roster entirely. There is no legitimate steady
     * state for that: every murid the halaqah detail returns carries `pivot.id`.
     * A non-zero count means either an upsert wrote the column blank again (the
     * 25 Agu 2026 bug) or a halaqah's detail has never been fetched — both worth
     * a line in the sync log, since the failure is otherwise invisible until
     * someone opens the page and finds their class empty.
     */
    const orphanRows = await db.execute(sql`
      select count(*)::int as n from students_sync
      where program_id = ${program.id} and halaqah_id is not null and halaqah_user_id is null
    `);
    const orphans = Number(orphanRows.rows[0]?.n ?? 0);
    if (orphans > 0) {
      console.warn(
        `[sync ${program.slug}] ${orphans} peserta tanpa halaqah_user_id — ` +
          `mereka tidak muncul di roster halaqah; periksa apakah detail halaqah gagal ditarik`,
      );
    }

    // HITS Reguler only: "Perkenalan" and pertemuan "1" (both order 1) are the
    // SAME meeting. Fold them into one so counts/attendance don't double: move
    // any Perkenalan presensi onto the "1" jadwal (present-if-either), dedupe per
    // peserta keeping the best status, then drop the Perkenalan jadwal. Runs each
    // sync (idempotent) before the attendance recompute below, so every read
    // (dashboard, inbox, rekap, rata² hadir) sees the folded reality. Other
    // programs whose "Perkenalan" is their sole pertemuan-1 are untouched.
    if (program.slug === "hits-regular") {
      const RANK = (col: string) =>
        sql.raw(
          `case when ${col} in ('1','2') then 3 when ${col}='0' then 2 when ${col}='3' then 1 else 0 end`,
        );
      // 1) repoint Perkenalan presensi to the sibling "1" jadwal
      await db.execute(sql`
        update attendance_sync a
        set halaqah_jadwal_id = one.tilawah_jadwal_id
        from jadwal_sync perk
        join jadwal_sync one
          on one.program_id = perk.program_id
         and one.tilawah_halaqah_id = perk.tilawah_halaqah_id
         and one.name = '1' and one."order" = 1
        where a.program_id = ${program.id}
          and perk.program_id = ${program.id}
          and perk.name = 'Perkenalan' and perk."order" = 1
          and a.halaqah_jadwal_id = perk.tilawah_jadwal_id
      `);
      // 2) dedupe per (peserta, jadwal): keep best status (present > alfa > izin), tie → higher id
      await db.execute(sql`
        delete from attendance_sync a using attendance_sync b
        where a.program_id = ${program.id} and b.program_id = ${program.id}
          and a.halaqah_user_id = b.halaqah_user_id
          and a.halaqah_jadwal_id = b.halaqah_jadwal_id
          and a.id <> b.id
          and (${RANK("b.status")} > ${RANK("a.status")}
               or (${RANK("b.status")} = ${RANK("a.status")} and b.id > a.id))
      `);
      // 2b) meeting-status fold: pertemuan 1 counts as taught if EITHER the
      // "Perkenalan" or the "1" jadwal was Selesai/Mulai. Promote the surviving
      // "1" jadwal to the Perkenalan's status when Perkenalan was taught but "1"
      // wasn't, so the teacher recap (real = status 3/4) is "done if either".
      await db.execute(sql`
        update jadwal_sync one
        set status = perk.status
        from jadwal_sync perk
        where one.program_id = ${program.id} and perk.program_id = ${program.id}
          and one.tilawah_halaqah_id = perk.tilawah_halaqah_id
          and one.name = '1' and one."order" = 1
          and perk.name = 'Perkenalan' and perk."order" = 1
          and perk.status in (3, 4)
          and (one.status is null or one.status not in (3, 4))
      `);
      // 3) drop the now-empty Perkenalan jadwal so it isn't counted as a meeting
      await db.execute(sql`
        delete from jadwal_sync
        where program_id = ${program.id} and name = 'Perkenalan' and "order" = 1
      `);
    }

    // Date-relative attendance: compute per student from attendance_sync (the
    // per-meeting records just synced) rather than tilawah's semester-total
    // percentage. Telat(2) counts as hadir; Izin/Sakit(3) is excluded from both
    // numerator and denominator. One UPDATE keeps the definition in one place.
    await db.execute(sql`
      update students_sync ss set
        hadir_count = agg.hadir,
        effective_meetings = agg.effective,
        recorded_meetings = agg.recorded,
        izin_count = agg.izin,
        attendance_rate = case when agg.effective > 0
          then round(100.0 * agg.hadir / agg.effective, 1) else null end
      from (
        select halaqah_user_id,
          count(*) filter (where status in ('1','2'))       as hadir,
          count(*) filter (where status in ('0','1','2'))   as effective,
          count(*)                                          as recorded,
          count(*) filter (where status = '3')              as izin
        from attendance_sync
        where program_id = ${program.id} and halaqah_user_id is not null
        group by halaqah_user_id
      ) agg
      where ss.program_id = ${program.id} and ss.halaqah_user_id = agg.halaqah_user_id
    `);

    // Reconcile any manually-added `students` (null tilawah_user_id) with the
    // synced list by exact name — API-seeded rows already carry the id.
    const unreconciled = await db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(and(eq(students.programId, program.id), isNull(students.tilawahUserId)));

    const nameToTilawahUserId = new Map(
      programAbsensi.map((item) => [item.user.name.trim().toLowerCase(), item.user.id]),
    );

    let reconciledCount = 0;
    for (const s of unreconciled) {
      const tilawahUserId = nameToTilawahUserId.get(s.fullName.trim().toLowerCase());
      if (!tilawahUserId) continue;
      await db.update(students).set({ tilawahUserId }).where(eq(students.id, s.id));
      reconciledCount += 1;
    }

    if (runRow) {
      await db
        .update(syncRuns)
        .set({ status: "success", finishedAt: new Date() })
        .where(eq(syncRuns.id, runRow.id));
    }

    return {
      ok: true,
      programSlug: program.slug,
      halaqahCount,
      studentCount,
      jadwalCount,
      attendanceCount,
      rosterCount,
      reconciledCount,
      prunedHalaqah: pruned.halaqah.length,
      prunedPresensi,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown sync error";
    if (runRow) {
      await db
        .update(syncRuns)
        .set({ status: "failed", error: message, finishedAt: new Date() })
        .where(eq(syncRuns.id, runRow.id));
    }
    return empty({ error: message });
  }
}
