/**
 * Read path for the kabar column and the rotating quote.
 *
 * Public surface: every select here lands on a page anyone with the URL can
 * open, so it must never reach for submittedBy / submittedByName / reviewNote.
 * Those columns exist for the curation screen, which is behind auth.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { newsItems, tvQuotes } from "@/lib/db/schema";
import { divisionLabel, type Division } from "@/lib/tv/divisions";
import { addDaysISO } from "@/lib/time/jakarta";

export type TvNewsItem = {
  id: string;
  division: Division | string;
  divisionLabel: string;
  title: string;
  body: string;
  pinned: boolean;
};

export type TvNews = {
  weekStart: string;
  /** True when this week has nothing approved yet and last week's is shown. */
  carryOver: boolean;
  items: TvNewsItem[];
};

const MAX_ITEMS = 6;

/**
 * Approved kabar for the running Jumat→Kamis week. Falls back to the previous
 * week when nothing is approved yet — a Friday morning with an empty column
 * reads as a broken screen, and the alternative (showing stale news silently)
 * is worse, so the caller gets a `carryOver` flag to label it.
 */
export async function getTvNews(weekStart: string): Promise<TvNews> {
  const thisWeek = await approvedFor(weekStart);
  if (thisWeek.length > 0) return { weekStart, carryOver: false, items: thisWeek };

  const prev = addDaysISO(weekStart, -7);
  const lastWeek = await approvedFor(prev);
  return { weekStart: prev, carryOver: lastWeek.length > 0, items: lastWeek };
}

async function approvedFor(weekStart: string): Promise<TvNewsItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: newsItems.id,
      division: newsItems.division,
      title: newsItems.title,
      body: newsItems.body,
      pinned: newsItems.pinned,
    })
    .from(newsItems)
    .where(and(eq(newsItems.weekStart, weekStart), eq(newsItems.status, "approved")))
    .orderBy(desc(newsItems.pinned), asc(newsItems.sortOrder), asc(newsItems.submittedAt))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    id: r.id,
    division: r.division,
    divisionLabel: divisionLabel(r.division),
    title: r.title,
    body: r.body,
    pinned: r.pinned,
  }));
}

export type TvQuote = { id: string; text: string; arabic: string | null; source: string | null };

/** Active quotes in display order. The board rotates through them client-side. */
export async function getTvQuotes(): Promise<TvQuote[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tvQuotes.id,
      text: tvQuotes.text,
      arabic: tvQuotes.arabic,
      source: tvQuotes.source,
    })
    .from(tvQuotes)
    .where(eq(tvQuotes.active, true))
    .orderBy(asc(tvQuotes.sortOrder), asc(tvQuotes.createdAt))
    .limit(20);
  return rows;
}

/** Newest successful sync across every program — the board's freshness clock. */
export async function getTvSyncMeta(): Promise<{ lastSuccessAt: string | null; anyFailed: boolean }> {
  const db = getDb();
  const rows = await db.execute(sql`
    select max(finished_at) filter (where status = 'success') as last_success,
           bool_or(status = 'failed') as any_failed
    from sync_runs
    where started_at > now() - interval '6 hours'
  `);
  const r = rows.rows[0] ?? {};
  return {
    lastSuccessAt: r.last_success ? new Date(r.last_success as string).toISOString() : null,
    anyFailed: r.any_failed === true,
  };
}
