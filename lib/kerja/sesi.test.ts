import { describe, expect, it } from "vitest";
import { batasValid, jamTitik, jamWibDari, sesiDari, sesiDariJam, waktuTepercaya } from "./sesi";

describe("sesiDariJam", () => {
  it("maps wall-clock times onto the three logbook sessions", () => {
    expect(sesiDariJam("04:59")).toBeNull();
    expect(sesiDariJam("05:00")).toBe("pagi");
    expect(sesiDariJam("10:59")).toBe("pagi");
    expect(sesiDariJam("11:00")).toBe("siang");
    expect(sesiDariJam("15:00")).toBe("sore");
    expect(sesiDariJam("21:59")).toBe("sore");
    expect(sesiDariJam("22:00")).toBeNull();
  });
  it("honours custom bounds", () => {
    expect(sesiDariJam("12:30", { pagiMulai: "06:00", siangMulai: "13:00", soreMulai: "16:00", selesai: "20:00" })).toBe("pagi");
  });
});

describe("time helpers", () => {
  it("reads Jakarta wall-clock time", () => {
    expect(jamWibDari(new Date("2026-09-29T01:05:00Z"))).toBe("08:05");
    expect(sesiDari(new Date("2026-09-29T09:00:00Z"))).toBe("sore");
    expect(jamTitik("16:00")).toBe("16.00");
  });
  it("trusts the device clock only within bounds", () => {
    const now = new Date("2026-09-29T09:00:00Z");
    expect(waktuTepercaya("2026-09-29T08:30:00Z", now).toISOString()).toBe("2026-09-29T08:30:00.000Z");
    expect(waktuTepercaya("2026-09-29T10:00:00Z", now)).toBe(now);
    expect(waktuTepercaya("2026-09-20T08:30:00Z", now)).toBe(now);
    expect(waktuTepercaya("bukan tanggal", now)).toBe(now);
  });
  it("validates bounds", () => {
    expect(batasValid({ pagiMulai: "05:00", siangMulai: "11:00", soreMulai: "15:00", selesai: "22:00" })).toBe(true);
    expect(batasValid({ pagiMulai: "05:00", siangMulai: "15:00", soreMulai: "11:00", selesai: "22:00" })).toBe(false);
    expect(batasValid({ pagiMulai: "5:00", siangMulai: "11:00", soreMulai: "15:00", selesai: "22:00" })).toBe(false);
  });
});
