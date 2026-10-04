/**
 * Read models for the mabni dashboard's non-attendance tabs.
 *
 * Kept out of lib/insights/halaqah.ts: those queries are shared by every
 * program, while everything here leans on shapes only the Mabni API produces
 * (the recurring jadwal pattern stashed in halaqah_sync.raw, and the setoran
 * rows in mabni_hafalan_sync).
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getProgram } from "@/lib/programs/resolve";
import { pesertaAktif } from "@/lib/enrollment";

/** Upstream weekday numbering: 1=Senin … 7=Ahad. JS getUTCDay(): 0=Ahad … 6=Sabtu. */
function upstreamWeekday(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First and last day of a "YYYY-MM" month, as ISO dates. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: ymd(start), end: ymd(end) };
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ── Setoran (hafalan) ────────────────────────────────────────────────────────

export type SetoranClassRow = {
  halaqahId: number;
  halaqah: string | null;
  pengajar: string | null;
  studentCount: number; // peserta terdaftar di kelas
  setorCount: number; // jumlah baris setoran bulan ini
  activeStudents: number; // peserta yang setor minimal sekali bulan ini
  byMetrik: { metrik: string; count: number }[];
  lastDate: string | null;
};

export type SetoranStudentRow = {
  siswaId: number;
  name: string | null;
  halaqah: string | null;
  setorCount: number;
  lastDate: string | null;
  lastMetrik: string | null;
  lastSurat: string | null;
};

export type SetoranSummary = {
  month: string;
  totalSetoran: number;
  activeStudents: number;
  totalStudents: number;
  byMetrik: { metrik: string; count: number }[];
  classes: SetoranClassRow[];
  students: SetoranStudentRow[]; // includes zero-setoran students, worst first
};

