/**
 * What this guards: a single upstream failure must never take the rest of a run
 * with it. Both passes used to be all-or-nothing — one 502 on an entity aborted
 * every entity after it (that is how `koordinator-ketua-kelas` went missing), and
 * a rekap route that fails must leave the payload stored by an earlier run alone.
 *
 * The DB and the HTTP client are faked; the assertions are about which writes the
 * sync attempts, not about SQL. Nothing here touches the network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: {
    inserts: [] as { table: unknown; values: Record<string, unknown>[] }[],
    deletes: [] as unknown[],
    entityCalls: [] as string[],
    rekapCalls: [] as string[],
    failEntity: null as string | null,
    failRekap: null as string | null,
    /** path → successive fetchEntity answers (rows as id lists) for the short-page case */
    pages: {} as Record<string, { ids: string[]; total: number }[]>,
  },
}));

vi.mock("@/lib/db/client", () => {
  // Any drizzle builder method returns the same thenable, so `await`-ing anywhere
  // along the chain yields `result`.
  const chain = (result: unknown): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then")
            return (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) =>
              Promise.resolve(result).then(ok, no);
          return () => chain(result);
        },
      },
    );

  const db = {
    execute: async () => ({ rows: [] }), // isSyncRunning is mocked away, but be safe
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        h.state.inserts.push({ table, values: Array.isArray(v) ? v : [v] });
        return chain([{ id: "run-1" }]);
      },
    }),
    select: () => chain([]),
    update: () => chain([]),
    delete: (table: unknown) => {
      h.state.deletes.push(table);
      return chain([]);
    },
  };
  return { getDb: () => db };
});

vi.mock("@/lib/sync/last-sync", () => ({ isSyncRunning: async () => false }));

vi.mock("@/lib/integrations/maahir/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/maahir/client")>();
  return {
    ...actual,
    fetchEntity: async (path: string) => {
      h.state.entityCalls.push(path);
      if (path === h.state.failEntity) throw new Error("Maahir GET failed: HTTP 502");
      const next = h.state.pages[path]?.shift();
      if (next) return { rows: next.ids.map((id) => ({ id, updated_at: "2026-09-29T10:00:00Z" })), etag: "e1", notModified: false, total: next.total };
      return { rows: [], etag: null, notModified: false, total: 0 };
    },
    fetchRekap: async (path: string) => {
      h.state.rekapCalls.push(path);
      if (path === h.state.failRekap) throw new Error("Maahir GET failed: HTTP 502");
      return { data: { dummy: true }, meta: { bulan: "2026-08", dari_cache: false } };
    },
  };
});

import { maahirRekap, maahirSyncState } from "@/lib/db/schema";
import { MAAHIR_ENTITIES } from "@/lib/integrations/maahir/registry";
import { maahirRekapPulls } from "@/lib/integrations/maahir/rekap-routes";
import { runMaahirSyncForProgram } from "./maahir-sync";

const PROGRAM = { id: "prog-1", slug: "maahir", config: {} };
const rekapInserts = () => h.state.inserts.filter((i) => i.table === maahirRekap);

beforeEach(() => {
  h.state.inserts = [];
  h.state.deletes = [];
  h.state.entityCalls = [];
  h.state.rekapCalls = [];
  h.state.failEntity = null;
  h.state.failRekap = null;
  h.state.pages = {};
});

describe("runMaahirSyncForProgram", () => {
  it("pulls every rekap route after the entity pass and stores payload + meta verbatim", async () => {
    const res = await runMaahirSyncForProgram(PROGRAM);

    const pulls = maahirRekapPulls();
    expect(res.status).toBe("success");
    expect(res.rekap).toHaveLength(pulls.length);
    expect(rekapInserts()).toHaveLength(pulls.length);
    // The entity pass runs first — its last request precedes the first rekap one.
    expect(h.state.entityCalls).toHaveLength(MAAHIR_ENTITIES.length);

    const row = rekapInserts()[0].values[0];
    expect(row.route).toBe(pulls[0].route);
    expect(row.periode).toBe(pulls[0].periode); // storage key from rekapPeriode()
    expect(row.paramsKey).toBe("");
    expect(row.payload).toEqual({ dummy: true });
    expect(row.meta).toEqual({ bulan: "2026-08", dari_cache: false });
  });

  it("keeps the other eleven rekap pulls when one route fails, and deletes nothing", async () => {
    h.state.failRekap = "rekap/tibyan";
    const res = await runMaahirSyncForProgram(PROGRAM);

    const total = maahirRekapPulls().length;
    const tibyanPulls = maahirRekapPulls().filter((p) => p.route === "rekap/tibyan").length;
    // Only the failed route is missing; nothing is removed, so the payload a
    // previous run stored for it stays readable (with an older fetchedAt).
    expect(rekapInserts()).toHaveLength(total - tibyanPulls);
    expect(h.state.deletes).toHaveLength(0);
    expect(res.rekap?.filter((r) => !r.ok).map((r) => r.route)).toEqual(
      Array(tibyanPulls).fill("rekap/tibyan"),
    );
    expect(res.status).toBe("partial");
    expect(res.ok).toBe(false);
  });

  it("carries on to the remaining entities after one entity errors", async () => {
    h.state.failEntity = MAAHIR_ENTITIES[0].path;
    const res = await runMaahirSyncForProgram(PROGRAM);

    expect(h.state.entityCalls).toHaveLength(MAAHIR_ENTITIES.length);
    expect(res.entities?.find((e) => e.entity === MAAHIR_ENTITIES[0].path)?.error).toContain("502");
    // …and the rekap pass still ran.
    expect(res.rekap).toHaveLength(maahirRekapPulls().length);
    expect(res.status).toBe("partial");
  });

  it("retries a pull that came back short and merges both passes", async () => {
    h.state.pages["evaluasi/nilai"] = [
      { ids: ["a", "b", "b"], total: 3 },
      { ids: ["a", "c"], total: 3 },
    ];
    const res = await runMaahirSyncForProgram(PROGRAM);
    const r = res.entities?.find((e) => e.entity === "evaluasi/nilai");
    expect(r).toEqual({ entity: "evaluasi/nilai", rows: 3 });
    expect(h.state.entityCalls.filter((p) => p === "evaluasi/nilai")).toHaveLength(2);
  });

  it("keeps rows but does not advance state when a pull stays incomplete", async () => {
    h.state.pages["evaluasi/nilai"] = [
      { ids: ["a"], total: 3 },
      { ids: ["a", "b"], total: 3 },
    ];
    const res = await runMaahirSyncForProgram(PROGRAM);
    const r = res.entities?.find((e) => e.entity === "evaluasi/nilai");
    expect(r?.rows).toBe(2);
    expect(r?.error).toContain("tidak lengkap: 2 dari 3");
    expect(res.status).toBe("partial");
    const stateWrites = h.state.inserts.filter((i) => i.table === maahirSyncState && i.values[0]?.entity === "evaluasi/nilai");
    expect(stateWrites).toHaveLength(0);
  });
});
