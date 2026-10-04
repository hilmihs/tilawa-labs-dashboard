import { describe, expect, it } from "vitest";
import { daftarTerlambat, progresPerKode, progresTotal } from "./ringkasan-view";

const divisi = [
  { id: "r-i", kode: "registrasi", nama: "Registrasi", sisi: "ikhwan" },
  { id: "r-a", kode: "registrasi", nama: "Registrasi", sisi: "akhwat" },
  { id: "lo", kode: "lo", nama: "LO", sisi: "bersama" },
  { id: "hm", kode: "humas", nama: "Humas", sisi: "ikhwan" },
];

describe("progresPerKode", () => {
  it("puts ikhwan and akhwat of one code on one row, least done first", () => {
    const rows = progresPerKode(divisi, [
      { divisiId: "r-i", status: "selesai" },
      { divisiId: "r-i", status: "berjalan" },
      { divisiId: "r-a", status: "selesai" },
      { divisiId: "lo", status: "belum_mulai" },
    ]);
    expect(rows.map((r) => r.kode)).toEqual(["lo", "registrasi", "humas"]);
    const reg = rows.find((r) => r.kode === "registrasi")!;
    expect(reg.ikhwan).toEqual({ selesai: 1, total: 2, persen: 50 });
    expect(reg.akhwat).toEqual({ selesai: 1, total: 1, persen: 100 });
    expect(rows.find((r) => r.kode === "humas")!.ikhwan).toEqual({ selesai: 0, total: 0, persen: null });
  });
  it("totals", () => {
    expect(progresTotal([{ status: "disetujui" }, { status: "ditahan" }])).toEqual({ selesai: 1, total: 2, persen: 50 });
  });
});

describe("daftarTerlambat", () => {
  it("lists overdue tasks oldest first with their PIC", () => {
    const rows = daftarTerlambat(
      [
        { id: "t1", judul: "Cetak banner", divisiId: "hm", panitiaId: null, ditugaskanKe: null, tenggat: "2026-09-20", status: "berjalan" },
        { id: "t2", judul: "Daftar hadir", divisiId: "r-i", panitiaId: "p2", ditugaskanKe: null, tenggat: "2026-09-27", status: "belum_mulai" },
        { id: "t3", judul: "Sudah beres", divisiId: "r-i", panitiaId: null, ditugaskanKe: null, tenggat: "2026-09-01", status: "selesai" },
        { id: "t4", judul: "Tanpa PIC", divisiId: null, panitiaId: null, ditugaskanKe: "Ke Bag. Humas", tenggat: "2026-09-28", status: "berjalan" },
      ],
      divisi,
      [
        { id: "p1", nama: "Wildan", wa: "62812", divisiId: "hm", peran: "pic" },
        { id: "p2", nama: "Hilmi", wa: null, divisiId: "r-i", peran: "anggota" },
      ],
      "2026-09-29",
    );
    expect(rows.map((r) => [r.judul, r.pic, r.hari])).toEqual([
      ["Cetak banner", "Wildan", 9],
      ["Daftar hadir", "Hilmi", 2],
      ["Tanpa PIC", "Ke Bag. Humas", 1],
    ]);
    expect(rows[0]).toMatchObject({ divisi: "Humas (ikhwan)", picWa: "62812" });
  });
});
