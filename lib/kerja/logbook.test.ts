import { describe, expect, it } from "vitest";
import { hariDalamBulan, potongHalaman, susunLogbook } from "./logbook";

describe("logbook", () => {
  it("lists the days of a month and pages them five at a time", () => {
    expect(hariDalamBulan("2026-09")).toHaveLength(30);
    expect(hariDalamBulan("2026-02").at(-1)).toBe("2026-02-28");
    expect(potongHalaman(hariDalamBulan("2026-09")).map((p) => p.length)).toEqual([5, 5, 5, 5, 5, 5]);
  });
  it("splits ikhwan/akhwat and fills HH.MM per session", () => {
    const lb = susunLogbook(
      [
        { orangId: "a", nama: "Aldi", gender: "L" },
        { orangId: "b", nama: "Salma", gender: "P" },
      ],
      [
        { orangId: "a", tanggal: "2026-09-29", sesi: "sore", waktu: new Date("2026-09-29T09:00:00Z"), sumber: "qr" },
        { orangId: "a", tanggal: "2026-09-30", sesi: "pagi", waktu: new Date("2026-09-30T00:45:00Z"), sumber: "manual" },
        { orangId: "a", tanggal: "2026-10-01", sesi: "pagi", waktu: new Date("2026-10-01T00:45:00Z"), sumber: "qr" },
      ],
      ["2026-09-29", "2026-09-30"],
    );
    expect(lb.ikhwan[0].sel["2026-09-29"].sore).toEqual({ jam: "16.00", sumber: "qr", catatan: null });
    expect(lb.ikhwan[0].sel["2026-09-30"].pagi?.jam).toBe("07.45");
    expect(lb.ikhwan[0].jumlah).toEqual({ pagi: 1, siang: 0, sore: 1, total: 2 });
    expect(lb.akhwat.map((b) => [b.no, b.nama, b.jumlah.total])).toEqual([[1, "Salma", 0]]);
  });
});
