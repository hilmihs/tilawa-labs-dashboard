import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  programs,
  syncRuns,
  hkmParticipants,
  hkmUsersSync,
  hkmReadingHistorySync,
  hkmTargetsSync,
  hkmDailySnapshots,
} from "@/lib/db/schema";
import { loginToBerkah, berkahBaseUrl } from "@/lib/integrations/HKM CMS/auth";
import type { SessionHolder } from "@/lib/integrations/HKM CMS/client";
import {
  fetchInternalUsers,
  fetchReadingExport,
  fetchAllTargets,
  fetchSurahs,
  type BerkahExportRow,
} from "@/lib/integrations/HKM CMS/fetchers";
import type { BerkahUser } from "@/lib/integrations/HKM CMS/types";
import { buildSuraNameMap, parseSuraNumber } from "@/lib/sync/sura-name";
import { mergeDailyReadings } from "@/lib/sync/hkm-reading-merge";
import { recordFailedRuns } from "@/lib/sync/last-sync";
import { seedHkmMasterIfEmpty } from "@/lib/sync/hkm-seed-master";
import {
  buildParticipantProgress,
  normalizeEmail,
  toHkmStatus,
  isTracked,
  type ReadingRow,
} from "@/lib/insights/hkm";

type Program = typeof programs.$inferSelect;

export type HkmSyncResult = {
  ok: boolean;
  programSlug: string;
  userCount: number;
  readingCount: number;
  /** Baris export tambahan yang digabung ke hari yang sama (lihat hkm-reading-merge). */
  mergedRowCount: number;
  targetCount: number;
  matchedParticipants: number; // master rows matched to a pulled user by email
  snapshotCount: number;
  unmatchedPulled: number; // internal users NOT in the master (the 381-vs-201 leftovers)
  masterNoData: number; // master rows (with email) that had no reading data
  error?: string;
};

const isInternalBool = (v: BerkahUser["is_internal"]): boolean =>
  v === true || v === 1 || v === "1";

