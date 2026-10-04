import { sql } from "drizzle-orm";
import { computeGuruCheckin, computeGuruCheckinOutside } from "@/lib/confirmations/guru-attendance";
import { getDb } from "@/lib/db/client";
import { currentBatchOnly } from "@/lib/programs/batch-guard";
import { resolveGuruPhone } from "@/lib/insights/guru-phone-overrides";
import { foldedJadwalCte } from "@/lib/reports/meeting-fold";
import { chronological, memberScope, type ReportScope } from "@/lib/reports/scope";
import { teacherPct, clampEndToToday } from "@/lib/reports/teacher-attendance";
import { todayJakarta } from "@/lib/time/jakarta";
import {
  getConfirmationsByGuru,
  getOrphanNotesByGuru,
  type TeacherConfirmation,
} from "@/lib/confirmations/attestation";

/**
 * Monthly-report queries. Two reports per program:
 *  - Participant recap: status buckets × (gender × level) + date-range attendance %.
 *  - Teacher recap: meetings-with-presensi per teacher over a 16–15 period.
 *
 * Status buckets derive from students_sync.enrollment_status_code (pivot.status:
 * 1=aktif, 0=tidak aktif, null=tidak ada status) sub-classified by the free-text
 * enrollment_status (reason).
 *
 * The participant reports take a ReportScope (lib/reports/scope.ts), not a slug:
 * a program's batches are separate program rows, and a coordinator can read one
 * batch or the whole family combined. Combined figures are re-queried over every
 * batch at once rather than summed from the per-batch reports — percentages and
 * the distinct-teacher count do not survive being averaged.
 */

/** `program_id in (…)` fragment for a scope's member ids. */
function pidList(scope: ReportScope) {
  return sql.join(
    scope.programIds.map((id) => sql`${id}`),
    sql`, `,
  );
}

/**
 * Batch-stray guard for the report queries. A halaqah mirrored under a program
 * whose batch it contradicts (see lib/sync/batch-strays.ts) is a stray: it does
 * not belong to this program and only pads its counts — seven TAFM LAZ halaqah
 * padded HKM-Presensi's peserta/kehadiran and made their teachers read as HKM
 * teachers. Same rule the dashboard (lib/insights/halaqah.ts) and getTeacherReport
 * use: keep a row only when its batch is null (non-tilawah source), the program is
 * unpinned, or the two batches agree. Requires `h` (halaqah_sync) and `p`
 * (programs) in scope.
 */
const notBatchStray = sql`(h.tilawah_batch_id is null or p.tilawah_batch_id is null or h.tilawah_batch_id = p.tilawah_batch_id)`;

/** One batch's line in a combined report's breakdown. */
export type BatchLine<T> = { slug: string; label: string; figures: T };

export type StatusBucket = "aktif" | "tidakAktif" | "dikeluarkan" | "mengundurkan" | "tidakAdaStatus";

export type ParticipantSegment = {
  /**
   * Meeting cadence of the halaqah, from the Mabni class (`jenis_pertemuan`):
   * 'yaumi' (daily) | 'usbui' (weekly). null for every other source — those
   * programs have a single cadence, so the report keeps its one-table shape.
   */
  jenis: string | null;
  gender: number | null; // 1 Ikhwan, 2 Akhwat
  level: string | null;
  aktif: number;
  tidakAktif: number;
  dikeluarkan: number;
  mengundurkan: number;
  tidakAdaStatus: number;
  total: number;
  kehadiranPct: number | null; // over the chosen date range
  /**
   * Teacher attendance for this segment's halaqah: meetings taught ÷ scheduled.
   * The window is the report period with its END CLAMPED TO TODAY — a mid-month
   * report must not count meetings that have not happened yet (see
   * lib/reports/teacher-attendance.ts).
   */
  teacherReal: number;
  teacherIdeal: number;
  teacherPct: number | null;
};

/**
 * Daily teacher check-in (mabni `/absensi-guru`), aggregated per segment in
 * GURU-DAYS: a teacher scheduled on 8 recorded days contributes 8. The source
 * carries no kelas/level, so the only way to segment it is through the meetings
 * that teacher was scheduled for.
 *
 * A guru who teaches two segments on one date counts in BOTH — one guru-day per
 * segment. That is what the column means, so this figure may sum to more than
 * the block total; quote GuruCheckinBlock for a headline, never this column.
 */
export type GuruCheckinSegment = {
  jenis: string | null;
  gender: number | null;
  level: string | null;
  hariEfektif: number;
  hadir: number;
  telat: number;
  izin: number;
  alpa: number;
};

/**
 * The block's totals are NOT the sum of its segments. A guru who teaches two
 * segments on one date is one guru-day in each segment's column — right for the
 * column, wrong for a headline: August 2026 sums to 87 guru-days across segments
 * against 82 distinct (guru, date) pairs. So the totals below come from a single
 * pass over the union of all scheduled rows, and they are the numbers to quote.
 */
export type GuruCheckinBlock = {
  segments: GuruCheckinSegment[];
  /** Calendar days in the period upstream recorded any check-in at all. */
  hariTerekam: number;
  /** Distinct (guru, date) guru-days counted — the denominator of the totals. */
  hariEfektif: number;
  totalTelat: number;
  totalAlpa: number;
  /**
   * Check-ins that fall OUTSIDE the counted denominator: a (guru, date) with a
   * check-in on a recorded date, where that guru has no meeting scheduled that
   * day. August 2026 has three such teachers (guru 27/29/31 check in but hold no
   * mabni meeting), and their rows include the month's only `terlambat` — so
   * without this counter the report reads "Terlambat: 0" against a feed that
   * plainly shows one, and the coordinator concludes the dashboard is lying.
   */
  luarJadwal: { checkin: number; telat: number; izin: number };
};

/**
 * Recap split by halaqah delivery type (halaqah_sync.type). Programs that mix
 * offline and online halaqah get read as three blocks in the report: offline,
 * online, then the combined figure (ParticipantReport.total).
 */
export type TypeSegment = {
  type: string | null; // 'offline' | 'online' | 'hybrid' | null (sumber non-tilawah)
  aktif: number;
  total: number;
  kehadiranPct: number | null;
};

/**
 * Recap split by meeting cadence — Mabni runs yaumi (daily) and usbu'iy (weekly)
 * halaqah side by side, and both reuse the same level names (M1, M2), so a recap
 * that only groups by gender × level silently merges two different cohorts.
 */
export type JenisSegment = {
  jenis: string | null; // 'yaumi' | 'usbui' | null
  aktif: number;
  total: number;
  kehadiranPct: number | null;
  teacherReal: number;
  teacherIdeal: number;
  teacherPct: number | null;
};

export type ParticipantTotals = {
  aktif: number;
  tidakAktif: number;
  dikeluarkan: number;
  mengundurkan: number;
  tidakAdaStatus: number;
  total: number;
  keaktifanPct: number | null;
  teacherReal: number;
  teacherIdeal: number;
  teacherPct: number | null;
};

export type ParticipantReport = {
  programName: string;
  start: string;
  end: string;
  segments: ParticipantSegment[];
  byType: TypeSegment[]; // empty when the program has only one type
  byJenis: JenisSegment[]; // empty when the program has only one cadence
  total: ParticipantTotals;
  /** Per-batch figures, oldest first. Empty unless the scope is combined. */
  perBatch: BatchLine<ParticipantTotals>[];
  /** null when no program in scope has teacher check-in data for this period. */
  guruCheckin: GuruCheckinBlock | null;
};

const bucketCase = sql`
  case
    when ss.enrollment_status_code = 1 then 'aktif'
    when ss.enrollment_status_code is null then 'tidakAdaStatus'
    when ss.enrollment_status ~* 'dikeluarkan|dinonaktifkan' then 'dikeluarkan'
    when ss.enrollment_status ~* 'mengundurkan|sakit|kerja|batal|pindah|keluar' then 'mengundurkan'
    else 'tidakAktif'
  end`;

/**
 * Meeting cadence lives in the raw Mabni class payload, not in a column of its
 * own: the sync spends halaqah_sync.type on tipe (offline/online). Reading it
 * out of `raw` keeps this migration-free, and any source whose raw has no
 * `kelas` key (tilawah, berkah) simply yields null.
 */
const jenisExpr = sql`h.raw->'kelas'->>'jenis_pertemuan'`;

const JENIS_ORDER = ["yaumi", "usbui"]; // daily first, then weekly
function jenisRank(j: string | null): number {
  const i = j ? JENIS_ORDER.indexOf(j) : -1;
  return i === -1 ? JENIS_ORDER.length : i;
}

