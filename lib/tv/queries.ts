/**
 * The numbers on the /tv board.
 *
 * Two SQL statements serve both slides:
 *   A. daily facts over an ≤8-day window (today + the running Jumat→Kamis week)
 *   B. the anomaly backlog (meetings past with no presensi at all)
 *
 * One statement rather than a loop over 13 programs, for three reasons: the
 * tables are small enough that round-trips dominate the cost; a single statement
 * reads one MVCC snapshot, so a sync running mid-render cannot produce a board
 * where program A is post-sync and program B is pre-sync; and the mabni schedule
 * fallback then exists in exactly one place.
 *
 * Dates are ALWAYS passed in from lib/time/jakarta — the database runs in UTC,
 * so `current_date` would mislabel everything between 00:00 and 07:00 WIB.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pesertaAktif } from "@/lib/enrollment";
import { addDaysISO, minISO, weekJumatKamis } from "@/lib/time/jakarta";
import { rosterCte, schedCte, uuidList } from "@/lib/tv/schedule";
import type { TvProgramRef } from "@/lib/tv/programs";
import { partitionBySource } from "@/lib/tv/programs";

/** How far back the "belum diisi sama sekali" backlog looks. */
const ANOMALY_LOOKBACK_DAYS = 30;

export type DailyFact = {
  statsProgramId: string;
  date: string;
  terjadwal: number; // active peserta in halaqah scheduled that day
  meetingsScheduled: number;
  meetingsHeld: number; // meetings with ≥1 presensi row
  hadir: number; // status 1 (Hadir) + 2 (Telat)
  eff: number; // status 0+1+2 — Izin excluded, as everywhere in this repo
  recorded: number; // distinct peserta with any presensi row
};

export type TvProgramToday = {
  key: string;
  label: string;
  terjadwal: number;
  hadir: number;
  belumDiisi: number;
  meetingsScheduled: number;
  meetingsHeld: number;
  hadirKemarin: number;
  adaKelasKemarin: boolean;
  anomali: number;
  syncPaused: boolean;
  /** No meeting scheduled today → the UI renders "—", never a 0. */
  adaKelas: boolean;
};

export type TvTodaySlide = {
  date: string;
  yesterday: string;
  totalHadir: number;
  totalTerjadwal: number;
  totalBelumDiisi: number;
  totalAnomali: number;
  programAktif: number;
  adaKelas: boolean;
  meetings: number;
  held: number;
  /**
   * Share of today's meetings with any presensi. Observed reality: ~4% on the
   * day itself, ~24% after five days, plateauing near 60% — so the headline
   * "hadir" is always an undercount and the board must say so out loud.
   */
  isiPct: number | null;
  programs: TvProgramToday[];
};

export type TvWeekDay = {
  date: string;
  hadir: number;
  eff: number;
  meetings: number;
  held: number;
  /** Share of that day's meetings that have any presensi yet — the maturity curve. */
  isiPct: number | null;
  isToday: boolean;
  isFuture: boolean;
};
export type TvWeekProgram = { key: string; label: string; hadir: number; eff: number; pct: number | null };
export type TvWeekSlide = {
  start: string;
  end: string;
  totalHadir: number;
  totalEff: number;
  pct: number | null;
  puncak: number; // biggest single-day hadir, for bar scaling
  days: TvWeekDay[];
  programs: TvWeekProgram[];
};

/** The window both slides need: the running week, extended back to yesterday. */
export function tvWindow(today: string): { from: string; to: string; week: ReturnType<typeof weekJumatKamis> } {
  const week = weekJumatKamis(today);
  return { from: minISO(week.start, addDaysISO(today, -1)), to: today, week };
}

