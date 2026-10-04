import { describe, expect, it } from "vitest";
import { genderHalaqah, jamHalaqah, pilihHalaqah, type HalaqahRow } from "./halaqah";

const row = (programSlug: string, name: string, type: string, ikhwan = 0, akhwat = 0): HalaqahRow => ({
  programSlug,
  name,
  type,
  ikhwan,
  akhwat,
});

describe("genderHalaqah", () => {
  it("trusts the name keyword over the roster", () => {
    expect(genderHalaqah(row("hits-regular", "HITS 059 IKHWAN", "online", 0, 3))).toBe(1);
    expect(genderHalaqah(row("hits-safar", "SAFAR AKHWAT 2026 05", "online"))).toBe(2);
  });
  it("falls back to the roster majority when the name is silent", () => {
    expect(genderHalaqah(row("hits-nurul-iman", "HITS NURIM 00147 01", "offline", 0, 6))).toBe(2);
    expect(genderHalaqah(row("tahfizh-nurul-iman", "TAHFIZH NURIM 01", "offline", 5, 0))).toBe(1);
  });
  it("is null when neither decides", () => {
    expect(genderHalaqah(row("hits-ortu-abk", "Halaqah 1", "online", 2, 2))).toBeNull();
    expect(genderHalaqah(row("x", "Ikhwan & Akhwat", "online"))).toBeNull();
  });
});

describe("pilihHalaqah", () => {
  const rows = [
    row("hits-regular", "HITS 01 IKHWAN", "offline"),
    row("hits-regular", "HITS 02 AKHWAT", "online"),
    row("hits-regular", "HITS 03 AKHWAT", "offline"),
    row("dpq", "DPQ AKHWAT 01", "hybrid"),
  ];
  it("splits by mode and gender", () => {
    expect(pilihHalaqah(rows, { type: "offline", gender: 2 }).map((r) => r.name)).toEqual(["HITS 03 AKHWAT"]);
    expect(pilihHalaqah(rows, { type: "online" })).toHaveLength(1);
    expect(pilihHalaqah(rows, {})).toHaveLength(4);
  });
  it("throws instead of dropping a halaqah of unknown gender", () => {
    expect(() => pilihHalaqah([row("hits-ortu-abk", "Halaqah 1", "online")], { gender: 1 })).toThrow(/tidak bisa ditentukan/);
  });
});

describe("jamHalaqah", () => {
  it("uses the per-program hours, else the default", () => {
    const rows = [
      row("hits-safar", "SAFAR IKHWAN 02", "offline"),
      row("hits-ortu-abk", "Halaqah 1", "online"),
      row("hits-nurul-iman", "HITS NURIM IKHWAN 01", "offline"),
    ];
    expect(jamHalaqah(rows, 3, { "hits-ortu-abk": 1, "hits-nurul-iman": 0.75 })).toBe(4.75);
  });
});