export async function getParticipantReport(
  scope: ReportScope,
  start: string,
  end: string,
): Promise<ParticipantReport> {
  const db = getDb();
  const pid = pidList(scope);

  // Status counts per (jenis, gender, level).
  const statusRows = await db.execute(sql`
    select ${jenisExpr} as jenis, ss.gender, h.level,
      count(*) filter (where ${bucketCase} = 'aktif')::int          as aktif,
      count(*) filter (where ${bucketCase} = 'tidakAktif')::int     as tidak_aktif,
      count(*) filter (where ${bucketCase} = 'dikeluarkan')::int    as dikeluarkan,
      count(*) filter (where ${bucketCase} = 'mengundurkan')::int   as mengundurkan,
      count(*) filter (where ${bucketCase} = 'tidakAdaStatus')::int as tidak_ada_status,
      count(*)::int as total
    from students_sync ss
    join programs p on p.id = ss.program_id
    left join halaqah_sync h on h.program_id = ss.program_id and h.tilawah_halaqah_id = ss.halaqah_id
    where ss.program_id in (${pid}) and ${notBatchStray}
    group by ${jenisExpr}, ss.gender, h.level
  `);

  // Date-range attendance % per (jenis, gender, level): hadir(1,2) / effective(0,1,2)
  // over meetings whose schedule_date falls in [start, end].
  const attRows = await db.execute(sql`
    select ${jenisExpr} as jenis, ss.gender, h.level,
      count(*) filter (where a.status in ('1','2'))     as hadir,
      count(*) filter (where a.status in ('0','1','2')) as eff
    from attendance_sync a
    join jadwal_sync j on j.program_id = a.program_id and j.tilawah_jadwal_id = a.halaqah_jadwal_id
    join students_sync ss on ss.program_id = a.program_id and ss.halaqah_user_id = a.halaqah_user_id
    join programs p on p.id = ss.program_id
    left join halaqah_sync h on h.program_id = ss.program_id and h.tilawah_halaqah_id = ss.halaqah_id
    where a.program_id in (${pid}) and j.schedule_date between ${start} and ${end} and ${notBatchStray}
    group by ${jenisExpr}, ss.gender, h.level
  `);
  const attByKey = new Map<string, { hadir: number; eff: number }>();
  for (const r of attRows.rows) {
    attByKey.set(`${r.jenis}|${r.gender}|${r.level}`, { hadir: Number(r.hadir), eff: Number(r.eff) });
  }

  // Teacher attendance shares the segment key with the status counts, but is
  // counted on MEETINGS, not on enrolments: eff_status 3/4 (folded, so HITS
  // Reguler's duplicate meeting-1 counts once) or a confirmation that says the
  // class did happen. A meeting taught by a badal still counts as taught — this
  // is a figure about the class, not about a person.
  // A meeting can only be attributed to its halaqah, so the halaqah's gender is
  // min(students.gender) — the same derivation getHitsMonthlyReport uses. The
  // status counts group by each student's own gender, so a halaqah whose roster
  // mixes genders lands in one column only.
  const teacherEnd = clampEndToToday(end, todayJakarta());
  const teacherRows = await db.execute(sql`
    with ${foldedJadwalCte}
    select ${jenisExpr} as jenis, hg.gender, h.level,
      count(*) filter (
        where j.eff_status in (3, 4)
           or c.status in ('mengajar_kendala_sistem', 'diisi_koordinator')
      )::int as real,
      count(*)::int as ideal
    from jf j
    join halaqah_sync h on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    join programs p on p.id = j.program_id
    left join lateral (
      select min(s.gender) as gender
      from students_sync s
      where s.program_id = h.program_id and s.halaqah_id = h.tilawah_halaqah_id
    ) hg on true
    left join teacher_meeting_confirmations c
      on c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
    where j.program_id in (${pid})
      and j.schedule_date between ${start} and ${teacherEnd}
      and ${notBatchStray}
    group by 1, 2, 3
  `);
  const teacherByKey = new Map<string, { real: number; ideal: number }>();
  for (const r of teacherRows.rows) {
    teacherByKey.set(`${r.jenis}|${r.gender}|${r.level}`, {
      real: Number(r.real),
      ideal: Number(r.ideal),
    });
  }

  const segments: ParticipantSegment[] = statusRows.rows.map((r) => {
    const att = attByKey.get(`${r.jenis}|${r.gender}|${r.level}`);
    const kehadiranPct = att && att.eff > 0 ? (100 * att.hadir) / att.eff : null;
    const t = teacherByKey.get(`${r.jenis}|${r.gender}|${r.level}`) ?? { real: 0, ideal: 0 };
    return {
      jenis: (r.jenis as string) ?? null,
      gender: r.gender != null ? Number(r.gender) : null,
      level: (r.level as string) ?? null,
      aktif: Number(r.aktif),
      tidakAktif: Number(r.tidak_aktif),
      dikeluarkan: Number(r.dikeluarkan),
      mengundurkan: Number(r.mengundurkan),
      tidakAdaStatus: Number(r.tidak_ada_status),
      total: Number(r.total),
      kehadiranPct,
      teacherReal: t.real,
      teacherIdeal: t.ideal,
      teacherPct: teacherPct(t.real, t.ideal),
    };
  });
  segments.sort(
    (a, b) =>
      jenisRank(a.jenis) - jenisRank(b.jenis) ||
      (a.gender ?? 9) - (b.gender ?? 9) ||
      (a.level ?? "").localeCompare(b.level ?? ""),
  );

  // Same numbers grouped by halaqah type instead of gender×level.
  const typeStatusRows = await db.execute(sql`
    select h.type,
      count(*) filter (where ${bucketCase} = 'aktif')::int as aktif,
      count(*)::int as total
    from students_sync ss
    join programs p on p.id = ss.program_id
    left join halaqah_sync h on h.program_id = ss.program_id and h.tilawah_halaqah_id = ss.halaqah_id
    where ss.program_id in (${pid}) and ${notBatchStray}
    group by h.type
  `);
  const typeAttRows = await db.execute(sql`
    select h.type,
      count(*) filter (where a.status in ('1','2'))     as hadir,
      count(*) filter (where a.status in ('0','1','2')) as eff
    from attendance_sync a
    join jadwal_sync j on j.program_id = a.program_id and j.tilawah_jadwal_id = a.halaqah_jadwal_id
    join students_sync ss on ss.program_id = a.program_id and ss.halaqah_user_id = a.halaqah_user_id
    join programs p on p.id = ss.program_id
    left join halaqah_sync h on h.program_id = ss.program_id and h.tilawah_halaqah_id = ss.halaqah_id
    where a.program_id in (${pid}) and j.schedule_date between ${start} and ${end} and ${notBatchStray}
    group by h.type
  `);
  const typeAtt = new Map<string, { hadir: number; eff: number }>();
  for (const r of typeAttRows.rows) {
    typeAtt.set(String(r.type), { hadir: Number(r.hadir), eff: Number(r.eff) });
  }
  const TYPE_ORDER = ["offline", "online", "hybrid"]; // offline first, per report convention
  const byType: TypeSegment[] = typeStatusRows.rows
    .map((r) => {
      const att = typeAtt.get(String(r.type));
      return {
        type: (r.type as string) ?? null,
        aktif: Number(r.aktif),
        total: Number(r.total),
        kehadiranPct: att && att.eff > 0 ? (100 * att.hadir) / att.eff : null,
      };
    })
    .sort((a, b) => {
      const rank = (t: string | null) => {
        const i = t ? TYPE_ORDER.indexOf(t) : -1;
        return i === -1 ? TYPE_ORDER.length : i;
      };
      return rank(a.type) - rank(b.type) || (a.type ?? "").localeCompare(b.type ?? "");
    });

  // Same numbers grouped by meeting cadence. Aktif/total come straight off the
  // segments (already grouped by jenis); only the attendance ratio needs its own
  // pass, since a ratio cannot be summed.
  const jenisAttRows = await db.execute(sql`
    select ${jenisExpr} as jenis,
      count(*) filter (where a.status in ('1','2'))     as hadir,
      count(*) filter (where a.status in ('0','1','2')) as eff
    from attendance_sync a
    join jadwal_sync j on j.program_id = a.program_id and j.tilawah_jadwal_id = a.halaqah_jadwal_id
    join students_sync ss on ss.program_id = a.program_id and ss.halaqah_user_id = a.halaqah_user_id
    join programs p on p.id = ss.program_id
    left join halaqah_sync h on h.program_id = ss.program_id and h.tilawah_halaqah_id = ss.halaqah_id
    where a.program_id in (${pid}) and j.schedule_date between ${start} and ${end} and ${notBatchStray}
    group by ${jenisExpr}
  `);
  const jenisAtt = new Map<string, { hadir: number; eff: number }>();
  for (const r of jenisAttRows.rows) {
    jenisAtt.set(String(r.jenis), { hadir: Number(r.hadir), eff: Number(r.eff) });
  }
  const byJenisMap = new Map<string, JenisSegment>();
  for (const s of segments) {
    const key = String(s.jenis);
    // A ratio cannot be summed, but its two counters can — so the cadence line
    // adds up real/ideal and divides once, at the end.
    const cur = byJenisMap.get(key) ?? {
      jenis: s.jenis,
      aktif: 0,
      total: 0,
      kehadiranPct: null,
      teacherReal: 0,
      teacherIdeal: 0,
      teacherPct: null,
    };
    cur.aktif += s.aktif;
    cur.total += s.total;
    cur.teacherReal += s.teacherReal;
    cur.teacherIdeal += s.teacherIdeal;
    byJenisMap.set(key, cur);
  }
  const byJenis: JenisSegment[] = [...byJenisMap.values()]
    .map((j) => {
      const att = jenisAtt.get(String(j.jenis));
      return {
        ...j,
        kehadiranPct: att && att.eff > 0 ? (100 * att.hadir) / att.eff : null,
        teacherPct: teacherPct(j.teacherReal, j.teacherIdeal),
      };
    })
    .sort((a, b) => jenisRank(a.jenis) - jenisRank(b.jenis));

  const sum = (k: keyof ParticipantSegment) =>
    segments.reduce((n, s) => n + (typeof s[k] === "number" ? (s[k] as number) : 0), 0);
  // Overall attendance from all in-range presensi.
  const [overall] = (
    await db.execute(sql`
      select count(*) filter (where a.status in ('1','2'))::int as hadir,
             count(*) filter (where a.status in ('0','1','2'))::int as eff
      from attendance_sync a
      join jadwal_sync j on j.program_id = a.program_id and j.tilawah_jadwal_id = a.halaqah_jadwal_id
      join programs p on p.id = j.program_id
      left join halaqah_sync h on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
      where a.program_id in (${pid}) and j.schedule_date between ${start} and ${end} and ${notBatchStray}
    `)
  ).rows;
  const keaktifanPct =
    overall && Number(overall.eff) > 0 ? (100 * Number(overall.hadir)) / Number(overall.eff) : null;

  // Combined scope: re-run per batch so the report can show each batch's own
  // contribution. Recursed rather than summed — keaktifanPct is a ratio.
  const perBatch: BatchLine<ParticipantTotals>[] = scope.combined
    ? await Promise.all(
        chronological(scope).map(async (m) => ({
          slug: m.slug,
          label: m.label,
          figures: (await getParticipantReport(memberScope(scope, m), start, end)).total,
        })),
      )
    : [];

  // Teacher check-in exists only where a program syncs /absensi-guru (mabni).
  // Everything else in scope simply produces no rows and the block stays null.
  //
  // The table itself is not everywhere either: the deploy repo is a separate
  // history that never received the migration creating guru_attendance_sync, so
  // on that database this query would take the whole monthly report down with
  // `relation "guru_attendance_sync" does not exist`. A report must not die over
  // a section that is empty on purpose, so the table is probed first and its
  // absence reads exactly like "no check-in data".
  const hasCheckinTable =
    (await db.execute(sql`select to_regclass('public.guru_attendance_sync') is not null as ok`))
      .rows[0]?.ok === true;
  const checkinRows = hasCheckinTable
    ? ((
        await db.execute(sql`
          select guru_id, tanggal::text as tanggal, status
          from guru_attendance_sync
          where program_id in (${pid})
            and tanggal between ${start} and ${teacherEnd}
            and guru_id is not null
        `)
      ).rows as { guru_id: number; tanggal: string; status: string }[])
    : [];

  let guruCheckin: GuruCheckinBlock | null = null;
  if (checkinRows.length > 0) {
    // Meetings attributed to a guru, with the segment they belong to. Same
    // attribution as the teacher figures: per-meeting guru first (badal), the
    // halaqah's guru as fallback.
    const scheduledRows = (
      await db.execute(sql`
        with ${foldedJadwalCte}
        select ${jenisExpr} as jenis, hg.gender, h.level,
               coalesce(j.guru_id, h.guru_id) as guru_id,
               j.schedule_date::text as tanggal
        from jf j
        join halaqah_sync h on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
        join programs p on p.id = j.program_id
        left join lateral (
          select min(s.gender) as gender
          from students_sync s
          where s.program_id = h.program_id and s.halaqah_id = h.tilawah_halaqah_id
        ) hg on true
        where j.program_id in (${pid})
          and j.schedule_date between ${start} and ${teacherEnd}
          and coalesce(j.guru_id, h.guru_id) is not null
          and ${notBatchStray}
      `)
    ).rows as {
      jenis: string | null;
      gender: number | null;
      level: string | null;
      guru_id: number;
      tanggal: string;
    }[];

    const recordedDates = [...new Set(checkinRows.map((r) => r.tanggal))];
    const checkins = checkinRows.map((r) => ({
      guruId: Number(r.guru_id),
      date: r.tanggal,
      status: String(r.status),
    }));

    // One call per segment: the helper is per-guru, and a segment's figure is the
    // sum over its own guru-days, so the scheduled rows are sliced first.
    const bySeg = new Map<string, typeof scheduledRows>();
    for (const row of scheduledRows) {
      const key = `${row.jenis}|${row.gender}|${row.level}`;
      const bucket = bySeg.get(key);
      if (bucket) bucket.push(row);
      else bySeg.set(key, [row]);
    }

    const segmentsOut: GuruCheckinSegment[] = [...bySeg.values()].map((rows) => {
      const counts = computeGuruCheckin({
        recordedDates,
        scheduled: rows.map((r) => ({ guruId: Number(r.guru_id), date: r.tanggal })),
        checkins,
      });
      const agg = [...counts.values()].reduce(
        (a, c) => ({
          hariEfektif: a.hariEfektif + c.hariEfektif,
          hadir: a.hadir + c.hadir,
          telat: a.telat + c.telat,
          izin: a.izin + c.izin,
          alpa: a.alpa + c.alpa,
        }),
        { hariEfektif: 0, hadir: 0, telat: 0, izin: 0, alpa: 0 },
      );
      return {
        jenis: rows[0].jenis ?? null,
        gender: rows[0].gender != null ? Number(rows[0].gender) : null,
        level: rows[0].level ?? null,
        ...agg,
      };
    });

    // Both block-level figures run over the UNION of the scheduled rows, not over
    // the per-segment slices: the totals must count a guru-day once (a guru
    // teaching two segments on one date summed to 87 against 82 real guru-days in
    // August), and a guru with no meeting that day belongs to no segment at all,
    // so a per-segment pass would never see the luar-jadwal rows.
    const allScheduled = scheduledRows.map((r) => ({ guruId: Number(r.guru_id), date: r.tanggal }));
    const union = [...computeGuruCheckin({ recordedDates, scheduled: allScheduled, checkins }).values()];

    guruCheckin = {
      segments: segmentsOut,
      hariTerekam: recordedDates.length,
      hariEfektif: union.reduce((n, c) => n + c.hariEfektif, 0),
      totalTelat: union.reduce((n, c) => n + c.telat, 0),
      totalAlpa: union.reduce((n, c) => n + c.alpa, 0),
      luarJadwal: computeGuruCheckinOutside({ recordedDates, scheduled: allScheduled, checkins }),
    };
  }

  return {
    programName: scope.programName,
    start,
    end,
    segments,
    // A single-type program needs no split — the combined total already says it.
    byType: byType.length > 1 ? byType : [],
    byJenis: byJenis.length > 1 ? byJenis : [],
    total: {
      aktif: sum("aktif"),
      tidakAktif: sum("tidakAktif"),
      dikeluarkan: sum("dikeluarkan"),
      mengundurkan: sum("mengundurkan"),
      tidakAdaStatus: sum("tidakAdaStatus"),
      total: sum("total"),
      keaktifanPct,
      teacherReal: sum("teacherReal"),
      teacherIdeal: sum("teacherIdeal"),
      teacherPct: teacherPct(sum("teacherReal"), sum("teacherIdeal")),
    },
    perBatch,
    guruCheckin,
  };
}

