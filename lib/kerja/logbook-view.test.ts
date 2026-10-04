import { describe, expect, it } from "vitest";
import {
  bulanAtauIni,
  geserBulan,
  hariPendek,
  hitungHariIni,
  labelRentang,
  namaBulan,
  pekanAktif,
  pekanBulan,
  ringkasBulan,
  tanggalSah,
  totalPerOrang,
} from "./logbook-view";

describe("logbook-view: bulan", () => {
  it("accepts a valid ?bulan= and falls back to the current month", () => {
    expect(bulanAtauIni("2026-08", "2026-09-29")).toBe("2026-08");
    expect(bulanAtauIni("2026-13", "2026-09-29")).toBe("2026-09");
    expect(bulanAtauIni(undefined, "2026-09-29")).toBe("2026-09");
  });
  it("shifts months across year boundaries", () => {
    expect(geserBulan("2026-12", 1)).toBe("2027-01");
    expect(geserBulan("2026-01", -1)).toBe("2025-12");
    expect(geserBulan("2026-09", 0)).toBe("2026-09");
  });
  it("names months and weekdays in Indonesian", () => {
    expect(namaBulan("2026-09")).toBe("September 2026");
    expect(hariPendek("2026-09-29")).toBe("Sel");
    expect(hariPendek("2026-09-27")).toBe("Ahd");
  });
});

describe("logbook-view: pekan", () => {
  // 1 Sep 2026 = Selasa.
  const pk = pekanBulan("2026-09");
  it("cuts a month into Monday–Sunday weeks, clipped to the month", () => {
    expect(pk.map((p) => p.length)).toEqual([6, 7, 7, 7, 3]);
    expect(pk[0][0]).toBe("2026-09-01");
    expect(pk[1][0]).toBe("2026-09-07");
    expect(pk.flat()).toHaveLength(30);
  });
  it("picks ?minggu=N, else the week containing today, else the first", () => {
    expect(pekanAktif(pk, "2", "2026-09-29")).toBe(1);
    expect(pekanAktif(pk, "9", "2026-09-29")).toBe(4);
    expect(pekanAktif(pk, undefined, "2026-09-29")).toBe(4);
    expect(pekanAktif(pk, undefined, "2026-10-02")).toBe(0);
  });
  it("labels a range", () => {
    expect(labelRentang(pk[0])).toBe("1–6 Sep");
    expect(labelRentang(["2026-09-30"])).toBe("30 Sep");
  });
});

describe("logbook-view: ringkasan", () => {
  const h = (orangId: string, tanggal: string, sesi: string, sumber = "qr") => ({ orangId, tanggal, sesi, sumber });
  const hadir = [
    h("a", "2026-09-28", "pagi"),
    h("a", "2026-09-28", "sore", "manual"),
    h("b", "2026-09-28", "siang"),
    h("a", "2026-09-29", "pagi"),
    h("x", "2026-09-29", "pagi"), // bukan anggota (sudah nonaktif) — tidak dihitung
    h("a", "2026-09-30", "pagi"), // masa depan — tidak dihitung
  ];
  it("counts sessions and people-days per person", () => {
    const t = totalPerOrang(hadir);
    expect(t.get("a")).toEqual({ sesi: 4, hari: 3, lengkap: 0 });
    expect(t.get("b")).toEqual({ sesi: 1, hari: 1, lengkap: 0 });
    const penuh = totalPerOrang(["pagi", "siang", "sore"].map((s) => ({ orangId: "c", tanggal: "2026-09-28", sesi: s, sumber: "qr" })));
    expect(penuh.get("c")).toEqual({ sesi: 3, hari: 1, lengkap: 1 });
  });
  it("derives open days from data and averages attendance over them", () => {
    const r = ringkasBulan(["a", "b"], hadir, "2026-09-29");
    // hari buka: 28 & 29; sesi terisi 4 dari 2 orang × 2 hari × 3 sesi = 12.
    expect(r).toEqual({ sesiTerisi: 4, lewatKartu: 3, manual: 1, hariBuka: 2, persen: 33 });
    expect(ringkasBulan(["a"], [], "2026-09-29").persen).toBeNull();
  });
  it("counts today's taps per session", () => {
    expect(hitungHariIni(["a", "b"], hadir, "2026-09-28")).toEqual({ pagi: 1, siang: 1, sore: 1, orang: 2 });
  });
  it("validates calendar dates", () => {
    expect(tanggalSah("2026-09-29")).toBe(true);
    expect(tanggalSah("2026-02-30")).toBe(false);
    expect(tanggalSah("29-09-2026")).toBe(false);
  });
});
