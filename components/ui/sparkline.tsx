import * as React from "react";

export interface SparklineProps {
  points: number[];
  /** Stroke color. Defaults to `currentColor` so the parent's text color wins. */
  stroke?: string;
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
  /**
   * `true` (default) stretches the line to the parent's full width — the
   * viewBox is drawn at `width` but rendered at 100%. Set `false` for an inline
   * chip-sized spark (e.g. the KPI hero) that must stay exactly `width` wide.
   */
  fluid?: boolean;
}

/**
 * Minimal inline trend line. Normalises `points` to the viewBox and draws a
 * single stroke — no axes, no fill, no dependencies.
 *
 * Degenerate inputs are handled rather than crashing: non-finite values are
 * dropped, fewer than two usable points renders nothing, and an all-equal
 * series draws a flat line through the vertical centre (instead of dividing by
 * a zero span and emitting `NaN` into the path).
 */
export function Sparkline({
  points,
  stroke = "currentColor",
  width = 120,
  height = 40,
  className,
  strokeWidth = 2,
  fluid = true,
}: SparklineProps) {
  const usable = points.filter((p) => Number.isFinite(p));
  if (usable.length < 2) return null;

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min;
  const pad = strokeWidth;
  const stepX = width / (usable.length - 1);
  const inner = Math.max(0, height - pad * 2);

  const d = usable
    .map((p, i) => {
      const x = i * stepX;
      // A flat series has no span to normalise against — centre it.
      const y = span === 0 ? pad + inner / 2 : pad + (1 - (p - min) / span) * inner;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height, width: fluid ? "100%" : width }}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
