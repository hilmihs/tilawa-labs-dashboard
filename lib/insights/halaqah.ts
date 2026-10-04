import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getProgram } from "@/lib/programs/resolve";
import { defaultBatchScope } from "@/lib/programs/batches";
import { bukanKelasDemo, pesertaAktif } from "@/lib/enrollment";
import { resolveGuruPhone } from "./guru-phone-overrides";

const DEFAULT_THRESHOLD = 70;

/**
 * Peserta aktif only — a participant deactivated upstream keeps their enrollment
 * row and their one Alfa forever, so leaving them in made three ex-peserta head
 * the HKM 6 Ikhwan roster at 0% and drag the halaqah average down.
 */
const AKTIF = pesertaAktif();

export type HalaqahRow = {
  halaqahId: number;
  /** Diisi hanya pada tampilan "semua batch": program asal baris (untuk tautan) dan label batch-nya. */
  programSlug?: string;
  batch?: string;
  name: string | null; // nama yang dilihat koordinator (nama_tampil bila ada)
  /** Nama apa adanya dari upstream — agar koordinator masih bisa mencarinya di mabni. */
  namaAsli: string | null;
  pengajar: string | null;
  guruPhone: string | null; // for the pengajar directory's WA link
  level: string | null;
  gender: number | null; // 1=Ikhwan, 2=Akhwat
  type: string | null; // 'offline' | 'online' | 'hybrid' (null untuk sumber non-tilawah)
  studentCount: number;
  avgRate: number | null;
  belowCount: number;
  recordedMeetings: number;
  totalMeetings: number;
  dueTanpaPresensi: number; // pertemuan lewat tanpa presensi
  jadwal: string | null; // hari + jam, mis. "Selasa & Kamis 16:00–17:30"
  /**
   * Per-meeting attendance strip for the heatmap — up to the last 8 past
   * meetings, in order. Each cell is a presensi-tone code: 1 hadir (≥85%),
   * 2 telat (70–85%), 0 alfa (<70%), or null for a past meeting with no
   * presensi yet.
   */
  meetings: Array<number | null>;
};

