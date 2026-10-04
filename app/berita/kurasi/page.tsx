import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireNewsUser } from "@/lib/news/auth";
import { currentWeekStart, listAllQuotes, listForCuration } from "@/lib/news/service";
import { weekJumatKamis } from "@/lib/time/jakarta";
import { rentang } from "@/app/tv/format";
import { KurasiBoard } from "./KurasiBoard";

export const metadata = { title: "Kurasi Kabar" };
export const dynamic = "force-dynamic";

/**
 * Curator queue: approve what airs on /tv this week, order it, and keep the
 * quote list. Lives under /berita — deliberately never under /tv, which is a
 * public prefix in middleware.
 */
export default async function KurasiPage() {
  const { actor, access } = await requireNewsUser({ curator: true });
  const weekStart = currentWeekStart();
  const week = weekJumatKamis(weekStart);

  const [items, quotes] = await Promise.all([listForCuration(access.curate, weekStart), listAllQuotes()]);

  return (
    <AppShell
      email={actor.email}
      title="Kurasi"
      railItems={divisionRail({
        isSuper: actor.isSuper,
        kabar: true,
        kurasi: access.curate.length > 0,
        includeOverview: actor.isSuper,
      })}
    >
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-bold tracking-[-0.01em]">Kurasi Kabar</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Pekan {rentang(week.start, week.end)} · divisi{" "}
              {access.curate.length === 0 ? "—" : access.curate.join(", ")}. Yang disetujui muncul di{" "}
              <Link href="/tv" className="underline underline-offset-2">
                layar
              </Link>{" "}
              dalam hitungan detik. Enam kabar teratas yang tayang.
            </p>
          </div>
          <Link
            href="/berita"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            ← Tulis kabar
          </Link>
        </div>

        <KurasiBoard items={items} quotes={quotes} />
      </main>
    </AppShell>
  );
}
