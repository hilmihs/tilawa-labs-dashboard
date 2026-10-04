import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRESENSI_LOCK_AT,
  RECAP_PERIOD,
  cycleFor,
  isPresensiLocked,
  lockLabel,
  periodLabel,
} from "./period";

/** Inside the 16 Jul – 15 Agu 2026 window, the one these tests describe. */
const IN_JULY_WINDOW = "2026-08-10T03:00:00Z";

// The module reads its env overrides once, at import time, so every env case
// below stubs the variable, drops the module cache and re-imports.
async function importWithEnv(env: Record<string, string>) {
  // Pinned for the same reason as importAt: a malformed override falls back to
  // the CURRENT window, so "what does it fall back to" only has a fixed answer
  // if the clock has one.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(IN_JULY_WINDOW));
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const m = await import("./period");
  vi.useRealTimers();
  return m;
}

/**
 * Import the module with the clock pinned.
 *
 * Its defaults come from cycleFor() at IMPORT time, so any test asserting "the
 * default window" is really asserting "the window that is current while the
 * test runs". Four of them broke on 18 Aug 2026 — not because the code changed,
 * but because the window rolled to 16 Agu–15 Sep exactly as designed. Pinning
 * the instant is what makes the assertion mean the thing it claims.
 */
async function importAt(instant: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
  vi.resetModules();
  const m = await import("./period");
  vi.useRealTimers();
  return m;
}



afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("cycleFor — the window repeats every month", () => {
  it("on blast day (the 16th) still means the window that just closed", () => {
    expect(cycleFor(new Date("2026-08-16T03:00:00Z"))).toEqual({
      start: "2026-07-16",
      end: "2026-08-15",
      lockAt: "2026-08-17T18:00:00+07:00",
    });
  });

  it("rolls to the next window only after the lock day", () => {
    expect(cycleFor(new Date("2026-08-17T03:00:00Z")).end).toBe("2026-08-15");
    expect(cycleFor(new Date("2026-08-18T03:00:00Z"))).toEqual({
      start: "2026-08-16",
      end: "2026-09-15",
      lockAt: "2026-09-17T18:00:00+07:00",
    });
  });

  it("before the 16th the window is still the one closing this month", () => {
    expect(cycleFor(new Date("2026-08-15T03:00:00Z"))).toEqual({
      start: "2026-07-16",
      end: "2026-08-15",
      lockAt: "2026-08-17T18:00:00+07:00",
    });
  });

  it("rolls the year over in December", () => {
    expect(cycleFor(new Date("2026-12-20T03:00:00Z"))).toEqual({
      start: "2026-12-16",
      end: "2027-01-15",
      lockAt: "2027-01-17T18:00:00+07:00",
    });
  });

  it("decides the month in WIB, not in the container's UTC", () => {
    // 15 Agu 23.00 WIB is still 15 Agu 16.00 UTC — same day either way.
    // 16 Agu 00.30 WIB is 15 Agu 17.30 UTC: only the WIB reading opens the new window.
    // 17 Agu 23.30 WIB is 17 Agu 16.30 UTC (still the 17th → closed window);
    // 18 Agu 00.30 WIB is 17 Agu 17.30 UTC — only the WIB reading rolls forward.
    expect(cycleFor(new Date("2026-08-17T17:30:00Z")).end).toBe("2026-09-15");
    expect(cycleFor(new Date("2026-08-17T16:30:00Z")).end).toBe("2026-08-15");
  });

  it("keeps the exported constants consistent with each other", () => {
    expect(PRESENSI_LOCK_AT.slice(0, 7)).toBe(RECAP_PERIOD.end.slice(0, 7));
    expect(PRESENSI_LOCK_AT).toContain("T18:00:00+07:00");
    expect(RECAP_PERIOD.start.endsWith("-16")).toBe(true);
    expect(RECAP_PERIOD.end.endsWith("-15")).toBe(true);
  });
});

