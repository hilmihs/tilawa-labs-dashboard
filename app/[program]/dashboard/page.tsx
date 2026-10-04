import { redirect } from "next/navigation";
import { getAllPrograms, getProgram, resolveProgramAccess } from "@/lib/programs/resolve";
import { getCurrentUser } from "@/lib/auth/current-user";
import { presensiParentOf } from "@/lib/programs/config";
import { HkmDashboard } from "../hkm/HkmDashboard";
import { AttendanceDashboard } from "./AttendanceDashboard";
import { HkmHeader } from "./HkmHeader";
import { MabniTabs, type MabniTab } from "./MabniTabs";
import { MabniSetoran } from "./MabniSetoran";
import { MabniDelivery } from "./MabniDelivery";
import { MabniQualityStrip } from "./MabniQualityStrip";
import { MaahirDashboard } from "./MaahirDashboard";

export const metadata = { title: "Monitoring Kehadiran" };
// Live DB read on every request — no static prerendering.
export const dynamic = "force-dynamic";

/**
 * Table pages get the screen. The halaqah table is 13 columns wide and 128 rows
 * long; boxing it in `max-w-5xl` wrapped teacher names onto three lines while
 * ~350px of a 1500px screen stayed empty. Prose keeps its own narrow measure
 * (see `max-w-3xl` on the intro copy inside the dashboards).
 */
const WIDE = "mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{
    mode?: string;
    month?: string;
    tab?: string;
    batch?: string;
    filter?: string;
  }>;
}) {
  const { program } = await params;
  const sp = await searchParams;
  const programRow = await getProgram(program);

  // A paired presensi program (hkm-presensi) has no dashboard of its own any
  // more: it is the Presensi section of the parent's page. Send the old URL there, keeping the
  // drill-down filter, when the viewer can open the parent.
  const presensiParent = presensiParentOf(await getAllPrograms(), program);
  if (presensiParent) {
    const user = await getCurrentUser();
    if (user && (await resolveProgramAccess(user, presensiParent.slug))) {
      const q = sp.filter ? `?${new URLSearchParams({ filter: sp.filter })}` : "";
      redirect(`/${presensiParent.slug}/dashboard${q}#presensi`);
    }
  }

  // Berkah-backed programs (HKM) render the tilawah-monitoring (setoran)
  // dashboard. When a presensiSlug is configured, wrap it in tabs so the paired
  // tilawah program (attendance) shows under a "Presensi" tab.
  if (programRow?.dataSourceType === "berkah_api") {
    const presensiSlug = (programRow.config as { presensiSlug?: string } | null)?.presensiSlug;
    const mode = sp.mode === "kumulatif" ? "kumulatif" : "bulanan";

    if (presensiSlug) {
      // One page, two sections — see HkmHeader. `?tab=presensi` from older
      // links is simply ignored; both halves are on the page.
      return (
        <main className={`${WIDE} space-y-10`}>
          <HkmHeader program={program} name={programRow.name} presensiSlug={presensiSlug} />
          <section id="presensi" className="scroll-mt-6">
            <AttendanceDashboard
              program={presensiSlug}
              title="Presensi"
              showPiketNote={false}
              filter={sp.filter}
              basePath={`/${program}/dashboard`}
            />
          </section>
          <HkmDashboard program={program} mode={mode} month={sp.month} embedded />
        </main>
      );
    }
    return <HkmDashboard program={program} mode={mode} month={sp.month} />;
  }

  // Maahir does not sync attendance rows we could aggregate — its API hands out
  // finished monthly reports (28→27 window, its own denominators), so this
  // dashboard mirrors that report instead of the shared attendance view.
  if (programRow?.dataSourceType === "maahir_api") {
    return (
      <main className={WIDE}>
        <MaahirDashboard program={program} month={sp.month} />
      </main>
    );
  }

  // Mabni carries three kinds of data the API keeps separate — attendance,
  // setoran, and whether the class ran at all — so each gets its own tab
  // instead of one very long page that queries all three every visit.
  if (programRow?.dataSourceType === "mabni_api") {
    const tab: MabniTab =
      sp.tab === "setoran" ? "setoran" : sp.tab === "pengajar" ? "pengajar" : "kehadiran";
    return (
      <>
        <MabniTabs program={program} tab={tab} />
        <main className={WIDE}>
          {tab === "setoran" ? (
            <MabniSetoran program={program} month={sp.month} />
          ) : tab === "pengajar" ? (
            <MabniDelivery program={program} month={sp.month} />
          ) : (
            <div className="space-y-6">
              <AttendanceDashboard
                program={program}
                source="boarding.tilawalabs.demo"
                filter={sp.filter}
                baseParams={{ tab: "kehadiran" }}
              />
              <MabniQualityStrip program={program} />
            </div>
          )}
        </main>
      </>
    );
  }

  return (
    <main className={WIDE}>
      <AttendanceDashboard program={program} batch={sp.batch} filter={sp.filter} />
    </main>
  );
}
