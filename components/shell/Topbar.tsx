"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, RefreshCw, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { signOut } from "@/app/login/actions";
import { triggerSync } from "@/app/[program]/actions";
import { navLabel, type NavItem } from "./sections";
import { NAV_BADGE } from "./IconRail";

export type ProgramOption = { slug: string; name: string };

// Earth-tone status dots (design 1c: moss #3D7A57 / ochre / brick).
const syncToneClass = {
  ok: "bg-emerald-600 dark:bg-emerald-500",
  warn: "bg-amber-600 dark:bg-amber-500",
  bad: "bg-red-600 dark:bg-red-500",
} as const;

/** Focus ring for every control in the bar — `--ring` is bronze (gold on dark). */
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function tabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Ref callback for the active tab: bring it into view inside its scroller.
 *
 * Both tab strips scroll horizontally, and a program can now carry 13 sections.
 * Landing on the last one (`/hits-regular/perubahan`) leaves the strip at
 * scrollLeft 0 with the bronze underline indicator off-screen — the one piece of
 * "you are here" the chrome offers, invisible. `inline: "nearest"` leaves an
 * already-visible tab alone, and `block: "nearest"` keeps the page itself from
 * scrolling vertically just to satisfy a horizontal nudge.
 */
function useScrollActiveIntoView() {
  return useCallback((node: HTMLAnchorElement | null) => {
    node?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, []);
}

/**
 * The one chrome bar, at every width: program switcher + section tabs + sync
 * status + user. On mobile it also carries the drawer trigger (the rail is
 * hidden there) and drops the section tabs into a scrollable strip underneath,
 * so switching sections never requires opening the drawer.
 */
export function Topbar({
  email,
  title,
  currentSlug,
  currentName,
  programs = [],
  tabs = [],
  sync,
  onMenu,
}: {
  email: string;
  /** Shown instead of the program switcher on program-less screens (overview). */
  title?: string;
  currentSlug?: string;
  currentName?: string;
  programs?: ProgramOption[];
  tabs?: NavItem[];
  sync?: { label: string; tone: "ok" | "warn" | "bad" };
  /** Opens the mobile drawer. Omitted on screens without a drawer. */
  onMenu?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [pending, start] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const scrollActiveIntoView = useScrollActiveIntoView();

  async function handleLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  function switchProgram(slug: string) {
    if (!currentSlug) {
      router.push(`/${slug}/dashboard`);
      return;
    }
    const rest = pathname.replace(`/${currentSlug}`, "") || "/dashboard";
    router.push(`/${slug}${rest}`);
  }

  function runSync() {
    if (!currentSlug) return;
    start(async () => {
      const r = await triggerSync(currentSlug);
      setSyncMsg(r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <>
      <header className="flex h-14 flex-none items-center gap-0 border-b border-border bg-card px-4 sm:px-6">
        {onMenu ? (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Buka menu"
            className={cn(
              "-ml-1 mr-2 rounded-lg p-1.5 text-ink-muted hover:bg-accent hover:text-foreground sm:hidden",
              FOCUS,
            )}
          >
            <Menu className="size-5" />
          </button>
        ) : null}

        {/* left: program identity / switcher */}
        {currentSlug ? (
          <div className="flex h-full min-w-0 items-center gap-2 pr-3 sm:pr-[18px]">
            <span className="cap hidden text-[10px] font-bold text-ink-muted sm:inline">
              Program
            </span>
            {programs.length > 1 ? (
              <span className="relative inline-flex min-w-0 items-center">
                <Select
                  value={currentSlug}
                  onChange={(e) => switchProgram(e.target.value)}
                  aria-label="Pindah program"
                  className="w-auto max-w-[46vw] rounded-lg py-1 pl-2 pr-7 text-sm font-bold sm:max-w-none"
                >
                  {programs.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-ink-muted" />
              </span>
            ) : (
              <span className="truncate text-sm font-bold">{currentName ?? title}</span>
            )}
          </div>
        ) : (
          <span className="truncate text-sm font-bold">{title}</span>
        )}

        {/* center: section tabs (desktop; mobile gets the strip below) */}
        {tabs.length > 0 ? (
          // Bisa memuat 13 seksi sejak program HITS mendapat Evaluasi, Disiplin,
          // Observasi, Inspeksi, dan Shakwa. Tanpa `min-w-0` + `overflow-x-auto`,
          // baris tab yang kepanjangan mendorong blok sync/user di kanan keluar
          // layar alih-alih menggulir. Scrollbar disembunyikan seperti pada strip
          // mobile di bawah.
          <nav
            aria-label="Seksi program"
            className="ml-2 hidden h-full min-w-0 items-stretch overflow-x-auto sm:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => {
              const active = tabActive(pathname, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  ref={active ? scrollActiveIntoView : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-none items-center gap-1.5 border-b-2 px-3.5 text-[13px] transition-colors",
                    // inset ring: the tab is flush with the bar, an outer ring would be clipped
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    active
                      ? "border-brand-bronze font-bold text-foreground dark:border-brand-gold"
                      : "border-transparent text-ink-muted hover:border-brand-gold/50 hover:text-foreground",
                  )}
                >
                  {navLabel(t)}
                  {t.badge ? <span className={NAV_BADGE}>{t.badge}</span> : null}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {/* right: sync + user */}
        <div className="ml-auto flex flex-none items-center gap-3 pl-3 sm:gap-3.5">
          {sync ? (
            <div className="hidden items-center gap-[7px] text-[11px] tabular-nums text-ink-muted md:flex">
              <span className={cn("size-1.5 rounded-full", syncToneClass[sync.tone])} />
              {syncMsg ?? sync.label}
            </div>
          ) : null}
          {currentSlug ? (
            <button
              type="button"
              onClick={runSync}
              disabled={pending}
              aria-label="Sync sekarang"
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-brand-forest px-2.5 py-[7px] text-[12.5px] font-semibold text-white transition-colors hover:bg-[#3b524c] disabled:opacity-50 sm:px-3",
                "dark:bg-brand-gold dark:text-brand-ink dark:hover:bg-[#d8ca8f]",
                FOCUS,
                "focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              )}
            >
              <RefreshCw
                className={cn(
                  "size-3.5 text-brand-gold dark:text-brand-ink",
                  pending && "animate-spin",
                )}
              />
              {pending ? "Sync…" : "Sync"}
            </button>
          ) : null}
          <span className="hidden text-[12.5px] text-ink-muted lg:inline">{email}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            aria-label="Keluar"
            className="hidden size-8 p-0 text-ink-muted hover:bg-accent hover:text-foreground sm:inline-flex"
          >
            <LogOut />
          </Button>
        </div>
      </header>

      {/* mobile: sections as a horizontally scrollable strip — no drawer needed */}
      {tabs.length > 0 ? (
        <nav
          aria-label="Seksi program"
          className="flex flex-none gap-1 overflow-x-auto border-b border-border bg-card px-3 py-1.5 sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => {
            const active = tabActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                ref={active ? scrollActiveIntoView : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-none items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors",
                  FOCUS,
                  active
                    ? "border-brand-bronze bg-accent font-bold text-foreground dark:border-brand-gold/60"
                    : "border-transparent text-ink-muted hover:bg-accent hover:text-foreground",
                )}
              >
                {navLabel(t)}
                {t.badge ? <span className={NAV_BADGE}>{t.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
