/**
 * Read model for the /scorecard page. Server components query the DB directly
 * through these (same pattern as lib/insights/*), no API route in between.
 *
 * OYP KPIs get their ACH/Outlook COMPUTED from their workbook items (the whole
 * point — the accumulation shows up in OYP and CAT). A CAT KPI's achievement is
 * rolled up from the OYP rows carrying the same `catCode`; the figure typed into
 * the CAT sheet stays visible next to it so the two can be compared.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { scorecardPeriods, scorecardKpis, scorecardWorkbookItems } from "@/lib/db/schema";
import type { PeriodKind } from "./period";
import {
  ratio,
  rollup,
  rollupCat,
  type CatChildLike,
  type CatRollup,
  type Uom,
} from "./rollup";

export type Subdivision = "cat" | "hits" | "kba" | "maahir" | "dpq";
export type Perspective = "financial" | "customer" | "ibp" | "learning";

export const OYP_SUBS: Exclude<Subdivision, "cat">[] = ["hits", "kba", "maahir", "dpq"];

export const SUB_LABEL: Record<Subdivision, string> = {
  cat: "Scorecard CAT",
  hits: "OYP HITS",
  kba: "OYP Kolaborasi",
  maahir: "OYP Maahir",
  dpq: "OYP DPQ",
};

export const PERSPECTIVE_LABEL: Record<Perspective, string> = {
  financial: "Financial Perspective",
  customer: "Customer Perspective",
  ibp: "Internal Business Process Perspective",
  learning: "Learning & Growth Perspective",
};

const PERSPECTIVE_ORDER: Perspective[] = ["financial", "customer", "ibp", "learning"];

export type Period = {
  id: string;
  label: string;
  kind: PeriodKind;
  year: number;
  seq: number;
  startDate: string;
  endDate: string;
  active: boolean;
  closedAt: Date | null;
};

export type WorkbookItem = {
  id: string;
  detail: string | null;
  deskripsi: string | null;
  kuantitas: number | null;
  pembagi: number | null;
  hours: number | null;
  status: "achieved" | "outlook";
  sumber: string | null;
  origin: string;
  metricKind: string | null;
  metricParams: Record<string, unknown>;
  autoValue: number | null;
  autoPembagi: number | null;
  locked: boolean;
  refreshedAt: Date | null;
  refreshError: string | null;
  sortOrder: number;
};

export type KpiView = {
  id: string;
  perspective: Perspective;
  subdivision: Subdivision;
  catCode: string | null;
  oypCode: string | null;
  catName: string | null;
  name: string;
  uom: Uom;
  target: number | null;
  weight: number | null;
  targetPeriod: number | null;
  achSeed: number | null;
  ach: number | null; // computed from workbook items, seeded value as fallback
  achNum: number | null;
  achDen: number | null;
  pctAch: number | null; // ach / targetPeriod
  outlook: number | null;
  outlookPct: number | null; // outlook / target
  computed: boolean; // true when ach came from workbook items, not the seed
  needsDenominator: boolean; // '%' KPI whose rows lack a denominator
  countsTowardCat: boolean;
  problem: string | null;
  corrective: string | null;
  pic: string | null;
  sortOrder: number;
  items: WorkbookItem[];
};

const n = (v: string | null): number | null => (v == null ? null : Number(v));

function toUom(v: string | null): Uom {
  return v === "%" || v === "#" || v === "Jam/Minggu" ? v : null;
}

function toPeriod(r: typeof scorecardPeriods.$inferSelect): Period {
  return {
    id: r.id,
    label: r.label,
    kind: r.kind === "month" ? "month" : r.kind === "ytd" ? "ytd" : "quarter",
    year: r.year,
    seq: r.seq,
    startDate: r.startDate,
    endDate: r.endDate,
    active: r.active,
    closedAt: r.closedAt,
  };
}

export async function listPeriods(): Promise<Period[]> {
  const db = getDb();
  const rows = await db.select().from(scorecardPeriods).orderBy(asc(scorecardPeriods.startDate));
  return rows.map(toPeriod);
}

export async function getPeriod(id: string): Promise<Period | null> {
  const db = getDb();
  const [row] = await db.select().from(scorecardPeriods).where(eq(scorecardPeriods.id, id));
  return row ? toPeriod(row) : null;
}

export async function getActivePeriod(): Promise<Period | null> {
  const periods = await listPeriods();
  return periods.find((p) => p.active) ?? periods.at(-1) ?? null;
}

/** All KPIs for a period + subdivision, each with its workbook items and computed rollup. */
async function loadKpis(periodId: string, subdivision: Subdivision): Promise<KpiView[]> {
  const db = getDb();
  const kpis = await db
    .select()
    .from(scorecardKpis)
    .where(and(eq(scorecardKpis.periodId, periodId), eq(scorecardKpis.subdivision, subdivision)))
    .orderBy(asc(scorecardKpis.sortOrder));

  if (kpis.length === 0) return [];

  const items = await db
    .select()
    .from(scorecardWorkbookItems)
    .where(
      inArray(
        scorecardWorkbookItems.kpiId,
        kpis.map((k) => k.id),
      ),
    )
    .orderBy(asc(scorecardWorkbookItems.kpiId), asc(scorecardWorkbookItems.sortOrder));

  const itemsByKpi = new Map<string, WorkbookItem[]>();
  for (const it of items) {
    const view: WorkbookItem = {
      id: it.id,
      detail: it.detail,
      deskripsi: it.deskripsi,
      kuantitas: n(it.kuantitas),
      pembagi: n(it.pembagi),
      hours: n(it.hours),
      status: it.status === "outlook" ? "outlook" : "achieved",
      sumber: it.sumber,
      origin: it.origin,
      metricKind: it.metricKind,
      metricParams: (it.metricParams ?? {}) as Record<string, unknown>,
      autoValue: n(it.autoValue),
      autoPembagi: n(it.autoPembagi),
      locked: it.locked,
      refreshedAt: it.refreshedAt,
      refreshError: it.refreshError,
      sortOrder: it.sortOrder,
    };
    const arr = itemsByKpi.get(it.kpiId);
    if (arr) arr.push(view);
    else itemsByKpi.set(it.kpiId, [view]);
  }

  return kpis.map((k) => {
    const its = itemsByKpi.get(k.id) ?? [];
    const uom = toUom(k.uom);
    const targetPeriod = n(k.targetPeriod);
    const target = n(k.target);
    const achSeed = n(k.achSeed);
    // Workbook items present → compute; otherwise fall back to the seeded number.
    const hasItems = its.length > 0;
    const rolled = rollup(its, uom);
    const ach = hasItems ? rolled.ach : achSeed;
    const outlook = hasItems ? rolled.outlook : n(k.outlookSeed);
    return {
      id: k.id,
      perspective: k.perspective as Perspective,
      subdivision: k.subdivision as Subdivision,
      catCode: k.catCode,
      oypCode: k.oypCode,
      catName: k.catName,
      name: k.name,
      uom,
      target,
      weight: n(k.weight),
      targetPeriod,
      achSeed,
      ach,
      achNum: hasItems ? rolled.achNum : achSeed,
      achDen: hasItems ? rolled.achDen : null,
      pctAch: ratio(ach, targetPeriod),
      outlook,
      outlookPct: ratio(outlook, target),
      computed: hasItems,
      needsDenominator: hasItems && rolled.needsDenominator,
      countsTowardCat: k.countsTowardCat,
      problem: k.problem,
      corrective: k.corrective,
      pic: k.pic,
      sortOrder: k.sortOrder,
      items: its,
    };
  });
}

