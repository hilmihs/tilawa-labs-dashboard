import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button hierarchy — one rule per screen (see components/ui/README.md).
 *
 *   default / primary  THE action of the screen. At most one, and only when the
 *                      screen really has a main verb ("Tampilkan", "Simpan").
 *   secondary/outline  supporting actions that are cheap and reversible
 *                      ("Export xlsx", "Refresh sekarang"). Any number.
 *   ghost              tertiary / in-table / toolbar actions. No border, so it
 *                      never competes with the two above.
 *   heavy              EXPENSIVE or wide-blast-radius actions that are not
 *                      destructive ("Tarik ulang penuh", re-import, backfill).
 *                      Ochre (warn) dashed outline: readable as "think first", but
 *                      visually quieter than a primary. Always pair with a
 *                      confirm step and a `title` explaining the cost.
 *   destructive        deletes / irreversible data loss. Solid red, confirm.
 *   success            positive commit action ("Ingatkan via WA"). Use sparingly.
 *   link               inline navigation that must look like text.
 *
 * `primary` and `outline` are aliases (shadcn naming) kept so callers can use
 * whichever name reads better; they render exactly like default / secondary.
 *
 * Colors are the earth-tone brand (design "Overhaul Warna Logo" 1a): primary
 * is the `--primary` token — forest #2E413D with white text in light, gold
 * #CCBB76 with ink text in dark (no per-theme overrides here, the token flips).
 * Destructive is brick #A63F2D, success moss #2F6546, heavy the ochre `--warn`.
 * Focus ring is `--ring` (bronze #A38D45; gold in dark).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border border-border-strong bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800",
        outline:
          "border border-border-strong bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800",
        ghost: "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        heavy:
          "border border-dashed border-warn bg-transparent text-warn hover:bg-amber-50 dark:border-amber-400/60 dark:hover:border-amber-400 dark:hover:bg-amber-950/40",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        success: "bg-emerald-700 text-white hover:bg-emerald-800",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        xs: "h-7 rounded-md px-2 text-11",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-lg px-6",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
