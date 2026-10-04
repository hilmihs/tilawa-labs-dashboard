import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatTileProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** color class for the value, e.g. "text-danger" */
  valueClassName?: string;
  className?: string;
}

/** KPI tile: big number + muted label. Replaces the three ad-hoc `Stat` helpers. */
export function StatTile({ label, value, hint, valueClassName, className }: StatTileProps) {
  return (
    <div
      className={cn(
        // Matches Card: neutral-200 vanished against `--surface-app` (1.15:1).
        "rounded-xl border border-neutral-300 bg-card p-4 dark:border-neutral-800",
        className,
      )}
    >
      {/* Design 1a hero figure: 800 weight, -0.03em, tabular. */}
      <div className={cn("text-2xl font-extrabold tracking-[-0.03em] tabular-nums", valueClassName)}>
        {value}
      </div>
      <div className="mt-0.5 text-12 text-ink-muted">{label}</div>
      {hint && <div className="mt-1 text-12 text-ink-faint">{hint}</div>}
    </div>
  );
}
