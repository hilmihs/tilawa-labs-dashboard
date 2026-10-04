import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireSuperUser } from "@/lib/auth/require";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getActivePeriod,
  getKpisWithItems,
  OYP_SUBS,
  SUB_LABEL,
  type Subdivision,
} from "@/lib/scorecard/queries";
import { KelolaTable, RefreshNow } from "./KelolaTable";

export const metadata = { title: "Kelola Scorecard" };
export const dynamic = "force-dynamic";
// Manual refresh pulls from an external API — give it room.
export const maxDuration = 300;

const TABS: Subdivision[] = ["cat", ...OYP_SUBS];

export default async function KelolaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireSuperUser();
  const sp = await searchParams;
  const tab: Subdivision = TABS.includes(sp.tab as Subdivision) ? (sp.tab as Subdivision) : "cat";

  const period = await getActivePeriod();
  const kpis = period ? await getKpisWithItems(period.id, tab) : [];
  const closed = !!period?.closedAt;

  return (
    <AppShell email={user.email} title="Kelola Scorecard" railItems={divisionRail({ isSuper: true, includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1600px] px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-20 font-bold tracking-[-0.01em]">
              Kelola Scorecard — {period?.label ?? "belum ada periode"}
              {closed ? (
                <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-normal text-ink-muted dark:bg-neutral-800 dark:text-neutral-400">
                  ditutup (read-only)
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Ubah baris workbook per KPI. Baris <span className="text-blue-600 dark:text-blue-400">otomatis</span>{" "}
              ditarik dari sumber; edit angkanya akan mengunci baris agar refresh tidak menimpanya.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/scorecard"
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              ← Lihat scorecard
            </Link>
            {!closed ? <RefreshNow /> : null}
          </div>
        </div>

        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/scorecard/kelola?tab=${t}`}
              aria-current={tab === t ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-700 dark:text-blue-300"
                  : "border-transparent text-ink-muted hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              {t === "cat" ? "CAT" : SUB_LABEL[t].replace("OYP ", "")}
            </Link>
          ))}
        </div>

        {!period ? (
          <EmptyState
            title="Belum ada periode scorecard"
            description="Buat atau seed periode lebih dulu; setelah itu tiap KPI muncul di sini beserta baris workbook yang bisa disunting."
          />
        ) : kpis.length === 0 ? (
          <EmptyState
            title="Belum ada KPI di subdivisi ini"
            description="Tab lain mungkin sudah terisi. KPI ditarik dari seed spreadsheet — jalankan seed ulang kalau subdivisi ini memang seharusnya ada."
          />
        ) : (
          <KelolaTable kpis={kpis} readOnly={closed} />
        )}
      </main>
    </AppShell>
  );
}