/** Query A — one row per (program, date). ≤ 13 × 8 rows. */
export async function getTvDailyFacts(refs: TvProgramRef[], from: string, to: string): Promise<DailyFact[]> {
  const { tilawahIds, mabniIds, allIds } = partitionBySource(refs);
  if (allIds.length === 0) return [];
  const db = getDb();

  const rows = await db.execute(sql`
    with ${schedCte(tilawahIds, mabniIds, from, to)},
    ${rosterCte(allIds)},
    sched_agg as (
      select s.program_id, s.d,
             count(*)::int as meetings_scheduled,
             coalesce(sum(r.n_aktif), 0)::int as terjadwal
      from sched s
      left join roster r on r.program_id = s.program_id and r.halaqah_id = s.halaqah_id
      group by 1, 2
    ),
    -- Real meetings and their presensi. Note the deliberate asymmetry with
    -- sched: a class that ran unexpectedly (rescheduled, extra session) still
    -- contributes hadir even though nothing predicted it.
    occ as (
      select j.program_id,
             j.schedule_date as d,
             count(*) filter (where a.status in ('1','2'))::int as hadir,
             count(*) filter (where a.status in ('0','1','2'))::int as eff,
             count(distinct a.halaqah_user_id)::int as recorded,
             count(a.id) > 0 as held
      from jadwal_sync j
      left join attendance_sync a
        on a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
      left join students_sync s
        on s.program_id = a.program_id and s.halaqah_user_id = a.halaqah_user_id
      where j.program_id in (${uuidList(allIds)})
        and j.schedule_date between ${from}::date and ${to}::date
        and (a.id is null or ${pesertaAktif("s")})
      group by j.program_id, j.schedule_date, j.tilawah_jadwal_id
    ),
    occ_agg as (
      select program_id, d,
             count(*) filter (where held)::int as meetings_held,
             coalesce(sum(hadir), 0)::int as hadir,
             coalesce(sum(eff), 0)::int as eff,
             coalesce(sum(recorded), 0)::int as recorded
      from occ group by 1, 2
    )
    select coalesce(sa.program_id, oa.program_id)::text as program_id,
           coalesce(sa.d, oa.d)::text as d,
           coalesce(sa.terjadwal, 0) as terjadwal,
           coalesce(sa.meetings_scheduled, 0) as meetings_scheduled,
           coalesce(oa.meetings_held, 0) as meetings_held,
           coalesce(oa.hadir, 0) as hadir,
           coalesce(oa.eff, 0) as eff,
           coalesce(oa.recorded, 0) as recorded
    from sched_agg sa
    full join occ_agg oa on oa.program_id = sa.program_id and oa.d = sa.d
  `);

  return rows.rows.map((r) => ({
    statsProgramId: String(r.program_id),
    date: String(r.d),
    terjadwal: Number(r.terjadwal),
    meetingsScheduled: Number(r.meetings_scheduled),
    meetingsHeld: Number(r.meetings_held),
    hadir: Number(r.hadir),
    eff: Number(r.eff),
    recorded: Number(r.recorded),
  }));
}

/**
 * Query B — meetings that came and went with zero presensi, per program.
 *
 * The window ends YESTERDAY on purpose: presensi is entered after a session
 * ends, so counting today would flag every class that meets today as a gap for
 * the rest of the day. Meetings the teacher already answered through the magic
 * link are excluded (same predicate as lib/insights/queries.ts) — otherwise the
 * number can only ever go up and the board becomes wallpaper.
 */
export async function getTvAnomalies(refs: TvProgramRef[], today: string): Promise<Map<string, number>> {
  const { tilawahIds, mabniIds, allIds } = partitionBySource(refs);
  const out = new Map<string, number>();
  if (allIds.length === 0) return out;

  const asOf = addDaysISO(today, -1);
  const from = addDaysISO(today, -ANOMALY_LOOKBACK_DAYS);
  const db = getDb();

  if (tilawahIds.length) {
    const rows = await db.execute(sql`
      select j.program_id::text as program_id, count(*)::int as n
      from jadwal_sync j
      where j.program_id in (${uuidList(tilawahIds)})
        and j.schedule_date between ${from}::date and ${asOf}::date
        and not exists (
          select 1 from attendance_sync a
          where a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
        )
        and not exists (
          select 1 from teacher_meeting_confirmations c
          where c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
        )
      group by 1
    `);
    for (const r of rows.rows) out.set(String(r.program_id), Number(r.n));
  }

  if (mabniIds.length) {
    // Mabni has no jadwal row for a meeting nobody recorded, so the gap is
    // "expected by the recurring pattern, but no presensi on that date".
    const rows = await db.execute(sql`
      with ${schedCte([], mabniIds, from, asOf)},
      held as (
        select j.program_id, j.tilawah_halaqah_id as halaqah_id, j.schedule_date as d
        from jadwal_sync j
        where j.program_id in (${uuidList(mabniIds)})
          and j.schedule_date between ${from}::date and ${asOf}::date
          and exists (
            select 1 from attendance_sync a
            where a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
          )
        group by 1, 2, 3
      )
      select s.program_id::text as program_id, count(*)::int as n
      from sched s
      left join held h
        on h.program_id = s.program_id and h.halaqah_id = s.halaqah_id and h.d = s.d
      where h.d is null
      group by 1
    `);
    for (const r of rows.rows) out.set(String(r.program_id), Number(r.n));
  }

  return out;
}

