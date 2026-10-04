import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  hkmParticipants,
  hkmUsersSync,
  hkmReadingHistorySync,
  hkmTargetsSync,
  hkmDailySnapshots,
} from "@/lib/db/schema";
import { getProgram, type Program } from "@/lib/programs/resolve";
import {
  buildParticipantProgress,
  isExcludedName,
  normalizeEmail,
  resolveHkmParams,
  expectedPages,
  expectedJuz,
  computeMonthly,
  monthOptions,
  reportingMonthOf,
  toHkmStatus,
  isTracked,
  isMonitored,
  type ReadingRow,
  type HkmCategory,
  type MonthlyCategory,
  type HkmStatus,
} from "@/lib/insights/hkm";

export type HkmMode = "kumulatif" | "bulanan";

export type HkmParticipantRow = {
  participantId: string;
  nama: string;
  email: string | null;
  phone: string | null;
  halaqah: string | null;
  pengajar: string | null;
  gender: string; // 'Ikhwan' | 'Akhwat'
  status: HkmStatus;
  statusNote: string | null;
  cumulativePages: number;
  cumulativeJuz: number;
  avgPerDay: number;
  firstDate: string | null;
  lastReadAt: string | null;
  targetPages: number;
  category: HkmCategory;
  khatamCount: number;
  apiTotalKhatam: number | null;
  streakDays: number;
  order: number;
  matched: boolean; // master email found among pulled internal users
  atRisk: boolean;
  riskReasons: string[];
  // Monthly (selected month) view:
  mRealisasi: number;
  mTarget: number;
  mCapaian: number; // %
  mActiveDays: number;
  mCategory: MonthlyCategory;
};

export type LeaderRow = {
  key: string; // halaqah or pengajar
  pengajar?: string | null;
  count: number;
  avgJuz: number;
  onTargetPct: number;
  behindCount: number;
  khatamCount: number;
};

export type HkmDashboardData = {
  hasData: boolean;
  participantMasterCount: number;
  period: { startDate: string; endDate: string };
  target: { pagesPerDay: number; targetPages: number; targetJuz: number };
  mode: HkmMode;
  month: string; // YYYY-MM
  monthOptions: string[];
  monthTargetPages: number;
  kpis: {
    total: number;
    sudahKhatam: number;
    sudahTarget: number;
    belumTarget: number;
    belumMulai: number;
    atRisk: number;
    totalPages: number;
    avgJuz: number;
  };
  monthlyKpis: {
    total: number;
    tercapai: number;
    belumTercapai: number;
    tidakAktif: number;
    avgCapaian: number; // rata² capaian % across peserta
    totalPages: number;
  };
  participants: HkmParticipantRow[];
  // Off the roster (keluar/wafat) — kept visible as a short audit list so a
  // removal is never silent, but excluded from every KPI and from at-risk.
  nonAktif: {
    nama: string;
    halaqah: string | null;
    gender: string;
    status: HkmStatus;
    statusNote: string | null;
    statusChangedAt: string | null;
  }[];
  halaqahLeaderboard: LeaderRow[];
  pengajarLeaderboard: LeaderRow[];
  atRisk: HkmParticipantRow[];
  reconciliation: {
    unmatchedPulled: { name: string | null; email: string | null }[];
    noEmailMasters: { nama: string; halaqah: string | null; gender: string | null }[];
    noDataMasters: { nama: string; halaqah: string | null; gender: string | null; email: string | null }[];
    lowConfidence: { nama: string; email: string | null; matchMethod: string | null; confidence: string | null }[];
  };
  trend: { date: string; avgJuz: number; totalPages: number; participants: number }[];
};

