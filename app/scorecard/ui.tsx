// Shared presentational bits for the scorecard tables. Server components only —
// pure markup, no client JS. The palette follows the rest of the dashboard
// (neutral + blue accent), tuned for a dense KPI table: legible, scannable,
// quietly refined rather than loud.
import { pctClass } from "./format";

/** A compact achievement bar: the % label with a thin track underneath, coloured
 *  by band (green ≥100 / amber ≥75 / red <75). Reads faster than a bare number. */
export function PctBar({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-neutral-300 dark:text-neutral-600">—</span>;
  const clamped = Math.max(0, Math.min(1, pct));
  const track =
    pct >= 1
      ? "bg-emerald-500"
      : pct >= 0.75
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`text-xs font-semibold tabular-nums ${pctClass(pct)}`}>
        {`${Math.round(pct * 100)}%`}
      </span>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <span className={`block h-full rounded-full ${track}`} style={{ width: `${clamped * 100}%` }} />
      </span>
    </div>
  );
}

/** A tiny red dot when a KPI has a flagged problem, so the note columns can move
 *  into the drill-down without hiding that a row needs attention. */
export function ProblemDot({ has }: { has: boolean }) {
  if (!has) return null;
  return (
    <span
      className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 align-middle"
      title="Ada problem / corrective action — buka detail"
    />
  );
}

/** One-line legend explaining the two achievement figures. */
export function ScorecardLegend() {
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
      <span>
        <b className="font-medium text-neutral-700 dark:text-neutral-300">Ach</b> = hitung
        langsung dari akumulasi baris OYP (live)
      </span>
      <span>
        <b className="font-medium text-neutral-700 dark:text-neutral-300">Sheet</b> = angka asli
        spreadsheet
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="rounded border border-neutral-300 px-1 text-11 text-ink-muted dark:border-neutral-700 dark:text-neutral-400">
          ≠ sheet
        </span>
        = angka sheet belum sama dengan hitungan live (penanda mutu data)
      </span>
    </p>
  );
}
