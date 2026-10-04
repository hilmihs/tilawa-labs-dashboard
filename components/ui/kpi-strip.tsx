/**
 * The KPI strip. Contract and rationale live in `./kpi-strip.md`.
 *
 * Muted text here is `text-ink-faint`, not `text-neutral-400`. The latter is
 * 2.6:1 on white and fails WCAG AA — `./README.md` says so in as many words —
 * and this file was the last place still using it, on the very elements that
 * carry meaning: the support hint that gives a percentage its denominator, the
 * caps micro-labels naming each figure, and the `target N%` caption. Colour
 * only; the arbitrary `text-[Npx]` sizes in here are a separate migration,
 * because changing them moves layout on every screen that mounts this.
 *
 * Brand (design "Overhaul Warna Logo" 1a): figures are Plus Jakarta Sans at
 * 800 weight, -0.03em tracking, tabular — no longer Geist Mono semibold. Status
 * colors come from the `ok`/`danger` text tokens and the earth `-600` fills
 * (moss #3D7A57 met, ochre #94600E not yet), not the stock cool palettes.
 */
import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneBadgeClass, type StatusTone } from "@/lib/ui/status";
import { Sparkline } from "@/components/ui/sparkline";

export interface KpiItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small muted line under the number, or an inline unit next to it. */
  hint?: React.ReactNode;
  /** Color class for the value, e.g. "text-danger". */
  valueClassName?: string;
  /** When set (0–100), renders a thin progress bar instead of a hint. */
  bar?: number;
  /** Fill color class for the bar (defaults to primary). */
  barClassName?: string;
}

/** The one number the screen is actually about. */
export interface KpiHero {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Rendered small next to the figure, e.g. "%" or "hlm". */
  unit?: React.ReactNode;
  /** 0–100. Draws the progress bar with a tick + "target N%" caption. */
  target?: number;
  /**
   * 0–100 fill for that bar. Defaults to `value` when it is a number, so pass
   * this only when `value` is preformatted ("99,6") or on a different scale.
   */
  progress?: number;
  /** Change vs the previous period. Sign drives the arrow and the color. */
  delta?: number;
  /** What the delta is measured against, e.g. "vs Agu". */
  deltaLabel?: React.ReactNode;
  /** Trend series, oldest → newest. Fewer than two points renders nothing. */
  spark?: number[];
  /** Where the figure drills down to. */
  href?: string;
  /** Lower is better (backlog, keterlambatan): flips the delta colors. */
  invert?: boolean;
}

/** Context numbers around the hero — size, denominators. Max 3, never 27px. */
export interface KpiSupport {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
}

/** A thing to fix. `value === 0` is dropped, never rendered as a dead zero. */
export interface KpiIssue {
  label: React.ReactNode;
  value: number;
  href?: string;
  /** Defaults to "warning" — reserve "danger" for what breaks today. */
  tone?: StatusTone;
}

export interface KpiStripLegacyProps {
  items: KpiItem[];
  className?: string;
}

export interface KpiStripHeroProps {
  items?: never;
  hero: KpiHero;
  /** Only the first three are rendered. */
  support?: KpiSupport[];
  issues?: KpiIssue[];
  /** Shown as one green line when every issue is zero. */
  allClearText?: React.ReactNode;
  className?: string;
}

export type KpiStripProps = KpiStripLegacyProps | KpiStripHeroProps;

/**
 * The data-console header.
 *
 * Two shapes, one component:
 *
 * - `hero` — the decision layout: one big figure with target/delta/sparkline,
 *   up to three small support numbers, and a chip row of only the non-zero
 *   problems (or a single "all clear" line). Prefer this.
 * - `items` — the legacy strip of equal cells. Kept so the 15 existing callers
 *   keep working; it says "here is a census", not "here is what to do".
 *
 * For a standalone metric use `StatTile`.
 */
export function KpiStrip(props: KpiStripProps) {
  if ("hero" in props) {
    const { hero, support, issues, allClearText, className } = props;
    return (
      <HeroStrip
        hero={hero}
        support={support}
        issues={issues}
        allClearText={allClearText}
        className={className}
      />
    );
  }
  return <LegacyStrip items={props.items} className={props.className} />;
}

/* ---------------------------------------------------------------- hero --- */

