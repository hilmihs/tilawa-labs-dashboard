import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/empty-state";
import { divisionRail } from "@/components/shell/sections";
import { requireSuperUser } from "@/lib/auth/require";
import {
  getActivePeriod,
  listPeriods,
  OYP_SUBS,
  type Subdivision,
} from "@/lib/scorecard/queries";
import { periodTargetLabel } from "@/lib/scorecard/period";
import { ScorecardTabs } from "./ScorecardTabs";
import { ScorecardCAT } from "./ScorecardCAT";
import { OypTable } from "./OypTable";

export const metadata = { title: "Scorecard" };
export const dynamic = "force-dynamic";

const TABS: Subdivision[] = ["cat", ...OYP_SUBS];

export default async function ScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  // Division-wide scorecard: super_coordinator only (redirects coordinators to
  // /overview). Every write action re-checks — the hidden nav link is not a gate.
  const user = await requireSuperUser();

  const sp = await searchParams;
  const tab: Subdivision = TABS.includes(sp.tab as Subdivision) ? (sp.tab as Subdivision) : "cat";

  const periods = await listPeriods();
  const active = await getActivePeriod();
  const period = sp.period ? periods.find((p) => p.id === sp.period) ?? active : active;
  const targetLabel = period ? periodTargetLabel(period.kind, period.seq) : "Tgt";

  return (
    <AppShell
      email={user.email}
      title="Scorecard"
      railItems={divisionRail({ isSuper: true, includeOverview: true })}
    >
      <ScorecardTabs tab={tab} periodId={period?.id} />
      {/* Halaman tabel: lebar penuh dengan pagar 1600px — 11 kolom angka tidak
          muat di 1152px, dan nama KPI-nya patah tiga baris. */}
      <main className="mx-auto w-full max-w-[1600px] px-6 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-20 font-bold tracking-[-0.01em]">
            Scorecard — {period?.label ?? "belum ada periode"}
            {period?.closedAt ? (
              <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-normal text-ink-muted dark:bg-neutral-800 dark:text-neutral-400">
                ditutup
              </span>
            ) : null}
          </h1>
          <div className="flex items-center gap-3">
            {periods.length > 1 ? (
              <nav className="flex gap-1 text-xs">
                {periods.map((p) => (
                  <Link
                    key={p.id}
                    href={`/scorecard?tab=${tab}&period=${p.id}`}
                    aria-current={p.id === period?.id ? "page" : undefined}
                    className={`rounded-md px-2 py-1 ${
                      p.id === period?.id
                        ? "bg-blue-600 text-white"
                        : "text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {p.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            <Link
              href="/scorecard/kelola"
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              Kelola
            </Link>
          </div>
        </div>

        {!period ? (
          <EmptyState
            title="Belum ada periode scorecard"
            description={
              <>
                Setelah periode diisi, halaman ini menampilkan tabel KPI CAT dan OYP beserta
                capaian per triwulan. Jalankan <code>pnpm seed:scorecard</code> untuk mengisi dari
                spreadsheet.
              </>
            }
          />
        ) : tab === "cat" ? (
          <ScorecardCAT periodId={period.id} targetLabel={targetLabel} />
        ) : (
          <OypTable periodId={period.id} subdivision={tab} targetLabel={targetLabel} />
        )}
      </main>
    </AppShell>
  );
}
