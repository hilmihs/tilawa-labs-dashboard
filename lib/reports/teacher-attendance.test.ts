import { describe, expect, it } from "vitest";
import { teacherPct, clampEndToToday } from "./teacher-attendance";

describe("teacherPct", () => {
  it("returns a 0-100 percentage", () => {
    expect(teacherPct(41, 45)).toBeCloseTo(91.111, 3);
  });

  it("returns null when nothing was scheduled", () => {
    expect(teacherPct(0, 0)).toBeNull();
  });

  it("returns 0 when nothing was taught but meetings were scheduled", () => {
    expect(teacherPct(0, 12)).toBe(0);
  });
});

describe("clampEndToToday", () => {
  it("cuts an end date that runs past today", () => {
    expect(clampEndToToday("2026-09-30", "2026-09-02")).toBe("2026-09-02");
  });

  it("leaves a fully elapsed period alone", () => {
    expect(clampEndToToday("2026-08-31", "2026-09-02")).toBe("2026-08-31");
  });

  it("leaves the end alone when it is exactly today", () => {
    expect(clampEndToToday("2026-09-02", "2026-09-02")).toBe("2026-09-02");
  });
});
