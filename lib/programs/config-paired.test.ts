import { describe, expect, it } from "vitest";
import { hidePairedPresensi, presensiParentOf } from "./config";

const hkm = { slug: "hkm", config: { presensiSlug: "hkm-presensi" } };
const presensi = { slug: "hkm-presensi", config: {} };
const hits = { slug: "hits-regular", config: {} };

describe("presensiParentOf", () => {
  it("finds the program embedding a slug as its presensi tab", () => {
    expect(presensiParentOf([hkm, presensi, hits], "hkm-presensi")).toBe(hkm);
    expect(presensiParentOf([hkm, presensi, hits], "hits-regular")).toBeNull();
  });

  it("ignores a program naming itself", () => {
    const self = { slug: "x", config: { presensiSlug: "x" } };
    expect(presensiParentOf([self], "x")).toBeNull();
  });
});

describe("hidePairedPresensi", () => {
  it("lists HKM once when both halves are visible", () => {
    expect(hidePairedPresensi([hkm, presensi, hits]).map((p) => p.slug)).toEqual(["hkm", "hits-regular"]);
  });

  it("keeps the child when its parent is not visible", () => {
    expect(hidePairedPresensi([presensi, hits]).map((p) => p.slug)).toEqual(["hkm-presensi", "hits-regular"]);
  });
});