describe("isPresensiLocked", () => {
  // Deadline of the 16 Jul – 15 Agu window: 2026-08-17T18:00+07:00 = 11:00Z.
  it("is open one second before the deadline", async () => {
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.isPresensiLocked(new Date("2026-08-17T17:59:59+07:00"))).toBe(false);
  });

  it("is locked exactly at the deadline", async () => {
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.isPresensiLocked(new Date("2026-08-17T18:00:00+07:00"))).toBe(true);
  });

  it("is locked one second after the deadline", async () => {
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.isPresensiLocked(new Date("2026-08-17T18:00:01+07:00"))).toBe(true);
  });

  it("judges a UTC instant against the +07:00 deadline, not against its own clock", async () => {
    // Same wall-clock number, different meaning: 16:00Z is 23:00 WIB (locked),
    // while 08:59Z is still 15:59 WIB (open).
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.isPresensiLocked(new Date("2026-08-17T10:59:00Z"))).toBe(false);
    expect(m.isPresensiLocked(new Date("2026-08-17T11:00:00Z"))).toBe(true);
    expect(m.isPresensiLocked(new Date("2026-08-17T16:00:00Z"))).toBe(true);
  });

  it("treats a day before the deadline as open even late at night UTC", async () => {
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.isPresensiLocked(new Date("2026-08-16T23:59:00Z"))).toBe(false);
  });

  // The deadline is not a constant: it follows the window forward.
  it("moves with the window into the next month", async () => {
    const m = await importAt("2026-09-10T03:00:00Z");
    expect(m.isPresensiLocked(new Date("2026-09-17T17:59:59+07:00"))).toBe(false);
    expect(m.isPresensiLocked(new Date("2026-09-17T18:00:00+07:00"))).toBe(true);
  });
});

describe("periodLabel", () => {
  it("labels the default window", async () => {
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.periodLabel()).toBe("16 Juli – 15 Agustus 2026");
  });

  it("prints the month once when both ends share it", () => {
    expect(periodLabel("2026-07-01", "2026-07-31")).toBe("1 – 31 Juli 2026");
  });

  it("prints both years when the window crosses new year", () => {
    expect(periodLabel("2025-12-16", "2026-01-15")).toBe("16 Desember 2025 – 15 Januari 2026");
  });

  it("uses Indonesian month names without relying on Intl", () => {
    expect(periodLabel("2026-01-01", "2026-12-31")).toBe("1 Januari – 31 Desember 2026");
  });

  it("falls back to the configured period when given a malformed date", async () => {
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.periodLabel("bukan-tanggal", "2026-08-15")).toBe("16 Juli – 15 Agustus 2026");
  });
});

describe("lockLabel", () => {
  it("labels the default deadline in WIB", async () => {
    const m = await importAt(IN_JULY_WINDOW);
    expect(m.lockLabel()).toBe("17 Agustus 2026 pukul 18.00 WIB");
  });
});

describe("env overrides", () => {
  it("accepts well-formed overrides", async () => {
    const m = await importWithEnv({
      RECAP_PERIOD_START: "2026-09-16",
      RECAP_PERIOD_END: "2026-10-15",
      PRESENSI_LOCK_AT: "2026-10-17T18:00:00+07:00",
    });
    expect(m.RECAP_PERIOD).toEqual({ start: "2026-09-16", end: "2026-10-15" });
    expect(m.periodLabel()).toBe("16 September – 15 Oktober 2026");
    expect(m.lockLabel()).toBe("17 Oktober 2026 pukul 18.00 WIB");
  });

  it("ignores dates in the wrong shape", async () => {
    const m = await importWithEnv({
      RECAP_PERIOD_START: "16-07-2026",
      RECAP_PERIOD_END: "2026/08/15",
    });
    expect(m.RECAP_PERIOD).toEqual({ start: "2026-07-16", end: "2026-08-15" });
  });

  it("ignores a date that matches the shape but is not a real day", async () => {
    const m = await importWithEnv({ RECAP_PERIOD_END: "2026-02-31" });
    expect(m.RECAP_PERIOD.end).toBe("2026-08-15");
  });

  it("ignores a blank or whitespace-only override", async () => {
    const m = await importWithEnv({ RECAP_PERIOD_START: "   " });
    expect(m.RECAP_PERIOD.start).toBe("2026-07-16");
  });

  it("ignores a lock timestamp with no UTC offset, which would shift the deadline", async () => {
    const m = await importWithEnv({ PRESENSI_LOCK_AT: "2026-08-17T16:00:00" });
    expect(m.PRESENSI_LOCK_AT).toBe("2026-08-17T18:00:00+07:00");
    expect(m.isPresensiLocked(new Date("2026-08-17T11:00:00Z"))).toBe(true);
  });

  it("ignores an unparseable lock timestamp", async () => {
    const m = await importWithEnv({ PRESENSI_LOCK_AT: "besok sore" });
    expect(m.PRESENSI_LOCK_AT).toBe("2026-08-17T18:00:00+07:00");
  });

  it("accepts a lock timestamp written in UTC", async () => {
    const m = await importWithEnv({ PRESENSI_LOCK_AT: "2026-08-17T11:00:00Z" });
    expect(m.lockLabel()).toBe("17 Agustus 2026 pukul 18.00 WIB");
    expect(m.isPresensiLocked(new Date("2026-08-17T08:59:59Z"))).toBe(false);
  });
});
