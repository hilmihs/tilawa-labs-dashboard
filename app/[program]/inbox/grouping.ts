import type { PresensiGapHalaqah } from "@/lib/insights/queries";

/**
 * Presentation-only regrouping of a halaqah's presensi backlog.
 *
 * The data layer hands us the backlog keyed by *meeting*: for every pertemuan,
 * which peserta are still unmarked. Printed literally that produced 21 identical
 * red rows ("Pertemuan N · <tanggal> — 1 peserta: Robianur") for what is a
 * single problem: one peserta who is never marked. So we invert the index here —
 * group by cause (the peserta, or "belum disentuh sama sekali"), not by meeting —
 * and rank by impact. Nothing about the underlying query, the counts, or the WA
 * message payload changes; this module only decides how the same rows are read.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "2026-06-22" → "22 Jun 2026". Hand-rolled: the container may lack ICU. */
export function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "22 Jun 2026" for one date, "22 Jun 2026 – 3 Sep 2026" for a span. */
export function fmtRange(first: string | null, last: string | null): string {
  if (!first && !last) return "tanggal tidak tercatat";
  if (!first || !last || first === last) return fmtDate(first ?? last);
  return `${fmtDate(first)} – ${fmtDate(last)}`;
}

/** Whole days between an ISO date and `today`; null when the date is missing. */
export function daysSince(iso: string | null, today: Date): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((now - then) / 86_400_000);
}

/**
 * COLOR RULE — the only place red is decided on this page.
 *
 * red / "urgent"     a pertemuan has sat untouched for more than
 *                    URGENT_UNTOUCHED_DAYS, or the halaqah is `kritis` and has
 *                    any untouched pertemuan at all.
 * amber / "attention" any other untouched backlog (still fresh), or a `kritis`
 *                    halaqah whose backlog is only half-filled pertemuan.
 * neutral / "routine" peserta left unmarked in pertemuan the teacher has
 *                    already started. Common, low-stakes, and by far the
 *                    bulkiest category — it must not be red.
 */
export const URGENT_UNTOUCHED_DAYS = 14;

export type GapSeverity = "urgent" | "attention" | "routine";

const SEVERITY_RANK: Record<GapSeverity, number> = {
  urgent: 0,
  attention: 1,
  routine: 2,
};

export const SEVERITY_LABEL: Record<GapSeverity, string> = {
  urgent: "Mendesak",
  attention: "Perlu tindak lanjut",
  routine: "Rutin",
};

export const SEVERITY_TONE = {
  urgent: "danger",
  attention: "warning",
  routine: "neutral",
} as const;

export type GapMeetingRef = { order: number | null; date: string | null };

export type GapGroup = {
  key: string;
  /** "untouched" = pertemuan never started; "peserta" = named people unmarked. */
  kind: "untouched" | "peserta";
  /** Peserta this group is about — empty for `untouched`. */
  students: string[];
  meetings: GapMeetingRef[];
  firstDate: string | null;
  lastDate: string | null;
  /** Age in days of the oldest pertemuan in the group; null when undated. */
  ageDays: number | null;
  /** peserta × pertemuan — how much of the register this one line represents. */
  impact: number;
  severity: GapSeverity;
};

export type HalaqahGapView = {
  halaqah: PresensiGapHalaqah;
  groups: GapGroup[];
  summary: {
    untouchedMeetings: number;
    partialMeetings: number;
    /** Distinct peserta named across the half-filled pertemuan. */
    affectedStudents: number;
    oldestDate: string | null;
    oldestAgeDays: number | null;
  };
  severity: GapSeverity;
  impact: number;
  isKritis: boolean;
};

const meetingKey = (m: GapMeetingRef) => `${m.order ?? "?"}#${m.date ?? ""}`;

function dateBounds(meetings: GapMeetingRef[]): [string | null, string | null] {
  const dates = meetings.map((m) => m.date).filter((d): d is string => !!d).sort();
  return [dates[0] ?? null, dates[dates.length - 1] ?? null];
}

/**
 * Fold one halaqah's backlog into cause-shaped groups.
 *
 * Untouched pertemuan collapse into a single group — they are one instruction
 * to the teacher ("mulai isi presensi"), not N. Half-filled pertemuan are
 * inverted into peserta → pertemuan, then peserta sharing the *same* set of
 * pertemuan are merged: that turns both "Robianur, 21 kali" and "sepuluh orang
 * absen di pertemuan yang sama" into one line each.
 */
