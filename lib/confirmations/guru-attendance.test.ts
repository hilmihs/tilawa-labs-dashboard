import { describe, expect, it } from "vitest";
import {
  computeGuruCheckin,
  computeGuruCheckinOutside,
  foldGuruAttendance,
  type GuruAttendanceRow,
} from "./guru-attendance";

const rows: GuruAttendanceRow[] = [
  { guruId: 26, status: "hadir" },
  { guruId: 26, status: "hadir" },
  { guruId: 26, status: "terlambat" },
  { guruId: 23, status: "izin" },
  { guruId: 23, status: "hadir" },
  { guruId: 99, status: "unknown" }, // unrecognised status is ignored
];

describe("foldGuruAttendance", () => {
  it("counts hadir/telat/izin per guru", () => {
    const m = foldGuruAttendance(rows);
    expect(m.get(26)).toEqual({ hadir: 2, telat: 1, izin: 0 });
    expect(m.get(23)).toEqual({ hadir: 1, telat: 0, izin: 1 });
  });

  it("leaves guru with no rows absent from the map", () => {
    expect(foldGuruAttendance(rows).has(1)).toBe(false);
  });

  it("ignores rows with a null guruId or unrecognised status", () => {
    const m = foldGuruAttendance([
      { guruId: null, status: "hadir" },
      { guruId: 99, status: "unknown" },
    ]);
    expect(m.has(99)).toEqual(true);
    expect(m.get(99)).toEqual({ hadir: 0, telat: 0, izin: 0 });
    expect(m.has(null as unknown as number)).toBe(false);
  });
});

describe("computeGuruCheckin", () => {
  const recordedDates = ["2026-08-03", "2026-08-04", "2026-08-05"];

  it("counts hadir/telat/izin and alpa over the dates a guru was scheduled", () => {
    const m = computeGuruCheckin({
      recordedDates,
      scheduled: [
        { guruId: 26, date: "2026-08-03" },
        { guruId: 26, date: "2026-08-04" },
        { guruId: 26, date: "2026-08-05" },
      ],
      checkins: [
        { guruId: 26, date: "2026-08-03", status: "hadir" },
        { guruId: 26, date: "2026-08-04", status: "terlambat" },
      ],
    });
    expect(m.get(26)).toEqual({ hariEfektif: 3, hadir: 1, telat: 1, izin: 0, alpa: 1 });
  });

  it("ignores scheduled dates upstream never recorded, so a stalled sync is not mass absence", () => {
    const m = computeGuruCheckin({
      recordedDates: ["2026-08-03"],
      scheduled: [
        { guruId: 7, date: "2026-08-03" },
        { guruId: 7, date: "2026-08-25" }, // after the sync stopped
      ],
      checkins: [{ guruId: 7, date: "2026-08-03", status: "hadir" }],
    });
    expect(m.get(7)).toEqual({ hariEfektif: 1, hadir: 1, telat: 0, izin: 0, alpa: 0 });
  });

  it("counts a duplicated check-in for one date once, strongest status first", () => {
    const m = computeGuruCheckin({
      recordedDates: ["2026-08-03"],
      scheduled: [{ guruId: 9, date: "2026-08-03" }],
      checkins: [
        { guruId: 9, date: "2026-08-03", status: "izin" },
        { guruId: 9, date: "2026-08-03", status: "hadir" },
      ],
    });
    expect(m.get(9)).toEqual({ hariEfektif: 1, hadir: 1, telat: 0, izin: 0, alpa: 0 });
  });

  it("counts a duplicated scheduled date once", () => {
    const m = computeGuruCheckin({
      recordedDates: ["2026-08-03"],
      scheduled: [
        { guruId: 9, date: "2026-08-03" },
        { guruId: 9, date: "2026-08-03" },
      ],
      checkins: [],
    });
    expect(m.get(9)).toEqual({ hariEfektif: 1, hadir: 0, telat: 0, izin: 0, alpa: 1 });
  });

  it("ignores check-ins on dates the guru was not scheduled", () => {
    const m = computeGuruCheckin({
      recordedDates,
      scheduled: [{ guruId: 3, date: "2026-08-03" }],
      checkins: [
        { guruId: 3, date: "2026-08-03", status: "hadir" },
        { guruId: 3, date: "2026-08-04", status: "hadir" },
      ],
    });
    expect(m.get(3)).toEqual({ hariEfektif: 1, hadir: 1, telat: 0, izin: 0, alpa: 0 });
  });

  it("leaves a guru with no scheduled meetings out of the map", () => {
    const m = computeGuruCheckin({
      recordedDates,
      scheduled: [],
      checkins: [{ guruId: 5, date: "2026-08-03", status: "hadir" }],
    });
    expect(m.has(5)).toBe(false);
  });
});

describe("computeGuruCheckinOutside", () => {
  const recordedDates = ["2026-08-03", "2026-08-04", "2026-08-05"];

  it("counts the check-ins of a guru who holds no meeting at all", () => {
    expect(
      computeGuruCheckinOutside({
        recordedDates,
        scheduled: [],
        checkins: [
          { guruId: 27, date: "2026-08-03", status: "terlambat" },
          { guruId: 29, date: "2026-08-04", status: "izin" },
          { guruId: 31, date: "2026-08-05", status: "hadir" },
        ],
      }),
    ).toEqual({ checkin: 3, telat: 1, izin: 1 });
  });

  it("counts only the days a scheduled guru was NOT scheduled on", () => {
    expect(
      computeGuruCheckinOutside({
        recordedDates,
        scheduled: [{ guruId: 26, date: "2026-08-03" }],
        checkins: [
          { guruId: 26, date: "2026-08-03", status: "terlambat" }, // counted by computeGuruCheckin
          { guruId: 26, date: "2026-08-04", status: "terlambat" },
        ],
      }),
    ).toEqual({ checkin: 1, telat: 1, izin: 0 });
  });

  it("ignores check-ins on dates outside the recorded window", () => {
    expect(
      computeGuruCheckinOutside({
        recordedDates: ["2026-08-03"],
        scheduled: [],
        checkins: [
          { guruId: 27, date: "2026-08-03", status: "izin" },
          { guruId: 27, date: "2026-08-25", status: "izin" },
        ],
      }),
    ).toEqual({ checkin: 1, telat: 0, izin: 1 });
  });

  it("counts a duplicated check-in for one date once, strongest status first", () => {
    expect(
      computeGuruCheckinOutside({
        recordedDates: ["2026-08-03"],
        scheduled: [],
        checkins: [
          { guruId: 27, date: "2026-08-03", status: "izin" },
          { guruId: 27, date: "2026-08-03", status: "terlambat" },
        ],
      }),
    ).toEqual({ checkin: 1, telat: 1, izin: 0 });
  });

  it("returns zeroes when every check-in lands on a scheduled day", () => {
    expect(
      computeGuruCheckinOutside({
        recordedDates,
        scheduled: [{ guruId: 26, date: "2026-08-03" }],
        checkins: [{ guruId: 26, date: "2026-08-03", status: "hadir" }],
      }),
    ).toEqual({ checkin: 0, telat: 0, izin: 0 });
  });
});