// ── Peserta keluar / non-aktif, with the reason ──────────────────────────
/**
 * The people behind the "Peserta Keluar" / "Tidak Aktif" counters, each with the
 * reason a coordinator typed upstream (students_sync.enrollment_status = the
 * tilawah enrollment pivot's `reason` — already carried by the sync, so this
 * needs no extra API call).
 *
 * Membership matches the recap's Keluar definition (enrollment_status_code is
 * distinct from 1); `inPeriod` marks the subset that the report's Keluar column
 * actually counts, so the list can show recent exits alongside older ones
 * without the two numbers contradicting each other.
 */
export type ExitedParticipant = {
  slug: string; // batch slug — distinguishes rows in a combined report
  batchLabel: string;
  name: string | null;
  halaqah: string | null;
  gender: number | null;
  level: string | null;
  bucket: StatusBucket;
  reason: string | null;
  exitedAt: string | null; // YYYY-MM-DD, null when the enrollment was never touched
  inPeriod: boolean;
};

export async function getExitedParticipants(
  scope: ReportScope,
  start: string,
  end: string,
): Promise<ExitedParticipant[]> {
  const db = getDb();
  const pid = pidList(scope);
  const endEx = new Date(`${end}T00:00:00Z`);
  endEx.setUTCDate(endEx.getUTCDate() + 1);
  const endExclusive = endEx.toISOString().slice(0, 10);

  const rows = await db.execute(sql`
    select ss.program_id, ss.name, ss.gender, coalesce(h.nama_tampil, h.name) as halaqah, h.level,
           ss.enrollment_status as reason,
           ${bucketCase} as bucket,
           to_char(ss.enrollment_updated_at, 'YYYY-MM-DD') as exited_at,
           (ss.enrollment_updated_at >= ${start}::timestamptz
            and ss.enrollment_updated_at < ${endExclusive}::timestamptz) as in_period
    from students_sync ss
    left join halaqah_sync h on h.program_id = ss.program_id and h.tilawah_halaqah_id = ss.halaqah_id
    where ss.program_id in (${pid}) and ss.enrollment_status_code is distinct from 1
    order by ss.enrollment_updated_at desc nulls last, ss.name asc
  `);

  const labelById = new Map(scope.members.map((m) => [m.programId, m]));
  return rows.rows.map((r) => {
    const member = labelById.get(String(r.program_id));
    return {
      slug: member?.slug ?? "",
      batchLabel: member?.label ?? "",
      name: (r.name as string) ?? null,
      halaqah: (r.halaqah as string) ?? null,
      gender: r.gender != null ? Number(r.gender) : null,
      level: (r.level as string) ?? null,
      bucket: r.bucket as StatusBucket,
      reason: (r.reason as string) ?? null,
      exitedAt: (r.exited_at as string) ?? null,
      inPeriod: r.in_period === true,
    };
  });
}

