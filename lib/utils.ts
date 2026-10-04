import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * The app's type scale (`text-11` … `text-28`, app/globals.css) is unknown to
 * stock tailwind-merge, which then reads e.g. `text-12` as a text COLOUR and
 * drops it next to `text-ink-muted` (or drops the colour next to `text-11`).
 * Registering the steps as font sizes keeps both.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["11", "12", "14", "16", "20", "28"] } },
});

/** Merge conditional class names, resolving Tailwind conflicts (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
