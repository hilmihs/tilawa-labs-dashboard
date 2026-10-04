import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bukanKelasDemo, pesertaAktif } from "@/lib/enrollment";
import { attendanceThresholds, halaqahSync, studentsSync, lateIncidents, students } from "@/lib/db/schema";
import { getProgram } from "@/lib/programs/resolve";
import { defaultBatchScope, getProgramBatches } from "@/lib/programs/batches";
import { getProgramConfig, genderLabel, type Segmentation } from "@/lib/programs/config";

const DEFAULT_PERIOD_TYPE = "yaumiy";

export type MonitoredStudent = {
  tilawahUserId: number;
  name: string;
  marhalah: string | null;
  // Punya halaqah atau tidak. Terpisah dari `marhalah` karena halaqah boleh
  // tanpa level (semua halaqah HKM): peserta itu sudah ditempatkan, hanya
  // programnya tidak bermarhalah.
  placed: boolean;
  gender: number | null;
  pengajar: string | null;
  attendanceRate: number | null; // date-relative: hadir ÷ pertemuan-terjadi (Izin dikecualikan)
  hadirCount: number | null;
  effectiveMeetings: number | null; // denominator (Alfa+Hadir+Telat)
  semesterProgressPct: number | null; // tilawah's raw: hadir ÷ total seluruh semester
  belowThreshold: boolean;
  lateIncidentCount: number;
  spRequiredCount: number;
};

export type SegmentSummary = {
  primary: string; // level / marhalah
  secondary: string | null; // gender label (Ikhwan/Akhwat) or null
  count: number;
  avgRate: number | null;
  belowCount: number;
};

export type DashboardData = {
  hasSyncData: boolean;
  rosterCount: number;
  /** Aktif tapi belum punya halaqah (daftar tunggu) — di luar `rosterCount` dan ringkasan. */
  belumDitempatkan: number;
  thresholdPct: number;
  segmentation: Segmentation | null;
  segments: SegmentSummary[];
  students: MonitoredStudent[];
  marhalahOptions: string[];
};

