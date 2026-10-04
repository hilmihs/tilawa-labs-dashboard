/**
 * Silabus — the curriculum a program actually runs, derived from the meeting
 * titles the teachers already write in the CMS (`jadwal_sync.name`, e.g.
 * "Qaidah Nuroniyyah — Dars 4"). Nothing here is authored in this app: the
 * upstream titles ARE the syllabus, they were simply never surfaced.
 *
 * Two things are derived per level:
 *   1. the "spine" — the distinct materi in teaching order, and
 *   2. where each halaqah currently sits on that spine, versus where the rest
 *      of its level sits at the same meeting number.
 *
 * (2) matters because halaqah in one level drift apart in pace: at Community Mosque
 * Lanjutan every halaqah teaches the same "Hal. 1 → Hal. 2 → …" sequence, but
 * some are one or two meetings ahead. Ordering the spine by average meeting
 * number (rather than by a single halaqah's schedule) keeps one row per materi
 * regardless of that drift.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getProgram } from "@/lib/programs/resolve";

/** Level bucket for halaqah whose level is unset (e.g. non-tilawah sources). */
export const NO_LEVEL = "(tanpa level)";

/**
 * Titles that are only a meeting number — "Pertemuan 3", or the bare "14" that
 * HITS Regular uses — carry no materi. A level made of these has no syllabus to
 * show, and saying so is more useful than rendering a list of numerals.
 */
const GENERIC_TITLE = /^(pertemuan|meeting|sesi)?\s*\d+$/i;

/** A level needs mostly-real titles, and enough of them, to be worth rendering. */
const MIN_DISTINCT_TITLES = 3;
const MAX_GENERIC_SHARE = 0.8;

function levelIsDerivable(rows: Row[]): boolean {
  const titles = rows.map((r) => r.title).filter((t): t is string => Boolean(t));
  if (titles.length === 0) return false;
  const genericShare = titles.filter((t) => GENERIC_TITLE.test(t)).length / titles.length;
  return new Set(titles).size >= MIN_DISTINCT_TITLES && genericShare < MAX_GENERIC_SHARE;
}

export type SilabusMateri = {
  index: number; // 0-based position on the spine
  title: string;
  firstOrder: number | null; // earliest meeting number this materi appears at
  lastOrder: number | null; // latest — differs from firstOrder when halaqah drift
  halaqahCount: number; // how many halaqah have it scheduled
  // Scheduled dates across every halaqah that runs this materi. They rarely
  // agree — halaqah meet on different days and get rescheduled — so this is a
  // range, not a single date. Equal ends mean everyone runs it the same day.
  firstDate: string | null; // earliest, YYYY-MM-DD
  lastDate: string | null; // latest
};

export type SilabusHalaqahProgress = {
  halaqahId: number;
  name: string | null;
  pengajar: string | null;
  level: string;
  lastTaughtOrder: number | null; // meeting number of the last meeting held
  lastTaughtTitle: string | null;
  materiIndex: number | null; // spine position of that title
  expectedIndex: number | null; // spine position the level's majority is at, same meeting number
  delta: number | null; // materiIndex - expectedIndex; <0 tertinggal, >0 lebih cepat
  meetingsHeld: number; // meetings already taught
  totalMeetings: number;
  nextTitle: string | null; // next materi on the spine, or null at the end
};

export type SilabusLevel = {
  level: string;
  materi: SilabusMateri[];
  halaqah: SilabusHalaqahProgress[];
  /** Majority materi title per meeting number — "what should be taught at #k". */
  canonicalByOrder: Record<number, string>;
};

export type SilabusData = {
  /** False when the CMS titles are generic/absent, so no syllabus can be read. */
  derivable: boolean;
  levels: SilabusLevel[];
};

type Row = {
  halaqahId: number;
  halaqahName: string | null;
  pengajar: string | null;
  level: string;
  order: number | null;
  title: string | null;
  held: boolean;
  date: string | null; // jadwal_sync.schedule_date, YYYY-MM-DD
};

/** Most frequent value, ties broken by the first one seen (input stays ordered). */
function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

