/**
 * Refresh every auto-sourced workbook item of a period from its metric source.
 *
 * For each item (origin='auto', metricKind set): the resolver returns the fresh
 * value. `auto_value`/`auto_pembagi` always record what the source said, plus
 * `refreshed_at` and any `refresh_error`. The live `kuantitas`/`pembagi` (what
 * the rollup actually sums) are overwritten too — UNLESS the item is `locked`,
 * in which case the human override stands and only the auto_* mirror updates.
 *
 * A closed period (closedAt set) is skipped: its numbers are frozen.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { scorecardPeriods, scorecardKpis, scorecardWorkbookItems } from "@/lib/db/schema";
import { getResolver, type AutoItem, type ResolvedItem } from "./index";

export type RefreshSummary = {
  periodId: string;
  refreshed: number;
  errors: number;
  skippedClosed: boolean;
  byKind: Record<string, { refreshed: number; errors: number }>;
};

export async function refreshPeriod(periodId: string): Promise<RefreshSummary> {
  const db = getDb();
  const summary: RefreshSummary = {
    periodId,
    refreshed: 0,
    errors: 0,
    skippedClosed: false,
    byKind: {},
  };

  const [period] = await db
    .select()
    .from(scorecardPeriods)
    .where(eq(scorecardPeriods.id, periodId));
  if (!period) throw new Error(`period ${periodId} not found`);
  if (period.closedAt) {
    summary.skippedClosed = true;
    return summary;
  }
  const ctx = { start: period.startDate, end: period.endDate };

  // Auto items belong to KPIs of this period. Join through kpis → items.
  const rows = await db
    .select({
      id: scorecardWorkbookItems.id,
      metricKind: scorecardWorkbookItems.metricKind,
      metricParams: scorecardWorkbookItems.metricParams,
      locked: scorecardWorkbookItems.locked,
    })
    .from(scorecardWorkbookItems)
    .innerJoin(scorecardKpis, eq(scorecardWorkbookItems.kpiId, scorecardKpis.id))
    .where(
      and(
        eq(scorecardKpis.periodId, periodId),
        eq(scorecardWorkbookItems.origin, "auto"),
        isNotNull(scorecardWorkbookItems.metricKind),
      ),
    );

  const byKind = new Map<string, AutoItem[]>();
  for (const r of rows) {
    const item: AutoItem = {
      id: r.id,
      metricKind: r.metricKind as string,
      metricParams: (r.metricParams ?? {}) as Record<string, unknown>,
      locked: r.locked,
    };
    const arr = byKind.get(item.metricKind);
    if (arr) arr.push(item);
    else byKind.set(item.metricKind, [item]);
  }

  for (const [kind, items] of byKind) {
    const resolver = getResolver(kind);
    const kindStat = { refreshed: 0, errors: 0 };
    summary.byKind[kind] = kindStat;

    let results: ResolvedItem[];
    if (!resolver) {
      results = items.map((it) => ({
        id: it.id,
        value: null,
        pembagi: null,
        error: `no resolver for metricKind '${kind}'`,
      }));
    } else {
      results = await resolver(items, ctx);
    }

    const lockedById = new Map(items.map((it) => [it.id, it.locked]));
    for (const r of results) {
      const now = new Date();
      const auto = r.value == null ? null : String(r.value);
      const autoPembagi = r.pembagi == null ? null : String(r.pembagi);
      const patch: Record<string, unknown> = {
        autoValue: auto,
        autoPembagi,
        refreshedAt: now,
        refreshError: r.error,
        updatedAt: now,
      };
      // Errors leave the live figure untouched; a locked item keeps its override.
      if (r.error == null && !lockedById.get(r.id)) {
        patch.kuantitas = auto;
        patch.pembagi = autoPembagi;
      }
      await db
        .update(scorecardWorkbookItems)
        .set(patch)
        .where(eq(scorecardWorkbookItems.id, r.id));

      if (r.error) {
        kindStat.errors += 1;
        summary.errors += 1;
      } else {
        kindStat.refreshed += 1;
        summary.refreshed += 1;
      }
    }
  }

  return summary;
}
