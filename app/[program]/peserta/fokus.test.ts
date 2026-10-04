import { describe, expect, it } from "vitest";
import { PESERTA_FOKUS, parsePesertaFokus } from "./fokus";
import { PENGAJAR_FOKUS, parsePengajarFokus } from "../pengajar/fokus";

describe("parsePesertaFokus", () => {
  it("accepts every known fokus", () => {
    for (const f of PESERTA_FOKUS) expect(parsePesertaFokus(f)).toBe(f);
  });
  it("rejects unknown, empty, and missing values", () => {
    expect(parsePesertaFokus("apa-saja")).toBeUndefined();
    expect(parsePesertaFokus("")).toBeUndefined();
    expect(parsePesertaFokus(undefined)).toBeUndefined();
  });
  it("takes the first value when Next hands over an array", () => {
    expect(parsePesertaFokus(["keluar", "tanpa-wa"])).toBe("keluar");
    expect(parsePesertaFokus([])).toBeUndefined();
  });
});

describe("parsePengajarFokus", () => {
  it("accepts every known fokus and rejects the rest", () => {
    for (const f of PENGAJAR_FOKUS) expect(parsePengajarFokus(f)).toBe(f);
    expect(parsePengajarFokus("keluar")).toBeUndefined();
    expect(parsePengajarFokus(undefined)).toBeUndefined();
  });
});
