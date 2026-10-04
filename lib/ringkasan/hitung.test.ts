import { describe, expect, it } from "vitest";
import {
  BULAN_PERTAMA,
  berlaku,
  bulanDari,
  geserBulan,
  hariIniWib,
  labelBulan,
  ringkas,
  tanggalBulan,
} from "@/lib/ringkasan/hitung";

describe("hariIniWib", () => {
  it("memakai WIB: 16 Sep 17:00 UTC sudah 17 Sep di Jakarta", () => {
    expect(hariIniWib(new Date("2026-09-16T16:59:59Z"))).toBe("2026-09-16");
    expect(hariIniWib(new Date("2026-09-16T17:00:00Z"))).toBe("2026-09-17");
  });
});

describe("kalender bulan", () => {
  it("tanggalBulan memuat seluruh hari", () => {
    const d = tanggalBulan("2026-09");
    expect(d).toHaveLength(30);
    expect(d[0]).toBe("2026-09-01");
    expect(d[29]).toBe("2026-09-30");
    expect(tanggalBulan("2027-02")).toHaveLength(28);
  });
  it("geserBulan melintasi tahun", () => {
    expect(geserBulan("2026-12", 1)).toBe("2027-01");
    expect(geserBulan("2026-09", -1)).toBe("2026-08");
  });
  it("bulanDari + label + bulan pertama", () => {
    expect(bulanDari("2026-09-17")).toBe("2026-09");
    expect(labelBulan("2026-09")).toBe("September 2026");
    expect(BULAN_PERTAMA).toBe("2026-09");
  });
});

describe("berlaku", () => {
  const r = { mulai: "2026-09-14", selesai: null };
  it("sebelum mulai & hari depan tidak berlaku", () => {
    expect(berlaku("2026-09-13", r, "2026-09-17")).toBe(false);
    expect(berlaku("2026-09-14", r, "2026-09-17")).toBe(true);
    expect(berlaku("2026-09-17", r, "2026-09-17")).toBe(true);
    expect(berlaku("2026-09-18", r, "2026-09-17")).toBe(false);
  });
  it("sesudah selesai tidak berlaku", () => {
    const s = { mulai: "2026-09-14", selesai: "2026-09-15" };
    expect(berlaku("2026-09-15", s, "2026-09-17")).toBe(true);
    expect(berlaku("2026-09-16", s, "2026-09-17")).toBe(false);
  });
});

describe("ringkas", () => {
  const r = { mulai: "2026-09-14", selesai: null };
  it("bulan berjalan: hari ini belum dicentang ikut tunggakan", () => {
    const setor = new Set(["2026-09-14", "2026-09-15"]);
    expect(ringkas("2026-09", r, setor, "2026-09-17")).toEqual({
      setor: 2,
      berlaku: 4,
      persen: 50,
      tunggakan: 2,
    });
  });
  it("penuh = 100%, tunggakan 0", () => {
    const setor = new Set(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
    expect(ringkas("2026-09", r, setor, "2026-09-17")).toEqual({
      setor: 4,
      berlaku: 4,
      persen: 100,
      tunggakan: 0,
    });
  });
  it("tanpa hari berlaku → persen null", () => {
    expect(ringkas("2026-08", r, new Set(), "2026-09-17")).toEqual({
      setor: 0,
      berlaku: 0,
      persen: null,
      tunggakan: 0,
    });
  });
  it("setoran di luar hari berlaku tidak dihitung", () => {
    const setor = new Set(["2026-09-13", "2026-09-14"]);
    expect(ringkas("2026-09", r, setor, "2026-09-14").setor).toBe(1);
  });
  it("bulan lampau: tunggakan dihitung dari hari berlaku terakhir", () => {
    const s = { mulai: "2026-09-14", selesai: null };
    const setor = new Set(["2026-09-28"]);
    expect(ringkas("2026-09", s, setor, "2026-10-05").tunggakan).toBe(2); // 29, 30
  });
});
