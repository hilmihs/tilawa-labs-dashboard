import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the Mabni login stampede.
 *
 * mabni-sync pulls eight endpoints through a single Promise.all. When `token()`
 * memoised the resolved string instead of the in-flight promise, all eight
 * callers reached it in the same tick, all eight saw an empty cache, and all
 * eight POSTed /login — past Laravel's 5-per-minute throttle on that route. The
 * burst answered itself with 429 and the sync died at its first step, every run
 * from 18 Aug 2026 onward.
 *
 * The assertion that matters is the login COUNT under concurrency. A test that
 * only checked "a token comes back" passed against the broken version too.
 */

const ORIGINAL_FETCH = globalThis.fetch;

type Call = { url: string; init?: RequestInit };

function installFetch(opts: { loginStatus?: number } = {}) {
  const calls: Call[] = [];
  let logins = 0;
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/login")) {
      logins += 1;
      const status = opts.loginStatus ?? 200;
      // Laravel answers the throttled request instantly; the delay below stands
      // in for the round trip the real one still has to make when it succeeds,
      // and it is what gives a broken implementation the window to stampede.
      await new Promise((r) => setTimeout(r, 5));
      if (status !== 200) {
        return new Response(JSON.stringify({ message: "Too Many Attempts." }), { status });
      }
      return new Response(JSON.stringify({ token: `tok-${logins}`, token_type: "Bearer" }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ data: [], meta: { next_cursor: null } }), { status: 200 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { calls, loginCount: () => logins };
}

/** Fresh module per test — the memo lives in module scope by design. */
async function freshClient() {
  vi.resetModules();
  return import("./client");
}

beforeEach(() => {
  process.env.MABNI_BASE_URL = "https://mabni.test/api/v1";
  process.env.MABNI_LOGIN_EMAIL = "svc@example.com";
  process.env.MABNI_LOGIN_PASSWORD = "secret";
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("mabni client auth", () => {
  it("logs in exactly once for eight concurrent fetches", async () => {
    const spy = installFetch();
    const client = await freshClient();

    await Promise.all([
      client.fetchKelas(),
      client.fetchSiswa(),
      client.fetchGuru(),
      client.fetchJadwal(),
      client.fetchHafalan(),
      client.fetchNilai(),
      client.fetchAllAbsensi({ dari: "2024-01-01" }),
      client.fetchAllGuruAbsensi({ dari: "2024-01-01" }),
    ]);

    expect(spy.loginCount()).toBe(1);
  });

  it("sends the bearer token from that single login on every request", async () => {
    const spy = installFetch();
    const client = await freshClient();

    await Promise.all([client.fetchKelas(), client.fetchSiswa()]);

    const authed = spy.calls.filter((c) => !c.url.endsWith("/login"));
    expect(authed).toHaveLength(2);
    for (const c of authed) {
      expect((c.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    }
  });

  it("does not memoise a failed login, so a later call can still retry", async () => {
    const spy = installFetch({ loginStatus: 429 });
    const client = await freshClient();

    await expect(client.fetchKelas()).rejects.toThrow(/Mabni login failed: HTTP 429/);
    await expect(client.fetchSiswa()).rejects.toThrow(/Mabni login failed: HTTP 429/);

    // Two attempts, not one replayed rejection and not a stampede.
    expect(spy.loginCount()).toBe(2);
  });
});