// ── HITS monthly recap ───────────────────────────────────────────────────
/**
 * The recap the HITS coordinators actually circulate: one table per (halaqah
 * type × level) with an Ikhwan/Akhwat/Total row each, then a KESELURUHAN block
 * for the whole program. Five figures per row:
 *
 *   Peserta aktif   — reconstructed to month-end, so a report for a past month
 *                     doesn't shrink every time someone leaves later.
 *   Kehadiran       — hadir(1,2) ÷ effective(0,1,2) over the month's meetings.
 *   Peserta Keluar  — deactivated WITHIN the month (see enrollmentUpdatedAt).
 *   Keberlangsungan — meetings actually held (status 3/4) ÷ meetings scheduled.
 *   Pengajar di bawah target — DISTINCT teachers whose taught÷assigned ratio in
 *                     that scope is under the program threshold.
 *
 * Every figure is segmented by the HALAQAH's (type, level, gender), not by each
 * student's own gender: the report's "Ikhwan/Akhwat" rows mean ikhwan/akhwat
 * classes, and halaqah here are gender-segregated. Halaqah gender = min(student
 * gender), the same signal getTeacherReport and the dashboard use.
 */
export type HitsRow = {
  gender: number | null; // 1 Ikhwan, 2 Akhwat, null tak diketahui
  aktif: number;
  kehadiranPct: number | null;
  keluar: number;
  keberlangsunganPct: number | null;
  pengajarDiBawahTarget: number;
  /**
   * Raw counters behind kehadiranPct — the KBA recap prints "akumulasi kehadiran
   * peserta" (a headcount, not a ratio), which cannot be recovered from the
   * percentage. `eff` is the denominator (status 0/1/2).
   */
  hadir: number;
  eff: number;
  /** Meetings taught ÷ assigned for the teachers in this row's scope. */
  teacherReal: number;
  teacherIdeal: number;
};
export type HitsBlock = {
  type: string | null; // offline | online | hybrid
  level: string | null;
  rows: HitsRow[];
  total: HitsRow;
};
export type HitsMonthlyReport = {
  programName: string;
  start: string;
  end: string;
  thresholdPct: number;
  blocks: HitsBlock[];
  overall: HitsRow;
  /**
   * Program-wide rollup per gender, across every (type × level) block. The KBA
   * kolaborasi recap splits Ikhwan/Akhwat at the PROGRAM level, which is not the
   * same as reading one block's gender rows once a program runs several blocks.
   */
  byGender: HitsRow[];
  /** Per-batch KESELURUHAN rows, oldest first. Empty unless the scope is combined. */
  perBatch: BatchLine<HitsRow>[];
};

const DEFAULT_TEACHER_THRESHOLD_PCT = 70;

type SegAgg = { aktif: number; keluar: number; hadir: number; eff: number; terlaksana: number; jadwal: number };
type TeacherAgg = { real: number; ideal: number };

const pct = (num: number, den: number): number | null => (den > 0 ? (100 * num) / den : null);

/**
 * Count teachers under target within one scope. A teacher's ratio is summed over
 * the segments in scope first, then compared — so someone who covers two halaqah
 * is judged on their whole load in that scope, and counted once (the report's
 * Total row is therefore NOT the sum of its gender rows).
 */
function countBelowTarget(
  entries: Array<[string, TeacherAgg]>,
  thresholdPct: number,
): number {
  const byTeacher = new Map<string, TeacherAgg>();
  for (const [name, t] of entries) {
    const cur = byTeacher.get(name) ?? { real: 0, ideal: 0 };
    byTeacher.set(name, { real: cur.real + t.real, ideal: cur.ideal + t.ideal });
  }
  let n = 0;
  for (const t of byTeacher.values()) {
    if (t.ideal === 0) continue; // no meetings assigned this month — nothing to miss
    if ((100 * t.real) / t.ideal < thresholdPct) n += 1;
  }
  return n;
}

const TYPE_RANK = ["offline", "online", "hybrid"];
const LEVEL_RANK = ["dasar", "lanjutan"];
const rank = (v: string | null, order: string[]): number => {
  const i = v ? order.indexOf(v.toLowerCase()) : -1;
  return i === -1 ? order.length : i;
};

