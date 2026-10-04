/**
 * Reader for the al-Fatihah assessment API — the same upstream the scorecard's
 * auto-metric already consumes (`lib/scorecard/metrics/alfatihah.ts`, wired to
 * KPI C312 by `scripts/wire-fatihah-metrics.ts`).
 *
 *   GET {ALFATIHAH_BASE_URL}/api/recitation-evaluations   (public, no auth)
 *
 * Nothing about this source is persisted locally: there is no table for it in
 * `lib/db/schema.ts` and no sync job writes one. Every read is a live HTTP
 * page-through, so this module adds the two things the scorecard resolver does
 * not need but a page does:
 *
 *   1. Bounded concurrency. `per_page` caps at 100 (101+ answers 422), so the
 *      full 2026 window is ~46 requests. Sequentially that is ~30 s; six at a
 *      time it is ~6 s.
 *   2. A TTL memo over the *promise*, the same trick as `lib/tv/snapshot.ts`.
 *      Two coordinators opening the page together share one page-through
 *      instead of both hammering upstream. Not `unstable_cache`: this deploys
 *      as a single container and that API wants a flag the app has not enabled.
 *
 * Upstream drops connections at random under paging (observed: ~1 in 40 pages
 * closes without a response), so each page is retried before the whole read is
 * declared failed.
 */
import { alfatihahBaseUrl, type Evaluation } from "@/lib/scorecard/metrics/alfatihah";

/**
 * The API returns one extra object the scorecard type omits, because the
 * scorecard only ever counts rows: a human-readable band for the score. It is
 * the upstream's own wording ("Level 6 - Baik"), so the page shows that rather
 * than inventing labels — but colour comes from our own `scoreBand`, since the
 * upstream `tone` is not monotonic in the score (level 5 is "success", 6 is
 * "info").
 */
export type ScoreLabel = { title?: string | null; description?: string | null; tone?: string | null };
export type Rec = Evaluation & { scoreLabel?: ScoreLabel | null };

export type Window = { start: string; end: string };

const PER_PAGE = 100; // upstream answers 422 above this
const CONCURRENCY = 6;
const RETRIES = 4;
const TTL_MS = 10 * 60_000;
/** Never let a slow upstream hold a page render open forever. */
const REQUEST_TIMEOUT_MS = 30_000;

type Paginated = { data?: Rec[]; last_page?: number; total?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pageUrl(base: string, w: Window, page: number): string {
  const q = new URLSearchParams({
    date_from: w.start,
    date_to: w.end,
    is_dummy: "false",
    per_page: String(PER_PAGE),
    page: String(page),
  });
  return `${base}/api/recitation-evaluations?${q.toString()}`;
}

async function getPage(base: string, w: Window, page: number): Promise<Paginated> {
  let last = "";
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(pageUrl(base, w, page), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Paginated;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (attempt < RETRIES) await sleep(400 * attempt);
    }
  }
  throw new Error(`API assessment al-Fatihah gagal di halaman ${page}: ${last}`);
}

/** Every non-dummy evaluation created in [start, end] (inclusive, YYYY-MM-DD). */
async function fetchWindow(w: Window): Promise<Rec[]> {
  const base = alfatihahBaseUrl();
  const first = await getPage(base, w, 1);
  const lastPage = Math.max(1, Number(first.last_page ?? 1));
  const out: Rec[] = [...(first.data ?? [])];

  const rest = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);
  // Pages land out of order across workers; sort at the end, not here.
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const slice = rest.slice(i, i + CONCURRENCY);
    const pages = await Promise.all(slice.map((p) => getPage(base, w, p)));
    for (const p of pages) out.push(...(p.data ?? []));
  }

  out.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return out;
}

const cache = new Map<string, { at: number; value: Promise<Rec[]> }>();

/**
 * Cached read for one window. The promise is cached, not the result, so
 * concurrent renders share a single page-through; a rejected read is evicted
 * so a transient upstream failure is not served as "the answer" for 10 minutes.
 */
export function getEvaluations(w: Window): Promise<Rec[]> {
  const key = `${w.start}|${w.end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const entry = { at: Date.now(), value: fetchWindow(w) };
  cache.set(key, entry);
  entry.value.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  // A handful of window presets, but bound it anyway.
  if (cache.size > 12) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest && oldest[0] !== key) cache.delete(oldest[0]);
  }
  return entry.value;
}
