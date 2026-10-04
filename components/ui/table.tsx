import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll wrapper + bordered card frame shared by every data table.
 *
 * Pass `maxHeight` to make the body scroll vertically inside the frame; that is
 * what `<THead sticky>` needs to stick against (a sticky header inside a wrapper
 * that only scrolls horizontally has nothing to stick to).
 *
 * Light mode: the frame carries `bg-card`. It used to be transparent, so a table
 * dropped straight on the page inherited `--surface-app` and its neutral-50 head
 * and zebra bands — both LIGHTER than that canvas — read inverted. Dark keeps the
 * transparent frame it always had (`--card` and `neutral-900` are the same color
 * there, so a filled frame would erase the header instead).
 */
export function TableWrap({
  className,
  maxHeight,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { maxHeight?: number | string }) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-neutral-300 bg-card dark:border-neutral-800 dark:bg-transparent",
        maxHeight != null && "overflow-y-auto",
        className,
      )}
      style={maxHeight != null ? { maxHeight, ...style } : style}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-sm", className)} {...props} />;
}

/**
 * `sticky` pins the header while the body scrolls. The background must stay
 * opaque (rows scroll *under* it), so the sticky variant repeats the solid
 * surface color on every `th` instead of relying on the wrapper's — never a
 * `/xx` alpha here, or the rows show through in light mode.
 *
 * Light mode uses `neutral-100`, not `neutral-50`: neutral-50 was within 1.04:1
 * of a white row, so with `zebra` the header and every even row were the same
 * band. The 1px `--border-strong` rule under the head (3.21:1 on neutral-100)
 * is what actually separates head from body, and it is drawn whether or not the
 * head is pinned. `text-ink-faint` on neutral-100 = 4.64:1.
 */
export function THead({
  className,
  sticky = false,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return (
    <thead
      className={cn(
        "bg-neutral-100 [&_th]:shadow-[inset_0_-1px_0_var(--border-strong)] dark:bg-neutral-900",
        sticky && "sticky top-0 z-10 [&_th]:bg-neutral-100 dark:[&_th]:bg-neutral-900",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `zebra` tints every other row. Use it on tables wider than ~6 columns where
 * the eye loses the row; leave it off for short tables (banding adds noise).
 *
 * The light band is `neutral-100` (1.09:1 against a white row). `neutral-50/70`
 * — the old value — landed at 1.03:1, which is below what an average laptop
 * panel resolves: the stripes were effectively not there.
 */
export function TBody({
  className,
  zebra = false,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & { zebra?: boolean }) {
  return (
    <tbody
      className={cn(
        zebra &&
          "[&>tr:nth-child(even)]:bg-neutral-100 dark:[&>tr:nth-child(even)]:bg-neutral-900/40",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className} {...props} />;
}

/**
 * Numeric columns: right-aligned + tabular figures so digits line up in a
 * column. Exported as a class too, for callers that build their own cells.
 */
export const numericClass = "text-right tabular-nums";

export function TH({
  className,
  numeric = false,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left font-medium text-ink-faint",
        numeric && numericClass,
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        // neutral-100 row rules were 1.09:1 on a white card — gone. neutral-200
        // is the hairline divider weight (1.26:1), enough to read a row edge.
        "px-3 py-2 border-t border-neutral-200 dark:border-neutral-900",
        numeric && numericClass,
        className,
      )}
      {...props}
    />
  );
}

/**
 * A number with its denominator/context kept on the SAME line: `86% 12/14`,
 * not a value with a second line under it. Stacked fractions doubled every row
 * height across the app for information that reads fine inline and muted.
 *
 *   <Numeric value="86%" fraction="12/14" />
 *   <Numeric value={12} fraction={`dari ${total}`} />
 */
export function Numeric({
  value,
  fraction,
  className,
  fractionClassName,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  value: React.ReactNode;
  fraction?: React.ReactNode;
  fractionClassName?: string;
}) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)} {...props}>
      {value}
      {fraction != null && fraction !== "" && (
        <span className={cn("ml-1 text-11 font-normal text-ink-faint", fractionClassName)}>
          {fraction}
        </span>
      )}
    </span>
  );
}

/** `<TD numeric>` + `<Numeric>` in one, for the common "value + /total" cell. */
export function TDNum({
  value,
  fraction,
  fractionClassName,
  valueClassName,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  value: React.ReactNode;
  fraction?: React.ReactNode;
  fractionClassName?: string;
  valueClassName?: string;
}) {
  return (
    <TD numeric {...props}>
      <Numeric
        value={value}
        fraction={fraction}
        className={valueClassName}
        fractionClassName={fractionClassName}
      />
    </TD>
  );
}

// ── sorting ────────────────────────────────────────────────────────────────
/**
 * Click-to-sort headers for the data tables.
 *
 * The accessor map is passed in rather than inferred: a column shows
 * "12 / 124" or "Ustadzah Nurlayla" but sorts on a number or a plain name, and
 * only the caller knows which. Keep the map a module-level constant — it is a
 * `useMemo` dependency, and a fresh object every render would re-sort the whole
 * table on every keystroke elsewhere on the page.
 */
export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir };
export type SortAccessors<T> = Record<string, (row: T) => string | number | null | undefined>;

export function useTableSort<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  initial?: SortState,
) {
  const [state, setState] = React.useState<SortState | null>(initial ?? null);

  const sorted = React.useMemo(() => {
    const get = state ? accessors[state.key] : undefined;
    if (!state || !get) return rows;
    const dir = state.dir === "asc" ? 1 : -1;
    // Nulls last in BOTH directions: "no data" is not the smallest value, and a
    // column of blanks at the top hides the rows the sort was meant to surface.
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const aNull = va == null || va === "";
      const bNull = vb == null || vb === "";
      if (aNull || bNull) return aNull && bNull ? 0 : aNull ? 1 : -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "id", { numeric: true }) * dir;
    });
  }, [rows, state, accessors]);

  /** First click on a column sorts descending — the interesting end of a metric. */
  const toggle = React.useCallback((key: string) => {
    setState((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }, []);

  return { rows: sorted, sort: state, toggle };
}

export function SortTH({
  sortKey,
  sort,
  onSort,
  className,
  children,
}: {
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort?.key === sortKey;
  const arrow = !active ? "↕" : sort.dir === "asc" ? "↑" : "↓";
  const alignRight = className?.includes("text-right");
  return (
    <TH className={cn("p-0", className)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex w-full items-center gap-1 px-3 py-2 font-medium hover:text-foreground",
          // Design 1c: the sorted column's label goes ink, its arrow bronze.
          active && "text-foreground",
          alignRight && "justify-end",
        )}
      >
        {children}
        <span className={cn("text-11", active ? "text-brand-bronze dark:text-brand-gold" : "text-ink-faint")}>
          {arrow}
        </span>
      </button>
    </TH>
  );
}