export async function getHitsMonthlyReport(
  scope: ReportScope,
  start: string,
  end: string,
  opts: { batchesInPeriodOnly?: boolean } = {},
): Promise<HitsMonthlyReport> {
  const db = getDb();
  const pid = pidList(scope);
  /**
   * Which batches of the scope's program rows count.
   *
   * Default: `notBatchStray` — the pin decides, which is right for a program
   * that owns one batch.
   *
   * `batchesInPeriodOnly`: the PERIOD decides. A rolling-batch program
   * (config.syncAllBatches) mirrors every upstream batch into one row — Tahsin
   * al-Fatihah LAZ opens a new one every 1–2 weeks — and its `tilawah_batch_id`
   * is a stale fallback that seeding never advances. Judged by the pin, LAZ's
   * report showed batch 10 alone: 62 of its 145 peserta, with the other two
   * batches dropped as "strays" of their own program. Judged by the period, the
   * block reports the batches that actually ran in it. Batch-level, not
   * halaqah-level: a halaqah whose own meetings fell outside the window still
   * belongs to a batch that ran, and dropping it would understate that batch.
   */
  const batchGuard = opts.batchesInPeriodOnly
    ? sql`(h.tilawah_batch_id is null or h.tilawah_batch_id in (
          select h2.tilawah_batch_id from halaqah_sync h2
          join jadwal_sync j2 on j2.program_id = h2.program_id
                             and j2.tilawah_halaqah_id = h2.tilawah_halaqah_id
          where h2.program_id = h.program_id
            and h2.tilawah_batch_id is not null
            and j2.schedule_date between ${start} and ${end}
        ))`
    : notBatchStray;
  // Half-open upper bound: enrollment timestamps carry a clock time, so "still
  // enrolled at month end" means the row was untouched until at least the first
  // instant of the next month.
  const endEx = new Date(`${end}T00:00:00Z`);
  endEx.setUTCDate(endEx.getUTCDate() + 1);
  const endExclusive = endEx.toISOString().slice(0, 10);

  // Threshold is anchored to the batch in the URL, not merged: batches of one
  // program share a target, and picking a single row keeps the figure explainable.
  const [thresholdRow] = (
    await db.execute(sql`
      select pct_70 from attendance_thresholds
      where program_id = ${scope.primary.programId} and period_type = 'yaumiy' limit 1
    `)
  ).rows;
  const thresholdPct =
    thresholdRow?.pct_70 != null ? Number(thresholdRow.pct_70) : DEFAULT_TEACHER_THRESHOLD_PCT;

  // Halaqah dimension + the three aggregates, all keyed the same way.
  // hd carries program_id so every join below stays batch-correct once the scope
  // spans more than one program row.
  const rows = await db.execute(sql`
    with hd as (
      select h.program_id, h.tilawah_halaqah_id as halaqah_id, h.type, h.level,
             (select min(s.gender) from students_sync s
               where s.program_id = h.program_id and s.halaqah_id = h.tilawah_halaqah_id) as gender
      from halaqah_sync h
      join programs p on p.id = h.program_id
      where h.program_id in (${pid}) and ${batchGuard}
    ),
    stu as (
      select hd.type, hd.level, hd.gender,
        -- Active AT MONTH END: enrolled by then, and either still active now or
        -- deactivated only after this month closed. A null created_at (student
        -- seen in the absensi report but with no enrollment row) is treated as
        -- "already enrolled" rather than dropped.
        count(*) filter (
          where (ss.enrollment_created_at is null or ss.enrollment_created_at < ${endExclusive}::timestamptz)
            and (ss.enrollment_status_code = 1
                 or (ss.enrollment_updated_at is not null
                     and ss.enrollment_updated_at >= ${endExclusive}::timestamptz))
        )::int as aktif,
        count(*) filter (
          where ss.enrollment_status_code is distinct from 1
            and ss.enrollment_updated_at >= ${start}::timestamptz
            and ss.enrollment_updated_at < ${endExclusive}::timestamptz
        )::int as keluar
      from students_sync ss
      join hd on hd.program_id = ss.program_id and hd.halaqah_id = ss.halaqah_id
      where ss.program_id in (${pid})
      group by 1, 2, 3
    ),
    att as (
      select hd.type, hd.level, hd.gender,
        count(*) filter (where a.status in ('1','2'))::int     as hadir,
        count(*) filter (where a.status in ('0','1','2'))::int as eff
      from attendance_sync a
      join jadwal_sync j on j.program_id = a.program_id and j.tilawah_jadwal_id = a.halaqah_jadwal_id
      join hd on hd.program_id = j.program_id and hd.halaqah_id = j.tilawah_halaqah_id
      where a.program_id in (${pid}) and j.schedule_date between ${start} and ${end}
      group by 1, 2, 3
    ),
    jad as (
      select hd.type, hd.level, hd.gender,
        count(*) filter (where j.status in (3,4))::int as terlaksana,
        count(*)::int as jadwal
      from jadwal_sync j
      join hd on hd.program_id = j.program_id and hd.halaqah_id = j.tilawah_halaqah_id
      where j.program_id in (${pid}) and j.schedule_date between ${start} and ${end}
      group by 1, 2, 3
    ),
    keys as (
      select distinct type, level, gender from hd
    )
    select k.type, k.level, k.gender,
           coalesce(stu.aktif, 0) as aktif, coalesce(stu.keluar, 0) as keluar,
           coalesce(att.hadir, 0) as hadir, coalesce(att.eff, 0) as eff,
           coalesce(jad.terlaksana, 0) as terlaksana, coalesce(jad.jadwal, 0) as jadwal
    from keys k
    left join stu on stu.type is not distinct from k.type
                 and stu.level is not distinct from k.level
                 and stu.gender is not distinct from k.gender
    left join att on att.type is not distinct from k.type
                 and att.level is not distinct from k.level
                 and att.gender is not distinct from k.gender
    left join jad on jad.type is not distinct from k.type
                 and jad.level is not distinct from k.level
                 and jad.gender is not distinct from k.gender
  `);

  // Per-meeting teacher (badal included), same attribution as getTeacherReport —
  // and the same taught rule: folded eff_status, plus confirmations that say the
  // class did happen. Reading j.status raw made this row disagree with /rekap.
  const teacherEnd = clampEndToToday(end, todayJakarta());
  const teacherRows = await db.execute(sql`
    with ${foldedJadwalCte},
    hd as (
      select h.program_id, h.tilawah_halaqah_id as halaqah_id, h.type, h.level,
             (select min(s.gender) from students_sync s
               where s.program_id = h.program_id and s.halaqah_id = h.tilawah_halaqah_id) as gender
      from halaqah_sync h
      join programs p on p.id = h.program_id
      where h.program_id in (${pid}) and ${batchGuard}
    )
    select hd.type, hd.level, hd.gender,
      coalesce(nullif(j.raw->'guru'->>'name', ''), h.pengajar,
               'Halaqah #' || h.tilawah_halaqah_id::text) as pengajar,
      count(*) filter (
        where j.eff_status in (3, 4)
           or c.status in ('mengajar_kendala_sistem', 'diisi_koordinator')
      )::int as real,
      count(*)::int as ideal
    from jf j
    join halaqah_sync h on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    join hd on hd.program_id = j.program_id and hd.halaqah_id = j.tilawah_halaqah_id
    left join teacher_meeting_confirmations c
      on c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
    where j.program_id in (${pid}) and j.schedule_date between ${start} and ${teacherEnd}
    group by 1, 2, 3, 4
  `);

  const segKey = (t: unknown, l: unknown, g: unknown) => `${t ?? ""}|${l ?? ""}|${g ?? ""}`;
  const teachersBySeg = new Map<string, Array<[string, TeacherAgg]>>();
  for (const r of teacherRows.rows) {
    const key = segKey(r.type, r.level, r.gender);
    const list = teachersBySeg.get(key) ?? [];
    list.push([String(r.pengajar), { real: Number(r.real), ideal: Number(r.ideal) }]);
    teachersBySeg.set(key, list);
  }
  const teachersIn = (keys: string[]): Array<[string, TeacherAgg]> =>
    keys.flatMap((k) => teachersBySeg.get(k) ?? []);

  type Seg = { type: string | null; level: string | null; gender: number | null; agg: SegAgg };
  const segs: Seg[] = rows.rows.map((r) => ({
    type: (r.type as string) ?? null,
    level: (r.level as string) ?? null,
    gender: r.gender != null ? Number(r.gender) : null,
    agg: {
      aktif: Number(r.aktif),
      keluar: Number(r.keluar),
      hadir: Number(r.hadir),
      eff: Number(r.eff),
      terlaksana: Number(r.terlaksana),
      jadwal: Number(r.jadwal),
    },
  }));

  const sumAgg = (list: SegAgg[]): SegAgg =>
    list.reduce(
      (a, s) => ({
        aktif: a.aktif + s.aktif,
        keluar: a.keluar + s.keluar,
        hadir: a.hadir + s.hadir,
        eff: a.eff + s.eff,
        terlaksana: a.terlaksana + s.terlaksana,
        jadwal: a.jadwal + s.jadwal,
      }),
      { aktif: 0, keluar: 0, hadir: 0, eff: 0, terlaksana: 0, jadwal: 0 },
    );
  /**
   * `teachers` is the raw (name, real/ideal) list for this row's scope, not a
   * pre-counted number: the row needs BOTH the distinct-teacher count under
   * target and the summed taught÷assigned ratio, and summing must happen over
   * the same entries the count was taken from.
   */
  const toRow = (
    gender: number | null,
    agg: SegAgg,
    teachers: Array<[string, TeacherAgg]>,
  ): HitsRow => ({
    gender,
    aktif: agg.aktif,
    kehadiranPct: pct(agg.hadir, agg.eff),
    keluar: agg.keluar,
    keberlangsunganPct: pct(agg.terlaksana, agg.jadwal),
    pengajarDiBawahTarget: countBelowTarget(teachers, thresholdPct),
    hadir: agg.hadir,
    eff: agg.eff,
    teacherReal: teachers.reduce((n, [, t]) => n + t.real, 0),
    teacherIdeal: teachers.reduce((n, [, t]) => n + t.ideal, 0),
  });

  // Group into (type × level) blocks; a block with neither participants nor
  // meetings is dropped rather than rendered empty.
  const blockKeys = [...new Set(segs.map((s) => `${s.type ?? ""}|${s.level ?? ""}`))];
  const blocks: HitsBlock[] = [];
  for (const bk of blockKeys) {
    const [t, l] = bk.split("|");
    const inBlock = segs.filter((s) => (s.type ?? "") === t && (s.level ?? "") === l);
    const blockAgg = sumAgg(inBlock.map((s) => s.agg));
    if (blockAgg.aktif === 0 && blockAgg.jadwal === 0 && blockAgg.keluar === 0) continue;
    const rows: HitsRow[] = inBlock
      .filter((s) => s.agg.aktif > 0 || s.agg.jadwal > 0 || s.agg.keluar > 0)
      .sort((a, b) => (a.gender ?? 9) - (b.gender ?? 9))
      .map((s) => toRow(s.gender, s.agg, teachersIn([segKey(s.type, s.level, s.gender)])));
    blocks.push({
      type: inBlock[0].type,
      level: inBlock[0].level,
      rows,
      total: toRow(
        null,
        blockAgg,
        teachersIn(inBlock.map((s) => segKey(s.type, s.level, s.gender))),
      ),
    });
  }
  blocks.sort(
    (a, b) =>
      rank(a.type, TYPE_RANK) - rank(b.type, TYPE_RANK) ||
      (a.type ?? "").localeCompare(b.type ?? "") ||
      rank(a.level, LEVEL_RANK) - rank(b.level, LEVEL_RANK) ||
      (a.level ?? "").localeCompare(b.level ?? ""),
  );

  // KESELURUHAN is re-aggregated from the raw counters, never averaged across
  // blocks — a 2-person block must not pull the program figure as hard as a
  // 22-person one.
  const overall = toRow(null, sumAgg(segs.map((s) => s.agg)), teachersIn([...teachersBySeg.keys()]));

  // Same re-aggregation, sliced by gender instead of by (type × level).
  const byGender: HitsRow[] = [...new Set(segs.map((s) => s.gender))]
    .sort((a, b) => (a ?? 9) - (b ?? 9))
    .map((g) => {
      const inG = segs.filter((s) => s.gender === g);
      return toRow(
        g,
        sumAgg(inG.map((s) => s.agg)),
        teachersIn(inG.map((s) => segKey(s.type, s.level, s.gender))),
      );
    })
    .filter((r) => r.aktif > 0 || r.eff > 0 || r.teacherIdeal > 0 || r.keluar > 0);

  // Combined scope: each batch's own KESELURUHAN row, so the merged figure can be
  // read back to its parts. Re-queried, not summed — kehadiran/keberlangsungan are
  // ratios and pengajarDiBawahTarget counts distinct teachers.
  const perBatch: BatchLine<HitsRow>[] = scope.combined
    ? await Promise.all(
        chronological(scope).map(async (m) => ({
          slug: m.slug,
          label: m.label,
          figures: (await getHitsMonthlyReport(memberScope(scope, m), start, end, opts)).overall,
        })),
      )
    : [];

  return {
    programName: scope.programName,
    start,
    end,
    thresholdPct,
    blocks,
    overall,
    byGender,
    perBatch,
  };
}

