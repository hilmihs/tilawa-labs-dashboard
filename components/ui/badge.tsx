import * as React from "react";
import { cn } from "@/lib/utils";
import { chipCapsClass, toneBadgeClass, type StatusTone } from "@/lib/ui/status";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /**
   * Render as the design's status chip — uppercase 11px bold with .06em
   * tracking (AMAN / PERHATIAN / KRITIS). Off by default so existing badges
   * that carry names or free text keep their sentence-case look.
   */
  caps?: boolean;
}

/** Pill badge in the app's (earth-tone) status palette. */
export function Badge({ tone = "neutral", caps = false, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal",
        toneBadgeClass[tone],
        caps && chipCapsClass,
        className,
      )}
      {...props}
    />
  );
}
