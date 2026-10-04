/**
 * Kalender pendidikan (kaldik) for one HITS batch, derived from the synced
 * schedule rather than typed by hand.
 *
 * Three things make this harder than "list the meetings":
 *
 *   1. EVERY HALAQAH RUNS ITS OWN DATES. A batch is one cohort but 128 day
 *      patterns: pertemuan 7 lands anywhere in a 6-day window. So the calendar
 *      is built per WEEK (the cohort really is aligned week-to-week, two
 *      meetings each) and the exact per-halaqah date is kept in its own table.
 *   2. `order` IS THE CURRICULUM NUMBER, dates are not. Ad-hoc meetings (badal,
 *      pengganti) sit between numbered ones, so counting meetings by date
 *      shifts "pertemuan ke-13" by a slot for the halaqah that had a badal.
 *      Evaluasi anchors therefore key on `order`, never on position-by-date.
 *   3. A DELETED MEETING LEAVES A HOLE in `order` (25 Aug 2026 was dropped
 *      batch-wide and re-appended at the end of each affected halaqah), so the
 *      final exam cannot key on a fixed number either. It is defined as the
 *      last two meetings BY DATE, which is also what the coordinator means.
 *
 * Libur is not a flag upstream — it is inferred: a date inside the batch span
 * where nobody meets although halaqah that normally teach on that weekday are
 * still running. That is exactly how 25 Aug shows up, and it keeps the tail of
 * the batch (classes finishing on different days) from being called a holiday.
 */
import { sql } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { addDaysISO, isoDow } from "@/lib/time/jakarta";

type Db = ReturnType<typeof getDb>;

/** Meeting numbers that carry a periodic evaluation, per the batch's own naming. */
const EVALUASI_ORDERS: ReadonlyArray<{ order: number; label: string }> = [
  { order: 7, label: "Evaluasi Berkala 1" },
  { order: 13, label: "Evaluasi Berkala 2" },
  { order: 18, label: "Evaluasi Berkala 3" },
];

/** How many closing meetings count as the final exam. */
const UJIAN_SESSIONS = 2;

/**
 * A halaqah below this many meetings never really ran (dropped mid-batch, no
 * teacher). It stays visible in the table with a note, but it must not drag the
 * batch's start/end window or the "berapa halaqah" counts.
 */
const MIN_MEETINGS_ACTIVE = 20;

/** A dead weekday needs this many classes that *should* have met to be libur. */
const MIN_EXPECTED_FOR_LIBUR = 5;

/**
 * Share of an agenda's dates a week must hold before the grid labels that week
 * with it. Below this the week is still ordinary KBM for almost everyone.
 */
const WEEK_AGENDA_SHARE = 0.3;

/** Above this share the week owns the agenda outright; below it, "sebagian". */
const WEEK_AGENDA_MOST = 0.6;

export type KaldikAgendaKind = "mulai" | "evaluasi" | "ujian" | "libur" | "selesai";

export type KaldikMeeting = {
  order: number | null;
  name: string | null;
  date: string; // YYYY-MM-DD
  isUjianType: boolean; // upstream type_pertemuan = "ujian"
};

export type KaldikHalaqah = {
  id: number;
  name: string;
  type: string | null;
  level: string | null;
  day: string | null;
  session: string | null;
  pengajar: string | null;
  tempat: string | null;
  active: boolean;
  meetings: number;
  start: string | null;
  end: string | null;
  /** Date of each evaluasi anchor, in EVALUASI_ORDERS order; null if missing. */
  evaluasi: Array<string | null>;
  /** The closing meetings, oldest first. Empty for a halaqah that never ran. */
  ujian: string[];
  note: string | null;
};

export type KaldikDay = {
  date: string;
  dom: number; // day of month, what the grid prints
  inSpan: boolean; // inside the batch window at all
  sesi: number; // meetings scheduled that day, across the batch
  libur: boolean;
};

export type KaldikWeek = {
  index: number; // 1-based pekan
  start: string;
  end: string;
  orders: number[]; // curriculum numbers taught this week (majority view)
  agenda: string[]; // evaluasi / ujian / libur labels landing in this week
  sesi: number;
  days: KaldikDay[]; // always 7, Senin..Ahad
};

export type KaldikEvent = {
  kind: KaldikAgendaKind;
  label: string;
  orderLabel: string; // "P7", "Pertemuan terakhir", "—"
  from: string;
  to: string;
  /** Every date this agenda lands on, one per halaqah. Drives the week grid. */
  dates: string[];
  halaqah: number; // how many halaqah this agenda touches
  note: string | null;
};

