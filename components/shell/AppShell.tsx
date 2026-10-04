"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import {
  IconRail,
  NAV_BADGE,
  RAIL_CAPTION,
  RAIL_ROW,
  RAIL_ROW_ACTIVE,
  RailBrand,
  isActive,
} from "./IconRail";
import { Topbar, type ProgramOption } from "./Topbar";
import {
  LAYAR_NAV,
  SECTION_ICON,
  navLabel,
  railWithoutTabs,
  withoutHrefs,
  type NavItem,
} from "./sections";

/**
 * App chrome. One destination, one navigation system:
 *
 * - **Rail (left, desktop)** — cross-program context: Semua Program, Scorecard,
 *   Kabar, Kurasi. Collapsed it shows icon + tooltip, expanded full labels.
 * - **Topbar tabs** — the sections inside the current program.
 * - **Rail "Layar" group (bottom)** — the wall boards (/tv, /arahan,
 *   /countdown) and the arahan input form. Defaulted from {@link LAYAR_NAV} so
 *   every one of the 20+ layouts gets them without being touched; pass `layar`
 *   to override, or `layar={[]}` to hide the group entirely.
 *
 * Layouts may still pass the sections in `railItems` (they historically did);
 * anything already present in `tabs` is stripped from the rail here so no
 * destination appears twice.
 *
 * On mobile there is a single chrome bar (the Topbar, which carries the drawer
 * trigger) plus a scrollable section strip; the drawer holds the rail's
 * cross-program destinations and, under its own heading, the Layar group.
 */
export function AppShell({
  email,
  title,
  currentSlug,
  currentName,
  programs = [],
  railItems,
  tabs = [],
  layar = LAYAR_NAV,
  sync,
  children,
}: {
  email: string;
  title?: string;
  currentSlug?: string;
  currentName?: string;
  programs?: ProgramOption[];
  railItems: NavItem[];
  tabs?: NavItem[];
  /** Wall-board group at the bottom of the rail. Defaults to {@link LAYAR_NAV}. */
  layar?: NavItem[];
  sync?: { label: string; tone: "ok" | "warn" | "bad" };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rail = useMemo(() => railWithoutTabs(railItems, tabs), [railItems, tabs]);
  // A layout that already carries a board in its rail or tabs keeps it there —
  // the Layar group never duplicates a destination that is one click away.
  const boards = useMemo(() => withoutHrefs(layar, rail, tabs), [layar, rail, tabs]);

  async function handleLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden sm:flex">
        <IconRail items={rail} layar={boards} email={email} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={email}
          title={title}
          currentSlug={currentSlug}
          currentName={currentName}
          programs={programs}
          tabs={tabs}
          sync={sync}
          onMenu={() => setOpen(true)}
        />

        <div className="flex-1 overflow-auto">{children}</div>
      </div>

      {/* mobile drawer — cross-program destinations + account */}
      {open ? (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-brand-ink/60"
            onClick={() => setOpen(false)}
          />
          <nav
            aria-label="Navigasi utama"
            className="absolute inset-y-0 left-0 flex w-64 flex-col gap-1 bg-rail p-4"
          >
            <div className="mb-3.5 flex items-center gap-2.5 px-1">
              <RailBrand wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
                className={cn("ml-auto flex-none rounded-lg p-1", RAIL_ROW)}
              >
                <X className="size-5" />
              </button>
            </div>
            {rail.map((item) => (
              <DrawerLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
            ))}

            {boards.length > 0 ? (
              <>
                <div className="mt-4 border-t border-rail-border pt-2">
                  <p className={RAIL_CAPTION}>Layar</p>
                </div>
                {boards.map((item) => (
                  <DrawerLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </>
            ) : null}

            <div className="mt-auto border-t border-rail-border pt-3">
              <p className="truncate px-3 pb-2 text-[11px] text-rail-fg">{email}</p>
              <button
                type="button"
                onClick={handleLogout}
                className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm", RAIL_ROW)}
              >
                <LogOut className="size-[18px]" strokeWidth={1.8} />
                Keluar
              </button>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

/** One row in the mobile drawer — shared by the rail group and the Layar group. */
function DrawerLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const Icon = SECTION_ICON[item.key];
  const pathname = usePathname() ?? "";
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
        RAIL_ROW,
        active && [RAIL_ROW_ACTIVE, "hover:bg-rail-active hover:text-rail-fg-active"],
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.8} />
      {navLabel(item)}
      {item.badge ? (
        <span className={cn(NAV_BADGE, "ml-auto")}>
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