export type { TeacherConfirmation };

export type MeetingConfStatus =
  | "tidak_mengajar"
  | "mengajar_belum_input"
  | "mengajar_kendala_sistem"
  | "diisi_koordinator"
  // The teacher says a meeting the system records as TAUGHT is wrong (wrong
  // date, not their halaqah, someone else taught it). Only reachable from
  // /rekap; unlike the others it sits on a done meeting, so it never changes a
  // count — it is a flag for a human.
  | "data_tidak_sesuai";
export type TeacherMeeting = {
  jadwalId: number; // tilawah_jadwal_id — target for coordinator force-fill
  programId: string; // programs.id (uuid) — scope for the force-fill write
  order: number | null;
  date: string | null;
  done: boolean;
  // Teacher self-confirmation for a not-taught meeting (via /confirm magic link).
  confStatus: MeetingConfStatus | null;
  reasonCode: string | null;
  reasonText: string | null;
};
export type TeacherHalaqah = {
  program: string;
  halaqah: string;
  real: number; // meetings actually taught by THIS teacher (jadwal status Mulai/Selesai)
  ideal: number; // meetings assigned to THIS teacher in the halaqah for the period
  asBadal: boolean; // true when this teacher isn't the halaqah's main pengajar (a badal)
  mainTeacher: string | null; // the halaqah's main pengajar (plurality); set when asBadal
  confirmedAbsent: number; // meetings the teacher confirmed they did not teach
  taughtNotInput: number; // meetings teacher says they taught but hasn't input presensi
  // meetings teacher attests they taught but the system couldn't record (kendala
  // sistem) — counted as taught, but only while j.status still ∉ (3,4) so a later
  // sync that flips the status doesn't double-count it (it graduates into `real`)
  confirmedTaught: number;
  // Of the not-taught (gap) meetings: resolved = teacher gave any confirmation;
  // unsolved = still no confirmation (these are what remain in the inbox).
  resolved: number;
  unsolved: number;
  gender: number | null; // 1 = Ikhwan, 2 = Akhwat, null = unknown
  guruPhone: string | null; // for the WA reminder column (override applied)
  // Every meeting scheduled in the period, oldest first, each flagged done (status
  // 3/4 = taught) — for the full per-pertemuan status strip (sudah vs belum).
  meetings: TeacherMeeting[];
};
export type TeacherRow = {
  pengajar: string;
  halaqah: TeacherHalaqah[];
  totalReal: number;
  totalIdeal: number;
  totalConfirmedAbsent: number;
  totalTaughtNotInput: number;
  totalConfirmedTaught: number;
  totalResolved: number;
  totalUnsolved: number;
  /** tilawah user ids behind this name — usually one, two when the CMS holds a duplicate account. */
  guruIds: number[];
  /**
   * The teacher's sign-off on their recap for this exact period, from the
   * /rekap magic link. null = never submitted, which is NOT the same as "nothing
   * to answer" and is the whole point of showing it.
   */
  confirmation: TeacherConfirmation | null;
};
export type TeacherReport = {
  start: string;
  end: string;
  teachers: TeacherRow[];
  totalReal: number;
  totalIdeal: number;
};

/**
 * Cross-program teacher recap, attributed by the PER-MEETING teacher (so a badal
 * is credited to the substitute, not the halaqah's main pengajar). Per teacher →
 * halaqah (program + name) with real (meetings this teacher taught, jadwal status
 * 3/4) and ideal (meetings assigned to this teacher in the period). A halaqah can
 * appear under two teachers when a badal covered some of its meetings; `asBadal`
 * flags the rows where the teacher is NOT the halaqah's main teacher — "main" =
 * whoever is assigned the most meetings (plurality), so an occasional substitute
 * is a badal while the de-facto teacher isn't. `programIds` scopes to the
 * programs the caller may access.
 */