export type KaldikData = {
  program: string;
  generatedAt: string; // ISO date (Jakarta) — stamped by the caller
  start: string;
  end: string;
  weeks: KaldikWeek[];
  halaqah: KaldikHalaqah[];
  events: KaldikEvent[];
  totals: {
    halaqahActive: number;
    halaqahInactive: number;
    offline: number;
    online: number;
    meetings: number;
    /** Modal meeting count — "berapa pertemuan satu halaqah" for this batch. */
    meetingsPerHalaqah: number;
    pekan: number;
  };
};

const DOW_LABEL = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Ahad"];
const MONTH_LABEL = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "2026-07-13" -> "13 Jul 2026". */
export function formatISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_LABEL[m - 1]} ${y}`;
}

/** "13 Jul" + "18 Jul 2026" -> "13–18 Jul 2026"; collapses a single date. */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatISO(from);
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const fd = Number(from.slice(8));
  if (fy === ty && fm === tm) return `${fd}–${formatISO(to)}`;
  if (fy === ty) return `${fd} ${MONTH_LABEL[fm - 1]} – ${formatISO(to)}`;
  return `${formatISO(from)} – ${formatISO(to)}`;
}

/** Monday of the week `iso` falls in. */
function mondayOf(iso: string): string {
  return addDaysISO(iso, -(isoDow(iso) - 1));
}

type HalaqahRow = {
  id: number;
  name: string | null;
  type: string | null;
  level: string | null;
  day: string | null;
  session: string | null;
  pengajar: string | null;
  tempat: string | null;
};

type MeetingRow = {
  halaqah_id: number;
  order: number | null;
  name: string | null;
  date: string | null;
  type_pertemuan: string | null;
};

export async function loadKaldik(
  db: Db,
  program: string,
  opts: { generatedAt: string },
): Promise<KaldikData> {
  const halaqahRes = await db.execute(sql`
    select h.tilawah_halaqah_id as id,
           h.name, h.type, h.level, h.day, h.session, h.pengajar,
           (select string_agg(distinct j.raw->>'offline_place', ' / ')
              from jadwal_sync j
             where j.program_id = h.program_id
               and j.tilawah_halaqah_id = h.tilawah_halaqah_id) as tempat
      from halaqah_sync h
      join programs p on p.id = h.program_id
     where p.name = ${program}
     order by h.name`);
  const meetingRes = await db.execute(sql`
    select j.tilawah_halaqah_id as halaqah_id,
           j."order" as order,
           j.name,
           j.schedule_date::text as date,
           j.raw->>'type_pertemuan' as type_pertemuan
      from jadwal_sync j
      join programs p on p.id = j.program_id
     where p.name = ${program}
       and j.schedule_date is not null
     order by j.tilawah_halaqah_id, j.schedule_date, j."order"`);

  const halaqahRows = halaqahRes.rows as unknown as HalaqahRow[];
  const meetingRows = meetingRes.rows as unknown as MeetingRow[];

  const byHalaqah = new Map<number, KaldikMeeting[]>();
  for (const m of meetingRows) {
    if (!m.date) continue;
    const list = byHalaqah.get(m.halaqah_id) ?? [];
    list.push({
      order: m.order,
      name: m.name,
      date: m.date,
      isUjianType: m.type_pertemuan === "ujian",
    });
    byHalaqah.set(m.halaqah_id, list);
  }

  const halaqah: KaldikHalaqah[] = halaqahRows.map((h) => {
    const meetings = (byHalaqah.get(h.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const active = meetings.length >= MIN_MEETINGS_ACTIVE;
    const byOrder = new Map<number, KaldikMeeting>();
    for (const m of meetings) if (m.order != null && !byOrder.has(m.order)) byOrder.set(m.order, m);
    const ujian = active ? meetings.slice(-UJIAN_SESSIONS).map((m) => m.date) : [];
    return {
      id: h.id,
      name: h.name ?? `Halaqah ${h.id}`,
      type: h.type,
      level: h.level,
      day: h.day,
      session: h.session,
      pengajar: h.pengajar,
      tempat: h.tempat,
      active,
      meetings: meetings.length,
      start: meetings[0]?.date ?? null,
      end: meetings.at(-1)?.date ?? null,
      evaluasi: EVALUASI_ORDERS.map((e) => byOrder.get(e.order)?.date ?? null),
      ujian,
      note: active
        ? null
        : meetings.length === 0
          ? "Tidak ada pertemuan terjadwal"
          : `Tidak berjalan penuh — ${meetings.length} pertemuan, berhenti ${formatISO(meetings.at(-1)!.date)}`,
    };
  });

  const activeHalaqah = halaqah.filter((h) => h.active);
  const activeIds = new Set(activeHalaqah.map((h) => h.id));
  const activeMeetings = meetingRows.filter((m) => m.date && activeIds.has(m.halaqah_id)) as Array<
    MeetingRow & { date: string }
  >;

  const start = activeMeetings.reduce((a, m) => (a < m.date ? a : m.date), activeMeetings[0]?.date ?? "");
  const end = activeMeetings.reduce((a, m) => (a > m.date ? a : m.date), activeMeetings[0]?.date ?? "");

  // Per-date load, and per-weekday "who should have met", for libur detection.
  const sesiByDate = new Map<string, number>();
  for (const m of activeMeetings) sesiByDate.set(m.date, (sesiByDate.get(m.date) ?? 0) + 1);

  const pattern = new Map<number, { dows: Set<number>; from: string; to: string }>();
  for (const h of activeHalaqah) {
    const list = byHalaqah.get(h.id) ?? [];
    pattern.set(h.id, {
      dows: new Set(list.map((m) => isoDow(m.date))),
      from: h.start!,
      to: h.end!,
    });
  }
  const isLibur = (date: string): boolean => {
    if ((sesiByDate.get(date) ?? 0) > 0) return false;
    let expected = 0;
    const dow = isoDow(date);
    for (const p of pattern.values()) {
      if (p.dows.has(dow) && p.from <= date && date <= p.to) expected++;
    }
    return expected >= MIN_EXPECTED_FOR_LIBUR;
  };

  // Weeks: Monday-anchored, first week is the one the batch starts in.
  const weeks: KaldikWeek[] = [];
  for (let ws = mondayOf(start), i = 1; ws <= end; ws = addDaysISO(ws, 7), i++) {
    const days: KaldikDay[] = [];
    const orderCount = new Map<number, number>();
    let sesi = 0;
    for (let k = 0; k < 7; k++) {
      const date = addDaysISO(ws, k);
      const inSpan = date >= start && date <= end;
      const n = inSpan ? (sesiByDate.get(date) ?? 0) : 0;
      sesi += n;
      days.push({ date, dom: Number(date.slice(8)), inSpan, sesi: n, libur: inSpan && isLibur(date) });
    }
    for (const m of activeMeetings) {
      if (m.date >= days[0].date && m.date <= days[6].date && m.order != null) {
        orderCount.set(m.order, (orderCount.get(m.order) ?? 0) + 1);
      }
    }
    // A week's "pertemuan ke-" is the numbers the cohort mostly sits on; the
    // long tail is badal and pengganti meetings from a handful of halaqah.
    const orders = [...orderCount.entries()]
      .filter(([, c]) => c >= sesi * 0.15)
      .map(([o]) => o)
      .sort((a, b) => a - b);
    weeks.push({
      index: i,
      start: days[0].date,
      end: days[6].date,
      orders,
      agenda: [],
      sesi,
      days,
    });
  }

  // ---- Agenda ---------------------------------------------------------------
  const events: KaldikEvent[] = [];
  const dates = (xs: Array<string | null>) => xs.filter((d): d is string => !!d).sort();

  const startDates = dates(activeHalaqah.map((h) => h.start));
  events.push({
    kind: "mulai",
    label: "Awal batch — pertemuan 1",
    orderLabel: "P1",
    from: startDates[0] ?? start,
    to: startDates.at(-1) ?? start,
    dates: startDates,
    halaqah: activeHalaqah.length,
    note: "Tanggal tepatnya mengikuti hari masing-masing halaqah.",
  });

  EVALUASI_ORDERS.forEach((e, i) => {
    const ds = dates(activeHalaqah.map((h) => h.evaluasi[i]));
    if (ds.length === 0) return;
    events.push({
      kind: "evaluasi",
      label: e.label,
      orderLabel: `P${e.order}`,
      from: ds[0],
      to: ds.at(-1)!,
      dates: ds,
      halaqah: ds.length,
      note: null,
    });
  });

  const liburDates: string[] = [];
  for (const w of weeks) for (const d of w.days) if (d.libur) liburDates.push(d.date);
  for (const date of liburDates) {
    let expected = 0;
    const dow = isoDow(date);
    for (const p of pattern.values()) if (p.dows.has(dow) && p.from <= date && date <= p.to) expected++;
    events.push({
      kind: "libur",
      label: `Libur — ${DOW_LABEL[dow - 1]}`,
      orderLabel: "—",
      from: date,
      to: date,
      dates: [date],
      halaqah: expected,
      note: "Tidak ada satu pun kelas terjadwal; pertemuan penggantinya ditambahkan di akhir jadwal halaqah masing-masing.",
    });
  }

  // Meetings the teacher themself labelled libur, on a day the rest still ran.
  const namedLibur = meetingRows.filter(
    (m) => m.date && /libur/i.test(m.name ?? "") && !liburDates.includes(m.date),
  );
  for (const date of [...new Set(namedLibur.map((m) => m.date!))].sort()) {
    const n = namedLibur.filter((m) => m.date === date).length;
    events.push({
      kind: "libur",
      label: `Libur sebagian — ${DOW_LABEL[isoDow(date) - 1]}`,
      orderLabel: "—",
      from: date,
      to: date,
      dates: namedLibur.filter((m) => m.date === date).map((m) => m.date!),
      halaqah: n,
      note: `Kelas lain tetap berjalan (${sesiByDate.get(date) ?? 0} sesi); ${n} halaqah menandai pertemuannya "Libur".`,
    });
  }

  for (let s = 0; s < UJIAN_SESSIONS; s++) {
    const ds = dates(activeHalaqah.map((h) => h.ujian[s] ?? null));
    if (ds.length === 0) continue;
    events.push({
      kind: "ujian",
      label: `Ujian Akhir — sesi ${s + 1}`,
      orderLabel: s === 0 ? "Pertemuan ke-2 terakhir" : "Pertemuan terakhir",
      from: ds[0],
      to: ds.at(-1)!,
      dates: ds,
      halaqah: ds.length,
      note:
        s === 0
          ? "Dua pertemuan penutup tiap halaqah dipakai untuk ujian akhir."
          : "Sekaligus penutupan batch.",
    });
  }

  const endDates = dates(activeHalaqah.map((h) => h.end));
  events.push({
    kind: "selesai",
    label: "Akhir batch — pertemuan terakhir",
    orderLabel: "—",
    from: endDates[0] ?? end,
    to: end,
    dates: endDates,
    halaqah: activeHalaqah.length,
    note: null,
  });
  events.sort((a, b) => a.from.localeCompare(b.from) || a.label.localeCompare(b.label));

  // Fold the agenda back into the weeks so the grid reads on its own. An agenda
  // belongs to a week by WEIGHT, not by overlap: a handful of halaqah whose
  // closing pair starts a week early must not put "Ujian Akhir" on two pekan.
  for (const w of weeks) {
    for (const ev of events) {
      if (ev.kind === "mulai" || ev.kind === "selesai") continue;
      const inWeek = ev.dates.filter((d) => d >= w.start && d <= w.end).length;
      if (inWeek === 0) continue;
      if (inWeek < ev.dates.length * WEEK_AGENDA_SHARE && inWeek < ev.dates.length) continue;
      const partial = inWeek < ev.dates.length * WEEK_AGENDA_MOST;
      const label =
        ev.kind === "libur"
          ? `${ev.label} (${formatISO(ev.from)})`
          : partial
            ? `${ev.label} (sebagian halaqah)`
            : ev.label;
      if (!w.agenda.includes(label)) w.agenda.push(label);
    }
    // Both exam sessions in one pekan read as one agenda, not two.
    const ujian = w.agenda.filter((a) => a.startsWith("Ujian Akhir — sesi") && !a.includes("sebagian"));
    if (ujian.length > 1) {
      w.agenda = w.agenda.filter((a) => !ujian.includes(a));
      w.agenda.push(`Ujian Akhir (${ujian.length} sesi)`);
    }
    if (w.index === 1) w.agenda.unshift("Awal batch");
    if (w.index === weeks.length) w.agenda.push("Penutupan batch");
  }

  const countByMeetings = new Map<number, number>();
  for (const h of activeHalaqah) countByMeetings.set(h.meetings, (countByMeetings.get(h.meetings) ?? 0) + 1);
  const meetingsPerHalaqah =
    [...countByMeetings.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;

  return {
    program,
    generatedAt: opts.generatedAt,
    start,
    end,
    weeks,
    halaqah,
    events,
    totals: {
      halaqahActive: activeHalaqah.length,
      halaqahInactive: halaqah.length - activeHalaqah.length,
      offline: activeHalaqah.filter((h) => h.type === "offline").length,
      online: activeHalaqah.filter((h) => h.type !== "offline").length,
      meetings: activeMeetings.length,
      meetingsPerHalaqah,
      pekan: weeks.length,
    },
  };
}

export { DOW_LABEL, EVALUASI_ORDERS, UJIAN_SESSIONS };
