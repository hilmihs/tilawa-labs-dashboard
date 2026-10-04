import { describe, expect, it } from "vitest";
import { buildMabniMessage, type MabniDigest } from "./mabni-digest";

const digest: MabniDigest = {
  start: "2026-07-16",
  end: "2026-08-15",
  teachers: [
    { guruId: 26, nama: "Zahid", halaqah: 1, meetings: 14, taught: 12, hadir: 11, telat: 1, izin: 0 },
  ],
  totals: { teachers: 1, meetings: 14, taught: 12 },
};

describe("buildMabniMessage", () => {
  it("shows the hadir/telat/izin breakdown on a teacher line", () => {
    const msg = buildMabniMessage({
      recipientName: "Mia",
      digest,
      periodLabel: "16 Juli – 15 Agustus 2026",
      lockLabel: "20 Agustus",
    });
    expect(msg).toContain("Zahid — 12/14 pertemuan · hadir 11 telat 1 izin 0 · 1 halaqah");
  });
});
