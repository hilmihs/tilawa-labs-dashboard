import { describe, expect, it } from "vitest";
import {
  isAwaitingDecision,
  isPendingApproval,
  readDiscovery,
  slugifyProgramName,
  uniqueSlug,
} from "./discovery";

const MARK = {
  kind: "program",
  tilawahProgramId: 11,
  tilawahBatchId: 15,
  upstreamProgramName: "HITS Armalah",
  upstreamBatchName: "HITS Armalah#1",
  discoveredAt: "2026-08-27T00:00:00.000Z",
};

describe("readDiscovery", () => {
  it("returns null for a hand-seeded program", () => {
    expect(readDiscovery({ features: { piket: false } })).toBeNull();
    expect(readDiscovery(null)).toBeNull();
  });

  it("ignores a malformed mark rather than trusting it", () => {
    expect(readDiscovery({ discovery: { kind: "program" } })).toBeNull();
  });
});

describe("isPendingApproval", () => {
  it("hides an undecided discovery", () => {
    expect(isPendingApproval({ discovery: MARK })).toBe(true);
  });

  it("keeps hiding one that was dismissed — dismissing is not publishing", () => {
    const config = { discovery: { ...MARK, dismissed: true } };
    expect(isPendingApproval(config)).toBe(true);
    expect(isAwaitingDecision(config)).toBe(false);
  });

  it("publishes once approved", () => {
    const config = { discovery: { ...MARK, approvedAt: "2026-08-27T01:00:00.000Z" } };
    expect(isPendingApproval(config)).toBe(false);
    expect(isAwaitingDecision(config)).toBe(false);
  });

  it("leaves seeded programs alone", () => {
    expect(isPendingApproval({ syncAllBatches: true })).toBe(false);
  });
});

describe("slugifyProgramName", () => {
  it("makes a url-safe slug", () => {
    expect(slugifyProgramName("HITS Armalah")).toBe("hits-armalah");
    expect(slugifyProgramName("Tahsin Al Fatihah Mustahik")).toBe("tahsin-al-fatihah-mustahik");
    expect(slugifyProgramName("Dauroh Pengajar Al-Qur'an")).toBe("dauroh-pengajar-al-quran");
  });

  it("never returns an empty slug", () => {
    expect(slugifyProgramName("—")).toBe("program");
  });
});

describe("uniqueSlug", () => {
  it("suffixes until free", () => {
    expect(uniqueSlug("hits", new Set())).toBe("hits");
    expect(uniqueSlug("hits", new Set(["hits"]))).toBe("hits-2");
    expect(uniqueSlug("hits", new Set(["hits", "hits-2"]))).toBe("hits-3");
  });
});