export async function getTeacherReport(
  start: string,
  end: string,
  programIds: string[],
): Promise<TeacherReport> {
  if (programIds.length === 0) return { start, end, teachers: [], totalReal: 0, totalIdeal: 0 };
  const db = getDb();

  // Attribute each meeting to the teacher who actually taught it (the per-meeting
  // guru on the jadwal — a badal shows up here), not the halaqah's main teacher.
  // The name is on the synced jadwal (raw.guru.name); fall back to the halaqah's
  // pengajar when a meeting has no per-meeting guru.
  const rows = await db.execute(sql`
    with ${foldedJadwalCte}
    select coalesce(nullif(j.raw->'guru'->>'name', ''), h.pengajar, 'Halaqah #' || h.tilawah_halaqah_id::text) as pengajar,
           p.name as program,
           coalesce(h.nama_tampil, h.name, '(tanpa nama)') as halaqah,
           -- Phone of the teacher this row is ATTRIBUTED to, not of the halaqah's
           -- main pengajar: rows are grouped by the per-meeting guru, so reading
           -- halaqah_sync.guru_phone handed badal rows a stranger's number (10 of
           -- 90 hits-regular teachers were wrong; Amina Nur Cahyani and Rika
           -- Ramadhona covered for each other and got each other's number, so the
           -- WA reminder went to the wrong person in both directions). The join
           -- key is fixed per group, so min() only satisfies the aggregate.
           min(nullif(g.phone, '')) as guru_phone,
           -- Identity behind the name, so the row can be matched to the teacher's
           -- own sign-off in recap_attestations (keyed by tilawah user id, not by
           -- a display name that two people can share).
           min(coalesce(j.guru_id, h.guru_id)) as guru_id,
           -- A COORDINATOR marking a taught meeting "tidak mengajar" is an
           -- authoritative correction: upstream recorded Selesai but the class
           -- was not actually held. That override wins here, so the meeting
           -- drops out of Real and paints red. A TEACHER's own /rekap answer
           -- (source='wa_magiclink') does NOT override a later Selesai — see the
           -- comment on confirmed_absent below.
           --
           -- coalesce(..., false) is load-bearing. c is a LEFT JOIN, so for the
           -- overwhelming majority of meetings (no confirmation row at all)
           -- c.status is NULL: the equality is NULL, NOT (NULL AND ...) is NULL,
           -- and a FILTER predicate that is NULL counts nothing. Without the
           -- coalesce every unconfirmed meeting silently drops out of Real —
           -- 3.026 August meetings rendered as 55 taught instead of 1.532.
           count(*) filter (
             where j.eff_status in (3, 4)
               and not coalesce(c.status = 'tidak_mengajar' and c.source = 'coordinator', false)
           )::int as real,
           count(*)::int as ideal,
           -- A meeting the system now records as TAUGHT outranks an older TEACHER
           -- "saya tidak mengajar": the teacher went on to hold the class, so
           -- the reason they gave before has stopped being true. Counting it
           -- anyway put a red "1 dikonfirmasi tidak mengajar" badge on teachers
           -- showing 16 of 16 taught, which reads as a contradiction and makes
           -- the coordinator distrust the whole row. A coordinator's deliberate
           -- override is the exception — that IS a not-taught meeting, so it
           -- counts here.
           count(*) filter (
             where c.status = 'tidak_mengajar'
               and (j.eff_status is null or j.eff_status not in (3, 4)
                    or c.source = 'coordinator')
           )::int as confirmed_absent,
           -- Same rule as confirmed_absent: once the meeting is recorded as
           -- taught, "saya mengajar tapi belum input" has been overtaken by
           -- events. Hamzah Anisa Maulana carried that badge beside 34 of 34 filled,
           -- which reads as an open item on a teacher who has none.
           count(*) filter (
             where c.status = 'mengajar_belum_input'
               and (j.eff_status is null or j.eff_status not in (3, 4))
           )::int as taught_not_input,
           count(*) filter (where c.status in ('mengajar_kendala_sistem', 'diisi_koordinator') and j.eff_status not in (3, 4))::int as confirmed_taught,
           -- Of the not-taught meetings (a "gap"), how many the teacher has
           -- answered via the magic link (any status = resolved) vs still open. A
           -- coordinator tidak_mengajar override counts as a resolved not-taught
           -- meeting too: it has an answer, and it is no longer taught.
           count(*) filter (
             where ((j.eff_status is null or j.eff_status not in (3, 4))
                    or (c.status = 'tidak_mengajar' and c.source = 'coordinator'))
               and c.status is not null
           )::int as resolved,
           count(*) filter (where (j.eff_status is null or j.eff_status not in (3, 4)) and c.status is null)::int as unsolved,
           -- Ikhwan/Akhwat, in order of how much the source can be trusted:
           --  1. the TEACHER's own gender from the CMS user record — a halaqah is
           --     gender-segregated, so its teacher decides its side;
           --  2. the halaqah name (AKHWAT/IKHWAN), a convention but a consistent one;
           --  3. the roster, by MAJORITY — last because 1.172 of 1.377 hits-regular
           --     students come back with gender null, which is what dumped most
           --     halaqah into "Tanpa jenis", and because min() let a single ikhwan
           --     sitting in on an akhwat halaqah flip the whole row.
           coalesce(
             gg.gender,
             case
               when h.name ilike '%akhwat%' then 2
               when h.name ilike '%ikhwan%' then 1
             end,
             sg.gender
           ) as gender,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'jadwalId', j.tilawah_jadwal_id, 'programId', j.program_id,
                 'order', j."order", 'date', j.schedule_date::text,
                 -- Same NULL trap as the real column above: without the coalesce
                 -- this is NULL for every meeting that has no confirmation, which
                 -- reaches the client as null — falsy — and paints the chip grey.
                 'done', (j.eff_status in (3, 4)
                          and not coalesce(c.status = 'tidak_mengajar' and c.source = 'coordinator', false)),
                 'confStatus', c.status, 'reasonCode', c.reason_code, 'reasonText', c.reason_text
               )
               order by j.schedule_date asc nulls last, j."order" asc
             ),
             '[]'::jsonb
           ) as meetings
    from jf j
    join halaqah_sync h on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    join programs p on p.id = j.program_id
    left join teacher_meeting_confirmations c
      on c.program_id = j.program_id and c.tilawah_jadwal_id = j.tilawah_jadwal_id
      -- A TEACHER's answer counts only if it was the CURRENT teacher who wrote it.
      -- A confirmation is keyed to the meeting, so when a meeting is reassigned the
      -- previous teacher's answer stays attached to it: HITS 040's meetings 8-13
      -- carried Hadi Hakim Maulana's "data tidak sesuai" flags, which then appeared on
      -- Salma Suhailah's row as if SHE had disputed her own work. An answer explains
      -- what one person did on one meeting; it stops meaning anything the moment the
      -- meeting belongs to someone else. Rows with a null guru_id predate this
      -- column and are still honoured.
      --
      -- A COORDINATOR force-fill (source='coordinator') is exempt: it asserts a fact
      -- about the MEETING ("this session was/wasn't taught"), not about one teacher,
      -- and that stays true across a badal handover. Scoping it by guru_id meant a
      -- resync that re-pointed the jadwal's guru AFTER the force-fill silently
      -- dropped the coordinator's mark — the meeting fell back to a raw untaught gap
      -- and the coordinator saw "sudah klik tandai mengajar tapi gak masuk" (Muthia
      -- Azzahra's HITS 072 Juni, meetings 11+). The mark follows the meeting to
      -- whoever now holds it, which is exactly where it belongs.
      and (
        c.source = 'coordinator'
        or c.guru_id is null
        or c.guru_id = coalesce(j.guru_id, h.guru_id)
      )
    -- Per-meeting teacher first (badal), halaqah's main teacher only when the
    -- meeting has no guru of its own — which is also how the pengajar column
    -- above is derived, so name and number describe the same person. No fallback
    -- to halaqah_sync.guru_phone: an unknown guru stays null rather than
    -- resolving to someone else.
    left join guru_sync g
      on g.program_id = j.program_id and g.tilawah_guru_id = coalesce(j.guru_id, h.guru_id)
    -- Per-halaqah gender (ikhwan/akhwat) = min of enrolled students' gender, the
    -- same signal the dashboard uses (halaqah are gender-segregated).
    left join (
      select program_id, halaqah_id,
             case
               when count(*) filter (where gender = 2) > count(*) filter (where gender = 1) then 2
               when count(*) filter (where gender = 1) > count(*) filter (where gender = 2) then 1
             end as gender
      from students_sync
      where program_id in (${sql.join(programIds, sql`, `)})
      group by program_id, halaqah_id
    ) sg on sg.program_id = j.program_id and sg.halaqah_id = j.tilawah_halaqah_id
    -- The teacher's own gender, keyed by identity across programs (guru_sync is
    -- written per program; the person is the same everywhere).
    left join (
      -- Tilawah-sourced only — mabni guru ids collide with tilawah ones.
      select g.tilawah_guru_id, min(g.gender) as gender
      from guru_sync g
      join programs gp on gp.id = g.program_id and gp.data_source_type = 'tilawah_api'
      where g.gender is not null group by g.tilawah_guru_id
    ) gg on gg.tilawah_guru_id = coalesce(j.guru_id, h.guru_id)
    where j.program_id in (${sql.join(programIds, sql`, `)})
      and j.schedule_date between ${start} and ${end}
      -- Current batch only. The sync never deletes, so the halaqah of batches
      -- that were removed upstream (HITS Reguler Jan 11→21, Apr 13→23) are still
      -- mirrored: 205 stale halaqah carrying 1.580 meetings inside a single
      -- month. They surface as the same halaqah listed twice under one teacher,
      -- with the meeting numbering restarting — and they inflate every total on
      -- this page.
      and ${currentBatchOnly}
      -- Halaqah the program excludes from the teacher recap and the honor sheet
      -- (config.teacherRecapExclude = [halaqahId, …]). Halaqah Ayah in Tahsin
      -- Keluarga is one: it runs five mornings a week inside one family and is
      -- not paid per meeting, so counting it made its teacher's honor row the
      -- largest in the program. Scoped to the HALAQAH, never the teacher — the
      -- same ustadz teaches paid halaqah elsewhere and must keep those rows.
      -- Participant figures are untouched; this only removes the row from the
      -- recap that drives payment.
      and not coalesce(p.config -> 'teacherRecapExclude' @> to_jsonb(h.tilawah_halaqah_id), false)
    -- h.nama_tampil must be listed: it is selected as the halaqah label, and
    -- leaving it out made Postgres reject the whole recap (42803) for everyone.
    group by 1, h.pengajar, p.name, h.name, h.nama_tampil, h.tilawah_halaqah_id, sg.gender, gg.gender
    order by pengajar, program, halaqah
  `);

  type Raw = {
    name: string;
    program: string;
    halaqah: string;
    real: number;
    ideal: number;
    confirmedAbsent: number;
    taughtNotInput: number;
    confirmedTaught: number;
    resolved: number;
    unsolved: number;
    gender: number | null;
    guruPhone: string | null;
    guruId: number | null;
    meetings: TeacherMeeting[];
  };
  const raws: Raw[] = rows.rows.map((r) => ({
    name: (r.pengajar as string) ?? "-",
    guruId: r.guru_id != null ? Number(r.guru_id) : null,
    program: (r.program as string) ?? "-",
    halaqah: (r.halaqah as string) ?? "-",
    real: Number(r.real),
    ideal: Number(r.ideal),
    confirmedAbsent: Number(r.confirmed_absent),
    taughtNotInput: Number(r.taught_not_input),
    confirmedTaught: Number(r.confirmed_taught),
    resolved: Number(r.resolved),
    unsolved: Number(r.unsolved),
    gender: r.gender != null ? Number(r.gender) : null,
    guruPhone: resolveGuruPhone(
      (r.pengajar as string) ?? null,
      (r.guru_phone as string) ?? null,
    ),
    meetings: Array.isArray(r.meetings)
      ? (r.meetings as TeacherMeeting[]).map((m) => ({
          jadwalId: Number(m.jadwalId),
          programId: String(m.programId),
          order: m.order != null ? Number(m.order) : null,
          date: m.date ?? null,
          done: Boolean(m.done),
          confStatus: (m.confStatus as MeetingConfStatus) ?? null,
          reasonCode: m.reasonCode ?? null,
          reasonText: m.reasonText ?? null,
        }))
      : [],
  }));

  // Per halaqah, the MAIN teacher = whoever is assigned the most meetings in the
  // period (plurality). Everyone else who taught it is an occasional substitute
  // (badal). This is what `asBadal` flags — not "differs from the recorded
  // pengajar" (which mislabels the real teacher as badal when the halaqah's
  // stored pengajar rarely teaches).
  const mainByHalaqah = new Map<string, { name: string; ideal: number }>();
  for (const r of raws) {
    const key = `${r.program}\u0000${r.halaqah}`;
    const cur = mainByHalaqah.get(key);
    if (!cur || r.ideal > cur.ideal) mainByHalaqah.set(key, { name: r.name, ideal: r.ideal });
  }

  const byTeacher = new Map<string, TeacherHalaqah[]>();
  for (const r of raws) {
    const key = `${r.program}\u0000${r.halaqah}`;
    const main = mainByHalaqah.get(key);
    const list = byTeacher.get(r.name) ?? [];
    list.push({
      program: r.program,
      halaqah: r.halaqah,
      real: r.real,
      ideal: r.ideal,
      asBadal: main != null && r.name !== main.name,
      mainTeacher: main != null && r.name !== main.name ? main.name : null,
      confirmedAbsent: r.confirmedAbsent,
      taughtNotInput: r.taughtNotInput,
      confirmedTaught: r.confirmedTaught,
      resolved: r.resolved,
      unsolved: r.unsolved,
      gender: r.gender,
      guruPhone: r.guruPhone,
      meetings: r.meetings,
    });
    byTeacher.set(r.name, list);
  }

  // Which tilawah ids hide behind each displayed name (two when the CMS holds a
  // duplicate account for the same person, e.g. Azka Wafa Wulandari 1797 + 1816).
  const idsByTeacher = new Map<string, Set<number>>();
  for (const r of raws) {
    if (r.guruId == null) continue;
    const set = idsByTeacher.get(r.name) ?? new Set<number>();
    set.add(r.guruId);
    idsByTeacher.set(r.name, set);
  }

  // Sign-offs from /rekap, matched to this exact period. A coordinator viewing a
  // custom range simply sees none — the attestation says "I checked 16 Jul–15 Agu",
  // and showing it against a different window would be a lie by re-labelling.
  const [confirmations, orphanNotes] = await Promise.all([
    getConfirmationsByGuru(start, end),
    getOrphanNotesByGuru(start, end),
  ]);

  const teachers: TeacherRow[] = [...byTeacher.entries()].map(([pengajar, halaqah]) => {
    const guruIds = [...(idsByTeacher.get(pengajar) ?? [])];
    // Either account may hold the sign-off; take whichever exists.
    let confirmation = guruIds.map((id) => confirmations.get(id)).find(Boolean) ?? null;
    if (!confirmation) {
      // Wrote something but the sign-off never landed — still a follow-up item,
      // and invisible everywhere else.
      const notes = guruIds.flatMap((id) => orphanNotes.get(id) ?? []);
      if (notes.length > 0) {
        confirmation = {
        verdict: "ada_koreksi",
        confirmedAt: "",
        answered: 0,
        disputed: 0,
        notes,
        resolvedAt: null,
        resolvedBy: null,
      };
      }
    }
    return {
      pengajar,
      halaqah,
      totalReal: halaqah.reduce((n, h) => n + h.real, 0),
      totalIdeal: halaqah.reduce((n, h) => n + h.ideal, 0),
      totalConfirmedAbsent: halaqah.reduce((n, h) => n + h.confirmedAbsent, 0),
      totalTaughtNotInput: halaqah.reduce((n, h) => n + h.taughtNotInput, 0),
      totalConfirmedTaught: halaqah.reduce((n, h) => n + h.confirmedTaught, 0),
      totalResolved: halaqah.reduce((n, h) => n + h.resolved, 0),
      totalUnsolved: halaqah.reduce((n, h) => n + h.unsolved, 0),
      guruIds,
      confirmation,
    };
  });
  teachers.sort((a, b) => b.totalReal - a.totalReal || a.pengajar.localeCompare(b.pengajar));

  return {
    start,
    end,
    teachers,
    totalReal: teachers.reduce((n, t) => n + t.totalReal, 0),
    totalIdeal: teachers.reduce((n, t) => n + t.totalIdeal, 0),
  };
}

