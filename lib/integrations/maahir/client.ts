/**
 * Client for the Maahir Public API (teachers.tilawalabs.demo/api/v1).
 * Server-to-server, read-only (GET), static Bearer key — NO login handshake
 * (unlike the mabni client's Sanctum token). Docs: docs/API-PUBLIC.md.
 *
 * Designed to be GENTLE on the upstream (explicit user requirement):
 *   - one request in flight at a time (global serialized queue), never parallel
 *     pages — well under the documented "max 4 concurrent" ceiling;
 *   - a minimum ~550ms gap between request starts (≤ ~109 req/min) — under the
 *     120 req/min ceiling. 250ms (240/min) looked gentle but broke it on long
 *     pulls: 30 Sep 2026 evaluasi/nilai + rapot gave up on 429;
 *   - honours `429 Retry-After` by sleeping then retrying;
 *   - sends `If-None-Match` and treats `304` as "unchanged" (skip);
 *   - stops cleanly (no hammering) on `404 not_found` (API switch off) and `503`
 *     (maintenance), and on `403 forbidden_scope` throws a typed error so the
 *     sync can skip that entity instead of failing the whole run.
 *
 * The envelope is `{ data, meta }` (see docs §2). Pagination is `page`/`limit`
 * (max 500) with `meta.has_more`.
 */

const BASE = () =>
  (process.env.MAAHIR_BASE_URL ?? "https://teachers.tilawalabs.demo/api/v1").replace(/\/$/, "");

function apiKey(): string {
  const k = process.env.MAAHIR_API_KEY;
  if (!k) throw new Error("MAAHIR_API_KEY not set");
  return k;
}

/** Key is valid but lacks the scope for this route — the sync should skip it. */
export class MaahirScopeForbiddenError extends Error {
  constructor(public path: string) {
    super(`Maahir 403 forbidden_scope: ${path}`);
    this.name = "MaahirScopeForbiddenError";
  }
}

/** API switch off (404 not_found) or maintenance (503) — transient, retry later. */
export class MaahirUnavailableError extends Error {
  constructor(
    public path: string,
    public status: number,
  ) {
    super(`Maahir ${status} (unavailable): ${path}`);
    this.name = "MaahirUnavailableError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Global throttle: one request in flight, min gap between requests ──────────
const MIN_GAP_MS = 550;
const MAX_429_RETRIES = 4;
let lastStart = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Serialize `fn` behind any in-flight request, spacing starts by MIN_GAP_MS. */
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastStart));
    if (wait) await sleep(wait);
    lastStart = Date.now();
    return fn();
  });
  // Keep the chain alive regardless of this call's outcome.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export type MaahirMeta = {
  page?: number;
  limit?: number;
  total?: number;
  has_more?: boolean;
  [k: string]: unknown;
};

export type MaahirRow = Record<string, unknown> & { id?: unknown };

type PageResult = {
  status: number;
  data: MaahirRow[];
  meta: MaahirMeta;
  etag: string | null;
  notModified: boolean;
};

/** Raw envelope: `data` is left untyped because the rekap routes answer with an
 *  object, not the row array the collection routes return. */
type RawResult = {
  status: number;
  data: unknown;
  meta: MaahirMeta;
  etag: string | null;
  notModified: boolean;
};

/**
 * One GET, throttled, with 429 backoff and ETag support. `304` returns
 * `notModified: true` and no data. Throws typed errors for 403 / 404 / 503.
 */
