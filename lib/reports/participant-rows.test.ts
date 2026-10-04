/**
 * UI ↔ xlsx parity for the teacher check-in rows of the monthly participant
 * recap ("Hari efektif belajar / Terlambat / Alpa").
 *
 * The bug this locks: `getParticipantReport` returns `byJenis: []` for any scope
 * with a single meeting cadence, so buildParticipantWorkbook fell back to one
 * table stamped `jenis: null` — and then looked the check-in figures up by THAT
 * null while the segments it was drawing carried a real "yaumi". Every
 * Terlambat/Alpa cell printed "-" next to a screen showing the numbers.
 *
 * `expectedFromUi` below is the screen's own rule, transcribed from
 * ParticipantStatusTable in app/[program]/report/ReportView.tsx:
 *
 *   checkin.segments.find(
 *     (x) => x.jenis === s.jenis && x.gender === s.gender && x.level === s.level,
 *   )
 *
 * — matched on the column's own SEGMENT, never on the enclosing table. That file
 * is owned by the UI and cannot be imported here (it is a React client
 * component), so the predicate is restated rather than shared; if the screen ever
 * changes it, this test is the tripwire.
 *
 * Everything here is pure: a hand-built ParticipantReport in, an in-memory
 * workbook out. No database.
 */
import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CHECKIN_ROWS, findCheckinSegment } from "./participant-rows";
import { buildParticipantWorkbook } from "./xlsx";
import type {
  GuruCheckinBlock,
  GuruCheckinSegment,
  ParticipantReport,
  ParticipantSegment,
} from "@/lib/reports/queries";
import { genderLabel } from "@/lib/programs/config";

// ── fixtures ─────────────────────────────────────────────────────────────

function seg(
  jenis: string | null,
  gender: number | null,
  level: string | null,
  over: Partial<ParticipantSegment> = {},
): ParticipantSegment {
  return {
    jenis,
    gender,
    level,
    aktif: 10,
    tidakAktif: 0,
    dikeluarkan: 0,
    mengundurkan: 0,
    tidakAdaStatus: 0,
    total: 10,
    kehadiranPct: 100,
    teacherReal: 8,
    teacherIdeal: 8,
    teacherPct: 100,
    ...over,
  };
}

function checkinSeg(
  jenis: string | null,
  gender: number | null,
  level: string | null,
  telat: number,
  alpa: number,
): GuruCheckinSegment {
  return { jenis, gender, level, hariEfektif: telat + alpa + 5, hadir: 5, telat, izin: 0, alpa };
}

function block(segments: GuruCheckinSegment[]): GuruCheckinBlock {
  return {
    segments,
    hariTerekam: 20,
    hariEfektif: segments.reduce((n, s) => n + s.hariEfektif, 0),
    totalTelat: segments.reduce((n, s) => n + s.telat, 0),
    totalAlpa: segments.reduce((n, s) => n + s.alpa, 0),
    luarJadwal: { checkin: 0, telat: 0, izin: 0 },
  };
}

function report(over: Partial<ParticipantReport> = {}): ParticipantReport {
  return {
    programName: "Madrasah Nusantara",
    start: "2026-08-01",
    end: "2026-08-31",
    segments: [],
    byType: [],
    byJenis: [],
    total: {
      aktif: 0,
      tidakAktif: 0,
      dikeluarkan: 0,
      mengundurkan: 0,
      tidakAdaStatus: 0,
      total: 0,
      keaktifanPct: 100,
      teacherReal: 0,
      teacherIdeal: 0,
      teacherPct: null,
    },
    perBatch: [],
    guruCheckin: null,
    ...over,
  };
}

/** Only one cadence in scope → queries.ts empties byJenis. The regression case. */
const SINGLE_CADENCE = report({
  segments: [seg("yaumi", 1, "M1"), seg("yaumi", 1, "M2"), seg("yaumi", 2, "M1")],
  byJenis: [],
  guruCheckin: block([
    checkinSeg("yaumi", 1, "M1", 1, 6),
    checkinSeg("yaumi", 1, "M2", 0, 2),
    checkinSeg("yaumi", 2, "M1", 3, 0),
  ]),
});

