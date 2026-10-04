/**
 * Period and lock constants for the monthly teacher recap confirmation flow
 * (WA blast → /rekap/<token> → teacher_meeting_confirmations).
 *
 * Pure module: no DB, no React, no Intl. Every consumer — the agent endpoint,
 * the message builder and the teacher page — reads the window from here so the
 * numbers in the WhatsApp text and the rows on the page can never describe
 * different months.
 *
 * Timezone discipline: the container runs UTC while every date the pesantren
 * cares about is WIB (UTC+7). Nothing below derives "today" from the server
 * clock's calendar fields; the lock is one absolute instant with an explicit
 * offset, compared as a timestamp, and the labels do calendar math on strings
 * or on UTC fields shifted by a fixed +7h. `Intl` is deliberately avoided for
 * month names because the slim container image may ship without full ICU data,
 * which would silently degrade Indonesian month names to English.
 */

/** Indonesian month names, index 0 = Januari. Hand-written; see the note above. */
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
] as const;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The cycle repeats every month: the window runs from the 16th of one month to
 * the 15th of the next, and presensi closes on the 17th at 18.00 WIB. Derived
 * from the current date rather than hardcoded so next month needs no deploy —
 * the env overrides below stay for re-running an older period on purpose.
 *
 * "Which month" is decided in WIB, not in the container's UTC: between 00.00 and
 * 07.00 WIB the two disagree about the date, and on the 16th that disagreement
 * would silently hand back last month's window.
 */
export function cycleFor(now: Date = new Date()): {
  start: string;
  end: string;
  lockAt: string;
} {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = wib.getUTCMonth(); // 0-based
  const d = wib.getUTCDate();

  // The window under confirmation is the one that just CLOSED, and it stays
  // under confirmation until the lock on the 17th — that is the whole point of
  // the blast. So up to and including the 17th we mean the window ending on the
  // 15th of this month; from the 18th we mean the next one. Getting this
  // backwards would, on the very day of a blast, hand everyone the month that
  // has barely started.
  const rollForward = d > 17;
  const endYear = rollForward && m === 11 ? y + 1 : y;
  const endMonth = rollForward ? (m + 1) % 12 : m;
  const startYear = endMonth === 0 ? endYear - 1 : endYear;
  const startMonth = (endMonth + 11) % 12;

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${startYear}-${pad(startMonth + 1)}-16`,
    end: `${endYear}-${pad(endMonth + 1)}-15`,
    lockAt: `${endYear}-${pad(endMonth + 1)}-17T18:00:00+07:00`,
  };
}

const CYCLE = cycleFor();
const DEFAULT_PERIOD_START = CYCLE.start;
const DEFAULT_PERIOD_END = CYCLE.end;
const DEFAULT_LOCK_AT = CYCLE.lockAt;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A timestamp is only accepted with an explicit offset — see `isLockTimestamp`. */
const OFFSET_RE = /(Z|[+-]\d{2}:\d{2})$/;

/**
 * True for a real calendar date written as YYYY-MM-DD. The round-trip through
 * UTC rejects shapes the regex alone would accept (2026-02-31, 2026-13-01):
 * JS would roll those over into another month instead of failing.
 */
function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/**
 * True for a parseable timestamp that states its own UTC offset. An offset-less
 * ISO string ("2026-08-17T16:00:00") is parsed as *server local* time, so on
 * this UTC container it would move the lock seven hours earlier than whoever
 * set the env variable meant. Rejecting it is safer than shifting it.
 */
function isLockTimestamp(value: string): boolean {
  return OFFSET_RE.test(value) && !Number.isNaN(Date.parse(value));
}

/** Env override that falls back to the default whenever the value is malformed. */
function envValue(name: string, fallback: string, valid: (v: string) => boolean): string {
  const raw = process.env[name]?.trim();
  if (!raw || !valid(raw)) return fallback;
  return raw;
}

/**
 * The recap window, inclusive on both ends, as YYYY-MM-DD in WIB. Overridable
 * per environment so a re-run for another month needs no deploy of new code.
 */
export const RECAP_PERIOD: { start: string; end: string } = {
  start: envValue("RECAP_PERIOD_START", DEFAULT_PERIOD_START, isIsoDate),
  end: envValue("RECAP_PERIOD_END", DEFAULT_PERIOD_END, isIsoDate),
};

/**
 * The instant presensi closes. After it the teacher page turns read-only: the
 * upstream tilawah data is frozen for the period, so a late answer could no
 * longer be reconciled against it.
 */
export const PRESENSI_LOCK_AT: string = envValue(
  "PRESENSI_LOCK_AT",
  DEFAULT_LOCK_AT,
  isLockTimestamp,
);

/**
 * Absolute comparison, never a calendar one: both sides collapse to epoch ms,
 * so the caller's clock timezone is irrelevant. Exactly at the boundary counts
 * as locked — the deadline is the first closed instant, not the last open one.
 */
export function isPresensiLocked(now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(PRESENSI_LOCK_AT);
}

/** Split a validated YYYY-MM-DD without constructing a Date (no TZ to get wrong). */
function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  if (!isIsoDate(value)) return null;
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

/**
 * Human label for the window, e.g. "16 Juli – 15 Agustus 2026". Redundant parts
 * are dropped the way a person would write them: the year appears once when
 * both ends share it, and the month once when both ends share that too
 * ("16 – 30 Juli 2026"). Malformed input falls back to the configured period so
 * a label is never rendered as raw garbage to a teacher.
 */
export function periodLabel(
  start: string = RECAP_PERIOD.start,
  end: string = RECAP_PERIOD.end,
): string {
  const a = parseIsoDate(start) ?? parseIsoDate(RECAP_PERIOD.start);
  const b = parseIsoDate(end) ?? parseIsoDate(RECAP_PERIOD.end);
  if (!a || !b) return "";

  const monthA = MONTHS_ID[a.month - 1];
  const monthB = MONTHS_ID[b.month - 1];

  if (a.year === b.year && a.month === b.month) {
    return `${a.day} – ${b.day} ${monthB} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day} ${monthA} – ${b.day} ${monthB} ${b.year}`;
  }
  return `${a.day} ${monthA} ${a.year} – ${b.day} ${monthB} ${b.year}`;
}

/**
 * Human label for the deadline, e.g. "17 Agustus 2026 pukul 16.00 WIB".
 * The lock instant is shifted into WIB by hand (+7h, then read the UTC fields)
 * so the wording is right whatever offset PRESENSI_LOCK_AT was written in and
 * whatever timezone the process runs in.
 */
export function lockLabel(): string {
  const wib = new Date(Date.parse(PRESENSI_LOCK_AT) + WIB_OFFSET_MS);
  const day = wib.getUTCDate();
  const month = MONTHS_ID[wib.getUTCMonth()];
  const year = wib.getUTCFullYear();
  const hour = String(wib.getUTCHours()).padStart(2, "0");
  const minute = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} pukul ${hour}.${minute} WIB`;
}