async function getRaw(
  path: string,
  params: Record<string, string | number>,
  etag: string | null,
): Promise<RawResult> {
  return throttle(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    const url = `${BASE()}/${path.replace(/^\//, "")}${qs.toString() ? `?${qs}` : ""}`;

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey()}`,
        Accept: "application/json",
      };
      if (etag) headers["If-None-Match"] = etag;

      const res = await fetch(url, { headers });

      if (res.status === 304) {
        return { status: 304, data: null, meta: {}, etag, notModified: true };
      }
      if (res.status === 429) {
        if (attempt >= MAX_429_RETRIES) throw new Error(`Maahir 429 rate_limited (gave up): ${path}`);
        const retryAfter = Number(res.headers.get("Retry-After")) || 5;
        await sleep(retryAfter * 1000 + Math.floor(Math.random() * 500));
        continue;
      }
      if (res.status === 403) throw new MaahirScopeForbiddenError(path);
      if (res.status === 404 || res.status === 503) throw new MaahirUnavailableError(path, res.status);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Maahir GET ${path} failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
      }

      const body = (await res.json()) as { data?: unknown; meta?: MaahirMeta };
      return {
        status: res.status,
        data: body.data ?? null,
        meta: body.meta ?? {},
        etag: res.headers.get("ETag"),
        notModified: false,
      };
    }
  });
}

/** `getRaw` narrowed to the paginated collection routes, whose `data` is a row array. */
async function getPage(
  path: string,
  params: Record<string, string | number>,
  etag: string | null,
): Promise<PageResult> {
  const raw = await getRaw(path, params, etag);
  return { ...raw, data: Array.isArray(raw.data) ? (raw.data as MaahirRow[]) : [] };
}

export type FetchEntityResult = {
  rows: MaahirRow[];
  etag: string | null;
  notModified: boolean;
  total: number | null;
};

/**
 * Read a whole paginated collection. Pages are fetched SEQUENTIALLY (never in
 * parallel) via the shared throttle. `limit=500` (the documented max) keeps the
 * page count — and thus the request count — as low as possible.
 *
 * ETag applies to page 1 only: when `etag` is supplied and page 1 answers `304`,
 * the collection is unchanged and we return `notModified` with no further pages.
 * Use this only for stable (`full`) entities whose params don't vary run to run;
 * for `sejak`/date-window pulls pass `etag: null`.
 */
export async function fetchEntity(
  path: string,
  opts: { params?: Record<string, string | number>; etag?: string | null } = {},
): Promise<FetchEntityResult> {
  const baseParams = opts.params ?? {};
  const first = await getPage(path, { ...baseParams, page: 1, limit: 500 }, opts.etag ?? null);
  if (first.notModified) return { rows: [], etag: opts.etag ?? null, notModified: true, total: null };

  const rows: MaahirRow[] = [...first.data];
  const firstEtag = first.etag;
  let page = 1;
  // Follow has_more sequentially. Guard against a runaway upstream.
  while (first.meta.has_more && page < 10_000) {
    page += 1;
    const next = await getPage(path, { ...baseParams, page, limit: 500 }, null);
    rows.push(...next.data);
    if (!next.meta.has_more) break;
    // carry has_more forward via the latest page's meta
    (first.meta as MaahirMeta).has_more = next.meta.has_more;
  }

  return {
    rows,
    etag: firstEtag,
    notModified: false,
    total: typeof first.meta.total === "number" ? first.meta.total : null,
  };
}

export type FetchRekapResult = {
  /** `body.data` verbatim — an object for most routes, an array for `rekap/kehadiran`. */
  data: unknown;
  /** `body.meta` verbatim: period window, `snapshot_terakhir`/`basi`, `dari_cache`. */
  meta: MaahirMeta;
};

/**
 * Read one `rekap/*` route. Separate from `fetchEntity` on purpose:
 *   - these routes are NOT paginated and `data` is a computed object, so forcing
 *     `page`/`limit` (as `fetchEntity` does) would be meaningless and, worse,
 *     `fetchEntity` would flatten a non-array `data` into zero rows;
 *   - no ETag — the params change every month and upstream already caches
 *     (`meta.dari_cache` / `meta.umur_detik`), so a conditional request buys
 *     nothing here.
 * Still goes through the shared throttle, so rekap pulls queue behind the entity
 * pass instead of racing it. Throws the same typed errors as the rest.
 */
export async function fetchRekap(
  path: string,
  params: Record<string, string | number> = {},
): Promise<FetchRekapResult> {
  const raw = await getRaw(path, params, null);
  return { data: raw.data, meta: raw.meta };
}
