/**
 * Pure aggregation for the scorecard. The workbook line items are the source of
 * truth; an OYP KPI's achievement is the accumulation of its items.
 *
 *   ACH     = Σ over items with status='achieved'      (sheet column I/J)
 *   Outlook = Σ over ALL items (achieved + outlook), the full-year projection
 *                                                     (sheet column K/L)
 *
 * `Total` rows are excluded at seed time, so a plain sum is correct here.
 *
 * Two unit-of-measure rules break the plain sum:
 *   '%'          — a row carries a numerator (`kuantitas`) AND a denominator
 *                  (`pembagi`); the KPI is 100 × Σnum / Σden. Summing the raw
 *                  numbers would print 3506 % for "Persentase Kelulusan".
 *   'Jam/Minggu' — `kuantitas` is the hours figure and the only column that
 *                  rolls up. The sheet's separate `hours` column disagrees with
 *                  both `kuantitas` and its own OYP total (15 vs 27.5 vs 54), and
 *                  it is absent from every sheet except Workbook KBA, so it is
 *                  kept as an annotation and never summed.
 */

export type Uom = "#" | "%" | "Jam/Minggu" | null;

export type WorkbookLike = {
  kuantitas: number | null;
  pembagi: number | null;
  status: string;
};

export type Rolled = {
  ach: number | null;
  outlook: number | null;
  /** Kept separate so a CAT parent can re-derive a percentage across children. */
  achNum: number | null;
  achDen: number | null;
  outlookNum: number | null;
  outlookDen: number | null;
  /** A '%' KPI whose contributing rows are missing a usable denominator. */
  needsDenominator: boolean;
};

const sum = (items: WorkbookLike[], pick: (i: WorkbookLike) => number | null): number =>
  items.reduce((s, i) => s + (pick(i) ?? 0), 0);

const EMPTY: Rolled = {
  ach: null,
  outlook: null,
  achNum: null,
  achDen: null,
  outlookNum: null,
  outlookDen: null,
  needsDenominator: false,
};

export function rollup(items: WorkbookLike[], uom: Uom): Rolled {
  if (items.length === 0) return EMPTY;

  const achieved = items.filter((i) => i.status === "achieved");

  if (uom === "%") {
    const achNum = sum(achieved, (i) => i.kuantitas);
    const achDen = sum(achieved, (i) => i.pembagi);
    const outlookNum = sum(items, (i) => i.kuantitas);
    const outlookDen = sum(items, (i) => i.pembagi);
    // A contributing row without a denominator makes the ratio a lie, so say so
    // rather than print a number nobody can defend.
    const missing = items.some((i) => i.kuantitas != null && (i.pembagi == null || i.pembagi === 0));
    return {
      ach: achDen > 0 ? (100 * achNum) / achDen : null,
      outlook: outlookDen > 0 ? (100 * outlookNum) / outlookDen : null,
      achNum,
      achDen,
      outlookNum,
      outlookDen,
      needsDenominator: missing,
    };
  }

  const ach = sum(achieved, (i) => i.kuantitas);
  const outlook = sum(items, (i) => i.kuantitas);
  return {
    ach,
    outlook,
    achNum: ach,
    achDen: null,
    outlookNum: outlook,
    outlookDen: null,
    needsDenominator: false,
  };
}

/** ratio, null when the denominator is missing or zero (avoids the sheet's #DIV/0!). */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

// ── CAT rollup ────────────────────────────────────────────────────────────

export type CatChildLike = {
  id: string;
  subdivision: string;
  oypCode: string | null;
  name: string;
  catCode: string | null;
  countsTowardCat: boolean;
  uom: Uom;
  ach: number | null;
  achNum: number | null;
  achDen: number | null;
};

export type CatRollup = {
  /** Σ of the OYP children carrying this CAT code (a ratio for '%' KPIs). */
  auto: number | null;
  /** The figure typed into the CAT sheet, kept for comparison. */
  seed: number | null;
  diverges: boolean;
  children: CatChildLike[];
};

/** Tolerance: half a percent of the seeded figure, and never less than 1 unit. */
function divergesFrom(auto: number | null, seed: number | null): boolean {
  if (auto == null || seed == null) return false;
  return Math.abs(auto - seed) > Math.max(1, Math.abs(seed) * 0.005);
}

export function rollupCat(
  cat: { catCode: string | null; uom: Uom; achSeed: number | null },
  oypKpis: CatChildLike[],
): CatRollup {
  const children = cat.catCode
    ? oypKpis.filter((k) => k.catCode === cat.catCode && k.countsTowardCat)
    : [];

  let auto: number | null = null;
  if (children.length > 0) {
    if (cat.uom === "%") {
      const num = children.reduce((s, c) => s + (c.achNum ?? 0), 0);
      const den = children.reduce((s, c) => s + (c.achDen ?? 0), 0);
      auto = den > 0 ? (100 * num) / den : null;
    } else {
      auto = children.reduce((s, c) => s + (c.ach ?? 0), 0);
    }
  }

  return {
    auto,
    seed: cat.achSeed,
    diverges: divergesFrom(auto, cat.achSeed),
    children,
  };
}
