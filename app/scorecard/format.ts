// Shared cell formatting for the scorecard tables.

const NUM = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** A count/hours value; "—" when null. */
export function fmtNum(v: number | null | undefined): string {
  return v == null ? "—" : NUM.format(v);
}

/** A weight (0.075) or ratio as a percent; "—" when null. */
export function fmtPct(v: number | null | undefined, digits = 0): string {
  return v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/**
 * A KPI figure rendered in its own unit. '%' KPIs are stored on a 0..100 scale
 * (the sheet writes target 75 for 75 %), so they are NOT multiplied again.
 */
export function fmtValue(v: number | null | undefined, uom: string | null): string {
  if (v == null) return "—";
  if (uom === "%") return `${NUM.format(v)}%`;
  if (uom === "Jam/Minggu") return `${NUM.format(v)} j`;
  return NUM.format(v);
}

/** Colour a %-achievement cell: green ≥100%, amber 75–99%, red <75%. */
export function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-ink-faint";
  if (v >= 1) return "text-ok";
  if (v >= 0.75) return "text-warn";
  return "text-danger";
}
