"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_ICON, navLabel, type NavItem } from "./sections";
import markForest from "@/public/brand/mark-forest.png";

const STORAGE_KEY = "mabni.rail.expanded";
const RAIL_EVENT = "mabni:rail-toggle";

/** Collapsed/expanded lives in localStorage so it survives navigation. */
function subscribeRail(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(RAIL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RAIL_EVENT, onChange);
  };
}

function readRail(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // private mode / storage disabled — stay collapsed
  }
}

function writeRail(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(RAIL_EVENT));
}

/*
 * Rail palette (design "Overhaul Warna Logo" 1b/1c). The rail is forest in both
 * themes, so these never flip under dark mode. Idle rows sit in `rail-fg`
 * (sage), hover warms to a pale gold on an 8% gold wash, the active row is gold
 * text on the `rail-active` gold tint. Focus uses gold rather than the bronze
 * `--ring`: bronze on forest is ~3:1, gold is well clear of it.
 */
export const RAIL_ROW =
  "text-rail-fg transition-colors hover:bg-brand-gold/[0.08] hover:text-[#e9e1c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/80";
export const RAIL_ROW_ACTIVE = "bg-rail-active font-semibold text-rail-fg-active";
/** Group caption on the rail ("Layar"). */
export const RAIL_CAPTION =
  "cap px-3 pb-1 text-[10px] font-bold text-[#8a9c95]";
/** Count badge — brick red (#A63F2D), white numerals. */
export const NAV_BADGE =
  "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9.5px] font-bold leading-none text-white tabular-nums";

/**
 * Brand tile + wordmark: the forest mountain mark on a gold tile, and — when
 * `wordmark` — "Tilawa Labs / #Pendidikan" beside it. Shared by the rail
 * and the mobile drawer so both open on the same identity.
 */
export function RailBrand({ wordmark }: { wordmark: boolean }) {
  return (
    <>
      <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-brand-gold">
        <Image src={markForest} alt="" unoptimized loading="eager" className="h-auto w-[26px]" />
      </span>
      {wordmark ? (
        <span className="flex min-w-0 flex-col leading-[1.15]">
          <span className="truncate text-[13px] font-extrabold tracking-[-0.01em] text-white">
            Tilawa Labs
          </span>
          <span className="truncate text-[11.5px] text-brand-gold">#Pendidikan</span>
        </span>
      ) : null}
    </>
  );
}

/** Whether a rail/drawer destination is the current page. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Vertical forest rail — cross-program context only (Semua Program, Scorecard,
 * Kabar, Kurasi). Sections inside a program live in the topbar tabs.
 *
 * Two states: collapsed (icon + hover/focus tooltip, 74px) and expanded (icon +
 * full label, 208px). No abbreviations in either state.
 *
 * `layar` is a second, quieter group pinned below the first behind a divider:
 * the wall boards (/tv, /arahan, /countdown) and the arahan input form. Separate
 * on purpose — they are display screens, not daily tools, and mixing them into
 * the list above would read as "another section of the dashboard".
 */
export function IconRail({
  items,
  layar = [],
  email,
}: {
  items: NavItem[];
  layar?: NavItem[];
  email: string;
}) {
  const pathname = usePathname() ?? "";
  const initials = email.slice(0, 2).toUpperCase();
  const expanded = useSyncExternalStore(subscribeRail, readRail, () => false);

  return (
    <nav
      aria-label="Navigasi utama"
      className={cn(
        "flex flex-none flex-col gap-[3px] bg-rail py-[15px] transition-[width] duration-150",
        expanded ? "w-52 items-stretch px-3" : "w-[74px] items-center",
      )}
    >
      <Link
        href="/"
        aria-label="Beranda"
        className={cn(
          "mb-3.5 flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/80 focus-visible:ring-offset-2 focus-visible:ring-offset-rail",
          expanded ? "px-1" : "justify-center",
        )}
      >
        <RailBrand wordmark={expanded} />
      </Link>

      {items.map((item) => (
        <RailLink key={item.href} item={item} expanded={expanded} pathname={pathname} />
      ))}

      {layar.length > 0 ? (
        <div
          className={cn(
            "mt-auto flex flex-col gap-[3px] border-t border-rail-border pt-2",
            expanded ? "items-stretch" : "w-[46px] items-center",
          )}
        >
          {expanded ? <span className={RAIL_CAPTION}>Layar</span> : null}
          {layar.map((item) => (
            <RailLink key={item.href} item={item} expanded={expanded} pathname={pathname} />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => writeRail(!expanded)}
        aria-label={expanded ? "Ciutkan menu" : "Lebarkan menu"}
        aria-expanded={expanded}
        title={expanded ? "Ciutkan menu" : "Lebarkan menu"}
        className={cn(
          "flex items-center gap-3 rounded-xl py-2",
          RAIL_ROW,
          layar.length > 0 ? "mt-2" : "mt-auto",
          expanded ? "px-3" : "w-[46px] justify-center",
        )}
      >
        {expanded ? (
          <PanelLeftClose className="size-[18px] flex-none" strokeWidth={1.8} />
        ) : (
          <PanelLeftOpen className="size-[18px] flex-none" strokeWidth={1.8} />
        )}
        {expanded ? <span className="truncate text-[13px]">Ciutkan</span> : null}
      </button>

      <div
        title={email}
        className={cn(
          "mt-2 flex items-center gap-2.5 text-rail-fg",
          expanded ? "px-1" : "justify-center",
        )}
      >
        <span className="flex size-[34px] flex-none items-center justify-center rounded-[10px] bg-rail-border text-[11px] font-bold text-[#e9e1c4]">
          {initials}
        </span>
        {expanded ? <span className="truncate text-[11px]">{email}</span> : null}
      </div>
    </nav>
  );
}

/** One rail row. Identical in both groups — only the wrapper differs. */
function RailLink({
  item,
  expanded,
  pathname,
}: {
  item: NavItem;
  expanded: boolean;
  pathname: string;
}) {
  const Icon = SECTION_ICON[item.key];
  const label = navLabel(item);
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={expanded ? undefined : label}
      className={cn(
        "group relative flex items-center rounded-xl transition-colors",
        expanded ? "gap-3 px-3 py-2" : "w-[46px] justify-center py-[11px]",
        active ? cn(RAIL_ROW, RAIL_ROW_ACTIVE, "hover:bg-rail-active hover:text-rail-fg-active") : RAIL_ROW,
      )}
    >
      <Icon className="size-[19px] flex-none" strokeWidth={1.8} />
      {expanded ? (
        <span className="truncate text-[13px]">{label}</span>
      ) : (
        /* collapsed: label as a hover/focus tooltip instead of an abbreviation */
        <span
          role="tooltip"
          className="pointer-events-none absolute left-[54px] z-50 hidden whitespace-nowrap rounded-md bg-brand-ink px-2 py-1 text-[12px] font-medium text-white shadow-lg ring-1 ring-brand-gold/25 group-hover:block group-focus-visible:block"
        >
          {label}
        </span>
      )}
      {item.badge ? (
        <span
          className={cn(
            NAV_BADGE,
            expanded ? "ml-auto" : "absolute right-[7px] top-[6px] ring-2 ring-rail",
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