function HeroStrip({
  hero,
  support = [],
  issues = [],
  allClearText,
  className,
}: Omit<KpiStripHeroProps, "items">) {
  const open = issues.filter((i) => i.value !== 0);
  // No open issues + no `allClearText` = no footer at all, rather than a rule
  // under an empty row.
  const showFooter = open.length > 0 || allClearText != null;
  const cols = support.slice(0, 3);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-border bg-card",
        className,
      )}
    >
      <div className="flex flex-col gap-x-8 gap-y-4 px-[18px] py-[15px] sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Label>{hero.label}</Label>
          <MaybeLink href={hero.href} className="mt-[5px] block">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <span className="text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
                {hero.value}
                {hero.unit ? (
                  <span className="ml-0.5 text-[16px] font-semibold tracking-normal text-ink-muted">
                    {hero.unit}
                  </span>
                ) : null}
              </span>
              <Delta value={hero.delta} label={hero.deltaLabel} invert={hero.invert} />
              {hero.spark ? (
                <Sparkline
                  points={hero.spark}
                  width={64}
                  height={20}
                  strokeWidth={1.5}
                  fluid={false}
                  className="self-center text-primary"
                />
              ) : null}
            </div>
          </MaybeLink>
          <TargetBar
            target={hero.target}
            progress={hero.progress ?? (typeof hero.value === "number" ? hero.value : undefined)}
            invert={hero.invert}
          />
        </div>

        {cols.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-x-7 gap-y-3 sm:justify-end">
            {cols.map((s, i) => (
              <MaybeLink key={i} href={s.href} className="block">
                <Label>{s.label}</Label>
                {/* Support numbers are ~half the hero on purpose. */}
                <div className="mt-[4px] text-[16px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
                  {s.value}
                </div>
                {s.hint ? (
                  <div className="mt-[5px] text-[10.5px] tabular-nums text-ink-faint">{s.hint}</div>
                ) : null}
              </MaybeLink>
            ))}
          </div>
        ) : null}
      </div>

      {showFooter ? (
        <div className="border-t border-border px-[18px] py-[10px]">
          {open.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {open.map((it, i) => (
                <IssueChip key={i} issue={it} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[12px] text-ok">
              <Check className="size-3.5 shrink-0" aria-hidden />
              <span>{allClearText}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="cap text-[10px] font-bold text-ink-muted">{children}</div>;
}

/** Wraps in a `Link` only when there is somewhere to go. */
function MaybeLink({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function Delta({
  value,
  label,
  invert,
}: {
  value?: number;
  label?: React.ReactNode;
  invert?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value > 0;
  const flat = value === 0;
  const good = invert ? value < 0 : up;
  return (
    <span
      className={cn(
        "text-[11.5px] font-semibold tabular-nums",
        flat ? "text-ink-faint" : good ? "text-ok" : "text-danger",
      )}
    >
      <span aria-hidden>{flat ? "→" : up ? "▲" : "▼"}</span> {fmt(Math.abs(value))}
      {label ? <span className="ml-1 font-medium text-ink-faint">{label}</span> : null}
    </span>
  );
}

function TargetBar({
  target,
  progress,
  invert,
}: {
  target?: number;
  progress?: number;
  invert?: boolean;
}) {
  if (target == null || !Number.isFinite(target)) return null;
  const tick = clamp(target);
  const has = progress != null && Number.isFinite(progress);
  const fill = has ? clamp(progress) : 0;
  // "Met" flips with `invert`: for a backlog metric, under the line is good.
  const met = has && (invert ? fill <= tick : fill >= tick);

  return (
    <div className="mt-[11px] max-w-[320px]">
      <div className="relative h-1.5 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
        <div
          className={cn(
            "h-full rounded-sm",
            !has
              ? "bg-neutral-300 dark:bg-neutral-700"
              : met
                ? "bg-emerald-600 dark:bg-emerald-400"
                : "bg-amber-600 dark:bg-amber-400",
          )}
          style={{ width: `${fill}%` }}
        />
        {/* Target tick sits above the fill so it stays visible once passed. */}
        <div
          className="absolute inset-y-0 w-px bg-neutral-500 dark:bg-neutral-300"
          style={{ left: `${tick}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-[5px] text-[10.5px] tabular-nums text-ink-faint">target {fmt(target)}%</div>
    </div>
  );
}

function IssueChip({ issue }: { issue: KpiIssue }) {
  const body = (
    <>
      <span className="font-bold tabular-nums">{issue.value}</span>
      <span>{issue.label}</span>
    </>
  );
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px]",
    toneBadgeClass[issue.tone ?? "warning"],
  );
  if (!issue.href) return <span className={cls}>{body}</span>;
  return (
    <Link
      href={issue.href}
      className={cn(
        cls,
        "transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </Link>
  );
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Deterministic on server and client — `toLocaleString` is not. */
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/* -------------------------------------------------------------- legacy --- */

function LegacyStrip({ items, className }: KpiStripLegacyProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-border bg-card",
        className,
      )}
    >
      {/*
       * Cells carry their own left/top rule and the grid is nudged -1px so the
       * outer edges get clipped. Unlike `divide-x` this keeps the rules correct
       * once the strip wraps to 2/3 columns on a narrow screen.
       */}
      <div
        className="-ml-px -mt-px grid grid-cols-2 sm:[grid-template-columns:repeat(min(var(--kpi-cols),3),minmax(0,1fr))] lg:[grid-template-columns:repeat(var(--kpi-cols),minmax(0,1fr))]"
        style={{ "--kpi-cols": items.length } as React.CSSProperties}
      >
        {items.map((it, i) => (
          <div key={i} className="border-l border-t border-border px-[18px] py-[15px]">
            <div className="cap text-[10px] font-bold text-ink-muted">{it.label}</div>
            <div
              className={cn(
                "mt-[5px] text-[27px] font-extrabold leading-none tracking-[-0.03em] tabular-nums",
                it.valueClassName,
              )}
            >
              {it.value}
            </div>
            {typeof it.bar === "number" ? (
              <div className="mt-[9px] h-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
                <div
                  className={cn("h-full", it.barClassName ?? "bg-primary")}
                  style={{ width: `${Math.max(0, Math.min(100, it.bar))}%` }}
                />
              </div>
            ) : it.hint ? (
              <div className="mt-[9px] text-[10.5px] tabular-nums text-ink-faint">{it.hint}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