export async function getDashboardData(
  programSlug: string,
  /**
   * Restrict to one tilawah batch. `null` = every batch in the mirror; omitted =
   * the program's default scope (pinned batch, or all for syncAllBatches).
   * Keeps the KPI strip and the segment table on the same roster as the halaqah
   * table, which reads the same scope.
   */
  batchId?: number | null,
): Promise<DashboardData> {
  const db = getDb();

  const program = await getProgram(programSlug);

  if (!program) {
    return {
      hasSyncData: false,
      rosterCount: 0,
      belumDitempatkan: 0,
      thresholdPct: 70,
      segmentation: null,
      segments: [],
      students: [],
      marhalahOptions: [],
    };
  }

  const { segmentation } = getProgramConfig(program);

  // "Peserta aktif" counts active enrolments only (owner, 23 Sep 2026). The
  // `students` roster keeps everyone ever enrolled — hits-regular read 1382
  // against 1119 active — and some rows no longer exist upstream at all (8 in
  // mabni). So once the mirror holds this program, it is the source (the
  // monitored roster below); the roster is only the fallback for a program
  // synced but not yet mirrored, which the "sudah terdaftar, belum ada data
  // kehadiran" note depends on.
  const [[rosterAgg], [syncAgg]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(students)
      .where(eq(students.programId, program.id)),
    db
      .select({
        semua: sql<number>`count(*)::int`,
        belum: sql<number>`(count(*) filter (where ${pesertaAktif()} and ${studentsSync.halaqahId} is null))::int`,
      })
      .from(studentsSync)
      .where(eq(studentsSync.programId, program.id)),
  ]);

  const [threshold] = await db
    .select({ pct70: attendanceThresholds.pct70 })
    .from(attendanceThresholds)
    .where(
      and(
        eq(attendanceThresholds.programId, program.id),
        eq(attendanceThresholds.periodType, DEFAULT_PERIOD_TYPE),
      ),
    )
    .limit(1);

  const thresholdPct = threshold?.pct70 != null ? Number(threshold.pct70) : 70;

  // Batch scope. Null (every batch) leaves both queries unfiltered; a batch id
  // keeps only halaqah of that batch — and only peserta enrolled in them, so
  // "Peserta" can't count a batch whose halaqah the table below is hiding.
  //
  // Gated on the mirror actually holding several batches: on a single-batch
  // program the scope adds nothing but would silently drop peserta whose halaqah
  // row is gone (pruned upstream) — 373 of hits-regular-apr's 879.
  const multiBatch = (await getProgramBatches(programSlug)).length > 1;
  const scope = multiBatch ? (batchId === undefined ? defaultBatchScope(program) : batchId) : null;
  const inScope = (col: typeof halaqahSync.tilawahHalaqahId | typeof studentsSync.halaqahId) =>
    scope == null
      ? sql`true`
      : sql`${col} in (
          select tilawah_halaqah_id from halaqah_sync
          where program_id = ${program.id}
            and (tilawah_batch_id is null or tilawah_batch_id = ${scope})
        )`;

  const [halaqahRows, studentRows, lateIncidentRows] = await Promise.all([
    db
      .select({ tilawahHalaqahId: halaqahSync.tilawahHalaqahId, level: halaqahSync.level })
      .from(halaqahSync)
      .where(and(eq(halaqahSync.programId, program.id), inScope(halaqahSync.tilawahHalaqahId))),
    db
      .select({
        tilawahUserId: studentsSync.tilawahUserId,
        name: studentsSync.name,
        halaqahId: studentsSync.halaqahId,
        pengajar: studentsSync.pengajar,
        gender: studentsSync.gender,
        attendanceRate: studentsSync.attendanceRate,
        hadirCount: studentsSync.hadirCount,
        effectiveMeetings: studentsSync.effectiveMeetings,
        kehadiranPercentage: studentsSync.kehadiranPercentage,
      })
      .from(studentsSync)
      .where(
        and(
          eq(studentsSync.programId, program.id),
          inScope(studentsSync.halaqahId),
          // Satu definisi "peserta aktif" untuk kartu, ringkasan dan rata²
          // (pemilik 28 Sep 2026): status aktif, SUDAH berkelas — daftar tunggu
          // bukan peserta aktif — dan bukan penghuni kelas DEMO. `not exists`,
          // bukan `in (halaqah nyata)`: peserta yang baris halaqahnya sudah
          // terpangkas dari cermin tetap terhitung.
          pesertaAktif(),
          sql`${studentsSync.halaqahId} is not null`,
          sql`not exists (
            select 1 from halaqah_sync h
            where h.program_id = ${program.id}
              and h.tilawah_halaqah_id = ${studentsSync.halaqahId}
              and not ${bukanKelasDemo("h.name")}
          )`,
        ),
      )
      .orderBy(sql`${studentsSync.attendanceRate} asc nulls last`),
    db
      .select({
        spRequired: lateIncidents.spRequired,
        tilawahUserId: students.tilawahUserId,
      })
      .from(lateIncidents)
      .innerJoin(students, eq(lateIncidents.studentId, students.id))
      .where(eq(lateIncidents.programId, program.id)),
  ]);

  const levelByHalaqahId = new Map(halaqahRows.map((h) => [h.tilawahHalaqahId, h.level]));

  const lateCountByTilawahUserId = new Map<number, { count: number; spCount: number }>();
  for (const row of lateIncidentRows) {
    if (row.tilawahUserId == null) continue;
    const entry = lateCountByTilawahUserId.get(row.tilawahUserId) ?? { count: 0, spCount: 0 };
    entry.count += 1;
    if (row.spRequired) entry.spCount += 1;
    lateCountByTilawahUserId.set(row.tilawahUserId, entry);
  }

  const monitoredStudents: MonitoredStudent[] = studentRows.map((s) => {
    const attendanceRate = s.attendanceRate != null ? Number(s.attendanceRate) : null;
    const semesterProgressPct = s.kehadiranPercentage != null ? Number(s.kehadiranPercentage) : null;
    const lateInfo = lateCountByTilawahUserId.get(s.tilawahUserId);
    return {
      tilawahUserId: s.tilawahUserId,
      name: s.name ?? "-",
      marhalah: s.halaqahId != null ? (levelByHalaqahId.get(s.halaqahId) ?? null) : null,
      placed: s.halaqahId != null,
      gender: s.gender != null ? Number(s.gender) : null,
      pengajar: s.pengajar,
      attendanceRate,
      hadirCount: s.hadirCount != null ? Number(s.hadirCount) : null,
      effectiveMeetings: s.effectiveMeetings != null ? Number(s.effectiveMeetings) : null,
      semesterProgressPct,
      belowThreshold: attendanceRate != null && attendanceRate < thresholdPct,
      lateIncidentCount: lateInfo?.count ?? 0,
      spRequiredCount: lateInfo?.spCount ?? 0,
    };
  });

  const marhalahOptions = [
    ...new Set(monitoredStudents.map((s) => s.marhalah).filter((m): m is string => !!m)),
  ].sort();

  const segments = summarizeSegments(monitoredStudents, segmentation);
  const adaCermin = (syncAgg?.semua ?? 0) > 0;

  return {
    hasSyncData: studentRows.length > 0,
    rosterCount: adaCermin ? monitoredStudents.length : (rosterAgg?.count ?? 0),
    belumDitempatkan: syncAgg?.belum ?? 0,
    thresholdPct,
    segmentation,
    segments,
    students: monitoredStudents,
    marhalahOptions,
  };
}

/** Segment label for peserta with no halaqah at all — the only truly unplaced ones. */
export const TANPA_KELAS = "(tanpa kelas)";
/** Segment label for peserta in a halaqah that carries no level (e.g. every HKM halaqah). */
export const TANPA_MARHALAH = "(tanpa marhalah)";

/**
 * Aggregate breakdown by the configured segmentation (e.g. HITS level×gender):
 * peserta count, average attendance, and how many are below threshold. Pure,
 * so the "semua batch" view can re-summarize the merged roster with it.
 */
export function summarizeSegments(
  monitoredStudents: MonitoredStudent[],
  segmentation: Segmentation | null,
): SegmentSummary[] {
  const segments: SegmentSummary[] = [];
  if (segmentation) {
    const groups = new Map<string, { primary: string; secondary: string | null; rows: MonitoredStudent[] }>();
    for (const s of monitoredStudents) {
      const primary = s.marhalah ?? (s.placed ? TANPA_MARHALAH : TANPA_KELAS);
      const secondary = segmentation.secondary === "gender" ? genderLabel(s.gender) : null;
      const key = `${primary}||${secondary ?? ""}`;
      const g = groups.get(key) ?? { primary, secondary, rows: [] };
      g.rows.push(s);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const withRate = g.rows.filter((r) => r.attendanceRate != null);
      const avgRate =
        withRate.length > 0
          ? withRate.reduce((n, r) => n + (r.attendanceRate as number), 0) / withRate.length
          : null;
      segments.push({
        primary: g.primary,
        secondary: g.secondary,
        count: g.rows.length,
        avgRate,
        belowCount: g.rows.filter((r) => r.belowThreshold).length,
      });
    }
    segments.sort((a, b) => a.primary.localeCompare(b.primary) || (a.secondary ?? "").localeCompare(b.secondary ?? ""));
  }
  return segments;
}
