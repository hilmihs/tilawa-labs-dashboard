import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** emerald success framing (e.g. "nothing to do 🎉") vs neutral */
  tone?: "neutral" | "success";
  className?: string;
}

export function EmptyState({ icon, title, description, tone = "neutral", className }: EmptyStateProps) {
  const success = tone === "success";
  /*
   * The neutral tone was `text-neutral-500`: 4.32:1 on the app canvas, 3.79:1 on
   * the dark card. `text-ink-muted` is the theme-aware role (5.87:1 / 8.95:1).
   * `opacity-80` on the description compounded it (ink-muted at 80% over white
   * is 3.77:1), so the fade now only applies to the success tone, where the
   * emerald body text still clears AA at 4.54:1.
   */
  const toneCls = success
    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    : "border-neutral-300 bg-card text-ink-muted dark:border-neutral-800";
  return (
    <div className={cn("rounded-xl border px-5 py-8 text-center", toneCls, className)}>
      {icon && <div className="mb-2 text-2xl">{icon}</div>}
      <div className={cn("font-medium", !success && "text-foreground")}>{title}</div>
      {description && <p className={cn("mt-1 text-sm", success && "opacity-80")}>{description}</p>}
    </div>
  );
}
