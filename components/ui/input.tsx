import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * `border-border-strong`, not `border-neutral-300`: a field's outline is the
 * only thing that says "you can type here", so WCAG 1.4.11 asks for 3:1 against
 * the surface behind it. neutral-300 was 1.5:1 on a white card (invisible) and
 * neutral-700 was 1.7:1 on the dark card — the token clears 3:1 in both themes.
 */
const fieldClass =
  "w-full rounded-lg border border-border-strong bg-transparent px-3 py-2 text-sm placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:bg-neutral-800";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClass, className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldClass, className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldClass, "appearance-none", className)} {...props} />
));
Select.displayName = "Select";

export { fieldClass };
