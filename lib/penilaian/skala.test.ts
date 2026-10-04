import { describe, expect, it } from "vitest";
import { butuhEvidence, hurufDariRata, isNilai, median, saranTepatWaktu } from "./skala";

const acara = { tanggal: "2026-09-26", jamMulai: "08:00:00", toleransiMenit: 15 };

describe("saranTepatWaktu", () => {
  it("B when scanned before start + tolerance", () => {
    expect(saranTepatWaktu("2026-09-26T08:10:00+07:00", acara)).toBe("B");
    expect(saranTepatWaktu("2026-09-26T08:15:00+07:00", acara)).toBe("B");
  });
  it("C up to 15 minutes past the threshold, D beyond", () => {
    expect(saranTepatWaktu("2026-09-26T08:25:00+07:00", acara)).toBe("C");
    expect(saranTepatWaktu("2026-09-26T08:30:00+07:00", acara)).toBe("C");
    expect(saranTepatWaktu("2026-09-26T08:31:00+07:00", acara)).toBe("D");
  });
  it("no suggestion without a scan or without a start time", () => {
    expect(saranTepatWaktu(null, acara)).toBeNull();
    expect(saranTepatWaktu("2026-09-26T08:10:00+07:00", { ...acara, jamMulai: null })).toBeNull();
  });
});

describe("skala", () => {
  it("maps averages back to letters with the proposed cut-offs", () => {
    expect(hurufDariRata(3.25)).toBe("B");
    expect(hurufDariRata(3.2)).toBe("C");
    expect(hurufDariRata(1.75)).toBe("D");
    expect(hurufDariRata(1.7)).toBe("E");
  });
  it("median of odd and even lists", () => {
    expect(median([4, 1, 3])).toBe(3);
    expect(median([4, 2])).toBe(3);
    expect(median([])).toBeNull();
  });
  it("D/E need evidence; guards the letter set", () => {
    expect(butuhEvidence(["B", "C"])).toBe(false);
    expect(butuhEvidence(["B", "D"])).toBe(true);
    expect(isNilai("E")).toBe(true);
    expect(isNilai("A")).toBe(false);
  });
});
