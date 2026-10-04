import { describe, expect, it } from "vitest";
import { mergeDailyGroup, mergeDailyReadings } from "./hkm-reading-merge";

/** Ringkas: satu baris export secukupnya untuk penggabung. */
const row = (fromPage: number, toPage: number, totalPages: number, extra: Record<string, unknown> = {}) => ({
  userId: 1,
  email: "a@b.c",
  tanggal: "2026-08-17",
  fromPage,
  toPage,
  totalPages,
  ...extra,
});

describe("mergeDailyGroup", () => {
  it("hari biasa satu baris lewat apa adanya", () => {
    const m = mergeDailyGroup([row(41, 53, 13)]);
    expect(m.totalPages).toBe(13);
    expect(m.toPage).toBe(53);
    expect(m.extraRowsMerged).toBe(0);
    expect(m.rowsRejected).toBe(0);
  });

  it("A: khatam tuntas lalu mulai lagi hari yang sama — semuanya dijumlahkan", () => {
    // Indah Citra 2026-05-28: h582→604 (23), lalu h1→1 (1), lalu h1→11 (11).
    const m = mergeDailyGroup([row(582, 604, 23), row(1, 1, 1), row(1, 11, 11)]);
    expect(m.totalPages).toBe(35);
    expect(m.extraRowsMerged).toBe(2);
    expect(m.rowsRejected).toBe(0);
  });

  it("A: khatam tuntas di tengah hari tetap terlihat lewat toPage tertinggi", () => {
    // Kalau toPage memakai baris TERAKHIR (11), detektor khatam di
    // cumulative.ts tak pernah melihat h604 dan khatamnya hilang.
    const m = mergeDailyGroup([row(582, 604, 23), row(1, 11, 11)]);
    expect(m.toPage).toBe(604);
  });

  it("A: dua sesi berurutan di hari yang sama", () => {
    // Indah Citra 2026-08-17: h1→1 (1) lalu h1→5 (5). Baris kedua inilah yang
    // dulu hilang, dan bikin capaian bulanannya kurang.
    const m = mergeDailyGroup([row(1, 1, 1), row(1, 5, 5)]);
    expect(m.totalPages).toBe(6);
    expect(m.extraRowsMerged).toBe(1);
  });

  it("B: duplikat rentang persis ditolak", () => {
    // Indah Citra 2026-05-06: rentang sama diulang dengan nomor khatam naik.
    const m = mergeDailyGroup([row(377, 386, 10), row(377, 386, 10)]);
    expect(m.totalPages).toBe(10);
    expect(m.rowsRejected).toBe(1);
  });

  it("C: baris kumulatif yang mundur ke awal khatam ditolak", () => {
    // Anindita Hapsari 2026-05-23: h225→265 (41) lalu rekap h23→259 (237).
    const m = mergeDailyGroup([row(225, 265, 41), row(23, 259, 237)]);
    expect(m.totalPages).toBe(41);
    expect(m.toPage).toBe(265);
    expect(m.rowsRejected).toBe(1);
  });

  it("C tidak boleh tertukar dengan wrap: mundur tapi belum di ujung mushaf", () => {
    const m = mergeDailyGroup([row(200, 265, 41), row(1, 30, 30)]);
    expect(m.totalPages).toBe(41);
    expect(m.rowsRejected).toBe(1);
  });

  it("campuran A+B+C dalam satu hari", () => {
    const m = mergeDailyGroup([
      row(590, 604, 15), // basis
      row(1, 1, 1), //      A wrap
      row(1, 1, 1), //      B duplikat
      row(1, 8, 8), //      A lanjutan
      row(1, 400, 399), //  C kumulatif (mundur dari 8? tidak — from 1 < prevTo 8)
    ]);
    expect(m.totalPages).toBe(24);
    expect(m.extraRowsMerged).toBe(2);
    expect(m.rowsRejected).toBe(2);
  });
});

describe("mergeDailyReadings", () => {
  it("mengelompokkan per (peserta, tanggal)", () => {
    const out = mergeDailyReadings([
      row(1, 5, 5),
      row(5, 9, 4),
      { ...row(1, 3, 3), userId: 2 },
      { ...row(1, 3, 3), tanggal: "2026-08-18" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].totalPages).toBe(9); // user 1, 17 Agu — dua baris digabung
    expect(out[1].totalPages).toBe(3); // user 2, 17 Agu
    expect(out[2].totalPages).toBe(3); // user 1, 18 Agu
  });

  it("baris tanpa tanggal dibuang", () => {
    expect(mergeDailyReadings([{ ...row(1, 5, 5), tanggal: null }])).toHaveLength(0);
  });

  it("jatuh ke email kalau userId tidak ada", () => {
    const out = mergeDailyReadings([
      { ...row(1, 5, 5), userId: null },
      { ...row(5, 9, 4), userId: null },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].totalPages).toBe(9);
  });
});