/** Both cadences → byJenis has two entries and the sheet splits into two tables. */
const TWO_CADENCES = report({
  segments: [
    seg("yaumi", 1, "M1"),
    seg("yaumi", 2, "MA"),
    seg("usbui", 1, "M1"),
    seg("usbui", 2, "M2"),
  ],
  byJenis: [
    { jenis: "yaumi", aktif: 20, total: 20, kehadiranPct: 100, teacherReal: 16, teacherIdeal: 16, teacherPct: 100 },
    { jenis: "usbui", aktif: 20, total: 20, kehadiranPct: 100, teacherReal: 16, teacherIdeal: 16, teacherPct: 100 },
  ],
  guruCheckin: block([
    checkinSeg("yaumi", 1, "M1", 1, 6),
    checkinSeg("yaumi", 2, "MA", 0, 3),
    // Same gender × level as the yaumi row above, different cadence: the pair the
    // group-jenis lookup would have collided on.
    checkinSeg("usbui", 1, "M1", 4, 9),
    checkinSeg("usbui", 2, "M2", 2, 0),
  ]),
});

/**
 * Mabni's stragglers: enrolments with no halaqah, hence no cadence at all. The
 * check-in source cannot segment them, so both renderers must show "-".
 */
const WITH_NULL_SEGMENT = report({
  segments: [seg("yaumi", 1, "M1"), seg(null, null, null)],
  byJenis: [],
  guruCheckin: block([checkinSeg("yaumi", 1, "M1", 1, 6)]),
});

// ── reading the two renderings ───────────────────────────────────────────

/** `${block index}|${gender label}|${level}|${row label}` → cell value. */
type CheckinCells = Map<string, number | null>;

const key = (b: number, gender: string, level: string, label: string) =>
  `${b}|${gender}|${level}|${label}`;

/** The screen: one block per cadence when split, else one; columns = segments. */
function expectedFromUi(rep: ParticipantReport): CheckinCells {
  const blocks =
    rep.byJenis.length > 1
      ? rep.byJenis.map((j) => rep.segments.filter((s) => s.jenis === j.jenis))
      : [rep.segments];
  const out: CheckinCells = new Map();
  blocks.forEach((segs, b) => {
    for (const s of segs) {
      // Transcribed from ParticipantStatusTable — see the file header.
      const cs = rep.guruCheckin?.segments.find(
        (x) => x.jenis === s.jenis && x.gender === s.gender && x.level === s.level,
      );
      for (const [label, get] of CHECKIN_ROWS) {
        out.set(key(b, genderLabel(s.gender), s.level ?? "-", label), cs ? get(cs) : null);
      }
    }
  });
  return out;
}

/**
 * The sheet: walk every "No | Status Peserta" header pair, take the gender row,
 * the level row under it, and the labelled body rows down to Total. Header text
 * is upper-cased in the sheet and levels pass through `shortLevel` unchanged for
 * these fixtures, so the two keys line up.
 */
function actualFromSheet(ws: ExcelJS.Worksheet): CheckinCells {
  const out: CheckinCells = new Map();
  const labels = new Set(CHECKIN_ROWS.map(([l]) => l));
  let b = 0;
  let r = 1;
  while (r <= ws.rowCount) {
    if (String(ws.getCell(r, 2).value ?? "") !== "Status Peserta") {
      r++;
      continue;
    }
    const cols: { gender: string; level: string }[] = [];
    for (let c = 3; ; c++) {
      const level = ws.getCell(r + 1, c).value;
      if (level == null || level === "") break;
      cols.push({ gender: String(ws.getCell(r, c).value ?? ""), level: String(level) });
    }
    let rr = r + 2;
    for (;;) {
      const label = String(ws.getCell(rr, 2).value ?? "");
      if (label === "") break;
      if (labels.has(label)) {
        cols.forEach((col, i) => {
          const v = ws.getCell(rr, 3 + i).value;
          // Number or the "-" placeholder numCell writes for a missing source.
          out.set(key(b, col.gender, col.level, label), typeof v === "number" ? v : null);
        });
      }
      if (label === "Total") break;
      rr++;
    }
    b++;
    r = rr + 1;
  }
  return out;
}

