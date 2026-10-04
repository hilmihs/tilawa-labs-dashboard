import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNewsNav } from "@/lib/news/auth";
import { getProgramsOverview } from "@/lib/insights/overview";
import { getBeranda } from "@/lib/insights/beranda";
import { accessibleTree, findNodeByPath } from "@/lib/org/structure";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { OrgCards } from "../OrgCards";
import { BerandaCakupan, BerandaTigaAngka } from "../../BerandaAngka";

export const metadata = { title: "Struktur Organisasi" };
export const dynamic = "force-dynamic";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tree = accessibleTree(user);
  if (!tree) redirect("/"); // no accessible programs → "Belum ada program"

  const { path = [] } = await params;
  const node = findNodeByPath(tree, path);
  if (!node) notFound();

  // A program leaf reached via URL → go straight to its dashboard.
  if (node.programSlug) redirect(`/${node.programSlug}/dashboard`);
  if (node.href) redirect(node.href);

  const children = node.children ?? [];

  // Stats only for the program leaves shown directly under this node.
  const leafSlugs = children.map((c) => c.programSlug).filter((s): s is string => !!s);
  const news = await getNewsNav(user);
  const overviews = leafSlugs.length ? await getProgramsOverview(leafSlugs) : [];
  // Teratas saja: angka umum yang sama persis dengan Beranda. Unit turunan
  // tidak — keputusan pemilik 23 Sep 2026.
  const beranda = path.length === 0 ? await getBeranda(user) : null;

  // Breadcrumb: Organisasi › ... › current.
  const crumbs: { label: string; href: string }[] = [{ label: "Organisasi", href: "/overview" }];
  let acc = tree;
  const segAcc: string[] = [];
  for (const seg of path) {
    const next = acc.children?.find((c) => c.id === seg);
    if (!next) break;
    segAcc.push(seg);
    acc = next;
    crumbs.push({ label: next.label, href: `/overview/${segAcc.join("/")}` });
  }

  const isSuper = user.role === "super_coordinator";

  const live = children.filter((c) => !c.comingSoon);

  /**
   * Apakah strip ringkasan di atas kartu boleh tampil.
   *
   * `overviews` hanya memuat **program leaf yang langsung di bawah node ini**
   * (lihat `leafSlugs`), bukan seluruh subtree. Jadi begitu node punya anak
   * berupa unit, strip itu berhenti menjadi ringkasan node dan berubah menjadi
   * ringkasan sebagian — dengan label yang tetap berbunyi "Rata² kehadiran".
   *
   * Diamati 8 Sep 2026 di `/overview/div-program`: anaknya HITS (unit),
   * DPQ (program), Kelas Maahir (program), MLP (unit). Strip menampilkan
   * "81.9% · 33 peserta · 3 halaqah" — persis angka DPQ sendirian, karena Kelas
   * Maahir nol dan dua unit lainnya tidak ikut dihitung sama sekali. Pembaca
   * membacanya sebagai kehadiran Div. Program.
   *
   * Maka strip hanya tampil kalau ia benar-benar meringkas semua yang terlihat:
   * tidak ada anak unit, dan ada lebih dari satu program untuk diagregasi.
   * Dengan satu program saja, strip cuma menyalin ulang kartu di bawahnya —
   * itu keadaan yang terlihat di `/overview/div-pendidikan` (Mabni sendirian).
   */
  const adaAnakUnit = live.some((c) => !c.programSlug);
  const tampilkanRingkas = !adaAnakUnit && overviews.length > 1;

  return (
    <AppShell
      email={user.email}
      title="Semua Program"
      railItems={divisionRail({ isSuper, kabar: news.kabar, kurasi: news.kurasi, includeOverview: true })}
    >
      <main className="mx-auto max-w-6xl space-y-5 px-6 py-7">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            {crumbs.length > 1 && (
              <nav className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
                {crumbs.slice(0, -1).map((c, i) => (
                  <span key={c.href} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="size-3 text-neutral-400" />}
                    <Link href={c.href} className="hover:text-primary hover:underline">
                      {c.label}
                    </Link>
                  </span>
                ))}
              </nav>
            )}
            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              {crumbs[crumbs.length - 1].label}
            </h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {path.length === 0 ? "Klik divisi untuk membuka isinya." : "Klik program untuk membuka isinya."}
            </p>
          </div>
          {user.role === "super_coordinator" && (
            <div className="flex shrink-0 gap-2">
              <Link
                href="/admin/programs"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white"
              >
                Program &amp; Sync
              </Link>
              <Link
                href="/admin/sql"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white"
              >
                Console SQL
              </Link>
            </div>
          )}
        </header>

        {beranda && <BerandaTigaAngka data={beranda} />}

        {tampilkanRingkas ? (
          (() => {
            const totPeserta = overviews.reduce((n, o) => n + (o.studentCount ?? 0), 0);
            const totHalaqah = overviews.reduce((n, o) => n + (o.halaqahCount ?? 0), 0);
            const withAvg = overviews.filter((o) => o.avgKehadiran != null);
            const avg = withAvg.length
              ? withAvg.reduce((n, o) => n + (o.avgKehadiran as number), 0) / withAvg.length
              : null;
            const kritis = overviews.filter(
              (o) => o.avgKehadiran != null && o.avgKehadiran < o.thresholdPct,
            ).length;
            const perhatian = overviews.reduce((n, o) => n + (o.belowThresholdCount ?? 0), 0);
            // The bar only means something against one ambang; programs here can
            // carry different ones, so show the target only when they agree.
            const thresholds = new Set(overviews.map((o) => o.thresholdPct));
            const target = thresholds.size === 1 ? [...thresholds][0] : undefined;
            return (
              <KpiStrip
                hero={{
                  label: "Rata² kehadiran",
                  value: avg != null ? avg.toFixed(1) : "—",
                  unit: avg != null ? "%" : undefined,
                  target,
                  progress: avg ?? undefined,
                }}
                support={[
                  { label: "Peserta", value: totPeserta },
                  { label: "Halaqah", value: totHalaqah },
                ]}
                issues={[
                  {
                    label: `program di bawah ${target != null ? `${target}%` : "ambang"}`,
                    value: kritis,
                    tone: "danger",
                  },
                  { label: "halaqah perlu perhatian", value: perhatian },
                ]}
                allClearText={`Semua program di atas ambang${target != null ? ` ${target}%` : ""}`}
              />
            );
          })()
        ) : null}

        <OrgCards nodes={children} basePath={path} root={path.length === 0} />

        {beranda && <BerandaCakupan data={beranda} />}
      </main>
    </AppShell>
  );
}
