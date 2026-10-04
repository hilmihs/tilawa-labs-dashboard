import { describe, expect, it } from "vitest";
import { selectMustFetch } from "./must-fetch";

describe("selectMustFetch", () => {
  it("fetches a hot-window halaqah even when its fingerprint is unchanged", () => {
    // 42 has a recent meeting (presensi likely being edited) but its report
    // fingerprint matched, so `changed` does not contain it. It must still fetch.
    const out = selectMustFetch({
      fullSweep: false,
      upstreamHalaqahIds: [42, 43],
      changed: new Set<number>(), // nothing moved per the summary report
      hotWindow: new Set([42]),
    });
    expect(out.has(42)).toBe(true);
    expect(out.has(43)).toBe(false);
  });

  it("unions fingerprint-changed with hot-window", () => {
    const out = selectMustFetch({
      fullSweep: false,
      upstreamHalaqahIds: [1, 2, 3],
      changed: new Set([1]),
      hotWindow: new Set([3]),
    });
    expect([...out].sort()).toEqual([1, 3]);
  });

  it("full sweep fetches every upstream halaqah, ignoring the sets", () => {
    const out = selectMustFetch({
      fullSweep: true,
      upstreamHalaqahIds: [1, 2, 3],
      changed: new Set<number>(),
      hotWindow: new Set<number>(),
    });
    expect([...out].sort()).toEqual([1, 2, 3]);
  });
});