export function buildHalaqahView(
  halaqah: PresensiGapHalaqah,
  opts: { today: Date; isKritis: boolean },
): HalaqahGapView {
  const { today, isKritis } = opts;
  const groups: GapGroup[] = [];

  if (halaqah.emptyMeetings.length > 0) {
    const meetings = halaqah.emptyMeetings.map((m) => ({ order: m.order, date: m.date }));
    const [first, last] = dateBounds(meetings);
    const ageDays = daysSince(first, today);
    const overdue = ageDays != null && ageDays > URGENT_UNTOUCHED_DAYS;
    groups.push({
      key: "untouched",
      kind: "untouched",
      students: [],
      meetings,
      firstDate: first,
      lastDate: last,
      ageDays,
      // Untouched pertemuan affect the whole halaqah, so they outrank any single
      // peserta group of the same length.
      impact: meetings.length * 2,
      severity: overdue || isKritis ? "urgent" : "attention",
    });
  }

  // peserta → the pertemuan where they are still unmarked (query order kept:
  // oldest first).
  const byStudent = new Map<string, GapMeetingRef[]>();
  for (const m of halaqah.partialMeetings) {
    for (const name of m.missingStudents) {
      const list = byStudent.get(name);
      if (list) list.push({ order: m.order, date: m.date });
      else byStudent.set(name, [{ order: m.order, date: m.date }]);
    }
  }

  // peserta with an identical pertemuan set are one cause, not several.
  const bySignature = new Map<string, { students: string[]; meetings: GapMeetingRef[] }>();
  for (const [name, meetings] of byStudent) {
    const sig = meetings.map(meetingKey).join("|");
    const bucket = bySignature.get(sig);
    if (bucket) bucket.students.push(name);
    else bySignature.set(sig, { students: [name], meetings });
  }

  for (const [sig, bucket] of bySignature) {
    const [first, last] = dateBounds(bucket.meetings);
    groups.push({
      key: `peserta:${sig}`,
      kind: "peserta",
      students: bucket.students.slice().sort((a, b) => a.localeCompare(b)),
      meetings: bucket.meetings,
      firstDate: first,
      lastDate: last,
      ageDays: daysSince(first, today),
      impact: bucket.students.length * bucket.meetings.length,
      severity: isKritis ? "attention" : "routine",
    });
  }

  groups.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.impact - a.impact ||
      (a.firstDate ?? "").localeCompare(b.firstDate ?? ""),
  );

  const partialMeetings = halaqah.partialMeetings.length;
  const affectedStudents = byStudent.size;
  const allDates = [
    ...halaqah.emptyMeetings.map((m) => m.date),
    ...halaqah.partialMeetings.map((m) => m.date),
  ]
    .filter((d): d is string => !!d)
    .sort();
  const oldestDate = allDates[0] ?? null;

  const severity: GapSeverity =
    groups.length > 0
      ? groups.reduce<GapSeverity>(
          (worst, g) => (SEVERITY_RANK[g.severity] < SEVERITY_RANK[worst] ? g.severity : worst),
          "routine",
        )
      : "routine";

  return {
    halaqah,
    groups,
    summary: {
      untouchedMeetings: halaqah.emptyMeetings.length,
      partialMeetings,
      affectedStudents,
      oldestDate,
      oldestAgeDays: daysSince(oldestDate, today),
    },
    severity,
    // Ranking weight for the halaqah as a whole: untouched pertemuan count
    // double (they block everyone) and half-filled ones count per peserta.
    impact:
      halaqah.emptyMeetings.length * 2 +
      groups.filter((g) => g.kind === "peserta").reduce((n, g) => n + g.impact, 0),
    isKritis,
  };
}

/**
 * All halaqah, worst first: severity, then impact, then age of the oldest
 * outstanding pertemuan. Deliberately *not* meeting order — a coordinator works
 * top-down and should meet the biggest backlog first.
 */
export function buildGapViews(
  gaps: PresensiGapHalaqah[],
  opts: { today: Date; kritisHalaqah: ReadonlySet<string> },
): HalaqahGapView[] {
  return gaps
    .map((g) =>
      buildHalaqahView(g, {
        today: opts.today,
        isKritis: !!g.halaqahName && opts.kritisHalaqah.has(g.halaqahName),
      }),
    )
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.impact - a.impact ||
        (a.summary.oldestDate ?? "9999").localeCompare(b.summary.oldestDate ?? "9999") ||
        (a.halaqah.halaqahName ?? "").localeCompare(b.halaqah.halaqahName ?? ""),
    );
}

/** Headline for one group — the single line a coordinator reads. */
export function groupTitle(g: GapGroup): string {
  const range = fmtRange(g.firstDate, g.lastDate);
  if (g.kind === "untouched") {
    return `${g.meetings.length} pertemuan belum diisi sama sekali (${range})`;
  }
  const who =
    g.students.length <= 3 ? g.students.join(", ") : `${g.students.length} peserta`;
  return `${who} — ${g.meetings.length} pertemuan tanpa presensi (${range})`;
}
