import { describe, expect, it } from "vitest";
import type { KelasBaris, PesertaBaris } from "./direktori";
import {
  PER_HALAMAN,
  bacaSaringKelas,
  bacaSaringPeserta,
  hadirTerendah,
  halaman,
  qs,
  saringKelas,
  saringPeserta,
} from "./saringan";

const p = (o: Partial<PesertaBaris>): PesertaBaris => ({
  kunci: "tilawah_api:1",
  nama: "Aisyah",
  gender: "P",
  hp: "081234567890",
  kelas: [{ program: "HITS Reguler", programSlug: "hits-regular", batch: "Juni 2026", halaqah: "HITS 001 AKHWAT JUNI", halaqahId: 1, pengajar: "Salma", hadir: 90, status: "berjalan", akhir: "2026-10-01" }],
  status: "berjalan",
  ...o,
});

const k = (o: Partial<KelasBaris>): KelasBaris => ({
  kunci: "x:1", nama: "HITS 001", program: "HITS Reguler", programSlug: "hits-regular", batch: "Juni 2026",
  halaqahId: 1, pengajar: "Salma", jenis: "P", peserta: 10, hadir: 80, jadwal: null, tipe: null, status: "berjalan", akhir: "2026-10-01", ...o,
});

describe("peserta", () => {
  const rows = [
    p({}),
    p({ kunci: "b", nama: "Budi", gender: "L", hp: null, kelas: [{ ...p({}).kelas[0], program: "RBI", halaqah: "RBI Ikhwan 1", pengajar: "Zahid", hadir: 50 }] }),
    p({ kunci: "c", nama: "Citra", kelas: [{ ...p({}).kelas[0], hadir: null }] }),
  ];

  it("parses params defensively", () => {
    expect(bacaSaringPeserta({ g: "x", hadir: "?", hal: "-2" })).toEqual({ q: undefined, program: undefined, g: undefined, hadir: undefined, status: undefined, hal: 1 });
    expect(bacaSaringPeserta({ hadir: "rendah", hal: "3" })).toMatchObject({ hadir: "rendah", hal: 3 });
  });

  it("searches name, phone fragment, halaqah and pengajar", () => {
    expect(saringPeserta(rows, { q: "budi", hal: 1 }).map((r) => r.nama)).toEqual(["Budi"]);
    expect(saringPeserta(rows, { q: "6281234", hal: 1 }).map((r) => r.nama)).toEqual(["Aisyah", "Citra"]);
    expect(saringPeserta(rows, { q: "zahid", hal: 1 }).map((r) => r.nama)).toEqual(["Budi"]);
  });

  it("filters program, gender and attendance buckets", () => {
    expect(saringPeserta(rows, { program: "RBI", hal: 1 }).map((r) => r.nama)).toEqual(["Budi"]);
    expect(saringPeserta(rows, { g: "P", hal: 1 })).toHaveLength(2);
    expect(saringPeserta(rows, { hadir: "rendah", hal: 1 }).map((r) => r.nama)).toEqual(["Budi"]);
    expect(saringPeserta(rows, { hadir: "kosong", hal: 1 }).map((r) => r.nama)).toEqual(["Citra"]);
  });

  it("uses the lowest attendance across classes", () => {
    expect(hadirTerendah(p({ kelas: [{ ...p({}).kelas[0], hadir: 90 }, { ...p({}).kelas[0], hadir: 60 }] }))).toBe(60);
  });
});

describe("kelas", () => {
  const rows = [k({}), k({ kunci: "2", nama: "HITS 002", peserta: 20, hadir: 40, jenis: "L", pengajar: "Budi" }), k({ kunci: "3", nama: "M1", program: "Madrasah Nusantara", hadir: null, peserta: 5 })];
  it("filters and sorts", () => {
    expect(bacaSaringKelas({ urut: "peserta", hadir: "rendah" })).toMatchObject({ urut: "peserta", hadir: "rendah" });
    expect(saringKelas(rows, { hadir: "rendah" }).map((r) => r.nama)).toEqual(["HITS 002"]);
    expect(saringKelas(rows, { urut: "peserta" }).map((r) => r.nama)).toEqual(["HITS 002", "HITS 001", "M1"]);
    expect(saringKelas(rows, { urut: "hadir" }).map((r) => r.nama)).toEqual(["HITS 002", "HITS 001", "M1"]);
    expect(saringKelas(rows, { q: "budi" }).map((r) => r.nama)).toEqual(["HITS 002"]);
  });
});

describe("halaman & qs", () => {
  it("pages and clamps", () => {
    const list = Array.from({ length: PER_HALAMAN + 5 }, (_, i) => i);
    expect(halaman(list, 2).isi).toHaveLength(5);
    expect(halaman(list, 9)).toMatchObject({ hal: 2, jumlahHal: 2 });
  });
  it("drops empty values and page 1", () => {
    expect(qs({ q: "a", g: undefined, hal: 1 })).toBe("?q=a");
    expect(qs({ q: "a" }, { hal: 2 })).toBe("?q=a&hal=2");
  });
});

describe("tab status", () => {
  const rows = [p({}), p({ kunci: "z", nama: "Zahra", status: "selesai" })];
  it("defaults to berjalan, with selesai and semua tabs", () => {
    expect(saringPeserta(rows, bacaSaringPeserta({})).map((r) => r.nama)).toEqual(["Aisyah"]);
    expect(saringPeserta(rows, bacaSaringPeserta({ status: "selesai" })).map((r) => r.nama)).toEqual(["Zahra"]);
    expect(saringPeserta(rows, bacaSaringPeserta({ status: "semua" }))).toHaveLength(2);
    expect(saringKelas([k({}), k({ kunci: "y", status: "selesai" })], bacaSaringKelas({}))).toHaveLength(1);
  });
});
