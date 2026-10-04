import { describe, expect, it } from "vitest";
import { indeksHari, jamMulai, labelBatchPendek, pctLabel, statusOf } from "./format";

describe("statusOf", () => {
  it("memetakan kehadiran ke sehat/pantau/kritis terhadap ambang", () => {
    expect(statusOf(75, 75)).toBe("sehat");
    expect(statusOf(65, 75)).toBe("pantau");
    expect(statusOf(64.9, 75)).toBe("kritis");
    expect(statusOf(null, 75)).toBe("idle");
  });
});

describe("pembacaan jadwal", () => {
  it("mengenali ejaan hari", () => {
    expect(["Senin", "Jum'at", "Ahad", "Minggu", "x"].map(indeksHari)).toEqual([0, 4, 6, 6, null]);
  });
  it("mengambil jam mulai sesi, 00:00 dianggap kosong", () => {
    expect(jamMulai("20:00 - 21:30")).toBe("20:00");
    expect(jamMulai("7.30-9.00")).toBe("07:30");
    expect(jamMulai("00:00")).toBeNull();
    expect(jamMulai(null)).toBeNull();
  });
});

describe("label", () => {
  it("memendekkan label batch dan persen", () => {
    expect(labelBatchPendek("Januari 2026")).toBe("Jan '26");
    expect(labelBatchPendek("LAZ #40")).toBe("LAZ #40");
    expect(pctLabel(82.44)).toBe("82,4%");
    expect(pctLabel(null)).toBe("—");
  });
});
