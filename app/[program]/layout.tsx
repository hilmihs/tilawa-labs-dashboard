import { collapseFamilies, familyDisplayName, readBatchConfig } from "@/lib/programs/families";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import type { NavItem } from "@/components/shell/sections";
import { requireProgramAccess, getAllPrograms } from "@/lib/programs/resolve";
import { hidePairedPresensi, presensiParentOf } from "@/lib/programs/config";
import { programTabs } from "@/lib/programs/nav";
import { punyaHasilUjian } from "@/lib/insights/evaluasi/maahir";
import { getNewsNav } from "@/lib/news/auth";

export default async function ProgramLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ program: string }>;
}) {
  const { program: slug } = await params;

  let user, program;
  try {
    ({ user, program } = await requireProgramAccess(slug));
  } catch (err) {
    const reason = err instanceof Error ? err.message : "";
    if (reason === "UNAUTHENTICATED") redirect("/login");
    // No access to this program (or it doesn't exist) — send them home, where
    // the root route routes them to a program they can see (or /overview).
    redirect("/");
  }

  // Programs to offer in the switcher: everything for a super_coordinator,
  // otherwise only the ones this coordinator was granted.
  const all = await getAllPrograms();
  // A paired presensi program (hkm-presensi) is reached through its parent's
  // Presensi tab, so it is not listed beside it — see hidePairedPresensi.
  const presensiParent = presensiParentOf(all, slug);
  const switchable = hidePairedPresensi(
    user.role === "super_coordinator"
      ? all
      : all.filter(
          (p) =>
            user.programs.includes(p.slug) ||
            (p.slug === slug && presensiParent != null && user.programs.includes(presensiParent.slug)),
        ),
  );
  const parentVisible = presensiParent != null && switchable.some((p) => p.slug === presensiParent.slug);

  const news = await getNewsNav(user);
  const isSuper = user.role === "super_coordinator";

  // Program sections shown as topbar text-tabs. Built per data source rather
  // than as one array for every program: a tab is offered only when the route
  // behind it can actually render data. See lib/programs/nav.ts.
  // Inside a paired presensi program the "Kehadiran" tab goes back to the
  // parent's page, whose Presensi section is its dashboard now.
  const adaHasilUjian = program.dataSourceType === "tilawah_api" ? await punyaHasilUjian(slug, program.id) : false;
  const tabs = programTabs(program, { punyaHasilUjian: adaHasilUjian }).map((t) =>
    parentVisible && t.key === "dashboard"
      ? { ...t, href: `/${presensiParent.slug}/dashboard#presensi` }
      : t,
  );

  // Division-wide destinations (rail only).
  const divisionItems: NavItem[] = [
    ...(isSuper ? [{ key: "scorecard" as const, href: `/scorecard`, label: "Scorecard" }] : []),
    ...(news.kabar ? [{ key: "kabar" as const, href: `/berita`, label: "Kabar" }] : []),
    ...(news.kurasi ? [{ key: "kurasi" as const, href: `/berita/kurasi`, label: "Kurasi" }] : []),
  ];

  const railItems: NavItem[] = [
    ...(switchable.length > 1 || isSuper
      ? [{ key: "overview" as const, href: "/overview", label: "Semua Program" }]
      : []),
    ...tabs,
    ...divisionItems,
  ];

  return (
    <AppShell
      email={user.email}
      currentSlug={parentVisible ? presensiParent.slug : slug}
      currentName={
        parentVisible
          ? `${presensiParent.name} · Presensi`
          : readBatchConfig(program.config)
            ? familyDisplayName(program.name)
            : program.name
      }
      programs={collapseFamilies(switchable, parentVisible ? presensiParent.slug : slug)}
      railItems={railItems}
      tabs={tabs}
    >
      {children}
    </AppShell>
  );
}
