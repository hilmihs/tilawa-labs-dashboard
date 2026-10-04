/**
 * Everything the board renders, assembled once and shared.
 *
 * The TTL memo below is the caching layer over six queries. /tv is
 * force-dynamic (it can't prerender at build — the build image has no DB), so
 * this memo does the work ISR would have: it caches the *promise*, so every
 * screen in the building and every reload share one in-flight query instead of
 * stampeding Postgres.
 *
 * Not `unstable_cache`: this deploys as a single container (deploy/docker-
 * compose.yml), and that API is deprecated in favour of "use cache", which needs
 * a flag this app hasn't enabled.
 */
import { getTvProgramRefs } from "@/lib/tv/programs";
import {
  buildTodaySlide,
  buildWeekSlide,
  getTvAnomalies,
  getTvDailyFacts,
  tvWindow,
  type TvTodaySlide,
  type TvWeekSlide,
} from "@/lib/tv/queries";
import { getTvNews, getTvQuotes, getTvSyncMeta, type TvNews, type TvQuote } from "@/lib/tv/news";
import { addDaysISO, jamWib, todayJakarta } from "@/lib/time/jakarta";
import { bulanLaporan, shiftMonth } from "@/lib/integrations/maahir/rekap-routes";
import { readKehadiran } from "@/lib/maahir/rekap";
import { maahirAnomali, maahirDailyFacts, maahirStale } from "@/lib/tv/maahir-facts";
import type { TvProgramRef } from "@/lib/tv/programs";
import type { DailyFact } from "@/lib/tv/queries";

/** A sync older than this means the numbers are not to be trusted on air. */
const STALE_AFTER_MIN = 40;
const TTL_MS = 120_000;

export type TvSnapshot = {
  today: TvTodaySlide;
  week: TvWeekSlide;
  news: TvNews;
  quotes: TvQuote[];
  meta: {
    generatedAtWib: string;
    lastSyncWib: string | null;
    stale: boolean;
    syncFailed: boolean;
  };
};

/** Keyed by the board date, so the today board and the kemarin board never share an entry. */
const cache = new Map<string, { at: number; value: Promise<TvSnapshot> }>();

/**
 * `kemarin`: build the board as of yesterday (Jakarta). The /arahan rotation
 * shows the wall during office hours, when tonight's classes haven't happened
 * yet and a "today" board would read as all zeroes.
 */
export function getTvSnapshot({ kemarin = false }: { kemarin?: boolean } = {}): Promise<TvSnapshot> {
  const date = kemarin ? addDaysISO(todayJakarta(), -1) : todayJakarta();
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.value;
  // Entries for past dates would otherwise pile up in a long-lived process.
  for (const [k, v] of cache) if (Date.now() - v.at > TTL_MS) cache.delete(k);
  const entry = { at: Date.now(), value: buildSnapshot(date) };
  cache.set(date, entry);
  // A failed build must not be cached as the answer for two minutes.
  entry.value.catch(() => {
    if (cache.get(date) === entry) cache.delete(date);
  });
  return entry.value;
}

/** Called after curation writes so an approved kabar appears within seconds. */
export function bustTvSnapshot(): void {
  cache.clear();
}

async function buildSnapshot(today: string): Promise<TvSnapshot> {
  const { from, to, week } = tvWindow(today);

  const baseRefs = await getTvProgramRefs();
  const [sqlFacts, anomalies, news, quotes, sync, maahir] = await Promise.all([
    getTvDailyFacts(baseRefs, from, to),
    getTvAnomalies(baseRefs, today),
    getTvNews(week.start),
    getTvQuotes(),
    getTvSyncMeta(),
    maahirForBoard(baseRefs, today, from, to),
  ]);
  const facts = [...sqlFacts, ...maahir.facts];
  for (const [id, n] of maahir.anomalies) anomalies.set(id, n);
  // A board date past the last Maahir pull has no sessions in the cache. Mark
  // the row paused so it reads "sync jeda", not "Tidak ada kelas".
  const refs = baseRefs.map((r) => (maahir.staleIds.has(r.statsProgramId) ? { ...r, syncPaused: true } : r));

  const lastSync = sync.lastSuccessAt ? new Date(sync.lastSuccessAt) : null;
  const staleMin = lastSync ? (Date.now() - lastSync.getTime()) / 60000 : Infinity;

  return {
    today: buildTodaySlide(facts, refs, today, anomalies),
    week: buildWeekSlide(facts, refs, today),
    news,
    quotes,
    meta: {
      generatedAtWib: jamWib(),
      lastSyncWib: lastSync ? jamWib(lastSync) : null,
      stale: staleMin > STALE_AFTER_MIN,
      syncFailed: sync.anyFailed,
    },
  };
}

/** Same lookback as the SQL anomaly query (lib/tv/queries.ts). */
const MAAHIR_ANOMALY_DAYS = 30;

/**
 * Kelas Maahir's share of the board, built from the cached `rekap/kehadiran`
 * rows. Every report month touched by the board window or the anomaly lookback
 * is read — at most three rows.
 */
async function maahirForBoard(
  refs: TvProgramRef[],
  today: string,
  from: string,
  to: string,
): Promise<{ facts: DailyFact[]; anomalies: Map<string, number>; staleIds: Set<string> }> {
  const out = { facts: [] as DailyFact[], anomalies: new Map<string, number>(), staleIds: new Set<string>() };
  const maahirRefs = refs.filter((r) => r.source === "maahir_api");
  if (maahirRefs.length === 0) return out;

  const anomalyFrom = addDaysISO(today, -MAAHIR_ANOMALY_DAYS);
  const first = bulanLaporan(anomalyFrom < from ? anomalyFrom : from);
  const last = bulanLaporan(to);
  const months: string[] = [];
  for (let m = first; m <= last; m = shiftMonth(m, 1)) months.push(m);

  const reads = await Promise.all(months.map((m) => readKehadiran(m)));
  const payloads = reads.flatMap((r) => (r ? [r.payload] : []));
  const current = reads[months.indexOf(bulanLaporan(today))] ?? null;
  const fetchedWib = current ? new Date(current.fetchedAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10) : null;

  // readKehadiran resolves the single maahir_api program; the board has one.
  for (const ref of maahirRefs) {
    out.facts.push(...maahirDailyFacts(ref.statsProgramId, payloads, from, to));
    out.anomalies.set(ref.statsProgramId, maahirAnomali(payloads, anomalyFrom, addDaysISO(today, -1)));
    if (maahirStale(today, fetchedWib)) out.staleIds.add(ref.statsProgramId);
  }
  return out;
}