export type CatKpiView = KpiView & { cat: CatRollup };
export type PerspectiveGroup = { perspective: Perspective; label: string; kpis: CatKpiView[] };

/** Every OYP KPI of a period, flattened — the input to the CAT rollup. */
async function loadAllOyp(periodId: string): Promise<KpiView[]> {
  const perSub = await Promise.all(OYP_SUBS.map((s) => loadKpis(periodId, s)));
  return perSub.flat();
}

/**
 * CAT scorecard grouped into the four BSC perspective bands (empty bands
 * dropped). Each row's `cat.auto` is the sum of the OYP KPIs sharing its
 * `catCode`; `cat.seed` is what the spreadsheet claims.
 */
export async function getScorecardCAT(periodId: string): Promise<PerspectiveGroup[]> {
  const [kpis, oyp] = await Promise.all([loadKpis(periodId, "cat"), loadAllOyp(periodId)]);
  const children: CatChildLike[] = oyp.map((k) => ({
    id: k.id,
    subdivision: k.subdivision,
    oypCode: k.oypCode,
    name: k.name,
    catCode: k.catCode,
    countsTowardCat: k.countsTowardCat,
    uom: k.uom,
    ach: k.ach,
    achNum: k.achNum,
    achDen: k.achDen,
  }));

  const withCat: CatKpiView[] = kpis.map((k) => {
    const cat = rollupCat({ catCode: k.catCode, uom: k.uom, achSeed: k.achSeed }, children);
    // A CAT KPI with children reads from them; one without (e.g. "Progres
    // Standarisasi Kurikulum") keeps its own seeded figure.
    const ach = cat.auto ?? k.ach;
    return { ...k, cat, ach, pctAch: ratio(ach, k.targetPeriod) };
  });

  return PERSPECTIVE_ORDER.map((p) => ({
    perspective: p,
    label: PERSPECTIVE_LABEL[p],
    kpis: withCat.filter((k) => k.perspective === p),
  })).filter((g) => g.kpis.length > 0);
}

/** One OYP sub-division's KPI rows (with workbook items for drill-down). */
export async function getOyp(
  periodId: string,
  subdivision: Exclude<Subdivision, "cat">,
): Promise<KpiView[]> {
  return loadKpis(periodId, subdivision);
}

/** Any subdivision's KPI rows with their editable workbook items (the /kelola editor). */
export async function getKpisWithItems(
  periodId: string,
  subdivision: Subdivision,
): Promise<KpiView[]> {
  return loadKpis(periodId, subdivision);
}