export async function getMabniSetoran(programSlug: string, month: string): Promise<SetoranSummary | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();
  const pid = program.id;
  const { start, end } = monthRange(month);

  const classRows = await db.execute(sql`
    with stu as (
      select halaqah_id, count(*)::int as n
      from students_sync
      where program_id = ${pid} and ${pesertaAktif()}
      group by halaqah_id
    ),
    setor as (
      select ss.halaqah_id,
        count(*)::int as setor_count,
        count(distinct hf.siswa_id)::int as active_students,
        max(hf.sesi_tanggal)::text as last_date
      from mabni_hafalan_sync hf
      join students_sync ss on ss.program_id = hf.program_id and ss.tilawah_user_id = hf.siswa_id
      where hf.program_id = ${pid} and hf.sesi_tanggal between ${start} and ${end}
      group by ss.halaqah_id
    ),
    metrik as (
      select ss.halaqah_id, hf.metrik, count(*)::int as n
      from mabni_hafalan_sync hf
      join students_sync ss on ss.program_id = hf.program_id and ss.tilawah_user_id = hf.siswa_id
      where hf.program_id = ${pid} and hf.sesi_tanggal between ${start} and ${end}
      group by ss.halaqah_id, hf.metrik
    )
    select h.tilawah_halaqah_id as halaqah_id, h.name, h.pengajar,
      coalesce(stu.n, 0) as student_count,
      coalesce(setor.setor_count, 0) as setor_count,
      coalesce(setor.active_students, 0) as active_students,
      setor.last_date,
      coalesce(
        (select jsonb_agg(jsonb_build_object('metrik', coalesce(m.metrik, '(tanpa metrik)'), 'count', m.n) order by m.n desc)
         from metrik m where m.halaqah_id = h.tilawah_halaqah_id),
        '[]'::jsonb
      ) as by_metrik
    from halaqah_sync h
    left join stu on stu.halaqah_id = h.tilawah_halaqah_id
    left join setor on setor.halaqah_id = h.tilawah_halaqah_id
    where h.program_id = ${pid}
    order by coalesce(setor.setor_count, 0) asc, h.name
  `);

  const studentRows = await db.execute(sql`
    with setor as (
      select siswa_id,
        count(*)::int as n,
        max(sesi_tanggal)::text as last_date
      from mabni_hafalan_sync
      where program_id = ${pid} and sesi_tanggal between ${start} and ${end}
      group by siswa_id
    ),
    latest as (
      select distinct on (siswa_id) siswa_id, metrik, surat
      from mabni_hafalan_sync
      where program_id = ${pid} and sesi_tanggal between ${start} and ${end}
      order by siswa_id, sesi_tanggal desc, mabni_hafalan_id desc
    )
    select ss.tilawah_user_id as siswa_id, ss.name, h.name as halaqah,
      coalesce(setor.n, 0) as setor_count, setor.last_date,
      latest.metrik as last_metrik, latest.surat as last_surat
    from students_sync ss
    left join halaqah_sync h on h.program_id = ss.program_id and h.tilawah_halaqah_id = ss.halaqah_id
    left join setor on setor.siswa_id = ss.tilawah_user_id
    left join latest on latest.siswa_id = ss.tilawah_user_id
    where ss.program_id = ${pid} and ${pesertaAktif("ss")}
    order by coalesce(setor.n, 0) asc, ss.name
  `);

  const totalRows = await db.execute(sql`
    select coalesce(metrik, '(tanpa metrik)') as metrik, count(*)::int as n
    from mabni_hafalan_sync
    where program_id = ${pid} and sesi_tanggal between ${start} and ${end}
    group by 1 order by n desc
  `);

  const students: SetoranStudentRow[] = studentRows.rows.map((r) => ({
    siswaId: Number(r.siswa_id),
    name: (r.name as string) ?? null,
    halaqah: (r.halaqah as string) ?? null,
    setorCount: Number(r.setor_count),
    lastDate: (r.last_date as string) ?? null,
    lastMetrik: (r.last_metrik as string) ?? null,
    lastSurat: (r.last_surat as string) ?? null,
  }));

  const byMetrik = totalRows.rows.map((r) => ({ metrik: r.metrik as string, count: Number(r.n) }));

  return {
    month,
    totalSetoran: byMetrik.reduce((n, m) => n + m.count, 0),
    activeStudents: students.filter((s) => s.setorCount > 0).length,
    totalStudents: students.length,
    byMetrik,
    classes: classRows.rows.map((r) => ({
      halaqahId: Number(r.halaqah_id),
      halaqah: (r.name as string) ?? null,
      pengajar: (r.pengajar as string) ?? null,
      studentCount: Number(r.student_count),
      setorCount: Number(r.setor_count),
      activeStudents: Number(r.active_students),
      byMetrik: (r.by_metrik as { metrik: string; count: number }[]) ?? [],
      lastDate: (r.last_date as string) ?? null,
    })),
    students,
  };
}

// ── Nilai ujian ──────────────────────────────────────────────────────────────

export type NilaiTable = {
  /** Scalar keys found across the rows, in first-seen order — the de-facto columns. */
  columns: string[];
  rows: Record<string, string>[];
  /** Rows whose student we could resolve get a name; the rest fall back to the id. */
  total: number;
};

/**
 * Exam marks, rendered from whatever the API actually returns.
 *
 * `/nilai` is still empty upstream, so there is no documented shape to map.
 * Rather than guess column names now (and migrate them away later), this reads
 * the stored raw rows and derives the columns from the scalar keys present.
 * Nested objects are flattened one level as `parent.name` when they carry a
 * `nama`/`name`, otherwise skipped — deep JSON is not a table.
 */
