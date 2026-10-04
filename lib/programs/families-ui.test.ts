import { describe, expect, it } from "vitest";
import { collapseFamilies, familyDisplayName } from "./families";

describe("familyDisplayName", () => {
  it("drops the trailing '(Batch …)' suffix", () => {
    expect(familyDisplayName("HITS Reguler (Batch Juni 2026)")).toBe("HITS Reguler");
    expect(familyDisplayName("HITS Safar (batch Januari 2026) ")).toBe("HITS Safar");
  });
  it("leaves other parentheses alone", () => {
    expect(familyDisplayName("Ruang Belajar Islam (RBI)")).toBe("Ruang Belajar Islam (RBI)");
  });
});

const fam = (family: string, order: number) => ({ batch: { family, label: `b${order}`, order } });

describe("collapseFamilies", () => {
  const programs = [
    { slug: "hits-regular-jan", name: "HITS Reguler (Batch Januari 2026)", config: fam("hits-regular", 1) },
    { slug: "dpq", name: "DPQ", config: null },
    { slug: "hits-regular", name: "HITS Reguler (Batch Juni 2026)", config: fam("hits-regular", 3) },
    { slug: "hits-regular-apr", name: "HITS Reguler (Batch April 2026)", config: fam("hits-regular", 2) },
  ];
  it("keeps one entry per family, named without the batch, at the newest member", () => {
    expect(collapseFamilies(programs, "dpq")).toEqual([
      { slug: "hits-regular", name: "HITS Reguler" },
      { slug: "dpq", name: "DPQ" },
    ]);
  });
  it("points the family entry at the member currently open, so the select stays in sync", () => {
    expect(collapseFamilies(programs, "hits-regular-apr")[0]).toEqual({
      slug: "hits-regular-apr",
      name: "HITS Reguler",
    });
  });
});