function todayJakarta(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function normGender(g: string | null): "Ikhwan" | "Akhwat" {
  return String(g ?? "").trim().toLowerCase() === "ikhwan" ? "Ikhwan" : "Akhwat";
}

export async function getHkmDashboardData(
  programSlug: string,
  opts: { mode?: HkmMode; month?: string } = {},
): Promise<HkmDashboardData | null> {
  const program = await getProgram(programSlug);
  if (!program || program.dataSourceType !== "berkah_api") return null;
  const db = getDb();

  const params = resolveHkmParams(program.config);
  const startDate =
    (program.config as { hkm?: { startDate?: string } })?.hkm?.startDate ?? "2026-03-31";
  const endDate = todayJakarta();
  const targetPages = expectedPages(startDate, endDate, params.pagesPerDay);
  const targetJuz = expectedJuz(startDate, endDate, params.pagesPerDay, params.pagesPerJuz);

  const mode: HkmMode = opts.mode === "kumulatif" ? "kumulatif" : "bulanan";
  // Reporting months run 28th→27th, so on the 28th the newest option is already
  // NEXT month's window — listing only up to today's calendar month would leave
  // the month currently being reported on unselectable for four days.
  const months = monthOptions(startDate.slice(0, 7), reportingMonthOf(endDate));
  /**
   * Default to the CALENDAR month, not to the newest window. On 28 Aug the
   * September window (28 Aug – 27 Sep) is one day old and empty; landing on it
   * would show a page of zeros for the four days a coordinator still calls
   * "bulan ini". The fresh window stays in the picker, just not as the default.
   */
  const currentCalendarMonth = endDate.slice(0, 7);
  const fallback = months.includes(currentCalendarMonth) ? currentCalendarMonth : months[0];
  const month = opts.month && months.includes(opts.month) ? opts.month : fallback;

  const [masters, users, readings, snapshots] = await Promise.all([
    db.select().from(hkmParticipants).where(eq(hkmParticipants.programId, program.id)),
    db.select().from(hkmUsersSync).where(eq(hkmUsersSync.programId, program.id)),
    db
      .select({
        email: hkmReadingHistorySync.email,
        historyDate: hkmReadingHistorySync.historyDate,
        totalPages: hkmReadingHistorySync.totalPages,
        toPage: hkmReadingHistorySync.toPage,
      })
      .from(hkmReadingHistorySync)
      .where(eq(hkmReadingHistorySync.programId, program.id)),
    db
      .select({
        snapshotDate: hkmDailySnapshots.snapshotDate,
        cumulativeJuz: hkmDailySnapshots.cumulativeJuz,
        cumulativePages: hkmDailySnapshots.cumulativePages,
      })
      .from(hkmDailySnapshots)
      .where(eq(hkmDailySnapshots.programId, program.id))
      .orderBy(asc(hkmDailySnapshots.snapshotDate)),
  ]);

  // Index pulled users + readings by normalized email.
  const userByEmail = new Map<string, (typeof users)[number]>();
  for (const u of users) {
    const e = normalizeEmail(u.email);
    if (e && !userByEmail.has(e)) userByEmail.set(e, u);
  }
  const readingsByEmail = new Map<string, ReadingRow[]>();
  for (const r of readings) {
    const e = normalizeEmail(r.email);
    if (!e || !r.historyDate) continue;
    const arr = readingsByEmail.get(e) ?? [];
    arr.push({ date: r.historyDate, totalPages: Number(r.totalPages ?? 0), sampaiPages: Number(r.toPage ?? 0) });
    readingsByEmail.set(e, arr);
  }
  const masterEmails = new Set(masters.map((m) => m.emailMaster).filter(Boolean) as string[]);

  const now = new Date(`${endDate}T12:00:00+07:00`);
  const rows: HkmParticipantRow[] = [];
  const nonAktif: HkmDashboardData["nonAktif"] = [];
  const noEmailMasters: HkmDashboardData["reconciliation"]["noEmailMasters"] = [];
  const noDataMasters: HkmDashboardData["reconciliation"]["noDataMasters"] = [];
  const lowConfidence: HkmDashboardData["reconciliation"]["lowConfidence"] = [];

  for (const m of masters) {
    if (isExcludedName(m.namaPeserta, program.config)) continue;
    const status = toHkmStatus(m.status);
    if (!isTracked(status)) {
      nonAktif.push({
        nama: m.namaPeserta,
        halaqah: m.namaHalaqah,
        gender: normGender(m.gender),
        status,
        statusNote: m.statusNote,
        statusChangedAt: m.statusChangedAt ? m.statusChangedAt.toISOString() : null,
      });
      continue;
    }
    const email = m.emailMaster;
    const apiUser = email ? userByEmail.get(email) : undefined;
    const rdgs = email ? readingsByEmail.get(email) ?? [] : [];

    if (!email) noEmailMasters.push({ nama: m.namaPeserta, halaqah: m.namaHalaqah, gender: m.gender });
    else if (rdgs.length === 0)
      noDataMasters.push({ nama: m.namaPeserta, halaqah: m.namaHalaqah, gender: m.gender, email });
    if (m.confidence != null && Number(m.confidence) < 1)
      lowConfidence.push({ nama: m.namaPeserta, email, matchMethod: m.matchMethod, confidence: m.confidence });

    const prog = buildParticipantProgress(
      {
        participantId: m.id,
        nama: m.namaPeserta,
        email,
        halaqah: m.namaHalaqah,
        pengajar: m.namaPengajar,
        gender: normGender(m.gender),
        readings: rdgs,
        apiTotalKhatam: apiUser?.totalKhatam ?? null,
        lastReadAt: apiUser?.lastReadAt ? apiUser.lastReadAt.toISOString() : null,
      },
      { startDate, endDate, config: program.config, now },
    );

    const mo = computeMonthly(rdgs, month, {
      pagesPerDay: params.pagesPerDay,
      pagesPerJuz: params.pagesPerJuz,
      today: endDate, // current month → target tracks the running date
    });

    rows.push({
      participantId: m.id,
      nama: prog.nama,
      email,
      phone: apiUser?.phone ?? null,
      halaqah: prog.halaqah,
      pengajar: prog.pengajar,
      gender: normGender(m.gender),
      status,
      statusNote: m.statusNote,
      cumulativePages: prog.cumulativePages,
      cumulativeJuz: prog.cumulativeJuz,
      avgPerDay: prog.avgPerDay,
      firstDate: prog.firstDate,
      lastReadAt: prog.apiTotalKhatam != null && apiUser?.lastReadAt ? apiUser.lastReadAt.toISOString() : prog.lastDate,
      targetPages: prog.targetPages,
      category: prog.category,
      khatamCount: prog.khatamCount,
      apiTotalKhatam: prog.apiTotalKhatam,
      streakDays: prog.streakDays,
      order: prog.order,
      matched: !!apiUser,
      // Cuti: the gap is explained and accepted, so it is not a kendala — no
      // at-risk row, no WA nudge (sendHkmReminders targets exactly this list).
      atRisk: isMonitored(status) && prog.atRisk,
      riskReasons: isMonitored(status) ? prog.riskReasons : [],
      mRealisasi: mo.realisasiPages,
      mTarget: mo.targetPages,
      mCapaian: mo.capaianPct,
      mActiveDays: mo.activeDays,
      mCategory: mo.category,
    });
  }

  const MCAT_ORDER: Record<MonthlyCategory, number> = { Tercapai: 1, "Belum Tercapai": 2, "Tidak Aktif": 3 };
  if (mode === "bulanan") {
    rows.sort((a, b) => MCAT_ORDER[a.mCategory] - MCAT_ORDER[b.mCategory] || b.mRealisasi - a.mRealisasi);
  } else {
    rows.sort((a, b) => a.order - b.order || b.cumulativeJuz - a.cumulativeJuz);
  }

  // KPIs
  const kpis = {
    total: rows.length,
    sudahKhatam: rows.filter((r) => r.khatamCount >= 1).length,
    sudahTarget: rows.filter((r) => r.category === "Sudah Mencapai Target").length,
    belumTarget: rows.filter((r) => r.category === "Belum Mencapai Target").length,
    belumMulai: rows.filter((r) => r.category === "Belum Sama Sekali").length,
    atRisk: rows.filter((r) => r.atRisk).length,
    totalPages: round1(rows.reduce((s, r) => s + r.cumulativePages, 0)),
    avgJuz: rows.length ? round1(rows.reduce((s, r) => s + r.cumulativeJuz, 0) / rows.length) : 0,
  };

  const monthTargetPages = rows[0]?.mTarget ?? 0;
  const monthlyKpis = {
    total: rows.length,
    tercapai: rows.filter((r) => r.mCategory === "Tercapai").length,
    belumTercapai: rows.filter((r) => r.mCategory === "Belum Tercapai").length,
    tidakAktif: rows.filter((r) => r.mCategory === "Tidak Aktif").length,
    avgCapaian: rows.length ? round1(rows.reduce((s, r) => s + r.mCapaian, 0) / rows.length) : 0,
    totalPages: round1(rows.reduce((s, r) => s + r.mRealisasi, 0)),
  };

  const halaqahLeaderboard = buildLeaderboard(rows, (r) => r.halaqah ?? "—", targetPages);
  const pengajarLeaderboard = buildLeaderboard(rows, (r) => r.pengajar ?? "—", targetPages);

  // Unmatched pulled internal users (the 381-vs-201 leftovers).
  const unmatchedPulled = users
    .filter((u) => {
      const e = normalizeEmail(u.email);
      return !e || !masterEmails.has(e);
    })
    .map((u) => ({ name: u.name, email: u.email }));

  // Cohort trend from snapshots.
  const byDate = new Map<string, { juz: number[]; pages: number }>();
  for (const s of snapshots) {
    if (!s.snapshotDate) continue;
    const e = byDate.get(s.snapshotDate) ?? { juz: [], pages: 0 };
    e.juz.push(Number(s.cumulativeJuz ?? 0));
    e.pages += Number(s.cumulativePages ?? 0);
    byDate.set(s.snapshotDate, e);
  }
  const trend = [...byDate.entries()].map(([date, e]) => ({
    date,
    avgJuz: e.juz.length ? round1(e.juz.reduce((a, b) => a + b, 0) / e.juz.length) : 0,
    totalPages: round1(e.pages),
    participants: e.juz.length,
  }));

  return {
    hasData: users.length > 0 || readings.length > 0,
    participantMasterCount: masters.length,
    period: { startDate, endDate },
    target: { pagesPerDay: params.pagesPerDay, targetPages, targetJuz },
    mode,
    month,
    monthOptions: months,
    monthTargetPages,
    kpis,
    monthlyKpis,
    participants: rows,
    nonAktif,
    halaqahLeaderboard,
    pengajarLeaderboard,
    atRisk: rows.filter((r) => r.atRisk),
    reconciliation: { unmatchedPulled, noEmailMasters, noDataMasters, lowConfidence },
    trend,
  };
}

function buildLeaderboard(
  rows: HkmParticipantRow[],
  keyFn: (r: HkmParticipantRow) => string,
  targetPages: number,
): LeaderRow[] {
  const groups = new Map<string, HkmParticipantRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const out: LeaderRow[] = [];
  for (const [key, arr] of groups) {
    const onTarget = arr.filter((r) => r.cumulativePages >= targetPages).length;
    out.push({
      key,
      pengajar: arr[0]?.pengajar ?? null,
      count: arr.length,
      avgJuz: arr.length ? round1(arr.reduce((s, r) => s + r.cumulativeJuz, 0) / arr.length) : 0,
      onTargetPct: arr.length ? Math.round((100 * onTarget) / arr.length) : 0,
      behindCount: arr.filter((r) => r.category === "Belum Mencapai Target" || r.category === "Belum Sama Sekali").length,
      khatamCount: arr.filter((r) => r.khatamCount >= 1).length,
    });
  }
  return out.sort((a, b) => b.avgJuz - a.avgJuz);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Program + params, for the drill-down page. */
export async function getHkmProgram(programSlug: string): Promise<Program | null> {
  const program = await getProgram(programSlug);
  return program && program.dataSourceType === "berkah_api" ? program : null;
}

export type HkmParticipantDetail = {
  nama: string;
  email: string | null;
  phone: string | null;
  halaqah: string | null;
  pengajar: string | null;
  gender: string;
  status: HkmStatus;
  statusNote: string | null;
  cumulativePages: number;
  cumulativeJuz: number;
  avgPerDay: number;
  targetPages: number;
  targetJuz: number;
  category: HkmCategory;
  khatamCount: number;
  apiTotalKhatam: number | null;
  streakDays: number;
  longestStreak: number;
  activeDays: number;
  atRisk: boolean;
  riskReasons: string[];
  firstDate: string | null;
  lastReadAt: string | null;
  history: {
    date: string;
    fromSura: number | null;
    toSura: number | null;
    fromJuz: number | null;
    toJuz: number | null;
    fromPage: number | null;
    toPage: number | null;
    totalPages: number | null;
  }[];
  juzCoverage: number[]; // index 0..29 → read-count for juz 1..30
  suraCoverage: number[]; // index 0..113 → read-count for surah 1..114
  target: {
    targetTotal: number | null;
    targetDone: number | null;
    targetRemaining: number | null;
    targetPerDay: number | null;
    statusLabel: string | null;
  } | null;
  trend: { date: string; cumulativeJuz: number }[];
};

export async function getHkmParticipantDetail(
  programSlug: string,
  participantId: string,
): Promise<HkmParticipantDetail | null> {
  const program = await getProgram(programSlug);
  if (!program || program.dataSourceType !== "berkah_api") return null;
  const db = getDb();

  const [participant] = await db
    .select()
    .from(hkmParticipants)
    .where(eq(hkmParticipants.id, participantId));
  if (!participant || participant.programId !== program.id) return null;

  const params = resolveHkmParams(program.config);
  const startDate =
    (program.config as { hkm?: { startDate?: string } })?.hkm?.startDate ?? "2026-03-31";
  const endDate = todayJakarta();
  const email = participant.emailMaster;

  const [user] = participant.berkahUserId
    ? await db.select().from(hkmUsersSync).where(eq(hkmUsersSync.berkahUserId, participant.berkahUserId))
    : email
      ? await db.select().from(hkmUsersSync).where(eq(hkmUsersSync.email, email))
      : [];

  const historyRows = email
    ? await db
        .select()
        .from(hkmReadingHistorySync)
        .where(eq(hkmReadingHistorySync.email, email))
        .orderBy(asc(hkmReadingHistorySync.historyDate))
    : [];

  const targetRow = participant.berkahUserId
    ? (
        await db
          .select()
          .from(hkmTargetsSync)
          .where(eq(hkmTargetsSync.berkahUserId, participant.berkahUserId))
      )[0]
    : undefined;

  const snapshots = await db
    .select({ snapshotDate: hkmDailySnapshots.snapshotDate, cumulativeJuz: hkmDailySnapshots.cumulativeJuz })
    .from(hkmDailySnapshots)
    .where(eq(hkmDailySnapshots.participantId, participant.id))
    .orderBy(asc(hkmDailySnapshots.snapshotDate));

  const readings: ReadingRow[] = historyRows
    .filter((h) => h.historyDate)
    .map((h) => ({ date: h.historyDate!, totalPages: Number(h.totalPages ?? 0), sampaiPages: Number(h.toPage ?? 0) }));

  const prog = buildParticipantProgress(
    {
      participantId: participant.id,
      nama: participant.namaPeserta,
      email,
      halaqah: participant.namaHalaqah,
      pengajar: participant.namaPengajar,
      gender: normGender(participant.gender),
      readings,
      apiTotalKhatam: user?.totalKhatam ?? null,
      lastReadAt: user?.lastReadAt ? user.lastReadAt.toISOString() : null,
    },
    { startDate, endDate, config: program.config, now: new Date(`${endDate}T12:00:00+07:00`) },
  );

  // Coverage maps for the heatmap.
  const juzCoverage = new Array(30).fill(0);
  const suraCoverage = new Array(114).fill(0);
  for (const h of historyRows) {
    const fj = h.fromJuz != null ? Math.floor(Number(h.fromJuz)) : null;
    const tj = h.toJuz != null ? Math.ceil(Number(h.toJuz)) : null;
    if (fj != null && tj != null) {
      for (let j = Math.max(1, fj); j <= Math.min(30, tj); j++) juzCoverage[j - 1] += 1;
    }
    if (h.fromSura != null && h.toSura != null) {
      for (let s = Math.max(1, h.fromSura); s <= Math.min(114, h.toSura); s++) suraCoverage[s - 1] += 1;
    }
  }

  const status = toHkmStatus(participant.status);

  return {
    nama: prog.nama,
    email,
    phone: user?.phone ?? null,
    halaqah: prog.halaqah,
    pengajar: prog.pengajar,
    gender: normGender(participant.gender),
    status,
    statusNote: participant.statusNote,
    cumulativePages: prog.cumulativePages,
    cumulativeJuz: prog.cumulativeJuz,
    avgPerDay: prog.avgPerDay,
    targetPages: prog.targetPages,
    targetJuz: expectedJuz(startDate, endDate, params.pagesPerDay, params.pagesPerJuz),
    category: prog.category,
    khatamCount: prog.khatamCount,
    apiTotalKhatam: prog.apiTotalKhatam,
    streakDays: prog.streakDays,
    longestStreak: prog.longestStreak,
    activeDays: prog.activeDays,
    atRisk: isMonitored(status) && prog.atRisk,
    riskReasons: isMonitored(status) ? prog.riskReasons : [],
    firstDate: prog.firstDate,
    lastReadAt: user?.lastReadAt ? user.lastReadAt.toISOString() : prog.lastDate,
    history: historyRows.map((h) => ({
      date: h.historyDate ?? "",
      fromSura: h.fromSura,
      toSura: h.toSura,
      fromJuz: h.fromJuz != null ? Number(h.fromJuz) : null,
      toJuz: h.toJuz != null ? Number(h.toJuz) : null,
      fromPage: h.fromPage,
      toPage: h.toPage,
      totalPages: h.totalPages,
    })),
    juzCoverage,
    suraCoverage,
    target: targetRow
      ? {
          targetTotal: targetRow.targetTotal != null ? Number(targetRow.targetTotal) : null,
          targetDone: targetRow.targetDone != null ? Number(targetRow.targetDone) : null,
          targetRemaining: targetRow.targetRemaining != null ? Number(targetRow.targetRemaining) : null,
          targetPerDay: targetRow.targetPerDay != null ? Number(targetRow.targetPerDay) : null,
          statusLabel: targetRow.statusLabel,
        }
      : null,
    trend: snapshots
      .filter((s) => s.snapshotDate)
      .map((s) => ({ date: s.snapshotDate!, cumulativeJuz: Number(s.cumulativeJuz ?? 0) })),
  };
}
