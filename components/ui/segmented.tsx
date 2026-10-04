"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "default";
}

/** Button-group toggle (gender/marhalah/period filters) — one shared style. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "default",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        // Light: neutral-50 on a white card was a 1.04:1 track with a 1.26:1
        // edge — the group read as loose text, not as a control. The warm
        // neutral-100/300 pair is the design's #EFEBDF track / #CFC8B6 edge.
        "inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            // Design 1c: the selected segment is filled with the primary token —
            // forest + white in light, gold + ink in dark (10.8:1 / 7.5:1).
            value === o.value
              ? "bg-primary font-semibold text-primary-foreground shadow-sm"
              : "text-neutral-600 hover:text-foreground dark:text-neutral-400",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
