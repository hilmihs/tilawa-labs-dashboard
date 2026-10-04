/**
 * HKM progress composer — combines the cumulative engine, categorization, streak,
 * and at-risk assessment into one participant-progress record consumed by the
 * sync (snapshots), dashboard queries, and xlsx reports.
 *
 * Pure: no DB/API imports. The caller supplies the participant identity, that
 * participant's reading rows, the API user row (for headline khatam + lastRead),
 * and the reporting period.
 */
import { calculateCumulative, type ReadingRow } from "./cumulative";
import { categorizeParticipant, type HkmCategory } from "./categorize";
import { computeStreak } from "./streak";
import { assessRisk } from "./at-risk";
import { expectedPages, expectedJuz } from "./target";
import { resolveHkmParams, type HkmParams } from "./constants";

export * from "./constants";
export * from "./cumulative";
export * from "./categorize";
export * from "./streak";
export * from "./at-risk";
export * from "./target";
export * from "./monthly";
export * from "./status";

export type ParticipantInput = {
  participantId?: string;
  nama: string;
  email: string | null;
  halaqah: string | null;
  pengajar: string | null;
  gender: string | null; // 'Ikhwan' | 'Akhwat'
  readings: ReadingRow[];
  // From the the partner system API user row (headline sources of truth):
  apiTotalKhatam?: number | null;
  apiProgressKhatam?: number | null;
  lastReadAt?: string | null;
};

export type ParticipantProgress = {
  participantId?: string;
  nama: string;
  email: string | null;
  halaqah: string | null;
  pengajar: string | null;
  gender: string | null;
  cumulativePages: number;
  cumulativeJuz: number;
  firstDate: string | null;
  lastDate: string | null;
  avgPerDay: number;
  targetPages: number;
  targetJuz: number;
  category: HkmCategory;
  khatamCount: number; // from cumulative pages (history-derived)
  apiTotalKhatam: number | null; // headline khatam from the API (preferred for totals)
  order: number;
  streakDays: number;
  longestStreak: number;
  activeDays: number;
  atRisk: boolean;
  riskReasons: string[];
};

export function buildParticipantProgress(
  p: ParticipantInput,
  period: { startDate: string | Date; endDate: string | Date; config?: unknown; now?: Date },
): ParticipantProgress {
  const params: HkmParams = resolveHkmParams(period.config);
  const cum = calculateCumulative(p.readings, {
    quranPages: params.quranPages,
    pagesPerJuz: params.pagesPerJuz,
  });
  const target = expectedPages(period.startDate, period.endDate, params.pagesPerDay);
  const targetJuz = expectedJuz(period.startDate, period.endDate, params.pagesPerDay, params.pagesPerJuz);
  const cat = categorizeParticipant(cum.cumulativePages, target, params.quranPages);
  const streak = computeStreak(p.readings.map((r) => r.date));
  const risk = assessRisk(
    {
      category: cat.category,
      avgPerDay: cum.avgPerDay,
      cumulativePages: cum.cumulativePages,
      lastReadAt: p.lastReadAt ?? cum.lastDate,
    },
    { pagesPerDay: params.pagesPerDay, now: period.now },
  );

  return {
    participantId: p.participantId,
    nama: p.nama,
    email: p.email,
    halaqah: p.halaqah,
    pengajar: p.pengajar,
    gender: p.gender,
    cumulativePages: cum.cumulativePages,
    cumulativeJuz: cum.cumulativeJuz,
    firstDate: cum.firstDate,
    lastDate: cum.lastDate,
    avgPerDay: cum.avgPerDay,
    targetPages: target,
    targetJuz,
    category: cat.category,
    khatamCount: cat.khatamCount,
    apiTotalKhatam: p.apiTotalKhatam ?? null,
    order: cat.order,
    streakDays: streak.currentStreak,
    longestStreak: streak.longestStreak,
    activeDays: streak.activeDays,
    atRisk: risk.atRisk,
    riskReasons: risk.reasons,
  };
}

/** Is this display name one of the excluded panitia/admin names? */
export function isExcludedName(name: string, config?: unknown): boolean {
  const { excludedNames } = resolveHkmParams(config);
  return excludedNames.includes(name.trim().toLowerCase());
}

/** Normalize an email for the master join (mirrors pandas strip().lower()). */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e === "" || e === "nan" || e === "none" ? null : e;
}