type SpineEntry = {
  title: string;
  firstOrder: number;
  lastOrder: number;
  halaqah: Set<number>;
  dates: string[];
};

/**
 * Walk the level's canonical titles from meeting #1 upward and collapse
 * consecutive repeats into one materi. Ordering by meeting number rather than
 * by a title's average position is what keeps a materi that legitimately
 * recurs — "Tashih Tilawah" runs at #5 and again at #22–24 in HITS Safar —
 * in both of its real places instead of averaging it into the middle.
 */
function buildSpine(rows: Row[], canonicalByOrder: Record<number, string>): SpineEntry[] {
  const spine: SpineEntry[] = [];
  const orders = Object.keys(canonicalByOrder)
    .map(Number)
    .sort((a, b) => a - b);

  for (const ord of orders) {
    const title = canonicalByOrder[ord];
    const last = spine.at(-1);
    if (last && last.title === title) last.lastOrder = ord;
    else spine.push({ title, firstOrder: ord, lastOrder: ord, halaqah: new Set(), dates: [] });
  }

  // Titles only a minority of halaqah use never win a meeting slot, so they are
  // absent from the canonical walk. Splice them in by average position rather
  // than dropping them — they are still materi someone was taught.
  const inSpine = new Set(spine.map((e) => e.title));
  const strays = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (!r.title || r.order == null || inSpine.has(r.title)) continue;
    const s = strays.get(r.title) ?? { sum: 0, n: 0 };
    s.sum += r.order;
    s.n += 1;
    strays.set(r.title, s);
  }
  for (const [title, s] of strays) {
    const avg = s.sum / s.n;
    const at = spine.findIndex((e) => e.firstOrder > avg);
    const entry: SpineEntry = {
      title,
      firstOrder: Math.round(avg),
      lastOrder: Math.round(avg),
      halaqah: new Set<number>(),
      dates: [],
    };
    if (at === -1) spine.push(entry);
    else spine.splice(at, 0, entry);
  }

  return spine;
}

/**
 * Which spine entry a halaqah is on when it teaches `title` at meeting `order`.
 * A recurring title has several entries, so pick the occurrence nearest to the
 * meeting number — that is the pass the halaqah is actually in.
 */
