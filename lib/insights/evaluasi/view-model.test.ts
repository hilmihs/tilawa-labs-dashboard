import { describe, expect, it } from "vitest";
import {
  filterHasil,
  hasilUjian,
  ringkasEvaluasi,
  ringkasUjian,
  resolveFilter,
  type HasilBaris,
} from "./view-model";

function baris(over: Partial<HasilBaris> = {}): HasilBaris {
  return {
    presensiId: 1,
    jadwalId: 100,
    halaqahId: 10,
    halaqahUserId: 5,
    halaqah: "HITS 80 AKHWAT",
    pengajar: "Lubna",
    level: "Dasar",
    ujian: "Evaluasi 4 Berkala",
    tanggal: "2026-08-13",
    peserta: "Fulanah",
    userCode: null,
    status: 1,
    lahnJaliy: 0,
    lahnKhofiy: 2,
    catatan: null,
    ...over,
  };
}

describe("hasilUjian — aturan verdict upstream", () => {
  it("nilai lahn terisi + hadir = lulus", () => {
    expect(hasilUjian(1, 0)).toBe("lulus");
    expect(hasilUjian(1, 12)).toBe("lulus");
  });

  it("nilai lahn terisi tapi tidak hadir = tidak lulus", () => {
    expect(hasilUjian(0, 3)).toBe("tidak");
  });

  it("tanpa nilai lahn tapi tidak hadir = tidak lulus", () => {
    expect(hasilUjian(0, null)).toBe("tidak");
    expect(hasilUjian(3, null)).toBe("tidak");
  });

  it("hadir tanpa nilai lahn = belum ada hasil, bukan tidak lulus", () => {
    expect(hasilUjian(1, null)).toBe("belum");
  });

  it("tanpa baris presensi sama sekali = belum ada hasil", () => {
    expect(hasilUjian(null, null)).toBe("belum");
  });
});

describe("ringkasUjian", () => {
  it("baris sintetis tanpa presensi tidak dihitung sebagai peserta", () => {
    const rows = [baris({ presensiId: null, status: null, lahnJaliy: null, lahnKhofiy: null })];
    const [u] = ringkasUjian(rows, "2026-09-05");
    expect(u.peserta).toBe(0);
    expect(u.rataJaliy).toBeNull();
    expect(u.sudahLewat).toBe(true);
  });

  it("menghitung rata-rata lahn hanya dari yang bernilai", () => {
    const rows = [
      baris({ presensiId: 1, lahnJaliy: 2, lahnKhofiy: 4 }),
      baris({ presensiId: 2, lahnJaliy: 4, lahnKhofiy: 0 }),
      baris({ presensiId: 3, lahnJaliy: null, lahnKhofiy: null }),
    ];
    const [u] = ringkasUjian(rows, "2026-09-05");
    expect(u.peserta).toBe(3);
    expect(u.bernilai).toBe(2);
    expect(u.rataJaliy).toBe(3);
    expect(u.rataKhofiy).toBe(2);
    expect(u.belum).toBe(1);
  });

  it("ujian yang tanggalnya belum tiba tidak dianggap sudah lewat", () => {
    const [u] = ringkasUjian([baris({ tanggal: "2026-12-01" })], "2026-09-05");
    expect(u.sudahLewat).toBe(false);
  });
});

describe("ringkasEvaluasi", () => {
  it("persenAdaHasil null saat belum ada peserta yang diuji", () => {
    const rows = [baris({ presensiId: null, status: null, lahnJaliy: null })];
    const r = ringkasEvaluasi(rows, ringkasUjian(rows, "2026-09-05"));
    expect(r.pesertaDiuji).toBe(0);
    expect(r.persenAdaHasil).toBeNull();
  });

  it("ujianTanpaHasil hanya menghitung ujian yang sudah lewat", () => {
    const rows = [
      baris({ jadwalId: 1, presensiId: 1, tanggal: "2026-08-01", status: 1, lahnJaliy: null }),
      baris({ jadwalId: 2, presensiId: 2, tanggal: "2026-12-01", status: 1, lahnJaliy: null }),
    ];
    const r = ringkasEvaluasi(rows, ringkasUjian(rows, "2026-09-05"));
    expect(r.ujianTotal).toBe(2);
    expect(r.ujianLewat).toBe(1);
    expect(r.ujianTanpaHasil).toBe(1);
    expect(r.belum).toBe(2);
  });
});

describe("filter", () => {
  it("resolveFilter menolak nilai asing", () => {
    expect(resolveFilter("belum")).toBe("belum");
    expect(resolveFilter("ngawur")).toBe("semua");
    expect(resolveFilter(undefined)).toBe("semua");
  });

  it("filterHasil memakai verdict, bukan status mentah", () => {
    const rows = [
      baris({ presensiId: 1, status: 1, lahnJaliy: 1 }),
      baris({ presensiId: 2, status: 0, lahnJaliy: null }),
      baris({ presensiId: 3, status: 1, lahnJaliy: null }),
    ];
    expect(filterHasil(rows, "lulus")).toHaveLength(1);
    expect(filterHasil(rows, "tidak")).toHaveLength(1);
    expect(filterHasil(rows, "belum")).toHaveLength(1);
    expect(filterHasil(rows, "semua")).toHaveLength(3);
  });
});
