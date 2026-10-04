import { describe, expect, it } from "vitest";
import { takeUntilSeen } from "./presensi-bulk";

const row = (updated_at: string | null) => ({ updated_at });

describe("takeUntilSeen", () => {
  it("keeps the whole page and never stops when since is null (full pull)", () => {
    const r = takeUntilSeen([row("2026-08-22T10:00:00Z"), row("2026-08-22T09:00:00Z")], null);
    expect(r).toEqual({ keptCount: 2, stop: false });
  });

  it("stops at the first row older than since, keeping the newer ones", () => {
    const since = new Date("2026-08-22T09:30:00Z");
    // page sorted DESC
    const page = [
      row("2026-08-22T10:00:00Z"), // keep
      row("2026-08-22T09:45:00Z"), // keep
      row("2026-08-22T09:00:00Z"), // older -> stop here
      row("2026-08-22T08:00:00Z"),
    ];
    expect(takeUntilSeen(page, since)).toEqual({ keptCount: 2, stop: true });
  });

  it("treats the boundary as inclusive (>=), so an equal timestamp is kept", () => {
    const since = new Date("2026-08-22T09:00:00Z");
    const page = [row("2026-08-22T09:00:00Z"), row("2026-08-22T08:59:59Z")];
    expect(takeUntilSeen(page, since)).toEqual({ keptCount: 1, stop: true });
  });

  it("keeps a full page and keeps paging when every row is at-or-after since", () => {
    const since = new Date("2026-08-22T00:00:00Z");
    const page = [row("2026-08-22T10:00:00Z"), row("2026-08-22T09:00:00Z")];
    expect(takeUntilSeen(page, since)).toEqual({ keptCount: 2, stop: false });
  });

  it("keeps rows with no updated_at and does not stop on them", () => {
    const since = new Date("2026-08-22T09:30:00Z");
    const page = [row(null), row("2026-08-22T10:00:00Z"), row("2026-08-22T09:00:00Z")];
    expect(takeUntilSeen(page, since)).toEqual({ keptCount: 2, stop: true });
  });

  it("stops on an empty page", () => {
    expect(takeUntilSeen([], new Date())).toEqual({ keptCount: 0, stop: true });
  });
});