function todayJakarta(): string {
  // Asia/Jakarta (UTC+7) calendar date — snapshots are one-per-day.
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Sync every berkah-backed program. Logs in once and reuses the session. */
export async function runAllHkmSyncs(): Promise<HkmSyncResult[]> {
  const baseUrl = berkahBaseUrl();
  const db = getDb();
  const all = await db.select().from(programs);
  // config.syncPaused freezes a program's synced data — same contract the
  // tilawah runner honours, so the admin toggle means one thing everywhere.
  const targets = all.filter(
    (p) =>
      p.dataSourceType === "berkah_api" &&
      !(p.config as { syncPaused?: boolean } | null)?.syncPaused,
  );
  if (targets.length === 0) return [];

  // Login dulu, sebelum ada run row satu pun. Kalau upstream tak bisa dihubungi,
  // catat kegagalannya untuk tiap program yang seharusnya jalan — kalau tidak,
  // kemandekannya senyap total (lihat recordFailedRuns).
  let holder: SessionHolder;
  try {
    holder = { session: await loginToBerkah(baseUrl) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "login berkah gagal";
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    await recordFailedRuns(
      targets.map((p) => p.id),
      "hkm_full",
      `login berkah gagal: ${message}${cause ? ` (${cause})` : ""}`,
    );
    throw err;
  }
  const results: HkmSyncResult[] = [];
  for (const program of targets) {
    results.push(await runHkmSyncForProgram(program, baseUrl, holder));
  }
  return results;
}

/** Sync one berkah program by slug (own login). */
export async function runHkmSyncForSlug(slug: string): Promise<HkmSyncResult | null> {
  const baseUrl = berkahBaseUrl();
  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!program || program.dataSourceType !== "berkah_api") return null;
  const holder: SessionHolder = { session: await loginToBerkah(baseUrl) };
  return runHkmSyncForProgram(program, baseUrl, holder);
}

export async function runHkmSyncForProgram(
  program: Program,
  baseUrl: string,
  holder: SessionHolder,
): Promise<HkmSyncResult> {
  const db = getDb();
  const startDate =
    (program.config as { hkm?: { startDate?: string } })?.hkm?.startDate ?? "2026-03-31";
  const endDate = todayJakarta();

  const empty = (over: Partial<HkmSyncResult>): HkmSyncResult => ({
    ok: false,
    programSlug: program.slug,
    userCount: 0,
    readingCount: 0,
    mergedRowCount: 0,
    targetCount: 0,
    matchedParticipants: 0,
    snapshotCount: 0,
    unmatchedPulled: 0,
    masterNoData: 0,
    ...over,
  });

  const [runRow] = await db
    .insert(syncRuns)
    .values({ programId: program.id, runType: "hkm_full", status: "running" })
    .returning({ id: syncRuns.id });

  try {
    const businessUnitId = program.berkahBusinessUnitId ?? null;
    const isInternal =
      (program.config as { hkm?: { userFilter?: { isInternal?: number } } })?.hkm?.userFilter
        ?.isInternal ?? 1;

    /**
     * Surah name → number map, for the export's "Dari/Sampai Surah" column.
     *
     * Never fatal. This lookup used to be the first call in the run, so when
     * berkah's `/api/quran/surahs` started returning 500 — its taslim.life
     * backend went unreachable on 19 Agu 2026 — the entire HKM sync died before
     * fetching a single peserta: 416 consecutive failures and seven days of
     * stale setoran, over a reference table that only tints one heatmap.
     *
     * The same outage also changed the export: latin names ("Maryam") became
     * placeholders ("Surah 19"). parseSuraNumber reads those directly, so the
     * common path now needs no reference data at all, and the map below only
     * covers rows that still carry a real name.
     */
    const rememberedSuraNames = await db.execute(sql`
      select name, number from (
        select raw->>'fromSuraName' as name, from_sura as number
        from hkm_reading_history_sync
        where program_id = ${program.id} and from_sura is not null
        union
        select raw->>'toSuraName', to_sura
        from hkm_reading_history_sync
        where program_id = ${program.id} and to_sura is not null
      ) s
      where name is not null
    `);
    let upstreamSurahs: Awaited<ReturnType<typeof fetchSurahs>> = [];
    try {
      upstreamSurahs = await fetchSurahs(baseUrl, holder);
    } catch (e) {
      console.warn(
        `[sync ${program.slug}] tabel surah tidak bisa diambil, pakai peta dari riwayat sendiri — ${String(e).slice(0, 200)}`,
      );
    }
    const suraByName = buildSuraNameMap(
      rememberedSuraNames.rows.map((r) => ({
        name: (r.name as string) ?? null,
        number: r.number != null ? Number(r.number) : null,
      })),
      upstreamSurahs,
    );
    const suraNum = (name: string | null): number | null => parseSuraNumber(name, suraByName);

    // 1) Internal users → hkm_users_sync
    const users = await fetchInternalUsers(baseUrl, holder, { businessUnitId, isInternal });
    for (const u of users) {
      const values = {
        programId: program.id,
        berkahUserId: u.id,
        uuid: u.uuid ?? null,
        name: u.name ?? null,
        email: normalizeEmail(u.email),
        phone: u.phone ?? null,
        gender: u.gender ?? null,
        isInternal: isInternalBool(u.is_internal),
        progressKhatam: u.progress_khatam != null ? String(u.progress_khatam) : null,
        totalKhatam: u.total_khatam ?? null,
        lastReadAt: u.last_read_at ? new Date(u.last_read_at) : null,
        businessUnitId: u.business_unit?.id ?? null,
        businessUnit: u.business_unit?.name ?? null,
        raw: u as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      };
      await db
        .insert(hkmUsersSync)
        .values(values)
        .onConflictDoUpdate({
          target: [hkmUsersSync.programId, hkmUsersSync.berkahUserId],
          set: {
            uuid: values.uuid,
            name: values.name,
            email: values.email,
            phone: values.phone,
            gender: values.gender,
            isInternal: values.isInternal,
            progressKhatam: values.progressKhatam,
            totalKhatam: values.totalKhatam,
            lastReadAt: values.lastReadAt,
            businessUnitId: values.businessUnitId,
            businessUnit: values.businessUnit,
            raw: values.raw,
            syncedAt: values.syncedAt,
          },
        });
    }

    // 2) Reading export CSV (global, page-accurate) → satu baris gabungan per
    //    (user/email, date) → hkm_reading_history_sync. Grouped by email for the
    //    progress engine (participants join by email).
    //    Export mengeluarkan satu baris per target khatam, jadi satu hari bisa
    //    punya beberapa baris; mergeDailyReadings menjumlahkan yang benar-benar
    //    lanjutan dan menolak duplikat/rekap kumulatif — lihat
    //    lib/sync/hkm-reading-merge.ts.
    const exportRows = await fetchReadingExport(baseUrl, holder, {
      businessUnitId,
      isInternal,
      startDate,
      endDate,
    });
    const emailByUserId = new Map<number, string | null>(users.map((u) => [u.id, normalizeEmail(u.email)]));

    const readingsByEmail = new Map<string, ReadingRow[]>();
    let readingCount = 0;
    let mergedRowCount = 0; // baris tambahan yang ikut dihitung (dulu terbuang)
    for (const day of mergeDailyReadings(exportRows)) {
      const { first, last, totalPages, toPage } = day;
      const email =
        normalizeEmail(first.email) ?? (first.userId != null ? emailByUserId.get(first.userId) ?? null : null);
      const date = first.tanggal!; // mergeDailyReadings sudah membuang yang null
      mergedRowCount += day.extraRowsMerged;

      if (first.userId != null) {
        // Identitas + awal bacaan dari baris pertama, akhir bacaan dari baris
        // terakhir yang diterima, halaman dari penjumlahan.
        const merged: BerkahExportRow = {
          ...first,
          targetKhatamKe: last.targetKhatamKe,
          toSuraName: last.toSuraName,
          toAyah: last.toAyah,
          toJuz: last.toJuz,
          toPage,
          totalPages,
        };
        await upsertReadingRow(program.id, first.userId, email, merged, suraNum(first.fromSuraName), suraNum(last.toSuraName));
        readingCount += 1;
      }
      if (email) {
        const arr = readingsByEmail.get(email) ?? [];
        arr.push({ date, totalPages, sampaiPages: toPage });
        readingsByEmail.set(email, arr);
      }
    }

    // 3) Targets → hkm_targets_sync
    const targets = await fetchAllTargets(baseUrl, holder);
    for (const t of targets) {
      const values = {
        programId: program.id,
        berkahTargetId: t.id,
        berkahUserId: t.user_id ?? null,
        targetType: t.target_type ?? null,
        targetDate: t.target_date ? t.target_date.slice(0, 10) : null,
        targetPerDay: t.target_per_day != null ? String(t.target_per_day) : null,
        targetTotal: t.target_total != null ? String(t.target_total) : null,
        targetDone: t.target_done != null ? String(t.target_done) : null,
        targetRemaining: t.target_remaining != null ? String(t.target_remaining) : null,
        statusLabel: t.status_label ?? null,
        raw: t as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      };
      await db
        .insert(hkmTargetsSync)
        .values(values)
        .onConflictDoUpdate({
          target: [hkmTargetsSync.programId, hkmTargetsSync.berkahTargetId],
          set: {
            berkahUserId: values.berkahUserId,
            targetType: values.targetType,
            targetDate: values.targetDate,
            targetPerDay: values.targetPerDay,
            targetTotal: values.targetTotal,
            targetDone: values.targetDone,
            targetRemaining: values.targetRemaining,
            statusLabel: values.statusLabel,
            raw: values.raw,
            syncedAt: values.syncedAt,
          },
        });
    }

    // 4) Master join + reconciliation + daily snapshot
    // A deployment whose master was never imported gets it from the presensi
    // roster (HKM = presensi + setoran, one program) — see hkm-seed-master.ts.
    await seedHkmMasterIfEmpty(program, users);
    const masters = await db
      .select()
      .from(hkmParticipants)
      .where(eq(hkmParticipants.programId, program.id));
    const userByEmail = new Map<string, BerkahUser>();
    for (const u of users) {
      const e = normalizeEmail(u.email);
      if (e && !userByEmail.has(e)) userByEmail.set(e, u);
    }
    const masterEmails = new Set(masters.map((m) => m.emailMaster).filter(Boolean) as string[]);

    let matchedParticipants = 0;
    let masterNoData = 0;
    let snapshotCount = 0;
    for (const m of masters) {
      // Off the roster (keluar/wafat): the the partner system user row still exists and may
      // still move, but we stop snapshotting it — otherwise the cohort trend
      // keeps carrying people who are no longer in the program.
      if (!isTracked(toHkmStatus(m.status))) continue;

      const email = m.emailMaster;
      const apiUser = email ? userByEmail.get(email) : undefined;
      const readings = email ? readingsByEmail.get(email) ?? [] : [];

      if (apiUser) {
        matchedParticipants += 1;
        if (m.berkahUserId !== apiUser.id) {
          await db
            .update(hkmParticipants)
            .set({ berkahUserId: apiUser.id })
            .where(eq(hkmParticipants.id, m.id));
        }
      }
      if (email && readings.length === 0) masterNoData += 1;

      const prog = buildParticipantProgress(
        {
          participantId: m.id,
          nama: m.namaPeserta,
          email,
          halaqah: m.namaHalaqah,
          pengajar: m.namaPengajar,
          gender: m.gender,
          readings,
          apiTotalKhatam: apiUser?.total_khatam ?? null,
          apiProgressKhatam: apiUser?.progress_khatam != null ? Number(apiUser.progress_khatam) : null,
          lastReadAt: apiUser?.last_read_at ?? null,
        },
        { startDate, endDate, config: program.config, now: new Date(`${endDate}T12:00:00+07:00`) },
      );

      await db
        .insert(hkmDailySnapshots)
        .values({
          programId: program.id,
          participantId: m.id,
          snapshotDate: endDate,
          cumulativePages: String(prog.cumulativePages),
          cumulativeJuz: String(prog.cumulativeJuz),
          totalKhatam: apiUser?.total_khatam ?? prog.khatamCount,
          targetPages: String(prog.targetPages),
          category: prog.category,
          streakDays: prog.streakDays,
          lastReadAt: apiUser?.last_read_at ? new Date(apiUser.last_read_at) : null,
        })
        .onConflictDoUpdate({
          target: [hkmDailySnapshots.programId, hkmDailySnapshots.participantId, hkmDailySnapshots.snapshotDate],
          set: {
            cumulativePages: String(prog.cumulativePages),
            cumulativeJuz: String(prog.cumulativeJuz),
            totalKhatam: apiUser?.total_khatam ?? prog.khatamCount,
            targetPages: String(prog.targetPages),
            category: prog.category,
            streakDays: prog.streakDays,
            lastReadAt: apiUser?.last_read_at ? new Date(apiUser.last_read_at) : null,
          },
        });
      snapshotCount += 1;
    }

    const unmatchedPulled = users.filter((u) => {
      const e = normalizeEmail(u.email);
      return !e || !masterEmails.has(e);
    }).length;

    if (runRow) {
      await db
        .update(syncRuns)
        .set({ status: "success", finishedAt: new Date() })
        .where(eq(syncRuns.id, runRow.id));
    }

    return {
      ok: true,
      programSlug: program.slug,
      userCount: users.length,
      readingCount,
      mergedRowCount,
      targetCount: targets.length,
      matchedParticipants,
      snapshotCount,
      unmatchedPulled,
      masterNoData,
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

  async function upsertReadingRow(
    programId: string,
    berkahUserId: number,
    email: string | null,
    r: BerkahExportRow,
    fromSura: number | null,
    toSura: number | null,
  ) {
    const values = {
      programId,
      berkahUserId,
      email,
      targetKhatamKe: r.targetKhatamKe,
      historyDate: r.tanggal!,
      fromSura,
      toSura,
      fromAyah: r.fromAyah,
      toAyah: r.toAyah,
      fromJuz: r.fromJuz != null ? String(r.fromJuz) : null,
      toJuz: r.toJuz != null ? String(r.toJuz) : null,
      fromPage: r.fromPage,
      toPage: r.toPage,
      totalPages: r.totalPages,
      raw: r as unknown as Record<string, unknown>,
      syncedAt: new Date(),
    };
    await db
      .insert(hkmReadingHistorySync)
      .values(values)
      .onConflictDoUpdate({
        target: [
          hkmReadingHistorySync.programId,
          hkmReadingHistorySync.berkahUserId,
          hkmReadingHistorySync.historyDate,
        ],
        set: {
          email: values.email,
          targetKhatamKe: values.targetKhatamKe,
          fromSura: values.fromSura,
          toSura: values.toSura,
          fromAyah: values.fromAyah,
          toAyah: values.toAyah,
          fromJuz: values.fromJuz,
          toJuz: values.toJuz,
          fromPage: values.fromPage,
          toPage: values.toPage,
          totalPages: values.totalPages,
          raw: values.raw,
          syncedAt: values.syncedAt,
        },
      });
  }
}

/** True if any berkah sync is currently mid-run (used by the cron guard). */
export async function anyHkmProgramExists(): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute(
    sql`select 1 from programs where data_source_type = 'berkah_api' limit 1`,
  );
  return rows.rows.length > 0;
}
