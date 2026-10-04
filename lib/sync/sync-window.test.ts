import { describe, expect, it } from "vitest";
import { decideRun, hourInJakarta, inSyncBlackout } from "./sync-window";

// All times below are WIB (UTC+7), which is the timezone every schedule in this
// repo is expressed in.
const at = (wib: string) => new Date(`2026-08-15T${wib}:00+07:00`);

describe("hourInJakarta", () => {
  it("reads the WIB hour, not the server's local hour", () => {
    expect(hourInJakarta(at("08:00"))).toBe(8);
  });

  it("handles a UTC instant that falls on the previous WIB day", () => {
    // 2026-08-15T22:30Z is 2026-08-16T05:30 WIB.
    expect(hourInJakarta(new Date("2026-08-15T22:30:00Z"))).toBe(5);
  });

  it("reads midnight WIB as hour 0, not 24", () => {
    expect(hourInJakarta(at("00:15"))).toBe(0);
  });
});

describe("inSyncBlackout", () => {
  it("is inclusive at 05:00 and exclusive at 08:00 WIB", () => {
    expect(inSyncBlackout(at("04:59"))).toBe(false);
    expect(inSyncBlackout(at("05:00"))).toBe(true);
    expect(inSyncBlackout(at("07:59"))).toBe(true);
    expect(inSyncBlackout(at("08:00"))).toBe(false);
  });

  it("reads the WIB hour, so a UTC instant in the window still counts", () => {
    // 22:30Z the previous day is 05:30 WIB.
    expect(inSyncBlackout(new Date("2026-08-14T22:30:00Z"))).toBe(true);
  });
});

describe("decideRun", () => {
  it("refuses during the DevOps quiet hours, whatever the lane says", () => {
    const d = decideRun({ now: at("06:00"), hasMeetingToday: true, minutesSinceLastRun: 999 });
    expect(d.run).toBe(false);
    expect(d.reason).toBe("blackout");
  });

  it("refuses in quiet hours even on the slow lane", () => {
    const d = decideRun({
      now: at("06:00"),
      hasMeetingToday: false,
      minutesSinceLastRun: 999,
      allowSlowLane: true,
    });
    expect(d.run).toBe(false);
    expect(d.reason).toBe("blackout");
  });

  it("opens again the moment the quiet hours end", () => {
    const d = decideRun({ now: at("08:00"), hasMeetingToday: true, minutesSinceLastRun: 20 });
    expect(d.run).toBe(true);
    expect(d.reason).toBe("in-window");
  });

  it("skips a program with no meeting today", () => {
    const d = decideRun({ now: at("08:00"), hasMeetingToday: false, minutesSinceLastRun: 999 });
    expect(d.run).toBe(false);
    expect(d.reason).toBe("no-meeting-today");
  });

  it("runs on the fast lane inside class hours", () => {
    const d = decideRun({ now: at("08:00"), hasMeetingToday: true, minutesSinceLastRun: 20 });
    expect(d.run).toBe(true);
    expect(d.reason).toBe("in-window");
  });

  it("holds inside class hours when the last run was too recent", () => {
    const d = decideRun({ now: at("08:00"), hasMeetingToday: true, minutesSinceLastRun: 5 });
    expect(d.run).toBe(false);
    expect(d.reason).toBe("too-soon");
  });

  it("drops to hourly outside class hours", () => {
    const d = decideRun({ now: at("23:30"), hasMeetingToday: true, minutesSinceLastRun: 20 });
    expect(d.run).toBe(false);
    expect(d.reason).toBe("too-soon");
  });

  it("runs outside class hours once an hour has passed", () => {
    const d = decideRun({ now: at("23:30"), hasMeetingToday: true, minutesSinceLastRun: 65 });
    expect(d.run).toBe(true);
    expect(d.reason).toBe("out-of-window");
  });

  it("treats the window as inclusive at its start and exclusive at its end", () => {
    const open = decideRun({ now: at("04:00"), hasMeetingToday: true, minutesSinceLastRun: 20 });
    expect(open.reason).toBe("in-window");
    const shut = decideRun({ now: at("22:00"), hasMeetingToday: true, minutesSinceLastRun: 20 });
    expect(shut.reason).toBe("too-soon");
  });

  it("gives a program with no class today the slow lane rather than silence", () => {
    // Skipping forever would freeze a program whose schedule changed upstream,
    // and we would never find out.
    const d = decideRun({
      now: at("08:00"),
      hasMeetingToday: false,
      minutesSinceLastRun: 999,
      allowSlowLane: true,
    });
    expect(d.run).toBe(true);
    expect(d.reason).toBe("slow-lane");
  });

  it("still holds a class-less program that ran minutes ago", () => {
    const d = decideRun({
      now: at("08:00"),
      hasMeetingToday: false,
      minutesSinceLastRun: 20,
      allowSlowLane: true,
    });
    expect(d.run).toBe(false);
    expect(d.reason).toBe("no-meeting-today");
  });
});
