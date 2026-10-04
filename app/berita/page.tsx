import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { listPrograms } from "@/lib/admin/service";
import { requireNewsUser } from "@/lib/news/auth";
import { currentWeekStart, listMyNews } from "@/lib/news/service";
import { weekJumatKamis } from "@/lib/time/jakarta";
import { rentang } from "@/app/tv/format";
import { BeritaForm } from "./BeritaForm";

export const metadata = { title: "Kabar Pekan Ini" };
export const dynamic = "force-dynamic";

/**
 * Contributor screen: write kabar for the running Jumat→Kamis week, see what is
 * still waiting for the curator. Behind auth and never under /tv — the board
 * itself is public and must stay read-only.
 */
export default async function BeritaPage() {
  const { actor, access } = await requireNewsUser();
  const weekStart = currentWeekStart();
  const week = weekJumatKamis(weekStart);

  const [mine, programs] = await Promise.all([listMyNews(actor, weekStart), listPrograms()]);

  return (
    <AppShell
      email={actor.email}
      title="Kabar"
      railItems={divisionRail({
        isSuper: actor.isSuper,
        kabar: true,
        kurasi: access.curate.length > 0,
        includeOverview: actor.isSuper,
      })}
    >
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-bold tracking-[-0.01em]">Kabar Pekan Ini</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Kabar baik divisi yang tayang di layar Board (
              <Link href="/tv" className="underline underline-offset-2">
                /tv
              </Link>
              ) untuk pekan {rentang(week.start, week.end)}. Kurator menyetujui dulu sebelum tayang.
            </p>
          </div>
          {access.curate.length > 0 && (
            <Link
              href="/berita/kurasi"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Antrean kurasi →
            </Link>
          )}
        </div>

        <BeritaForm
          weekStart={weekStart}
          weekLabel={rentang(week.start, week.end)}
          divisions={access.contribute}
          programs={programs}
          mine={mine}
        />
      </main>
    </AppShell>
  );
}
