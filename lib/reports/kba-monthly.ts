/**
 * Data layer for the KBA (kolaborasi) monthly recap — the workbook the
 * kolaborasi coordinator used to assemble by hand from one `hits-bulanan`
 * export per program plus a lot of typing.
 *
 * One export = one period = one sheet, blocks stacked in the order the
 * coordinator's own file uses (see KBA_BLOCKS). Everything here is READ-ONLY and
 * per-program; the writer (lib/reports/kba-xlsx.ts) decides the layout.
 *
 * Scope note: HITS Reguler is deliberately absent — it has its own monthly
 * report. Tahsin Security is gone from the sheet (never had a program row), and
 * HITS Al-Kautsar folded into HITS Reguler in July 2026.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pesertaAktif } from "@/lib/enrollment";
import { getHitsMonthlyReport, getTeacherReport, type HitsMonthlyReport } from "@/lib/reports/queries";
import { resolveReportScope, resolveReportScopeForAgent, COMBINED, type ReportScope } from "@/lib/reports/scope";
import { KBA_BLOCKS, KBA_SLUGS, type KbaBlockSpec } from "@/lib/reports/kba-blocks";

export { KBA_BLOCKS, KBA_SLUGS };
export type { KbaBlockSpec, KbaBlockKind } from "@/lib/reports/kba-blocks";

export type KbaStudent = {
  name: string;
  gender: number | null;
  halaqah: string | null;
  hadir: number;
  /** Meetings whose presensi was actually filled for this student (status 0/1/2). */
  eff: number;
  /** Meetings scheduled for this student's halaqah in the period. */
  ideal: number;
  /** hadir ÷ eff as a percentage, null when nothing was recorded. */
  pct: number | null;
};

export type KbaTeacher = { name: string; real: number; ideal: number };

export type KbaProgram = {
  slug: string;
  programName: string;
  rep: HitsMonthlyReport;
  students: KbaStudent[];
  /** Active peserta whose attendance is under the program threshold, worst first. */
  belowTarget: KbaStudent[];
  teachers: KbaTeacher[];
};


export type KbaMonthly = {
  start: string;
  end: string;
  /** Keyed by slug. A slug the caller cannot read (or that has no row) maps to null. */
  programs: Record<string, KbaProgram | null>;
};

const pct = (num: number, den: number): number | null => (den > 0 ? (100 * num) / den : null);

/**
 * Per-peserta attendance inside the period.
 *
 * `eff` counts the meetings someone's presensi was actually filled for, while
 * `ideal` counts every meeting scheduled for their halaqah — the Tahsin Keluarga
 * table prints "Jumlah Kehadiran / Kehadiran Ideal per Bulan", and those two
 * disagree whenever a meeting's presensi was never input. Keeping both is the
 * point; collapsing them would hide un-inputted meetings as attendance.
 */
