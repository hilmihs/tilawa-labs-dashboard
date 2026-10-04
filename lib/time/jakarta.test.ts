import { describe, expect, it } from "vitest";
import { addDaysISO, diffDaysISO } from "./jakarta";

describe("diffDaysISO", () => {
  it("is a − b in whole days, signed", () => {
    expect(diffDaysISO("2026-09-20", "2026-09-10")).toBe(10);
    expect(diffDaysISO("2026-09-10", "2026-09-20")).toBe(-10);
    expect(diffDaysISO("2026-09-10", "2026-09-10")).toBe(0);
  });
  it("crosses month, year and leap-day boundaries", () => {
    expect(diffDaysISO("2027-01-01", "2026-12-31")).toBe(1);
    expect(diffDaysISO("2028-03-01", "2028-02-28")).toBe(2);
    expect(diffDaysISO("2027-03-01", "2027-02-28")).toBe(1);
  });
  it("inverts addDaysISO", () => {
    expect(diffDaysISO(addDaysISO("2026-08-14", 45), "2026-08-14")).toBe(45);
  });
});