export async function getMabniNilai(programSlug: string): Promise<NilaiTable | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();

  const res = await db.execute(sql`
    select n.mabni_nilai_id, n.raw, ss.name as siswa_nama
    from mabni_nilai_sync n
    left join students_sync ss
      on ss.program_id = n.program_id and ss.tilawah_user_id = n.siswa_id
    where n.program_id = ${program.id}
    order by n.mabni_nilai_id desc
    limit 200
  `);

  const columns: string[] = [];
  const rows: Record<string, string>[] = [];

  for (const r of res.rows) {
    const raw = (r.raw ?? {}) as Record<string, unknown>;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v == null) continue;
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        const label = o.nama ?? o.name;
        if (typeof label === "string") flat[k] = label;
        continue;
      }
      flat[k] = String(v);
    }
    if (r.siswa_nama) flat.siswa = r.siswa_nama as string;
    for (const k of Object.keys(flat)) if (!columns.includes(k)) columns.push(k);
    rows.push(flat);
  }

  return { columns, rows, total: rows.length };
}

// ── Keterlaksanaan kelas ─────────────────────────────────────────────────────

export type DeliveryClassRow = {
  halaqahId: number;
  halaqah: string | null;
  pengajarUtama: string | null;
  pendamping: string[];
  jadwal: string | null; // "Selasa & Jumat 16:00–19:30"
  expected: number;
  held: number;
  gaps: string[]; // tanggal terjadwal tanpa presensi sama sekali
};

export type DeliverySummary = {
  month: string;
  asOf: string; // meetings are only counted up to this date
  rows: DeliveryClassRow[];
  totalExpected: number;
  totalHeld: number;
};

type HalaqahRaw = {
  kelas?: { hari?: number[] | null } | null;
  jadwal?: {
    hari?: number[] | null;
    jam?: string | null;
    jam_selesai?: string | null;
    tanggal_mulai?: string | null;
    tanggal_selesai?: string | null;
  } | null;
  gurus?: { id: number; nama: string; nickname: string | null }[] | null;
};

/**
 * Which dates a class was supposed to meet this month, and which of those
 * actually produced a session.
 *
 * "Held" means a session with attendance exists — upstream has no session list
 * and no teacher attendance, so this measures whether the CLASS ran, not
 * whether a particular teacher showed up. Expected dates are derived from the
 * recurring `/jadwal` pattern in halaqah_sync.raw rather than written into
 * jadwal_sync: those ids belong to upstream and must not be invented.
 */
export async function getMabniDelivery(programSlug: string, month: string): Promise<DeliverySummary | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();
  const pid = program.id;
  const { start, end } = monthRange(month);
  // Stop at YESTERDAY: presensi for a session is typically entered after it
  // ends, so counting today would report every class that meets today as a gap
  // for the rest of the day.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const cutoff = ymd(yesterday);
  const asOf = cutoff < end ? cutoff : end;

  const halaqahRows = await db.execute(sql`
    select tilawah_halaqah_id as id, name, pengajar, day, session, raw
    from halaqah_sync where program_id = ${pid} order by name
  `);

  // A date counts as held when at least one presensi was recorded on it.
  const heldRows = await db.execute(sql`
    select j.tilawah_halaqah_id as halaqah_id, j.schedule_date::text as date
    from jadwal_sync j
    where j.program_id = ${pid}
      and j.schedule_date between ${start} and ${asOf}
      and exists (
        select 1 from attendance_sync a
        where a.program_id = ${pid} and a.halaqah_jadwal_id = j.tilawah_jadwal_id
      )
    group by 1, 2
  `);
  const heldByHalaqah = new Map<number, Set<string>>();
  for (const r of heldRows.rows) {
    const id = Number(r.halaqah_id);
    (heldByHalaqah.get(id) ?? heldByHalaqah.set(id, new Set()).get(id)!).add(r.date as string);
  }

  const rows: DeliveryClassRow[] = halaqahRows.rows.map((r) => {
    const raw = (r.raw ?? {}) as HalaqahRaw;
    const hari = raw.jadwal?.hari ?? raw.kelas?.hari ?? [];
    const from = raw.jadwal?.tanggal_mulai ?? null;
    const to = raw.jadwal?.tanggal_selesai ?? null;
    const held = heldByHalaqah.get(Number(r.id)) ?? new Set<string>();

    const expectedDates: string[] = [];
    if (hari.length > 0) {
      for (let d = new Date(`${start}T00:00:00Z`); ymd(d) <= asOf; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = ymd(d);
        if (from && iso < from) continue;
        if (to && iso > to) continue;
        if (hari.includes(upstreamWeekday(d))) expectedDates.push(iso);
      }
    }

    const pengajarUtama = (r.pengajar as string) ?? null;
    const pendamping = (raw.gurus ?? [])
      .map((g) => g.nama)
      .filter((n) => n && n !== pengajarUtama);

    const jadwalText = [r.day, r.session].filter(Boolean).join(" ") || null;

    return {
      halaqahId: Number(r.id),
      halaqah: (r.name as string) ?? null,
      pengajarUtama,
      pendamping,
      jadwal: jadwalText,
      expected: expectedDates.length,
      held: expectedDates.filter((d) => held.has(d)).length,
      gaps: expectedDates.filter((d) => !held.has(d)),
    };
  });

  rows.sort((a, b) => b.gaps.length - a.gaps.length || (a.halaqah ?? "").localeCompare(b.halaqah ?? ""));

  return {
    month,
    asOf,
    rows,
    totalExpected: rows.reduce((n, r) => n + r.expected, 0),
    totalHeld: rows.reduce((n, r) => n + r.held, 0),
  };
}

