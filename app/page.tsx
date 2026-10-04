import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNewsNav } from "@/lib/news/auth";
import { getAccessiblePrograms } from "@/lib/programs/resolve";
import { getBeranda } from "@/lib/insights/beranda";
import { jamWib, jakartaDate } from "@/lib/time/jakarta";
import { accessibleTree } from "@/lib/org/structure";
import Image from "next/image";
// Impor statis (seperti login & rail), bukan string "/brand/…": berkasnya ikut
// /_next/static, jadi tetap muncul walau public/ tidak ikut ke build standalone.
import markGold from "@/public/brand/mark-gold.png";
import { BerandaCakupan, BerandaTigaAngka } from "./BerandaAngka";
import { BerandaOrganisasi } from "./BerandaOrganisasi";

export const metadata = { title: "Beranda" };
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isSuper = user.role === "super_coordinator";
  const news = await getNewsNav(user);
  const rail = divisionRail({ isSuper, kabar: news.kabar, kurasi: news.kurasi, includeOverview: true });

  // Authenticated but granted no program yet — commonly a stale pre-P2 session
  // that predates the role/program claims. The header's "Keluar" lets them log
  // out and sign back in to mint a fresh token with the right access.
  // A division grant is independent of program access, so someone who only
  // writes kabar still gets that link here.
  if (!isSuper && (await getAccessiblePrograms(user)).length === 0) {
    return (
      <AppShell
        email={user.email}
        title="Beranda"
        railItems={divisionRail({ kabar: news.kabar, kurasi: news.kurasi })}
      >
        <main className="mx-auto flex max-w-lg flex-1 flex-col items-start justify-center gap-4 px-6 py-24">
          <h1 className="text-[19px] font-bold tracking-[-0.01em]">Belum ada program</h1>
          <p className="text-sm text-ink-muted">
            Akun kamu ({user.email}) belum diberi akses ke program mana pun — atau sesi
            kamu masih yang lama. Klik <b>Keluar</b> di kanan atas lalu login ulang untuk
            menyegarkan akses.
          </p>
        </main>
      </AppShell>
    );
  }

  const data = await getBeranda(user);
  const tree = accessibleTree(user);

  return (
    <AppShell email={user.email} title="Beranda" railItems={rail}>
      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-10 pt-7 sm:px-6">
        {/* Pita keyvisual (desain "Overhaul Warna Logo" 1b): forest di kedua tema,
            gunung emas samar di pojok kanan bawah sebagai latar. */}
        <section className="relative overflow-hidden rounded-[18px] bg-brand-forest px-5 pb-6 pt-6 sm:px-[30px] sm:pb-[30px] sm:pt-7">
          <Image
            src={markGold}
            alt=""
            aria-hidden
            unoptimized
            loading="eager"
            className="pointer-events-none absolute -bottom-14 -right-12 w-[300px] max-w-none select-none opacity-[0.13] sm:-bottom-[84px] sm:-right-9 sm:w-[460px]"
          />
          <header className="relative flex min-w-0 flex-col gap-1">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-white">
              Beranda
            </h1>
            <p className="text-sm text-white/70">
              {isSuper ? "Semua program" : `${data.programs.length} program yang bisa kamu lihat`} ·
              per {tanggal(jakartaDate())}, {jamWib()} WIB
            </p>
          </header>
          <div className="relative mt-6">
            <BerandaTigaAngka data={data} tone="band" />
          </div>
        </section>

        {tree && (
          <section className="space-y-5 pt-1">
            <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-[-0.015em]">Organisasi</h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Klik divisi untuk membuka isinya.
                </p>
              </div>
              {isSuper && (
                <div className="flex shrink-0 gap-2">
                  {[
                    { href: "/admin/programs", label: "Program & Sync" },
                    { href: "/admin/sql", label: "Console SQL" },
                  ].map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-12 font-medium text-ink-muted transition-colors hover:border-brand-bronze hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-neutral-700 dark:hover:border-brand-gold/60"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </header>
            <BerandaOrganisasi nodes={tree.children ?? []} />
          </section>
        )}

        <BerandaCakupan data={data} />
      </main>
    </AppShell>
  );
}

function tanggal(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
