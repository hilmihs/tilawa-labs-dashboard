import { describe, expect, it } from "vitest";
import type { MaahirKehadiranPayload } from "@/lib/maahir/types";
import { maahirAnomali, maahirDailyFacts, maahirStale } from "./maahir-facts";

type Kelas = MaahirKehadiranPayload[number];

function kelas(
  id: string,
  anggota: Record<string, Record<string, string>>,
  pertemuan: { id: string; tanggal: string; program?: string }[],
  sessions: { tanggal: string; filled: boolean; program?: string }[],
): Kelas {
  return {
    kelasId: id,
    kelasName: id,
    gender: "akhwat",
    pertemuan: pertemuan.map((p) => ({ programLabel: "", program: "kelas_maahir", ...p })),
    anggota: Object.entries(anggota).map(([anggotaId, perPertemuan]) => ({ anggotaId, perPertemuan })),
    sessions: sessions.map((s) => ({ programLabel: "", mingguan: false, program: "kelas_maahir", ...s })),
  } as unknown as Kelas;
}

const A = kelas(
  "A",
  {
    a1: { p1: "H", p2: "T" },
    a2: { p1: "I", p2: "A" },
    a3: { p1: "T", p2: "-" },
  },
  [
    { id: "p1", tanggal: "2026-09-16" },
    { id: "p2", tanggal: "2026-09-17" },
  ],
  [
    { tanggal: "2026-09-16", filled: true },
    { tanggal: "2026-09-17", filled: true },
  ],
);
// Scheduled on the 16th but nobody filled presensi.
const B = kelas("B", { b1: {}, b2: {} }, [], [{ tanggal: "2026-09-16", filled: false }]);

describe("maahirDailyFacts", () => {
  it("builds the same shape the SQL builds: roster per session, H+T hadir, izin/sakit excused", () => {
    const facts = maahirDailyFacts("m", [[A, B]], "2026-09-16", "2026-09-17");
    expect(facts).toEqual([
      { statsProgramId: "m", date: "2026-09-16", terjadwal: 5, meetingsScheduled: 2, meetingsHeld: 1, hadir: 2, eff: 2, recorded: 3 },
      { statsProgramId: "m", date: "2026-09-17", terjadwal: 3, meetingsScheduled: 1, meetingsHeld: 1, hadir: 1, eff: 2, recorded: 2 },
    ]);
  });

  it("does not double a session present in two report months' payloads", () => {
    const once = maahirDailyFacts("m", [[A]], "2026-09-16", "2026-09-16");
    const twice = maahirDailyFacts("m", [[A], [A]], "2026-09-16", "2026-09-16");
    expect(twice).toEqual(once);
  });

  it("counts two sessions of one program on one day", () => {
    const dua = kelas("C", { c1: {} }, [], [
      { tanggal: "2026-09-16", filled: false },
      { tanggal: "2026-09-16", filled: false },
    ]);
    expect(maahirDailyFacts("m", [[dua]], "2026-09-16", "2026-09-16")[0].meetingsScheduled).toBe(2);
  });
});

describe("maahirAnomali & maahirStale", () => {
  it("counts unfilled past sessions once", () => {
    expect(maahirAnomali([[A, B], [B]], "2026-09-01", "2026-09-16")).toBe(1);
  });
  it("is stale only after the pull date, or with no pull", () => {
    expect(maahirStale("2026-09-17", "2026-09-17")).toBe(false);
    expect(maahirStale("2026-09-17", "2026-09-08")).toBe(true);
    expect(maahirStale("2026-09-17", null)).toBe(true);
  });
});

it("counts an unplanned meeting in the schedule, so hadir never exceeds terjadwal", () => {
  const ekstra = kelas("E", { e1: { x: "H" }, e2: { x: "H" } }, [{ id: "x", tanggal: "2026-09-18" }], []);
  const [f] = maahirDailyFacts("m", [[ekstra]], "2026-09-18", "2026-09-18");
  expect(f).toMatchObject({ meetingsScheduled: 1, meetingsHeld: 1, terjadwal: 2, hadir: 2 });
});
