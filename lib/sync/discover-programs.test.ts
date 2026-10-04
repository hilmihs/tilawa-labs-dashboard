import { describe, expect, it } from "vitest";
import { planDiscovery, type LocalProgramRow, type UpstreamProgramWithBatches } from "./discover-programs";

const NOW = "2026-08-27T00:00:00.000Z";

function local(over: Partial<LocalProgramRow> & { slug: string }): LocalProgramRow {
  return {
    dataSourceType: "tilawah_api",
    tilawahProgramId: null,
    tilawahBatchId: null,
    config: {},
    ...over,
  };
}

function up(
  id: number,
  name: string,
  batches: { id: number; name: string }[],
): UpstreamProgramWithBatches {
  return { id, name, batches };
}

describe("planDiscovery", () => {
  it("creates a row for an upstream program nothing mirrors", () => {
    // The real case this was built for: upstream program 11 ran three halaqah
    // for weeks with no row here at all.
    const { creates } = planDiscovery([up(11, "HITS Armalah", [{ id: 15, name: "HITS Armalah#1" }])], [], NOW);
    expect(creates).toHaveLength(1);
    expect(creates[0].slug).toBe("hits-armalah");
    expect(creates[0].tilawahBatchId).toBe(15);
    expect(creates[0].config.discovery.kind).toBe("program");
  });

  it("seeds a discovered program paused, hidden and rolling", () => {
    const { creates } = planDiscovery([up(11, "HITS Armalah", [{ id: 15, name: "B1" }])], [], NOW);
    const config = creates[0].config;
    // Paused + marked = invisible everywhere until approved; syncAllBatches so
    // its NEXT batch needs no second approval.
    expect(config.syncPaused).toBe(true);
    expect(config.syncAllBatches).toBe(true);
    expect(config.discovery.approvedAt).toBeUndefined();
  });

  it("ignores an upstream program with no batches", () => {
    const { creates, emptyUpstream } = planDiscovery([up(2, "Tahsin Al-Fatihah", [])], [], NOW);
    expect(creates).toHaveLength(0);
    expect(emptyUpstream).toEqual(["2:Tahsin Al-Fatihah"]);
  });

  it("stays silent for a rolling program, whatever batches appear", () => {
    // tafm-laz mirrors every batch itself; a new LAZ batch is not news.
    const rows = [
      local({ slug: "tafm-laz", tilawahProgramId: 9, tilawahBatchId: 10, config: { syncAllBatches: true } }),
    ];
    const { creates } = planDiscovery(
      [up(9, "Tahsin Al Fatihah Mustahik", [{ id: 30, name: "TAFM #43" }, { id: 24, name: "TAFM #42" }])],
      rows,
      NOW,
    );
    expect(creates).toHaveLength(0);
  });

  it("gives a pinned batch-family a sibling row for an uncovered batch", () => {
    const rows = [
      local({
        slug: "hits-regular",
        tilawahProgramId: 3,
        tilawahBatchId: 1,
        config: { reportFormat: "hits", batch: { family: "hits-regular", label: "Juni 2026", order: 3 } },
      }),
      local({
        slug: "hits-regular-jan",
        tilawahProgramId: 3,
        tilawahBatchId: 21,
        config: { reportFormat: "hits", batch: { family: "hits-regular", label: "Januari 2026", order: 1 } },
      }),
    ];
    const { creates } = planDiscovery(
      [up(3, "HITS Reguler", [{ id: 25, name: "Oktober_2026" }, { id: 21, name: "Januari_2026" }, { id: 1, name: "Juni 2026" }])],
      rows,
      NOW,
    );
    expect(creates).toHaveLength(1);
    const row = creates[0];
    expect(row.slug).toBe("hits-regular-oktober-2026");
    expect(row.tilawahBatchId).toBe(25);
    expect(row.config.discovery.kind).toBe("batch");
    // Inherits the family's report layout, sorts newest-first, stays paused.
    expect(row.config.reportFormat).toBe("hits");
    expect(row.config.batch).toEqual({ family: "hits-regular", label: "Oktober_2026", order: 4 });
    expect(row.config.syncPaused).toBe(true);
  });

  it("never re-proposes a batch a sibling already covers", () => {
    const rows = [
      local({ slug: "hits-safar", tilawahProgramId: 7, tilawahBatchId: 7, config: { batch: { family: "hits-safar", label: "Juli", order: 2 } } }),
      local({ slug: "hits-safar-jan", tilawahProgramId: 7, tilawahBatchId: 6, config: { batch: { family: "hits-safar", label: "Januari", order: 1 } } }),
    ];
    const { creates } = planDiscovery(
      [up(7, "HITS Safar", [{ id: 7, name: "Juli 2026" }, { id: 6, name: "Batch Januari 2026" }])],
      rows,
      NOW,
    );
    expect(creates).toHaveLength(0);
  });

  it("does not collide with a slug already taken", () => {
    const rows = [local({ slug: "hits-armalah", dataSourceType: "manual" })];
    const { creates } = planDiscovery([up(11, "HITS Armalah", [{ id: 15, name: "B1" }])], rows, NOW);
    expect(creates[0].slug).toBe("hits-armalah-2");
  });

  it("proposes one row per uncovered batch, ordered after the newest sibling", () => {
    const rows = [
      local({ slug: "hits-regular", tilawahProgramId: 3, tilawahBatchId: 1, config: { batch: { family: "hits-regular", label: "Juni", order: 3 } } }),
    ];
    const { creates } = planDiscovery(
      [up(3, "HITS Reguler", [{ id: 26, name: "Des" }, { id: 25, name: "Okt" }, { id: 1, name: "Juni" }])],
      rows,
      NOW,
    );
    expect(creates.map((c) => c.tilawahBatchId)).toEqual([26, 25]);
    expect(creates.map((c) => (c.config.batch as { order: number }).order)).toEqual([4, 5]);
  });

  it("ignores rows of another data source that reuse the same id", () => {
    // berkah/mabni rows carry no tilawah_program_id; a berkah row numbered 11
    // must not be mistaken for a mirror of upstream program 11.
    const rows = [local({ slug: "hkm", dataSourceType: "berkah_api", tilawahProgramId: 11 })];
    const { creates } = planDiscovery([up(11, "HITS Armalah", [{ id: 15, name: "B1" }])], rows, NOW);
    expect(creates).toHaveLength(1);
  });
});
