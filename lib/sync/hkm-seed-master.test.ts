import { describe, expect, it } from "vitest";
import { planMasterSeed, seedNameKey } from "./hkm-seed-master";

const r = (name: string, phone: string | null = null, gender: number | null = 1) => ({
  name,
  phone,
  gender,
  halaqah: "HKM 1 IKHWAN",
  pengajar: "Al Fajar",
});

describe("planMasterSeed", () => {
  it("links by phone first, then by a unique exact name", () => {
    const plan = planMasterSeed(
      [r("Budi", "0812-1111-2222"), r("Siti Aminah (Ami)", null, 2), r("Tanpa Akun")],
      [
        { email: "Budi@X.com", phone: "62812 1111 2222", name: "Budi Santoso" },
        { email: "siti@x.com", phone: null, name: "SITI AMINAH" },
      ],
    );
    expect(plan.map((p) => [p.emailMaster, p.matchMethod, p.gender])).toEqual([
      ["budi@x.com", "phone", "Ikhwan"],
      ["siti@x.com", "name", "Akhwat"],
      [null, null, "Ikhwan"],
    ]);
  });

  it("never links an ambiguous name or reuses an email", () => {
    const plan = planMasterSeed(
      [r("Ahmad"), r("Ahmad"), r("Kiki", "081333334444"), r("Kiki B", "081333334444")],
      [
        { email: "a@x.com", phone: null, name: "Ahmad" },
        { email: "k@x.com", phone: "081333334444", name: null },
      ],
    );
    expect(plan.map((p) => p.emailMaster)).toEqual([null, null, "k@x.com", null]);
  });

  it("normalizes names like the reconciliation script", () => {
    expect(seedNameKey("  yena (Yena)  putri ")).toBe("YENA PUTRI");
  });
});
