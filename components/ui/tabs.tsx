"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Same light-mode fix as SegmentedControl: the neutral-50 track was
      // invisible on a white card (1.04:1) behind a 1.26:1 border.
      "inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      /*
       * Active tab (design 1c): ink text on a raised card-colored pill with the
       * bronze 2px underline the program nav uses — bronze is 3.25:1 on white;
       * dark swaps to gold (7.1:1 on neutral-800). Drawn as an inset shadow so
       * the trigger keeps its exact box.
       */
      "rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_var(--brand-bronze)] dark:text-neutral-400 dark:data-[state=active]:bg-neutral-800 dark:data-[state=active]:shadow-[inset_0_-2px_0_var(--brand-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = TabsPrimitive.Content;
