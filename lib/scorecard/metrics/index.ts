/**
 * Metric registry for scorecard auto-sourced workbook items.
 *
 * A workbook item with origin='auto' carries a `metricKind` naming a resolver
 * here and `metricParams` describing what to count. Resolvers are BATCHED per
 * kind so a source is hit once per refresh (al-Fatihah pages the whole period
 * window a single time, then every al-Fatihah item aggregates over that set).
 */
import {
  aggregate,
  fetchEvaluations,
  type FatihahParams,
} from "./alfatihah";
import { computeTilawah, type TilawahParams } from "./tilawah";

export type MetricContext = { start: string; end: string };

export type AutoItem = {
  id: string;
  metricKind: string;
  metricParams: Record<string, unknown>;
  locked: boolean;
};

export type ResolvedItem = {
  id: string;
  value: number | null;
  pembagi: number | null;
  error: string | null;
};

export type BatchResolver = (items: AutoItem[], ctx: MetricContext) => Promise<ResolvedItem[]>;

const alfatihahBatch: BatchResolver = async (items, ctx) => {
  let records;
  try {
    records = await fetchEvaluations({ start: ctx.start, end: ctx.end });
  } catch (e) {
    const error = (e as Error).message;
    return items.map((it) => ({ id: it.id, value: null, pembagi: null, error }));
  }
  return items.map((it) => {
    try {
      const { value, pembagi } = aggregate(records, it.metricParams as FatihahParams);
      return { id: it.id, value, pembagi, error: null };
    } catch (e) {
      return { id: it.id, value: null, pembagi: null, error: (e as Error).message };
    }
  });
};

// Tilawah reads local synced tables; each item resolves independently (cheap DB
// counts), no shared fetch to batch.
const tilawahBatch: BatchResolver = async (items) =>
  Promise.all(
    items.map(async (it) => {
      try {
        const value = await computeTilawah(it.metricParams as TilawahParams);
        return { id: it.id, value, pembagi: null, error: null };
      } catch (e) {
        return { id: it.id, value: null, pembagi: null, error: (e as Error).message };
      }
    }),
  );

const RESOLVERS: Record<string, BatchResolver> = {
  alfatihah: alfatihahBatch,
  tilawah: tilawahBatch,
};

export function metricKinds(): string[] {
  return Object.keys(RESOLVERS);
}

export function getResolver(kind: string): BatchResolver | null {
  return RESOLVERS[kind] ?? null;
}
