/**
 * Data for the HKM monthly coordinator sheet — the one the koordinator keeps in
 * "Laporan Bulanan HKM 2026.xlsx", which mixes the TWO HKM sources that live in
 * separate program rows:
 *
 *   setoran  — `hkm` (berkah_api): pages read per participant this month.
 *   presensi — `hkm-presensi` (tilawah_api, config.presensiSlug): halaqah
 *              attendance for peserta and pengajar.
 *
 * Keeping them apart is what made this sheet a manual paste job: neither export
 * alone answers the coordinator's five rows. This module joins them for one
 * calendar month; lib/reports/hkm-bulanan-xlsx.ts lays them out.
 */
import { getProgram } from "@/lib/programs/resolve";
import { getHkmDashboardData, type HkmParticipantRow } from "@/app/[program]/hkm/queries";
import { monthBounds, effectiveDays, monthLabel } from "@/lib/insights/hkm/monthly";
import { getHitsMonthlyReport, getTeacherReport, type HitsRow } from "@/lib/reports/queries";
import { resolveReportScope, resolveReportScopeForAgent } from "@/lib/reports/scope";

export type HkmGenderStat = {
  gender: "Ikhwan" | "Akhwat";
  peserta: number;
  pages: number;
  perDay: number;
};

export type HkmBelowRow = {
  nama: string;
  gender: string;
  halaqah: string | null;
  pengajar: string | null;
  realisasi: number;
  perDay: number;
  keterangan: string; // "Belum Tercapai" | "Tidak Aktif"
};

export type HkmPresensi = {
  /** Peserta attendance for the month, program-wide and per gender. */
  overall: HitsRow;
  byGender: HitsRow[];
  thresholdPct: number;
  /** Teachers whose taught÷assigned ratio is under the threshold, worst first. */
  pengajarBelowTarget: Array<{ name: string; real: number; ideal: number; gender: number | null }>;
};

export type HkmBulanan = {
  programName: string;
  month: string; // YYYY-MM
  monthLabel: string; // "Agustus 2026"
  start: string;
  end: string;
  /** Days the month's target is spread over (elapsed days for the current month). */
  days: number;
  pagesPerDayTarget: number;
  setoran: {
    total: number;
    tercapai: number;
    belumTercapai: number;
    tidakAktif: number;
    pages: number;
    perDay: number;
    byGender: HkmGenderStat[];
    below: HkmBelowRow[];
  };
  /** null when hkm-presensi is unreadable (no row, or outside the caller's grants). */
  presensi: HkmPresensi | null;
};

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "2026-08" → "Agustus 2026" (the coordinator's sheet names, not the short form). */
export function longMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_ID[(m || 1) - 1]} ${y}`;
}

const normGender = (g: string): "Ikhwan" | "Akhwat" =>
  g.trim().toLowerCase() === "ikhwan" ? "Ikhwan" : "Akhwat";

/**
 * Pages per participant per DAY, not per participant: the coordinator's row is
 * "rata-rata tilawah seluruh peserta per hari", so the divisor is
 * peserta × days-in-the-month-so-far. Zero peserta yields 0, not NaN.
 */
const perDay = (pages: number, peserta: number, days: number): number =>
  peserta > 0 && days > 0 ? pages / (peserta * days) : 0;

async function loadPresensi(
  presensiSlug: string,
  start: string,
  end: string,
  agent: boolean,
): Promise<HkmPresensi | null> {
  const scope = agent
    ? await resolveReportScopeForAgent(presensiSlug)
    : await resolveReportScope(presensiSlug);
  if (!scope) return null;

  const [rep, teacherRep] = await Promise.all([
    getHitsMonthlyReport(scope, start, end),
    getTeacherReport(start, end, scope.programIds),
  ]);

  // A teacher with no meetings assigned this month has no ratio to be under —
  // listing them would read as an absence they were never scheduled for.
  const pengajarBelowTarget = teacherRep.teachers
    .filter((t) => t.totalIdeal > 0 && (100 * t.totalReal) / t.totalIdeal < rep.thresholdPct)
    .map((t) => ({
      name: t.pengajar,
      real: t.totalReal,
      ideal: t.totalIdeal,
      gender: t.halaqah[0]?.gender ?? null,
    }))
    .sort((a, b) => a.real / a.ideal - b.real / b.ideal);

  return {
    overall: rep.overall,
    byGender: rep.byGender,
    thresholdPct: rep.thresholdPct,
    pengajarBelowTarget,
  };
}

/**
 * One month of the combined HKM recap. `month` is "YYYY-MM"; the presensi window
 * is that calendar month, matching how the setoran side counts.
 */
export async function getHkmBulanan(
  programSlug: string,
  month: string | undefined,
  opts: { agent: boolean },
): Promise<HkmBulanan | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;

  const dash = await getHkmDashboardData(programSlug, { mode: "bulanan", month });
  if (!dash) return null;

  const ym = dash.month;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // Jakarta
  const { start, end: monthEnd, days: windowDays } = monthBounds(ym);
  const days = effectiveDays(ym, windowDays, today);
  /**
   * For the CURRENT month the window stops at today, exactly like the setoran
   * target does. Reading to the month's last day instead put meetings that have
   * not happened yet into the pengajar denominator — Agustus 2026 read as 48/67
   * (71.6 %) on 28 Aug purely because 29–31 Aug were still scheduled.
   */
  const end = monthEnd > today && start <= today ? today : monthEnd;

  const rows: HkmParticipantRow[] = dash.participants;
  const pages = rows.reduce((n, p) => n + p.mRealisasi, 0);

  const byGender: HkmGenderStat[] = (["Ikhwan", "Akhwat"] as const).map((g) => {
    const inG = rows.filter((p) => normGender(p.gender) === g);
    const gPages = inG.reduce((n, p) => n + p.mRealisasi, 0);
    return { gender: g, peserta: inG.length, pages: gPages, perDay: perDay(gPages, inG.length, days) };
  });

  // "Di bawah target" = everyone not Tercapai, which INCLUDES the inactive: the
  // coordinator's list carries both, tagged apart by the Keterangan column.
  const below: HkmBelowRow[] = rows
    .filter((p) => p.mCategory !== "Tercapai")
    .sort(
      (a, b) =>
        (a.halaqah ?? "").localeCompare(b.halaqah ?? "") ||
        b.mRealisasi - a.mRealisasi ||
        a.nama.localeCompare(b.nama),
    )
    .map((p) => ({
      nama: p.nama,
      gender: normGender(p.gender),
      halaqah: p.halaqah,
      pengajar: p.pengajar,
      realisasi: p.mRealisasi,
      perDay: days > 0 ? p.mRealisasi / days : 0,
      keterangan: p.mCategory,
    }));

  const presensiSlug = (program.config as { presensiSlug?: string })?.presensiSlug;
  const presensi = presensiSlug ? await loadPresensi(presensiSlug, start, end, opts.agent) : null;

  return {
    programName: program.name,
    month: ym,
    monthLabel: longMonthLabel(ym),
    start,
    end,
    days,
    pagesPerDayTarget: dash.target.pagesPerDay,
    setoran: {
      total: dash.monthlyKpis.total,
      tercapai: dash.monthlyKpis.tercapai,
      belumTercapai: dash.monthlyKpis.belumTercapai,
      tidakAktif: dash.monthlyKpis.tidakAktif,
      pages,
      perDay: perDay(pages, rows.length, days),
      byGender,
      below,
    },
    presensi,
  };
}

export { monthLabel };