// ── Pure builders (no DB — unit-testable) ────────────────────────────────

function factIndex(facts: DailyFact[]): Map<string, DailyFact> {
  return new Map(facts.map((f) => [`${f.statsProgramId}|${f.date}`, f]));
}

export function buildTodaySlide(
  facts: DailyFact[],
  refs: TvProgramRef[],
  today: string,
  anomalies: Map<string, number>,
): TvTodaySlide {
  const idx = factIndex(facts);
  const yesterday = addDaysISO(today, -1);

  const programs = refs.map((ref): TvProgramToday => {
    const f = idx.get(`${ref.statsProgramId}|${today}`);
    const y = idx.get(`${ref.statsProgramId}|${yesterday}`);
    const terjadwal = f?.terjadwal ?? 0;
    // Clamp: the mabni pattern can under-predict, and a walk-in peserta can be
    // recorded in a halaqah whose roster says otherwise.
    const belumDiisi = Math.max(0, terjadwal - (f?.recorded ?? 0));
    return {
      key: ref.key,
      label: ref.label,
      terjadwal,
      hadir: f?.hadir ?? 0,
      belumDiisi,
      meetingsScheduled: f?.meetingsScheduled ?? 0,
      meetingsHeld: f?.meetingsHeld ?? 0,
      hadirKemarin: y?.hadir ?? 0,
      adaKelasKemarin: (y?.meetingsScheduled ?? 0) > 0 || (y?.meetingsHeld ?? 0) > 0,
      anomali: anomalies.get(ref.statsProgramId) ?? 0,
      syncPaused: ref.syncPaused,
      adaKelas: (f?.meetingsScheduled ?? 0) > 0 || (f?.meetingsHeld ?? 0) > 0,
    };
  });

  // Totals are summed over the fact rows — which are keyed by statsProgramId —
  // so a program folded into another (HKM) can never be counted twice.
  const todayFacts = facts.filter((f) => f.date === today);
  const totalHadir = sum(todayFacts, (f) => f.hadir);
  const totalTerjadwal = sum(todayFacts, (f) => f.terjadwal);
  const totalBelumDiisi = todayFacts.reduce((n, f) => n + Math.max(0, f.terjadwal - f.recorded), 0);
  const meetings = sum(todayFacts, (f) => f.meetingsScheduled);
  const held = sum(todayFacts, (f) => f.meetingsHeld);

  return {
    date: today,
    yesterday,
    totalHadir,
    totalTerjadwal,
    totalBelumDiisi,
    totalAnomali: [...anomalies.values()].reduce((a, b) => a + b, 0),
    programAktif: programs.filter((p) => p.adaKelas).length,
    adaKelas: programs.some((p) => p.adaKelas),
    meetings,
    held,
    isiPct: meetings > 0 ? (held / meetings) * 100 : null,
    programs,
  };
}

export function buildWeekSlide(facts: DailyFact[], refs: TvProgramRef[], today: string): TvWeekSlide {
  const { days, start, end } = weekJumatKamis(today);
  const inWeek = facts.filter((f) => f.date >= start && f.date <= end);

  const dayRows = days.map((date): TvWeekDay => {
    const onDate = inWeek.filter((f) => f.date === date);
    const meetings = sum(onDate, (f) => f.meetingsScheduled);
    const held = sum(onDate, (f) => f.meetingsHeld);
    return {
      date,
      hadir: sum(onDate, (f) => f.hadir),
      eff: sum(onDate, (f) => f.eff),
      meetings,
      held,
      isiPct: meetings > 0 ? (held / meetings) * 100 : null,
      isToday: date === today,
      isFuture: date > today,
    };
  });

  const programs = refs
    .map((ref): TvWeekProgram => {
      const mine = inWeek.filter((f) => f.statsProgramId === ref.statsProgramId);
      const hadir = sum(mine, (f) => f.hadir);
      const eff = sum(mine, (f) => f.eff);
      return { key: ref.key, label: ref.label, hadir, eff, pct: eff > 0 ? (hadir / eff) * 100 : null };
    })
    .sort((a, b) => b.hadir - a.hadir);

  const totalHadir = sum(inWeek, (f) => f.hadir);
  const totalEff = sum(inWeek, (f) => f.eff);

  return {
    start,
    end,
    totalHadir,
    totalEff,
    pct: totalEff > 0 ? (totalHadir / totalEff) * 100 : null,
    puncak: Math.max(1, ...dayRows.map((d) => d.hadir)),
    days: dayRows,
    programs,
  };
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((n, r) => n + pick(r), 0);
}