function entryIndexFor(spine: SpineEntry[], title: string, order: number | null): number | null {
  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  spine.forEach((e, i) => {
    if (e.title !== title) return;
    const mid = (e.firstOrder + e.lastOrder) / 2;
    const dist = order == null ? 0 : Math.abs(mid - order);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}

/** The spine entry the level as a whole is on at meeting `order`. */
function entryIndexAtOrder(spine: SpineEntry[], order: number | null): number | null {
  if (order == null) return null;
  const covering = spine.findIndex((e) => order >= e.firstOrder && order <= e.lastOrder);
  if (covering !== -1) return covering;
  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  spine.forEach((e, i) => {
    const dist = Math.min(Math.abs(e.firstOrder - order), Math.abs(e.lastOrder - order));
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}

/**
 * The syllabus of `programSlug` plus each halaqah's position on it. Returns
 * null for an unknown slug; `derivable: false` when the CMS meeting titles are
 * generic ("Pertemuan 1") and therefore carry no materi.
 */
export async function getSilabus(programSlug: string): Promise<SilabusData | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();
  const pid = program.id;

  // A meeting counts as "held" once presensi exists for it — the same signal
  // getHalaqahList() uses for recorded/due meetings — falling back to the
  // schedule date so a halaqah whose teacher hasn't filled anything in yet
  // still shows a position instead of looking like it never started.
  const res = await db.execute(sql`
    select
      j.tilawah_halaqah_id as halaqah_id,
      h.name as halaqah_name,
      h.pengajar,
      coalesce(nullif(btrim(h.level), ''), ${NO_LEVEL}) as level,
      j."order" as ord,
      nullif(btrim(j.name), '') as title,
      j.schedule_date::text as schedule_date,
      (
        exists (
          select 1 from attendance_sync a
          where a.program_id = ${pid} and a.halaqah_jadwal_id = j.tilawah_jadwal_id
        )
        or (j.schedule_date is not null and j.schedule_date <= current_date)
      ) as held
    from jadwal_sync j
    join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    where j.program_id = ${pid}
    order by level, h.name, j."order" asc nulls last
  `);

  const rows: Row[] = res.rows.map((r) => ({
    halaqahId: Number(r.halaqah_id),
    halaqahName: (r.halaqah_name as string) ?? null,
    pengajar: (r.pengajar as string) ?? null,
    level: (r.level as string) ?? NO_LEVEL,
    order: r.ord != null ? Number(r.ord) : null,
    title: (r.title as string) ?? null,
    held: Boolean(r.held),
    date: (r.schedule_date as string) ?? null,
  }));

  const byLevel = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byLevel.get(r.level) ?? [];
    list.push(r);
    byLevel.set(r.level, list);
  }

  // Judged per level, not per program: a program can run one level with real
  // materi titles and another still on bare numbers.
  const levels: SilabusLevel[] = [...byLevel.entries()]
    .filter(([, levelRows]) => levelIsDerivable(levelRows))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([level, levelRows]) => {
      // What the level as a whole teaches at each meeting number.
      const perOrder = new Map<number, string[]>();
      for (const r of levelRows) {
        if (r.order == null || !r.title) continue;
        const list = perOrder.get(r.order) ?? [];
        list.push(r.title);
        perOrder.set(r.order, list);
      }
      const canonicalByOrder: Record<number, string> = {};
      for (const [ord, list] of perOrder) {
        const m = mode(list);
        if (m) canonicalByOrder[ord] = m;
      }

      const spine = buildSpine(levelRows, canonicalByOrder);
      // Attribute every scheduled meeting to the spine entry it belongs to, so
      // "dipakai N halaqah" counts the pass, not every use of the same title.
      for (const r of levelRows) {
        if (!r.title) continue;
        const i = entryIndexFor(spine, r.title, r.order);
        if (i == null) continue;
        spine[i].halaqah.add(r.halaqahId);
        if (r.date) spine[i].dates.push(r.date);
      }
      const materi: SilabusMateri[] = spine.map((e, index) => {
        const sorted = [...e.dates].sort();
        return {
          index,
          title: e.title,
          firstOrder: e.firstOrder,
          lastOrder: e.lastOrder,
          halaqahCount: e.halaqah.size,
          firstDate: sorted[0] ?? null,
          lastDate: sorted.at(-1) ?? null,
        };
      });

      const perHalaqah = new Map<number, Row[]>();
      for (const r of levelRows) {
        const list = perHalaqah.get(r.halaqahId) ?? [];
        list.push(r);
        perHalaqah.set(r.halaqahId, list);
      }

      const halaqah: SilabusHalaqahProgress[] = [...perHalaqah.values()].map((hRows) => {
        const head = hRows[0];
        const ordered = [...hRows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const heldRows = ordered.filter((r) => r.held);
        const last = heldRows.at(-1) ?? null;

        const materiIndex = last?.title != null ? entryIndexFor(spine, last.title, last.order) : null;
        const expectedIndex = last != null ? entryIndexAtOrder(spine, last.order) : null;

        return {
          halaqahId: head.halaqahId,
          name: head.halaqahName,
          pengajar: head.pengajar,
          level,
          lastTaughtOrder: last?.order ?? null,
          lastTaughtTitle: last?.title ?? null,
          materiIndex,
          expectedIndex,
          delta: materiIndex != null && expectedIndex != null ? materiIndex - expectedIndex : null,
          meetingsHeld: heldRows.length,
          totalMeetings: ordered.length,
          nextTitle: materiIndex != null ? (materi[materiIndex + 1]?.title ?? null) : null,
        };
      });

      // Worst laggards first — that's the whole point of the table.
      halaqah.sort(
        (a, b) =>
          (a.delta ?? 0) - (b.delta ?? 0) ||
          (a.name ?? "").localeCompare(b.name ?? ""),
      );

      return { level, materi, halaqah, canonicalByOrder };
    });

  return { derivable: levels.length > 0, levels };
}
