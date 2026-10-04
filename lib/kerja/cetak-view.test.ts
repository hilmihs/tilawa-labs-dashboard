import { describe, expect, it } from "vitest";
import {
  bacaParamCetak,
  bagiRata,
  geserBulan,
  hrefCetak,
  kepalaTgl,
  labelBulanTahun,
  susunLembar,
  tanggalValid,
} from "./cetak-view";
import { hariDalamBulan, susunLogbook } from "./logbook";

describe("bacaParamCetak", () => {
  it("defaults to the current Jakarta month", () => {
    const p = bacaParamCetak({}, "2026-09-29");
    expect(p.bulan).toBe("2026-09");
    expect(p.hari).toHaveLength(30);
    expect(p.rentang).toBeNull();
    expect(p.kosong).toBe(false);
  });
  it("reads ?bulan and ?kosong, ignoring garbage", () => {
    expect(bacaParamCetak({ bulan: "2026-02", kosong: "1" }, "2026-09-29")).toMatchObject({ bulan: "2026-02", kosong: true });
    expect(bacaParamCetak({ bulan: "2026-02" }, "2026-09-29").hari.at(-1)).toBe("2026-02-28");
    expect(bacaParamCetak({ bulan: "2026-13" }, "2026-09-29").bulan).toBe("2026-09");
  });
  it("prefers a valid ?dari&sampai range, capped", () => {
    const p = bacaParamCetak({ bulan: "2026-01", dari: "2026-09-28", sampai: "2026-10-03" }, "2026-09-29");
    expect(p.hari).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(p.bulan).toBe("2026-09");
    const panjang = bacaParamCetak({ dari: "2026-01-01", sampai: "2026-12-31" }, "2026-09-29");
    expect(panjang.hari).toHaveLength(93);
    expect(panjang.rentang?.sampai).toBe(panjang.hari.at(-1));
  });
  it("falls back to the month when the range is incomplete or reversed", () => {
    expect(bacaParamCetak({ dari: "2026-09-10" }, "2026-09-29").rentang).toBeNull();
    expect(bacaParamCetak({ dari: "2026-09-10", sampai: "2026-09-01" }, "2026-09-29").rentang).toBeNull();
    expect(bacaParamCetak({ dari: "2026-02-30", sampai: "2026-03-02" }, "2026-09-29").rentang).toBeNull();
  });
});

describe("helpers", () => {
  it("validates real calendar dates", () => {
    expect(tanggalValid("2026-09-29")).toBe(true);
    expect(tanggalValid("2026-02-29")).toBe(false);
    expect(tanggalValid("2026-9-29")).toBe(false);
  });
  it("shifts months across years", () => {
    expect(geserBulan("2026-01", -1)).toBe("2025-12");
    expect(geserBulan("2026-12", 1)).toBe("2027-01");
    expect(geserBulan("2026-09", 0)).toBe("2026-09");
  });
  it("labels the Bulan/Tahun field", () => {
    expect(labelBulanTahun(["2026-09-26", "2026-09-30", null])).toBe("September 2026");
    expect(labelBulanTahun(["2026-09-30", "2026-10-01"])).toBe("September – Oktober 2026");
    expect(labelBulanTahun(["2026-12-31", "2027-01-01"])).toBe("Desember 2026 – Januari 2027");
    expect(labelBulanTahun([null])).toBe("");
  });
  it("gives the day number and short weekday", () => {
    expect(kepalaTgl("2026-09-29")).toEqual({ tgl: 29, hari: "Sel" });
    expect(kepalaTgl("2026-09-27")).toEqual({ tgl: 27, hari: "Ahad" });
  });
  it("splits rows evenly", () => {
    expect(bagiRata([...Array(19).keys()], 14).map((x) => x.length)).toEqual([10, 9]);
    expect(bagiRata([...Array(14).keys()], 14).map((x) => x.length)).toEqual([14]);
    expect(bagiRata([], 14)).toEqual([]);
  });
  it("keeps the range or month in links", () => {
    expect(hrefCetak({ bulan: "2026-09", kosong: true })).toBe("/operating-office/kehadiran/cetak?bulan=2026-09&kosong=1");
    expect(hrefCetak({ bulan: "2026-09", rentang: { dari: "2026-09-01", sampai: "2026-09-05" } })).toBe(
      "/operating-office/kehadiran/cetak?dari=2026-09-01&sampai=2026-09-05",
    );
  });
});

describe("susunLembar", () => {
  const w = (iso: string) => new Date(iso);
  const anggota = [
    ...Array.from({ length: 19 }, (_, i) => ({ orangId: `l${i}`, nama: `Ikhwan ${i}`, gender: "L" })),
    { orangId: "p0", nama: "Akhwat 0", gender: "P" },
  ];
  const hadir = [
    { orangId: "l0", tanggal: "2026-09-01", sesi: "pagi", waktu: w("2026-09-01T00:15:00Z"), sumber: "qr" },
    { orangId: "p0", tanggal: "2026-09-30", sesi: "sore", waktu: w("2026-09-30T09:05:00Z"), sumber: "manual" },
  ];
  const lb = susunLogbook(anggota, hadir, hariDalamBulan("2026-09"));
  const lembar = susunLembar(lb);

  it("makes one sheet per 5-day chunk per row chunk per gender block", () => {
    // 19 ikhwan muat satu lembar seperti kertasnya: Ikhwan 6 potong tanggal, Akhwat 6.
    expect(lembar).toHaveLength(12);
    expect(lembar.slice(0, 6).every((l) => l.blok === "IKHWAN")).toBe(true);
    expect(lembar.slice(6).every((l) => l.blok === "AKHWAT")).toBe(true);
    expect(lembar[0].hari).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(lembar[0].baris.at(-1)?.no).toBe(19);
    expect(new Set(lembar.map((l) => l.kunci)).size).toBe(lembar.length);
  });
  it("pads the last chunk to five date columns", () => {
    const lb31 = susunLogbook(anggota, [], hariDalamBulan("2026-10"));
    const akhir = susunLembar(lb31).find((l) => l.blok === "AKHWAT" && l.hari[0] === "2026-10-31");
    expect(akhir?.hari).toEqual(["2026-10-31", null, null, null, null]);
  });
  it("flags sheets holding manual entries", () => {
    const akhwatAkhir = lembar.find((l) => l.blok === "AKHWAT" && l.hari[0] === "2026-09-26");
    expect(akhwatAkhir?.adaManual).toBe(true);
    expect(akhwatAkhir?.baris[0].sel["2026-09-30"].sore?.jam).toBe("16.05");
    expect(lembar[0].adaManual).toBe(false);
  });
  it("skips an empty gender block", () => {
    const hanyaL = susunLogbook(anggota.slice(0, 3), [], hariDalamBulan("2026-09"));
    expect(susunLembar(hanyaL).every((l) => l.blok === "IKHWAN")).toBe(true);
  });
});
