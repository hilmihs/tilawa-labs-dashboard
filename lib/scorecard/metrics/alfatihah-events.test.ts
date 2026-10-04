import { describe, expect, it } from "vitest";
import { aggregate, type Evaluation } from "./alfatihah";

const ev = (created_at: string, kegiatan = "Half Deen Series 2026"): Evaluation => ({
  uuid: created_at + Math.random(),
  kode_unik: null,
  kegiatan,
  divisi: null,
  pemeriksa: null,
  asal_halaqah: null,
  rekomendasi_program: null,
  is_dummy: false,
  created_at,
  score: 6,
  namaLengkap: null,
});

describe("aggregate events", () => {
  const rows = [
    ...Array.from({ length: 12 }, () => ev("2026-01-18T02:00:00Z")),
    ev("2026-01-25T02:00:00Z"), // late entry
    ...Array.from({ length: 10 }, () => ev("2026-02-05T18:00:00Z")), // 6 Feb in Jakarta
  ];

  it("counts every day without a minimum", () => {
    expect(aggregate(rows, { agg: "events" }).value).toBe(3);
  });

  it("drops straggler days below minPerEvent", () => {
    expect(aggregate(rows, { agg: "events", minPerEvent: 10 }).value).toBe(2);
  });

  it("buckets by the Jakarta calendar day, not UTC", () => {
    const split = [ev("2026-02-05T16:30:00Z"), ev("2026-02-05T17:30:00Z")]; // 23:30 and 00:30 WIB
    expect(aggregate(split, { agg: "events" }).value).toBe(2);
  });
});