export async function getKbaStudents(
  scope: ReportScope,
  start: string,
  end: string,
  opts: { batchesInPeriodOnly?: boolean } = {},
): Promise<KbaStudent[]> {
  const db = getDb();
  const pid = sql.join(
    scope.programIds.map((id) => sql`${id}`),
    sql`, `,
  );
  // Same batch rule the recap figures use (getHitsMonthlyReport's
  // `batchesInPeriodOnly`), so the roster under a block can never disagree with
  // the block's own headcount.
  const batchGuard = opts.batchesInPeriodOnly
    ? sql`(h.tilawah_batch_id is null or h.tilawah_batch_id in (
          select h2.tilawah_batch_id from halaqah_sync h2
          join jadwal_sync j2 on j2.program_id = h2.program_id
                             and j2.tilawah_halaqah_id = h2.tilawah_halaqah_id
          where h2.program_id = h.program_id
            and h2.tilawah_batch_id is not null
            and j2.schedule_date between ${start} and ${end}
        ))`
    : sql`(h.tilawah_batch_id is null or p.tilawah_batch_id is null
           or h.tilawah_batch_id = p.tilawah_batch_id)`;
  const rows = await db.execute(sql`
    with hd as (
      select h.program_id, h.tilawah_halaqah_id as halaqah_id, h.name as halaqah
      from halaqah_sync h
      join programs p on p.id = h.program_id
      where h.program_id in (${pid}) and ${batchGuard}
    ),
    jad as (
      select j.program_id, j.tilawah_halaqah_id as halaqah_id, count(*)::int as jadwal
      from jadwal_sync j
      join hd on hd.program_id = j.program_id and hd.halaqah_id = j.tilawah_halaqah_id
      where j.program_id in (${pid}) and j.schedule_date between ${start} and ${end}
      group by 1, 2
    ),
    att as (
      select a.program_id, a.halaqah_user_id,
        count(*) filter (where a.status in ('1','2'))::int     as hadir,
        count(*) filter (where a.status in ('0','1','2'))::int as eff
      from attendance_sync a
      join jadwal_sync j on j.program_id = a.program_id and j.tilawah_jadwal_id = a.halaqah_jadwal_id
      where a.program_id in (${pid}) and j.schedule_date between ${start} and ${end}
      group by 1, 2
    )
    select coalesce(ss.name, '(tanpa nama)') as name, ss.gender, hd.halaqah,
           coalesce(att.hadir, 0) as hadir, coalesce(att.eff, 0) as eff,
           coalesce(jad.jadwal, 0) as ideal
    from students_sync ss
    join hd on hd.program_id = ss.program_id and hd.halaqah_id = ss.halaqah_id
    left join att on att.program_id = ss.program_id and att.halaqah_user_id = ss.halaqah_user_id
    left join jad on jad.program_id = ss.program_id and jad.halaqah_id = ss.halaqah_id
    where ss.program_id in (${pid}) and ${pesertaAktif("ss")}
    order by name
  `);
  return rows.rows.map((r) => {
    const hadir = Number(r.hadir);
    const eff = Number(r.eff);
    return {
      name: String(r.name),
      gender: r.gender != null ? Number(r.gender) : null,
      halaqah: (r.halaqah as string) ?? null,
      hadir,
      eff,
      ideal: Number(r.ideal),
      pct: pct(hadir, eff),
    };
  });
}

/** One program's slice of the sheet. Returns null when the slug is unreadable. */
async function loadProgram(
  spec: KbaBlockSpec,
  start: string,
  end: string,
  opts: { agent: boolean; allowed: Set<string> },
): Promise<KbaProgram | null> {
  const slug = spec.slug;
  if (!slug || !opts.allowed.has(slug)) return null;
  const scope = opts.agent
    ? await resolveReportScopeForAgent(slug, spec.combined ? COMBINED : undefined)
    : await resolveReportScope(slug, spec.combined ? COMBINED : undefined);
  if (!scope) return null;

  const batchOpts = { batchesInPeriodOnly: spec.batchesInPeriodOnly };
  const [rep, students, teacherRep] = await Promise.all([
    getHitsMonthlyReport(scope, start, end, batchOpts),
    getKbaStudents(scope, start, end, batchOpts),
    getTeacherReport(start, end, scope.programIds),
  ]);

  // Under target only counts peserta whose presensi was recorded at all: a
  // peserta with eff = 0 has no ratio to be under, and listing them as 0 % would
  // put un-inputted meetings on the peserta's record.
  const belowTarget = students
    .filter((s) => s.eff > 0 && s.pct != null && s.pct < rep.thresholdPct)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));

  return {
    slug,
    programName: scope.programName,
    rep,
    students,
    belowTarget,
    teachers: teacherRep.teachers.map((t) => ({
      name: t.pengajar,
      real: t.totalReal,
      ideal: t.totalIdeal,
    })),
  };
}

/**
 * Assemble every block's data for one period.
 *
 * `allowedSlugs` is the caller's reach (all programs for the agent token, the
 * session's grants otherwise). A slug outside it yields a null entry rather than
 * a missing block: the sheet keeps its shape, and the writer says the block was
 * not readable instead of silently dropping a program from the recap.
 */
export async function getKbaMonthly(
  start: string,
  end: string,
  opts: { agent: boolean; allowedSlugs: string[] },
): Promise<KbaMonthly> {
  const allowed = new Set(opts.allowedSlugs);
  const entries = await Promise.all(
    KBA_BLOCKS.filter((b) => b.slug).map(
      async (b) =>
        [b.slug as string, await loadProgram(b, start, end, { agent: opts.agent, allowed })] as const,
    ),
  );
  return { start, end, programs: Object.fromEntries(entries) };
}
