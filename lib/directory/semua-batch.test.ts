import { describe, expect, it } from "vitest";
import { gabungBatch, namaSemuaBatch } from "./semua-batch";

describe("namaSemuaBatch", () => {
  it("strips the trailing '(Batch …)' and lists every batch label", () => {
    expect(namaSemuaBatch("HITS Reguler (Batch Juni 2026)", ["Juni 2026", "April 2026"])).toBe(
      "HITS Reguler — semua batch (Juni 2026, April 2026)",
    );
  });
  it("leaves a name without a batch suffix intact", () => {
    expect(namaSemuaBatch("HITS Safar", ["Juni", "Januari"])).toBe(
      "HITS Safar — semua batch (Juni, Januari)",
    );
  });
});

describe("gabungBatch", () => {
  it("stamps every row with its batch label and slug, keeping part order", () => {
    const out = gabungBatch("HITS Reguler (Batch Juni 2026)", [
      { label: "Juni 2026", slug: "hits-regular", rows: [{ id: 1 }, { id: 2 }] },
      { label: "April 2026", slug: "hits-regular-apr", rows: [{ id: 3 }] },
    ]);
    expect(out.programName).toBe("HITS Reguler — semua batch (Juni 2026, April 2026)");
    expect(out.rows).toEqual([
      { id: 1, batch: "Juni 2026", programSlug: "hits-regular" },
      { id: 2, batch: "Juni 2026", programSlug: "hits-regular" },
      { id: 3, batch: "April 2026", programSlug: "hits-regular-apr" },
    ]);
  });
});
