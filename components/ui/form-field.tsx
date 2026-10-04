import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + optional hint, with consistent vertical spacing. */
export function FormField({ label, htmlFor, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {/* text-neutral-500 was 4.32:1 on the app canvas and 3.79:1 on a dark card. */}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
