import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getProgram } from "@/lib/programs/resolve";
import { pesertaAktif } from "@/lib/enrollment";
import { resolveGuruPhone } from "./guru-phone-overrides";

/**
 * Action-item / insight queries for one program. Everything keys off the synced
 * read-model tables; joins use the tilawah ids:
 *   students_sync.halaqah_id      = halaqah_sync.tilawah_halaqah_id
 *   jadwal_sync.tilawah_halaqah_id = halaqah_sync.tilawah_halaqah_id
 *   attendance_sync.halaqah_jadwal_id = jadwal_sync.tilawah_jadwal_id
 *   attendance_sync.halaqah_user_id   = students_sync.halaqah_user_id
 *
 * "Today" uses the DB CURRENT_DATE. A meeting counts as due when its
 * schedule_date has passed and it has zero presensi rows — that is exactly the
 * "guru belum presensi" gap.
 */

export type GapMeeting = { order: number | null; date: string | null };

export type TeacherGap = {
  halaqahId: number;
  halaqahName: string | null;
  pengajar: string | null;
  guruPhone: string | null;
  meetings: GapMeeting[]; // each past meeting with zero presensi, oldest first
};

export type PartialMeeting = {
  order: number | null;
  date: string | null;
  missingStudents: string[]; // enrolled peserta with no presensi row for this meeting
};

export type PartialPresensiHalaqah = {
  halaqahId: number;
  halaqahName: string | null;
  pengajar: string | null;
  guruPhone: string | null;
  meetings: PartialMeeting[];
};

/**
 * One halaqah's whole presensi backlog: the meetings with no presensi at all
 * ("kelas belum dimulai" — the teacher hasn't touched it) AND the meetings that
 * were started but left with peserta unmarked. They used to be two separate
 * worklists in two places (Laporan vs Action Items), which meant two nudges to
 * the same teacher about the same halaqah — so they are merged into one item
 * with one WA reminder.
 */
export type PresensiGapHalaqah = {
  halaqahId: number;
  halaqahName: string | null;
  pengajar: string | null;
  guruPhone: string | null;
  emptyMeetings: GapMeeting[]; // belum diisi sama sekali
  partialMeetings: PartialMeeting[]; // sudah diisi sebagian
};

export type AtRiskStudent = {
  name: string | null;
  halaqahName: string | null;
  pengajar: string | null;
  kehadiran: number | null;
};

export type HalaqahHealth = {
  halaqahName: string | null;
  pengajar: string | null;
  studentCount: number;
  avgKehadiran: number | null;
  tier: "kritis" | "perhatian" | "sehat";
};

export type LahnStudent = {
  name: string | null;
  halaqahName: string | null;
  totalLahn: number;
};

export type InsightBundle = {
  thresholdPct: number;
  teacherGaps: TeacherGap[];
  partialPresensi: PartialPresensiHalaqah[];
  /** teacherGaps + partialPresensi folded per halaqah — what the inbox renders. */
  presensiGaps: PresensiGapHalaqah[];
  atRisk: AtRiskStudent[];
  halaqahHealth: HalaqahHealth[];
  topLahn: LahnStudent[];
  counts: {
    teacherGapMeetings: number;
    teacherGapHalaqah: number;
    partialMeetings: number;
    /** Halaqah with any presensi backlog of either kind. */
    presensiGapHalaqah: number;
    atRisk: number;
    halaqahKritis: number;
  };
};

/** Fold the two gap lists into one item per halaqah, worst backlog first. */
export function mergePresensiGaps(
  teacherGaps: TeacherGap[],
  partialPresensi: PartialPresensiHalaqah[],
): PresensiGapHalaqah[] {
  const merged = new Map<number, PresensiGapHalaqah>();
  const slot = (
    src: TeacherGap | PartialPresensiHalaqah,
  ): PresensiGapHalaqah => {
    let m = merged.get(src.halaqahId);
    if (!m) {
      m = {
        halaqahId: src.halaqahId,
        halaqahName: src.halaqahName,
        pengajar: src.pengajar,
        guruPhone: src.guruPhone,
        emptyMeetings: [],
        partialMeetings: [],
      };
      merged.set(src.halaqahId, m);
    }
    return m;
  };
  for (const g of teacherGaps) slot(g).emptyMeetings = g.meetings;
  for (const p of partialPresensi) slot(p).partialMeetings = p.meetings;

  const weight = (m: PresensiGapHalaqah) => m.emptyMeetings.length + m.partialMeetings.length;
  return [...merged.values()].sort(
    (a, b) => weight(b) - weight(a) || (a.halaqahName ?? "").localeCompare(b.halaqahName ?? ""),
  );
}

