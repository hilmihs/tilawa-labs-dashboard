import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { listAcaraHariIni } from "@/lib/hadir/queries";
import { todayJakarta } from "@/lib/time/jakarta";
import { PageHead, tglPendek } from "../[slug]/_ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan hari ini" };

/**
 * Satu tautan tetap untuk panitia: /acara/scan → pemindai acara hari ini.
 * Tepat satu acara → langsung dialihkan (kiosk ikut diteruskan). Nol acara →
 * pemindai global /acara/scan/lepas. Lebih dari satu → tampilkan pilihan,
 * jangan menebak.
 */
export default async function ScanHariIniPage({ searchParams }: { searchParams: Promise<{ kiosk?: string }> }) {
  const user = await requireStaff();
  const { kiosk } = await searchParams;
  const daftar = await listAcaraHariIni(todayJakarta(), new Date());
  const q = kiosk === "1" ? "?kiosk=1" : "";
  if (daftar.length === 1) redirect(`/acara/${daftar[0].slug}/scan${q}`);
  // Nol kegiatan BUKAN jalan buntu: panitia tetap memindai, koordinator membuat
  // kegiatannya menyusul lalu menautkan scan hari itu.
  if (daftar.length === 0) redirect(`/acara/scan/lepas${q}`);
  return (
    <AppShell email={user.email} title="Scan hari ini" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[700px] px-6 py-6">
        <PageHead title="Scan hari ini">Lebih dari satu kegiatan hari ini — pilih.</PageHead>
        <ul className="space-y-2">
          {daftar.map((a) => (
            <li key={a.slug}>
              <Link href={`/acara/${a.slug}/scan${q}`} className="block rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                <div className="text-14 font-semibold">{a.nama}</div>
                <div className="text-12 text-muted-foreground">{tglPendek(a.tanggal)}</div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-12 text-muted-foreground">
          Atau <Link href={`/acara/scan/lepas${q}`} className="underline">scan tanpa kegiatan</Link> — hasilnya ditautkan belakangan.
        </p>
      </main>
    </AppShell>
  );
}
