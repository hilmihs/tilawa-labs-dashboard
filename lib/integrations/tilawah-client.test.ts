import { afterEach, describe, expect, it, vi } from "vitest";
import { tilawahGetAllPages } from "./tilawah-client";

const session = { cookieHeader: "c", xsrfToken: "x" };
const TIMEOUT_BODY = JSON.stringify({ message: "API Timeout atau Error. Daftar halaqah gagal dimuat." });

/**
 * Fake tilawah list endpoint over `total` items that times out (HTTP 500, the
 * upstream's own 15 s guard) whenever a page is larger than `maxOk`.
 */
function fakeUpstream(total: number, maxOk: number) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const page = Number(u.searchParams.get("page"));
    const perPage = Number(u.searchParams.get("per_page"));
    if (perPage > maxOk) return new Response(TIMEOUT_BODY, { status: 500 });
    const from = (page - 1) * perPage;
    const rows = Array.from({ length: Math.max(0, Math.min(perPage, total - from)) }, (_, i) => ({ id: from + i + 1 }));
    return new Response(
      JSON.stringify({ data: { halaqohs: rows, pagination: { last_page: Math.ceil(total / perPage) } } }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("tilawahGetAllPages", () => {
  it("pages normally when upstream keeps up", async () => {
    fakeUpstream(45, 100);
    const rows = await tilawahGetAllPages<{ id: number }>("https://t", session, "/api/halaqah?x=1", "halaqohs", 20);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
  });

  it("shrinks the page on an upstream timeout and resumes without gaps or duplicates", async () => {
    const calls = fakeUpstream(128, 25);
    const rows = await tilawahGetAllPages<{ id: number }>("https://t", session, "/api/halaqah?x=1", "halaqohs");
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 128 }, (_, i) => i + 1));
    expect(calls.some((c) => c.includes("per_page=100"))).toBe(true);
    expect(calls.at(-1)).toContain("per_page=25");
  });

  it("resumes mid-stream when the timeout starts after some pages succeeded", async () => {
    let served = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        const page = Number(u.searchParams.get("page"));
        const perPage = Number(u.searchParams.get("per_page"));
        // First 50-row page succeeds, then upstream slows down for anything > 10.
        if (served > 0 && perPage > 10) return new Response(TIMEOUT_BODY, { status: 500 });
        const from = (page - 1) * perPage;
        const rows = Array.from({ length: Math.max(0, Math.min(perPage, 73 - from)) }, (_, i) => ({ id: from + i + 1 }));
        served++;
        return new Response(JSON.stringify({ data: { items: rows, pagination: { last_page: Math.ceil(73 / perPage) } } }), { status: 200 });
      }),
    );
    const rows = await tilawahGetAllPages<{ id: number }>("https://t", session, "/api/r", "items", 50);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 73 }, (_, i) => i + 1));
  });

  it("gives up with the upstream error once the smallest page still times out", async () => {
    fakeUpstream(10, 0);
    await expect(tilawahGetAllPages("https://t", session, "/api/halaqah", "halaqohs")).rejects.toThrow(/API Timeout/);
  });

  it("does not retry errors that are not upstream timeouts", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tilawahGetAllPages("https://t", session, "/api/halaqah", "halaqohs")).rejects.toThrow(/HTTP 403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
