import { describe, expect, it } from "vitest";
import { hariKerjaPekan, periksaIzin, ringkasanPekan, terlambat } from "./izin";

const HARI = "2026-09-25"; // Jumat
const sah = { dari: HARI, sampai: HARI, alasan: "sakit", catatan: "" };

describe("periksaIzin", () => {
  it("menerima izin hari ini", () => {
    expect(periksaIzin(sah, HARI, [])).toEqual({ ok: true });
  });
  it("menolak alasan asing", () => {
    expect(periksaIzin({ ...sah, alasan: "malas" }, HARI, [])).toEqual({ ok: false, alasan: "alasan-tidak-sah" });
  });
  it("menolak tanggal terbalik dan tanggal mustahil", () => {
    expect(periksaIzin({ ...sah, sampai: "2026-09-24" }, HARI, [])).toMatchObject({ alasan: "tanggal-tidak-sah" });
    expect(periksaIzin({ ...sah, dari: "2026-02-30", sampai: "2026-02-30" }, "2026-02-01", [])).toMatchObject({
      alasan: "tanggal-tidak-sah",
    });
  });
  it("menolak hari yang sudah lewat", () => {
    expect(periksaIzin({ ...sah, dari: "2026-09-24" }, HARI, [])).toMatchObject({ alasan: "sudah-lewat" });
  });
  it("menolak lebih dari 14 hari", () => {
    expect(periksaIzin({ ...sah, sampai: "2026-10-08" }, HARI, [])).toEqual({ ok: true });
    expect(periksaIzin({ ...sah, sampai: "2026-10-09" }, HARI, [])).toMatchObject({ alasan: "terlalu-panjang" });
  });
  it("menolak irisan dengan kabar yang berlaku, tapi tidak dengan yang ditolak/dibatalkan", () => {
    const ada = { dari: "2026-09-24", sampai: "2026-09-26" };
    expect(periksaIzin(sah, HARI, [{ ...ada, status: "dikabarkan" }])).toMatchObject({ alasan: "bertumpuk" });
    expect(periksaIzin(sah, HARI, [{ ...ada, status: "menunggu" }])).toMatchObject({ alasan: "bertumpuk" });
    expect(periksaIzin(sah, HARI, [{ ...ada, status: "disetujui" }])).toMatchObject({ alasan: "bertumpuk" });
    expect(periksaIzin(sah, HARI, [{ ...ada, status: "ditolak" }, { ...ada, status: "dibatalkan" }])).toEqual({ ok: true });
  });
});

describe("hariKerjaPekan", () => {
  it("Senin–Jumat pekan itu", () => {
    expect(hariKerjaPekan(HARI)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]);
  });
  it("Ahad menunjuk pekan yang baru lewat", () => {
    expect(hariKerjaPekan("2026-09-27")[0]).toBe("2026-09-21");
  });
});

describe("ringkasanPekan", () => {
  it("hadir mengalahkan kabar; kabar yang dibatalkan tidak dihitung", () => {
    const r = ringkasanPekan(HARI, new Set(["2026-09-22", "2026-09-23"]), [
      { dari: "2026-09-21", sampai: "2026-09-21", status: "dikabarkan" },
      { dari: "2026-09-23", sampai: "2026-09-23", status: "dikabarkan" },
      { dari: "2026-09-24", sampai: "2026-09-24", status: "dibatalkan" },
    ]);
    expect(r.sel.map((s) => s.keadaan)).toEqual(["izin", "hadir", "hadir", "kosong", "kosong"]);
    expect(r).toMatchObject({ hadir: 2, izin: 1 });
    expect(r.sel[4]).toMatchObject({ hariIni: true, lewat: false });
    expect(r.sel[0].lewat).toBe(true);
  });
});

describe("terlambat", () => {
  it("tepat jam dinas bukan terlambat", () => {
    expect(terlambat("08:00", "08:00")).toBe(false);
    expect(terlambat("08:01", "08:00")).toBe(true);
  });
});
