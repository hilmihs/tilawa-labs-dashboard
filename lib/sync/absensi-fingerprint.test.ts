import { describe, expect, it } from "vitest";
import { buildFingerprints, changedHalaqahIds } from "./absensi-fingerprint";

const item = (halaqahId: number, userId: number, pertemuan: string, pct: number) => ({
  halaqah_id: halaqahId,
  pertemuan,
  kehadiran_percentage: pct,
  user: { id: userId },
});

describe("buildFingerprints", () => {
  it("groups one fingerprint per halaqah", () => {
    const fp = buildFingerprints([item(1, 10, "5/26", 19), item(2, 20, "3/26", 12)]);
    expect([...fp.keys()].sort()).toEqual([1, 2]);
  });

  it("is stable regardless of item order", () => {
    const a = buildFingerprints([item(1, 10, "5/26", 19), item(1, 11, "4/26", 15)]);
    const b = buildFingerprints([item(1, 11, "4/26", 15), item(1, 10, "5/26", 19)]);
    expect(a.get(1)).toBe(b.get(1));
  });

  it("changes when a student's attendance count moves", () => {
    const before = buildFingerprints([item(1, 10, "5/26", 19)]);
    const after = buildFingerprints([item(1, 10, "6/26", 23)]);
    expect(after.get(1)).not.toBe(before.get(1));
  });

  it("changes when a student joins the halaqah", () => {
    const before = buildFingerprints([item(1, 10, "5/26", 19)]);
    const after = buildFingerprints([item(1, 10, "5/26", 19), item(1, 11, "0/26", 0)]);
    expect(after.get(1)).not.toBe(before.get(1));
  });

  it("changes when the schedule grows — the denominator is part of the state", () => {
    const before = buildFingerprints([item(1, 10, "5/26", 19)]);
    const after = buildFingerprints([item(1, 10, "5/27", 19)]);
    expect(after.get(1)).not.toBe(before.get(1));
  });

  it("does not let one halaqah's state leak into another's fingerprint", () => {
    const alone = buildFingerprints([item(1, 10, "5/26", 19)]);
    const together = buildFingerprints([item(1, 10, "5/26", 19), item(2, 20, "9/26", 35)]);
    expect(together.get(1)).toBe(alone.get(1));
  });
});

describe("changedHalaqahIds", () => {
  it("reports a halaqah whose fingerprint moved", () => {
    const prev = new Map([
      [1, "aaa"],
      [2, "bbb"],
    ]);
    const next = new Map([
      [1, "aaa"],
      [2, "ccc"],
    ]);
    expect(changedHalaqahIds([1, 2], prev, next)).toEqual(new Set([2]));
  });

  it("reports a halaqah with no stored fingerprint — never seen, must be fetched", () => {
    const prev = new Map<number, string>();
    const next = new Map([[1, "aaa"]]);
    expect(changedHalaqahIds([1], prev, next)).toEqual(new Set([1]));
  });

  it("reports a halaqah absent from the report entirely", () => {
    // A halaqah with no enrolled students never appears in absensi-murid, so it
    // has no fingerprint to compare and must always be fetched.
    const prev = new Map([[1, "aaa"]]);
    const next = new Map<number, string>();
    expect(changedHalaqahIds([1], prev, next)).toEqual(new Set([1]));
  });

  it("reports nothing when everything matches", () => {
    const prev = new Map([[1, "aaa"]]);
    const next = new Map([[1, "aaa"]]);
    expect(changedHalaqahIds([1], prev, next)).toEqual(new Set());
  });

  it("ignores halaqah that are not in the asked-for list", () => {
    // The caller asks about one program's halaqah; another program's changes
    // must not drag it into a fetch.
    const prev = new Map([[9, "aaa"]]);
    const next = new Map([[9, "zzz"]]);
    expect(changedHalaqahIds([1], prev, next)).toEqual(new Set([1]));
  });
});