export async function getInsights(programSlug: string): Promise<InsightBundle | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();
  const pid = program.id;

  // Threshold (yaumiy pct70), default 70.
  const thrRows = await db.execute(sql`
    select pct_70 from attendance_thresholds
    where program_id = ${pid} and period_type = 'yaumiy' limit 1
  `);
  const thresholdPct = thrRows.rows[0]?.pct_70 != null ? Number(thrRows.rows[0].pct_70) : 70;

  // 1) Guru belum presensi: past meetings with ZERO presensi. Returned per
  // meeting (order + date) so the coordinator can name exactly which pertemuan
  // is missing when nudging the teacher; grouped by halaqah in TS below.
  const gapRows = await db.execute(sql`
    select j.tilawah_halaqah_id as halaqah_id,
           h.name as halaqah_name,
           h.pengajar as pengajar,
           h.guru_phone as guru_phone,
           j."order" as ord,
           j.schedule_date::text as date
    from jadwal_sync j
    left join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    where j.program_id = ${pid}
      and j.schedule_date <= current_date
      and not exists (
        select 1 from attendance_sync a
        where a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
      )
      -- ...and the teacher hasn't already confirmed this meeting via the magic
      -- link (any status = resolved) — drop it from the action-item nudge.
      and not exists (
        select 1 from teacher_meeting_confirmations c
        where c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
      )
    order by h.name, j.schedule_date asc nulls last, j."order" asc
  `);
  const gapByHalaqah = new Map<number, TeacherGap>();
  for (const r of gapRows.rows) {
    const id = Number(r.halaqah_id);
    let g = gapByHalaqah.get(id);
    if (!g) {
      const pengajar = (r.pengajar as string) ?? null;
      g = {
        halaqahId: id,
        halaqahName: (r.halaqah_name as string) ?? null,
        pengajar,
        guruPhone: resolveGuruPhone(pengajar, (r.guru_phone as string) ?? null),
        meetings: [],
      };
      gapByHalaqah.set(id, g);
    }
    g.meetings.push({ order: r.ord != null ? Number(r.ord) : null, date: (r.date as string) ?? null });
  }
  const teacherGaps: TeacherGap[] = [...gapByHalaqah.values()].sort(
    (a, b) => b.meetings.length - a.meetings.length,
  );

  // 1b) Presensi belum lengkap: meetings that HAVE been started (>=1 presensi
  // row) but some enrolled peserta still have no presensi row — the teacher must
  // complete the roster. One row per (meeting, missing student); grouped in TS.
  const partialRows = await db.execute(sql`
    with roster as (
      select halaqah_id, halaqah_user_id, name
      from students_sync
      where program_id = ${pid} and halaqah_user_id is not null
        -- Peserta AKTIF saja. The names in this list are read out to a teacher
        -- as "these people still need marking", so a name that no longer belongs
        -- there costs the teacher a search for someone who left. Rows with a
        -- null status used to be included as a hedge for un-synced pivot data;
        -- the owner chose accuracy over coverage on 17 Aug 2026, knowing the
        -- cost: programs whose roster carries no status at all (DPQ, HITS Safar
        -- Januari) produce no reminder names until their pivot data syncs.
        and enrollment_status_code = 1
    )
    select j.tilawah_halaqah_id as halaqah_id,
           h.name as halaqah_name,
           h.pengajar as pengajar,
           h.guru_phone as guru_phone,
           j."order" as ord,
           j.schedule_date::text as date,
           r.name as student_name
    from jadwal_sync j
    join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    join roster r on r.halaqah_id = j.tilawah_halaqah_id
    where j.program_id = ${pid}
      -- meeting has been started (at least one peserta marked)
      and exists (
        select 1 from attendance_sync a
        where a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
      )
      -- ...but THIS peserta has no presensi row for it
      and not exists (
        select 1 from attendance_sync a2
        where a2.program_id = j.program_id
          and a2.halaqah_jadwal_id = j.tilawah_jadwal_id
          and a2.halaqah_user_id = r.halaqah_user_id
      )
      -- ...and the teacher hasn't confirmed this meeting via the magic link.
      and not exists (
        select 1 from teacher_meeting_confirmations c
        where c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
      )
    order by h.name, j.schedule_date asc nulls last, j."order" asc, r.name
  `);
  const partialByHalaqah = new Map<number, PartialPresensiHalaqah>();
  for (const r of partialRows.rows) {
    const id = Number(r.halaqah_id);
    let p = partialByHalaqah.get(id);
    if (!p) {
      const pengajar = (r.pengajar as string) ?? null;
      p = {
        halaqahId: id,
        halaqahName: (r.halaqah_name as string) ?? null,
        pengajar,
        guruPhone: resolveGuruPhone(pengajar, (r.guru_phone as string) ?? null),
        meetings: [],
      };
      partialByHalaqah.set(id, p);
    }
    const ord = r.ord != null ? Number(r.ord) : null;
    const date = (r.date as string) ?? null;
    let m = p.meetings.find((mm) => mm.order === ord && mm.date === date);
    if (!m) {
      m = { order: ord, date, missingStudents: [] };
      p.meetings.push(m);
    }
    if (r.student_name) m.missingStudents.push(r.student_name as string);
  }
  const partialPresensi: PartialPresensiHalaqah[] = [...partialByHalaqah.values()];

  // 2) At-risk: had recorded meetings but never showed up (hadir_count 0) — a
  // sharper signal than a low semester percentage.
  const atRiskRows = await db.execute(sql`
    select s.name, h.name as halaqah_name, s.pengajar,
           s.attendance_rate::float as kehadiran
    from students_sync s
    left join halaqah_sync h
      on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
    where s.program_id = ${pid} and s.hadir_count = 0 and s.recorded_meetings > 0
      and ${pesertaAktif("s")}
    order by s.recorded_meetings desc, s.name
    limit 200
  `);
  const atRisk: AtRiskStudent[] = atRiskRows.rows.map((r) => ({
    name: (r.name as string) ?? null,
    halaqahName: (r.halaqah_name as string) ?? null,
    pengajar: (r.pengajar as string) ?? null,
    kehadiran: r.kehadiran != null ? Number(r.kehadiran) : null,
  }));

  // 3) Per-halaqah health: avg attendance + student count, tiered on threshold.
  const healthRows = await db.execute(sql`
    select h.name as halaqah_name, h.pengajar,
           count(s.id)::int as student_count,
           avg(s.attendance_rate)::float as avg_kehadiran
    from halaqah_sync h
    left join students_sync s
      on s.program_id = h.program_id and s.halaqah_id = h.tilawah_halaqah_id
      and ${pesertaAktif("s")}
    where h.program_id = ${pid}
    group by h.name, h.pengajar
    having count(s.id) > 0
    order by avg_kehadiran asc nulls last
  `);
  const halaqahHealth: HalaqahHealth[] = healthRows.rows.map((r) => {
    const avg = r.avg_kehadiran != null ? Number(r.avg_kehadiran) : null;
    const tier: HalaqahHealth["tier"] =
      avg == null ? "perhatian" : avg < thresholdPct / 2 ? "kritis" : avg < thresholdPct ? "perhatian" : "sehat";
    return {
      halaqahName: (r.halaqah_name as string) ?? null,
      pengajar: (r.pengajar as string) ?? null,
      studentCount: Number(r.student_count),
      avgKehadiran: avg,
      tier,
    };
  });

  // 4) Tahsin quality: students with the most lahn (tajwid errors) recorded.
  const lahnRows = await db.execute(sql`
    select s.name, h.name as halaqah_name,
           sum(coalesce(nullif(a.lahn_jaliy,'')::int,0) + coalesce(nullif(a.lahn_khofiy,'')::int,0))::int as total_lahn
    from attendance_sync a
    join students_sync s
      on s.program_id = a.program_id and s.halaqah_user_id = a.halaqah_user_id
    left join halaqah_sync h
      on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
    where a.program_id = ${pid}
      and ${pesertaAktif("s")}
    group by s.name, h.name
    having sum(coalesce(nullif(a.lahn_jaliy,'')::int,0) + coalesce(nullif(a.lahn_khofiy,'')::int,0)) > 0
    order by total_lahn desc
    limit 20
  `);
  const topLahn: LahnStudent[] = lahnRows.rows.map((r) => ({
    name: (r.name as string) ?? null,
    halaqahName: (r.halaqah_name as string) ?? null,
    totalLahn: Number(r.total_lahn),
  }));

  const presensiGaps = mergePresensiGaps(teacherGaps, partialPresensi);

  return {
    thresholdPct,
    teacherGaps,
    partialPresensi,
    presensiGaps,
    atRisk,
    halaqahHealth,
    topLahn,
    counts: {
      teacherGapMeetings: teacherGaps.reduce((n, g) => n + g.meetings.length, 0),
      teacherGapHalaqah: teacherGaps.length,
      partialMeetings: partialPresensi.reduce((n, p) => n + p.meetings.length, 0),
      presensiGapHalaqah: presensiGaps.length,
      atRisk: atRisk.length,
      halaqahKritis: halaqahHealth.filter((h) => h.tier === "kritis").length,
    },
  };
}