// ── Kehadiran pengajar Mabni (check-in harian) ───────────────────────────
/**
 * Per-guru teacher check-in for the "Kehadiran Boarding Teacher" sheet, in the
 * SAME unit and under the same filters as the participant report's check-in rows
 * (GuruCheckinBlock) — because both ship in workbooks a coordinator reads side by
 * side, and they used to disagree.
 *
 * The sheet used to be built from `foldGuruAttendance`, which counts raw
 * `guru_attendance_sync` ROWS in the period: no intersection with the days that
 * guru was scheduled, no intersection with the days upstream actually recorded,
 * no dedupe when upstream holds two rows for one (guru, date), and no Alpa at
 * all. Its own note called those numbers "hari". Two definitions of "terlambat"
 * in one export is one too many, so this function is the definition the screen
 * uses: `computeGuruCheckin` over scheduled ∩ recorded guru-days.
 *
 * `checkinMentah` keeps the old figure reachable rather than silently dropping
 * it: the raw check-in row count for that guru in the period. A guru with
 * `hariEfektif: 0` and a non-zero `checkinMentah` is the luar-jadwal case — they
 * checked in on days they held no meeting (GuruCheckinBlock.luarJadwal), which is
 * why such teachers are listed instead of filtered away.
 */
export type MabniGuruCheckinRow = {
  guruId: number;
  nama: string;
  hariEfektif: number;
  hadir: number;
  telat: number;
  izin: number;
  alpa: number;
  /** Raw check-in rows upstream recorded for this guru in the period. */
  checkinMentah: number;
};

export async function getMabniGuruCheckinRows(
  programId: string,
  start: string,
  end: string,
): Promise<MabniGuruCheckinRow[]> {
  const db = getDb();
  // Same clamp as every other teacher figure: a mid-month report must not count
  // days that have not happened yet (lib/reports/teacher-attendance.ts).
  const teacherEnd = clampEndToToday(end, todayJakarta());

  // The deploy repo never received the migration that creates this table, and a
  // missing section must not take the whole export down. See getParticipantReport.
  const hasCheckinTable =
    (await db.execute(sql`select to_regclass('public.guru_attendance_sync') is not null as ok`))
      .rows[0]?.ok === true;
  if (!hasCheckinTable) return [];

  const checkinRows = (
    await db.execute(sql`
      select guru_id, tanggal::text as tanggal, status
      from guru_attendance_sync
      where program_id = ${programId}
        and tanggal between ${start} and ${teacherEnd}
        and guru_id is not null
    `)
  ).rows as { guru_id: number; tanggal: string; status: string }[];
  if (checkinRows.length === 0) return [];

  const scheduledRows = (
    await db.execute(sql`
      with ${foldedJadwalCte}
      select coalesce(j.guru_id, h.guru_id) as guru_id, j.schedule_date::text as tanggal
      from jf j
      join halaqah_sync h on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
      join programs p on p.id = j.program_id
      where j.program_id = ${programId}
        and j.schedule_date between ${start} and ${teacherEnd}
        and coalesce(j.guru_id, h.guru_id) is not null
        and ${notBatchStray}
    `)
  ).rows as { guru_id: number; tanggal: string }[];

  const checkins = checkinRows.map((r) => ({
    guruId: Number(r.guru_id),
    date: r.tanggal,
    status: String(r.status),
  }));
  const counts = computeGuruCheckin({
    recordedDates: [...new Set(checkins.map((c) => c.date))],
    scheduled: scheduledRows.map((r) => ({ guruId: Number(r.guru_id), date: r.tanggal })),
    checkins,
  });

  const rawByGuru = new Map<number, number>();
  for (const c of checkins) rawByGuru.set(c.guruId, (rawByGuru.get(c.guruId) ?? 0) + 1);

  const names = (
    await db.execute(sql`select tilawah_guru_id, name from guru_sync where program_id = ${programId}`)
  ).rows as { tilawah_guru_id: number; name: string }[];
  const nameById = new Map(names.map((g) => [Number(g.tilawah_guru_id), String(g.name)]));

  // Every guru with scheduled guru-days OR a check-in row: dropping the ones with
  // no scheduled meeting would hide exactly the luar-jadwal teachers whose rows
  // carried August 2026's only `terlambat`.
  const guruIds = [...new Set([...counts.keys(), ...rawByGuru.keys()])];
  return guruIds
    .map((guruId) => {
      const c = counts.get(guruId) ?? { hariEfektif: 0, hadir: 0, telat: 0, izin: 0, alpa: 0 };
      return {
        guruId,
        nama: nameById.get(guruId) ?? `Guru #${guruId}`,
        ...c,
        checkinMentah: rawByGuru.get(guruId) ?? 0,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}