// ── Kualitas data ────────────────────────────────────────────────────────────

export type DataQuality = {
  futureAttendance: number; // presensi bertanggal setelah hari ini
  futureAttendanceDates: string[];
  classesWithoutAttendance: number;
  studentsWithoutClass: number;
  teachersWithoutClass: number;
  studentsWithoutSetoran: number;
};

export async function getMabniDataQuality(programSlug: string): Promise<DataQuality | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();
  const pid = program.id;

  const res = await db.execute(sql`
    select
      (select count(*)::int from jadwal_sync j
        where j.program_id = ${pid} and j.schedule_date > current_date
          and exists (select 1 from attendance_sync a
                      where a.program_id = ${pid} and a.halaqah_jadwal_id = j.tilawah_jadwal_id)
      ) as future_attendance,
      (select coalesce(jsonb_agg(distinct j.schedule_date::text), '[]'::jsonb) from jadwal_sync j
        where j.program_id = ${pid} and j.schedule_date > current_date
      ) as future_dates,
      (select count(*)::int from halaqah_sync h
        where h.program_id = ${pid}
          and not exists (select 1 from jadwal_sync j
                          where j.program_id = ${pid} and j.tilawah_halaqah_id = h.tilawah_halaqah_id)
      ) as classes_without_attendance,
      (select count(*)::int from students_sync ss
        where ss.program_id = ${pid} and ss.halaqah_id is null
      ) as students_without_class,
      (select count(*)::int from guru_sync g
        where g.program_id = ${pid}
          and not exists (select 1 from halaqah_sync h
                          where h.program_id = ${pid}
                            and h.raw->'gurus' @> jsonb_build_array(jsonb_build_object('id', g.tilawah_guru_id)))
      ) as teachers_without_class,
      (select count(*)::int from students_sync ss
        where ss.program_id = ${pid}
          and not exists (select 1 from mabni_hafalan_sync hf
                          where hf.program_id = ${pid} and hf.siswa_id = ss.tilawah_user_id)
      ) as students_without_setoran
  `);
  const r = res.rows[0];
  return {
    futureAttendance: Number(r?.future_attendance ?? 0),
    futureAttendanceDates: ((r?.future_dates as string[]) ?? []).slice(0, 6),
    classesWithoutAttendance: Number(r?.classes_without_attendance ?? 0),
    studentsWithoutClass: Number(r?.students_without_class ?? 0),
    teachersWithoutClass: Number(r?.teachers_without_class ?? 0),
    studentsWithoutSetoran: Number(r?.students_without_setoran ?? 0),
  };
}