/** Collapse a per-meeting attendance rate (0–1) into a heatmap tone code. */
function rateToCode(rate: number | null): number | null {
  if (rate == null) return null;
  if (rate >= 0.85) return 1; // hadir → emerald
  if (rate >= 0.7) return 2; // telat → amber
  return 0; // alfa → red
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Build "Selasa & Kamis 16:00–17:30" (or day-only when time is unset/00:00). */
function formatJadwal(slots: { dow: number; start: string; end: string }[]): string | null {
  if (slots.length === 0) return null;
  const ord = (d: number) => (d === 0 ? 7 : d); // Monday-first
  const sorted = [...slots].sort((a, b) => ord(a.dow) - ord(b.dow));
  const hasTime = (s: { start: string }) => Boolean(s.start) && s.start !== "00:00";
  const sameTime = sorted.every(hasTime) && new Set(sorted.map((s) => `${s.start}-${s.end}`)).size === 1;
  if (sameTime) {
    return `${sorted.map((s) => HARI[s.dow]).join(" & ")} ${sorted[0].start}–${sorted[0].end}`;
  }
  return sorted.map((s) => (hasTime(s) ? `${HARI[s.dow]} ${s.start}–${s.end}` : HARI[s.dow])).join(" · ");
}

export async function getHalaqahList(
  programSlug: string,
  /**
   * Show only this tilawah batch. `null` = every batch the mirror holds; omitted
   * = the program's own default (see resolveHalaqahBatchScope).
   */
  batchId?: number | null,
): Promise<HalaqahRow[]> {
  const program = await getProgram(programSlug);
  if (!program) return [];
  const db = getDb();
  const pid = program.id;

  /**
   * Which batch(es) to show.
   *
   * Built in TS rather than as one SQL expression on purpose: writing
   * `${program.tilawahBatchId} is null` sends a bare parameter to Postgres, which
   * cannot infer its type and answers "could not determine data type of parameter
   * $2" — a 500 on every dashboard, which is exactly what shipped on 17 Aug.
   * Branching here keeps the parameter in a comparison, where its type is obvious.
   *
   * Why the filter exists: the mirror is upsert-only and the automatic prune gives
   * up once strays outnumber its safety cap, so a class mis-filed into this
   * program's batch upstream keeps showing here forever — seven TAFM LAZ halaqah
   * were padding the HKM dashboard's counts and making their teachers read as HKM
   * teachers.
   *
   * Why it can be switched off: a syncAllBatches program mirrors every batch on
   * purpose, so pinning it to one would hide the batches opened since the pin was
   * seeded — tafm-laz showed only LAZ #40 while #41 and #42 ran unseen.
   */
  const scope = batchId === undefined ? defaultBatchScope(program) : batchId;
  const batchFilter =
    scope == null
      ? sql``
      : sql`and (h.tilawah_batch_id is null or h.tilawah_batch_id = ${scope})`;

  const rows = await db.execute(sql`
    with stu as (
      select halaqah_id,
        count(*)::int as student_count,
        min(gender) as gender,
        avg(attendance_rate)::float as avg_rate,
        count(*) filter (where attendance_rate < ${DEFAULT_THRESHOLD})::int as below_count
      from students_sync
      where program_id = ${pid} and ${AKTIF}
      group by halaqah_id
    ),
    jad as (
      select tilawah_halaqah_id as halaqah_id,
        count(*)::int as total_meetings,
        count(*) filter (
          where schedule_date <= current_date and not exists (
            select 1 from attendance_sync a
            where a.program_id = ${pid} and a.halaqah_jadwal_id = jadwal_sync.tilawah_jadwal_id
          )
        )::int as due_tanpa_presensi
      from jadwal_sync where program_id = ${pid} group by tilawah_halaqah_id
    ),
    rec as (
      select j.tilawah_halaqah_id as halaqah_id, count(distinct a.halaqah_jadwal_id)::int as recorded
      from attendance_sync a
      join jadwal_sync j on j.program_id = a.program_id and j.tilawah_jadwal_id = a.halaqah_jadwal_id
      where a.program_id = ${pid} group by j.tilawah_halaqah_id
    )
    select h.tilawah_halaqah_id as halaqah_id,
      coalesce(h.nama_tampil, h.name) as name, h.name as nama_asli,
      h.pengajar, h.guru_phone, h.level, h.type,
      h.day as halaqah_day, h.session as halaqah_session,
      stu.gender,
      coalesce(stu.student_count, 0) as student_count,
      stu.avg_rate,
      coalesce(stu.below_count, 0) as below_count,
      coalesce(rec.recorded, 0) as recorded_meetings,
      coalesce(jad.total_meetings, 0) as total_meetings,
      coalesce(jad.due_tanpa_presensi, 0) as due_tanpa_presensi
    from halaqah_sync h
    left join stu on stu.halaqah_id = h.tilawah_halaqah_id
    left join jad on jad.halaqah_id = h.tilawah_halaqah_id
    left join rec on rec.halaqah_id = h.tilawah_halaqah_id
    where h.program_id = ${pid}
      and ${bukanKelasDemo("h.name")}
      -- Only the batch in scope (see above). The mirror is upsert-only and
      -- pruning gives up when the strays outnumber its safety cap, so a class
      -- that was once mis-filed into this program's batch upstream keeps
      -- appearing here forever — seven TAFM LAZ halaqah ("Halaqah 2/5/6/7") were
      -- padding the HKM dashboard's halaqah, peserta and gap counts, and their
      -- teachers read as HKM teachers. Hidden here whether or not the prune has
      -- caught up; the rows themselves are removed by pruneRemovedHalaqah.
      ${batchFilter}
    -- Urut memakai nama yang DILIHAT: diurut h.name, tabelnya tampak acak bagi
    -- koordinator yang membaca "M1 - Usbu'i 1" dan seterusnya.
    order by coalesce(h.nama_tampil, h.name)
  `);

  // Per-meeting attendance rate (share of recorded rows that actually came,
  // i.e. status hadir/telat) for every past meeting — drives the heatmap strip.
  const meetingStatRows = await db.execute(sql`
    select j.tilawah_halaqah_id as halaqah_id, j."order" as ord,
      -- attendance_sync.status is text ('0'..'3'), so the codes must be quoted:
      -- an unquoted "status in (1, 2)" is a text=integer comparison and Postgres
      -- refuses it outright ("operator does not exist"), 500-ing the halaqah list.
      avg((a.status in ('1', '2'))::int)::float as rate
    from jadwal_sync j
    join attendance_sync a
      on a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
    -- Same roster as the peserta count above, or the card contradicts itself:
    -- HKM 6 Ikhwan read "rata² 100%" beside an all-red strip, because three
    -- ex-peserta's Alfa still counted here. Left join, since an unmatched
    -- presensi has a null status and so passes as aktif rather than vanishing.
    left join students_sync s
      on s.program_id = a.program_id and s.halaqah_user_id = a.halaqah_user_id
    where j.program_id = ${pid} and j.schedule_date <= current_date and j."order" is not null
      and ${pesertaAktif("s")}
    group by 1, 2
  `);
  // The full set of past meeting orders per halaqah — so a held-but-unrecorded
  // meeting still paints an (empty) cell rather than vanishing.
  const meetingSlotRows = await db.execute(sql`
    select tilawah_halaqah_id as halaqah_id, "order" as ord
    from jadwal_sync
    where program_id = ${pid} and schedule_date <= current_date and "order" is not null
    group by 1, 2
  `);
  const rateByHalaqahOrder = new Map<string, number>();
  for (const r of meetingStatRows.rows) {
    if (r.rate != null) rateByHalaqahOrder.set(`${r.halaqah_id}:${r.ord}`, Number(r.rate));
  }
  const ordersByHalaqah = new Map<number, number[]>();
  for (const r of meetingSlotRows.rows) {
    const hid = Number(r.halaqah_id);
    (ordersByHalaqah.get(hid) ?? ordersByHalaqah.set(hid, []).get(hid)!).push(Number(r.ord));
  }
  const meetingsOf = (hid: number): Array<number | null> => {
    const orders = (ordersByHalaqah.get(hid) ?? []).sort((a, b) => a - b).slice(-8);
    return orders.map((ord) => {
      const rate = rateByHalaqahOrder.get(`${hid}:${ord}`);
      return rateToCode(rate ?? null);
    });
  };

  // Recurring schedule: distinct (weekday, time) slots per halaqah, with the
  // dominant time per weekday (data has one fixed time per day). Times come from
  // raw jsonb; some programs (Community Mosque, mabni) leave them 00:00 → day only.
  const schedRows = await db.execute(sql`
    select tilawah_halaqah_id as halaqah_id,
      extract(dow from schedule_date)::int as dow,
      substring(raw->>'start_session_date' from 12 for 5) as start_t,
      substring(raw->>'end_session_date' from 12 for 5) as end_t,
      count(*)::int as n
    from jadwal_sync
    where program_id = ${pid} and schedule_date is not null
    group by 1, 2, 3, 4
  `);
  // halaqahId -> dow -> best {start,end,n}
  const byHalaqah = new Map<number, Map<number, { start: string; end: string; n: number }>>();
  for (const r of schedRows.rows) {
    const hid = Number(r.halaqah_id);
    const dow = Number(r.dow);
    const start = (r.start_t as string) ?? "";
    const end = (r.end_t as string) ?? "";
    const n = Number(r.n);
    const perDow = byHalaqah.get(hid) ?? new Map();
    const cur = perDow.get(dow);
    if (!cur || n > cur.n) perDow.set(dow, { start, end, n });
    byHalaqah.set(hid, perDow);
  }
  const jadwalOf = (hid: number): string | null => {
    const perDow = byHalaqah.get(hid);
    if (!perDow) return null;
    return formatJadwal([...perDow.entries()].map(([dow, v]) => ({ dow, start: v.start, end: v.end })));
  };

  /**
   * Prefer the schedule reconstructed from the meetings themselves, but fall
   * back to the halaqah's own day/session when that reconstruction carries no
   * time — mabni's jadwal rows hold no clock times, so meetings alone would
   * render "Selasa · Jumat" and drop the hours the class actually runs.
   */
  const scheduleOf = (hid: number, day: unknown, session: unknown): string | null => {
    const derived = jadwalOf(hid);
    if (derived && derived.includes(":")) return derived;
    const own = [day, session].filter((v): v is string => typeof v === "string" && v !== "").join(" ");
    return own || derived;
  };

  return rows.rows.map((r) => ({
    halaqahId: Number(r.halaqah_id),
    name: (r.name as string) ?? null,
    namaAsli: (r.nama_asli as string | null) ?? null,
    pengajar: (r.pengajar as string) ?? null,
    guruPhone: resolveGuruPhone((r.pengajar as string) ?? null, (r.guru_phone as string) ?? null),
    level: (r.level as string) ?? null,
    gender: r.gender != null ? Number(r.gender) : null,
    type: (r.type as string) ?? null,
    studentCount: Number(r.student_count),
    avgRate: r.avg_rate != null ? Number(r.avg_rate) : null,
    belowCount: Number(r.below_count),
    recordedMeetings: Number(r.recorded_meetings),
    totalMeetings: Number(r.total_meetings),
    dueTanpaPresensi: Number(r.due_tanpa_presensi),
    jadwal: scheduleOf(Number(r.halaqah_id), r.halaqah_day, r.halaqah_session),
    meetings: meetingsOf(Number(r.halaqah_id)),
  }));
}

export type Meeting = {
  jadwalId: number;
  order: number | null;
  date: string | null;
  statusLabel: string | null;
  /** Materi the pengajar titled this meeting with in the CMS, e.g. "Dars 4". */
  name: string | null;
};

export type DetailStudent = {
  halaqahUserId: number;
  name: string | null;
  rate: number | null;
  hadir: number | null;
  effective: number | null;
};

/** One presensi cell: the status plus the reason the pengajar recorded, if any. */
export type AttendanceCell = {
  status: number; // 0 Alfa, 1 Hadir, 2 Telat, 3 Izin
  /** `attendance_sync.notes`, whitespace-collapsed; null when absent or blank. */
  note: string | null;
  /** Mabni arrival clock time, e.g. "16:18". Null for tilawah-sourced rows. */
  lateAt: string | null;
  /** Minutes late, derived from lateAt minus the session start time. */
  lateMinutes: number | null;
};

export type HalaqahDetail = {
  halaqahId: number;
  name: string | null;
  pengajar: string | null;
  level: string | null;
  gender: number | null;
  meetings: Meeting[];
  students: DetailStudent[];
  /** Peserta dinonaktifkan upstream — excluded from `students`, shown as a note. */
  nonaktifCount: number;
  /** Peserta whose enrollment never synced — a sync defect, surfaced as a warning. */
  tanpaEnrollmentCount: number;
  // halaqahUserId -> jadwalId -> AttendanceCell
  matrix: Record<number, Record<number, AttendanceCell>>;
};

/**
 * Collapse every whitespace run — including the `\n\n` in reasons pasted out of
 * WhatsApp — to single spaces. Done here rather than at render time so the cell
 * tooltip and the reason list can never show differently-spaced text. Emoji
 * pass through untouched; they are not `\s`.
 */
function normalizeNote(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/**
 * Accept a clock time only if it is actually shaped like one, and return it as
 * `HH:MM`. No row carries `jam_terlambat` yet, so its runtime shape is
 * unverified upstream — a shape guard keeps a future schema change from leaking
 * raw junk into the UI instead of quietly rendering nothing.
 */
function normalizeClock(v: unknown): string | null {
  if (v == null) return null;
  const m = /^(\d{1,2})[:.](\d{2})/.exec(String(v).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Minutes between the session start and the arrival time, or null if implausible. */
function lateMinutesOf(lateAt: string | null, sesiJam: string | null): number | null {
  if (!lateAt || !sesiJam) return null;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = mins(lateAt) - mins(sesiJam);
  if (diff <= 0 || diff > 12 * 60) return null;
  return diff;
}

export async function getHalaqahDetail(
  programSlug: string,
  halaqahId: number,
): Promise<HalaqahDetail | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();
  const pid = program.id;

  const halRows = await db.execute(sql`
    select name, pengajar, level, guru_id from halaqah_sync
    where program_id = ${pid} and tilawah_halaqah_id = ${halaqahId} limit 1
  `);
  const hal = halRows.rows[0];
  if (!hal) return null;

  const meetingRows = await db.execute(sql`
    select tilawah_jadwal_id as jadwal_id, "order", schedule_date::text as date, status_label, name
    from jadwal_sync
    where program_id = ${pid} and tilawah_halaqah_id = ${halaqahId}
    order by schedule_date asc nulls last, "order" asc
  `);
  const meetings: Meeting[] = meetingRows.rows.map((r) => ({
    jadwalId: Number(r.jadwal_id),
    order: r.order != null ? Number(r.order) : null,
    date: (r.date as string) ?? null,
    statusLabel: (r.status_label as string) ?? null,
    name: (r.name as string) ?? null,
  }));

  const studentRows = await db.execute(sql`
    select halaqah_user_id, name, attendance_rate::float as rate, hadir_count, effective_meetings, gender
    from students_sync
    where program_id = ${pid} and halaqah_id = ${halaqahId} and halaqah_user_id is not null
      and ${AKTIF}
    order by attendance_rate asc nulls last, name
  `);
  /**
   * Counted, not listed. Two different reasons a peserta is missing above, and
   * both must be said out loud rather than left to look like data loss:
   *
   *   nonaktif      — deactivated upstream; the roster hides them on purpose.
   *   tanpaEnrollment — no halaqah_user_id, so no presensi can be keyed to them
   *     and the matrix above cannot render a row. That is always a sync defect
   *     (it was the 25 Agu 2026 blanking bug, which stayed invisible for weeks
   *     precisely because the query dropped these rows in silence). Surfaced so
   *     the next occurrence is visible on the page itself.
   */
  const excludedRows = await db.execute(sql`
    select
      count(*) filter (where enrollment_status_code = 0)::int as nonaktif,
      count(*) filter (where halaqah_user_id is null and ${AKTIF})::int as tanpa_enrollment
    from students_sync
    where program_id = ${pid} and halaqah_id = ${halaqahId}
  `);
  const nonaktifCount = Number(excludedRows.rows[0]?.nonaktif ?? 0);
  const tanpaEnrollmentCount = Number(excludedRows.rows[0]?.tanpa_enrollment ?? 0);
  const students: DetailStudent[] = studentRows.rows.map((r) => ({
    halaqahUserId: Number(r.halaqah_user_id),
    name: (r.name as string) ?? null,
    rate: r.rate != null ? Number(r.rate) : null,
    hadir: r.hadir_count != null ? Number(r.hadir_count) : null,
    effective: r.effective_meetings != null ? Number(r.effective_meetings) : null,
  }));
  const gender = studentRows.rows[0]?.gender != null ? Number(studentRows.rows[0].gender) : null;

  const jadwalIds = meetings.map((m) => m.jadwalId);
  const matrix: HalaqahDetail["matrix"] = {};
  if (jadwalIds.length > 0) {
    // `raw` is jsonb NOT NULL DEFAULT {}, so ->> on a missing key yields NULL
    // rather than erroring — tilawah-sourced rows simply carry no clock times.
    const attRows = await db.execute(sql`
      select halaqah_user_id, halaqah_jadwal_id, status, notes,
             nullif(btrim(raw->>'jam_terlambat'), '') as jam_terlambat,
             nullif(btrim(raw->'sesi'->>'jam'), '')   as sesi_jam
      from attendance_sync
      where program_id = ${pid}
        and halaqah_jadwal_id in (${sql.join(jadwalIds, sql`, `)})
    `);
    for (const a of attRows.rows) {
      const uid = Number(a.halaqah_user_id);
      const jid = Number(a.halaqah_jadwal_id);
      const st = a.status != null ? Number(a.status) : null;
      // Number("") is 0, which would silently paint an Alfa.
      if (st == null || !Number.isFinite(st)) continue;
      const lateAt = normalizeClock(a.jam_terlambat);
      (matrix[uid] ??= {})[jid] = {
        status: st,
        note: normalizeNote(a.notes),
        lateAt,
        lateMinutes: lateMinutesOf(lateAt, normalizeClock(a.sesi_jam)),
      };
    }
  }

  return {
    halaqahId,
    name: (hal.name as string) ?? null,
    pengajar: (hal.pengajar as string) ?? null,
    level: (hal.level as string) ?? null,
    gender,
    meetings,
    students,
    nonaktifCount,
    tanpaEnrollmentCount,
    matrix,
  };
}