/** Sheet headers shout; the screen does not. Compare on the same casing. */
function upperKeys(cells: CheckinCells): CheckinCells {
  const out: CheckinCells = new Map();
  for (const [k, v] of cells) {
    const [b, gender, level, label] = k.split("|");
    out.set(key(Number(b), gender.toUpperCase(), level.toUpperCase(), label), v);
  }
  return out;
}

function sheetOf(rep: ParticipantReport): CheckinCells {
  const ws = buildParticipantWorkbook(rep).getWorksheet("Laporan Peserta");
  if (!ws) throw new Error("sheet Laporan Peserta tidak ada");
  return actualFromSheet(ws);
}

// ── tests ────────────────────────────────────────────────────────────────

describe("findCheckinSegment", () => {
  const checkin = block([checkinSeg("yaumi", 1, "M1", 1, 6), checkinSeg("usbui", 1, "M1", 4, 9)]);

  it("keys on the segment's own jenis, not the table it sits in", () => {
    expect(findCheckinSegment(checkin, seg("usbui", 1, "M1"))?.alpa).toBe(9);
    expect(findCheckinSegment(checkin, seg("yaumi", 1, "M1"))?.alpa).toBe(6);
  });

  it("returns undefined — not zero — when the source has no row for a column", () => {
    expect(findCheckinSegment(checkin, seg("yaumi", 2, "MA"))).toBeUndefined();
    expect(findCheckinSegment(null, seg("yaumi", 1, "M1"))).toBeUndefined();
    expect(findCheckinSegment(checkin, undefined)).toBeUndefined();
  });
});

describe("check-in rows: sheet matches screen", () => {
  const cases: [string, ParticipantReport][] = [
    ["single cadence (byJenis empty)", SINGLE_CADENCE],
    ["two cadences (byJenis split)", TWO_CADENCES],
    ["segment without a cadence", WITH_NULL_SEGMENT],
  ];

  for (const [name, rep] of cases) {
    it(name, () => {
      const expected = upperKeys(expectedFromUi(rep));
      const actual = sheetOf(rep);
      expect(actual.size).toBe(expected.size);
      expect(Object.fromEntries([...actual].sort())).toEqual(
        Object.fromEntries([...expected].sort()),
      );
    });
  }

  it("prints the numbers, not '-', for a single-cadence report (the reported bug)", () => {
    const cells = sheetOf(SINGLE_CADENCE);
    expect(cells.get(key(0, "IKHWAN", "M1", "Terlambat"))).toBe(1);
    expect(cells.get(key(0, "IKHWAN", "M1", "Alpa"))).toBe(6);
    expect(cells.get(key(0, "AKHWAT", "M1", "Terlambat"))).toBe(3);
  });

  it("keeps the two cadences apart when they share a gender × level", () => {
    const cells = sheetOf(TWO_CADENCES);
    expect(cells.get(key(0, "IKHWAN", "M1", "Alpa"))).toBe(6); // yaumi
    expect(cells.get(key(1, "IKHWAN", "M1", "Alpa"))).toBe(9); // usbu'iy
  });

  it("leaves a column with no check-in source empty in both renderings", () => {
    expect(sheetOf(WITH_NULL_SEGMENT).get(key(0, "-", "-", "Alpa"))).toBeNull();
  });

  it("writes no check-in rows at all when the program has no check-in source", () => {
    const cells = sheetOf(report({ segments: [seg("yaumi", 1, "M1")], guruCheckin: null }));
    expect(cells.size).toBe(0);
  });
});
