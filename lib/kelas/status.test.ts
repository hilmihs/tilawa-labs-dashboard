import { describe, expect, it } from "vitest";
import { masihAktif, rentangPeriode, statusDariRentang } from "./status";

describe("rentangPeriode", () => {
  it("reads English and Indonesian month ranges", () => {
    expect(rentangPeriode("July 2026 - March 2027")).toEqual({ awal: "2026-07-01", akhir: "2027-03-31" });
    expect(rentangPeriode("Februari 2028 – Agustus 2028")).toEqual({ awal: "2028-02-01", akhir: "2028-08-31" });
    expect(rentangPeriode("Batch 2026")).toBeNull();
  });
});

describe("statusDariRentang", () => {
  it("classifies by the last and first meeting", () => {
    expect(statusDariRentang({ awal: "2026-07-20", akhir: "2026-09-15" }, "2026-09-29")).toBe("selesai");
    expect(statusDariRentang({ awal: "2026-07-20", akhir: "2026-09-29" }, "2026-09-29")).toBe("berjalan");
    expect(statusDariRentang({ awal: "2026-10-05", akhir: "2026-12-20" }, "2026-09-29")).toBe("belum_mulai");
    expect(statusDariRentang(null, "2026-09-29")).toBe("berjalan");
  });

  it("keeps a person active while any class is not finished", () => {
    expect(masihAktif(["selesai", "berjalan"])).toBe(true);
    expect(masihAktif(["selesai", "belum_mulai"])).toBe(true);
    expect(masihAktif(["selesai"])).toBe(false);
  });
});
