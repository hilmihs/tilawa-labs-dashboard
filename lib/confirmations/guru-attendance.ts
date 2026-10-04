import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export type GuruAttendanceRow = { guruId: number | null; status: string };
export type GuruAttendanceCounts = { hadir: number; telat: number; izin: number };

/**
 * Per-guru hadir/telat/izin day counts. `terlambat` is kept SEPARATE here (unlike
 * the student attendance rate where telat folds into hadir) because the recap
 * shows the three numbers side by side; the caller decides whether to treat telat
 * as present. Rows with a null guruId are dropped; an unrecognised status still
 * creates a zeroed entry so the guru is not silently lost.
 */
export function foldGuruAttendance(rows: GuruAttendanceRow[]): Map<number, GuruAttendanceCounts> {
  const out = new Map<number, GuruAttendanceCounts>();
  for (const r of rows) {
    if (r.guruId == null) continue;
    const c = out.get(r.guruId) ?? { hadir: 0, telat: 0, izin: 0 };
    if (r.status === "hadir") c.hadir += 1;
    else if (r.status === "terlambat") c.telat += 1;
    else if (r.status === "izin") c.izin += 1;
    out.set(r.guruId, c);
  }
  return out;
}

/** Load one program's teacher attendance over [start, end] and fold it. */
export async function getMabniGuruAttendance(
  programId: string,
  start: string,
  end: string,
): Promise<Map<number, GuruAttendanceCounts>> {
  const db = getDb();
  const res = await db.execute(sql`
    select guru_id, status
    from guru_attendance_sync
    where program_id = ${programId}
      and tanggal between ${start} and ${end}
  `);
  return foldGuruAttendance(
    res.rows.map((r) => ({ guruId: r.guru_id != null ? Number(r.guru_id) : null, status: String(r.status) })),
  );
}

export type GuruCheckinInput = {
  /** Dates in the period upstream recorded ANY teacher check-in for. */
  recordedDates: string[];
  /** One entry per (guru, date) a meeting was attributed to that guru. */
  scheduled: Array<{ guruId: number; date: string }>;
  /** Raw check-in rows for the period. */
  checkins: Array<{ guruId: number; date: string; status: string }>;
};

export type GuruCheckinCounts = {
  hariEfektif: number;
  hadir: number;
  telat: number;
  izin: number;
  alpa: number;
};

/** hadir outranks terlambat outranks izin when one date carries two rows. */
const STATUS_RANK: Record<string, number> = { hadir: 3, terlambat: 2, izin: 1 };

/** Strongest status per (guru, date) — upstream may hold two rows for one day. */
function strongestPerGuruDate(
  checkins: GuruCheckinInput["checkins"],
): Map<string, { guruId: number; date: string; status: string }> {
  const out = new Map<string, { guruId: number; date: string; status: string }>();
  for (const c of checkins) {
    const key = `${c.guruId}|${c.date}`;
    const cur = out.get(key);
    if (cur == null || (STATUS_RANK[c.status] ?? 0) > (STATUS_RANK[cur.status] ?? 0)) {
      out.set(key, { guruId: c.guruId, date: c.date, status: c.status });
    }
  }
  return out;
}

/**
 * Per-guru check-in counts over the days that guru was actually scheduled.
 *
 * `hari efektif` is the guru's scheduled dates INTERSECTED with the dates
 * upstream has recorded at all. That intersection is the whole point: mabni's
 * /absensi-guru pull can stall (it sat at 2026-08-18 for two weeks), and without
 * it every teacher would be reported alpa for every day the sync missed. A day
 * upstream never recorded is a day we know nothing about, not a day of absence.
 *
 * Days with no scheduled meeting are ignored even if the guru checked in — the
 * denominator is "days you were meant to teach", the coordinator's question.
 */
export function computeGuruCheckin(input: GuruCheckinInput): Map<number, GuruCheckinCounts> {
  const recorded = new Set(input.recordedDates);

  const effByGuru = new Map<number, Set<string>>();
  for (const s of input.scheduled) {
    if (!recorded.has(s.date)) continue;
    const set = effByGuru.get(s.guruId) ?? new Set<string>();
    set.add(s.date);
    effByGuru.set(s.guruId, set);
  }

  const statusByGuruDate = strongestPerGuruDate(input.checkins);

  const out = new Map<number, GuruCheckinCounts>();
  for (const [guruId, dates] of effByGuru) {
    const counts: GuruCheckinCounts = {
      hariEfektif: dates.size,
      hadir: 0,
      telat: 0,
      izin: 0,
      alpa: 0,
    };
    for (const d of dates) {
      const status = statusByGuruDate.get(`${guruId}|${d}`)?.status;
      if (status === "hadir") counts.hadir += 1;
      else if (status === "terlambat") counts.telat += 1;
      else if (status === "izin") counts.izin += 1;
      else counts.alpa += 1; // no check-in at all on a day upstream did record
    }
    out.set(guruId, counts);
  }
  return out;
}

export type GuruCheckinOutside = { checkin: number; telat: number; izin: number };

/**
 * The check-ins computeGuruCheckin DROPS: a (guru, date) recorded upstream where
 * that guru had no meeting scheduled that day. The denominator rule is right —
 * the coordinator asked about days you were meant to teach — but the dropped rows
 * still have to be countable. In August 2026 three mabni teachers (guru 27/29/31)
 * check in while holding no meeting at all, and their rows carry the month's ONLY
 * `terlambat`; counting nothing here leaves the report saying "Terlambat: 0"
 * against a feed that plainly shows one.
 *
 * Same input as computeGuruCheckin so the two partition the recorded check-ins
 * between them, and the same strongest-status-per-day rule so a duplicated row
 * cannot be counted twice.
 */
export function computeGuruCheckinOutside(input: GuruCheckinInput): GuruCheckinOutside {
  const recorded = new Set(input.recordedDates);
  const scheduledKeys = new Set(input.scheduled.map((s) => `${s.guruId}|${s.date}`));

  const out: GuruCheckinOutside = { checkin: 0, telat: 0, izin: 0 };
  for (const [key, c] of strongestPerGuruDate(input.checkins)) {
    if (!recorded.has(c.date) || scheduledKeys.has(key)) continue;
    out.checkin += 1;
    if (c.status === "terlambat") out.telat += 1;
    else if (c.status === "izin") out.izin += 1;
  }
  return out;
}
