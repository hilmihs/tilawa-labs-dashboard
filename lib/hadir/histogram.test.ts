import { describe, expect, it } from "vitest";
import { susunHistogram } from "./histogram";

describe("susunHistogram", () => {
  it("fills gaps, marks zones, and places the start line", () => {
    const h = susunHistogram(
      [{ jam: "19:10", jumlah: 4 }, { jam: "19:30", jumlah: 10 }, { jam: "20:00", jumlah: 2 }],
      "19:30:00",
      15,
    );
    expect(h.bins.map((b) => `${b.jam}:${b.jumlah}:${b.zona}`)).toEqual([
      "19:10:4:awal",
      "19:20:0:awal",
      "19:30:10:toleransi",
      "19:40:0:toleransi",
      "19:50:0:terlambat",
      "20:00:2:terlambat",
    ]);
    expect(h.posisiMulai).toBeCloseTo(20 / 60);
    expect(h.lebarToleransi).toBeCloseTo(15 / 60);
  });

  it("works without a start time and with no arrivals", () => {
    expect(susunHistogram([], "19:30", 15)).toEqual({ bins: [], posisiMulai: null, lebarToleransi: 0 });
    const h = susunHistogram([{ jam: "08:00", jumlah: 1 }], null, 15);
    expect(h).toMatchObject({ posisiMulai: null, bins: [{ jam: "08:00", jumlah: 1, zona: "awal" }] });
  });
});
