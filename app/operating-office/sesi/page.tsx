import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { KepalaHalaman, kartu } from "@/components/lintas/brand";
import { requireSuperUser } from "@/lib/auth/require";
import { getKantor } from "@/lib/kantor/queries";
import { batasKantor } from "@/lib/kerja/queries";
import { jamWibDari } from "@/lib/kerja/sesi";
import { getNewsNav } from "@/lib/news/auth";
import { jamWib } from "@/lib/time/jakarta";
import { cn } from "@/lib/utils";
import { SetelSesi } from "./SetelSesi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jam sesi logbook" };

export default async function SesiPage() {
  const user = await requireSuperUser();
  const [news, kantor] = await Promise.all([getNewsNav(user), getKantor()]);
  const sekarang = new Date();

  return (
    <AppShell
      email={user.email}
      title="Jam sesi logbook"
      railItems={divisionRail({ isSuper: true, kabar: news.kabar, kurasi: news.kurasi, includeOverview: true })}
    >
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pt-6 pb-14 sm:px-8 sm:pt-7">
        <Link href="/operating-office" className="inline-flex items-center gap-1 text-12 text-ink-muted hover:text-primary">
          <ArrowLeft className="size-3.5" aria-hidden /> Operating Office
        </Link>

        <KepalaHalaman judul="Jam sesi logbook">
          Batas Pagi, Siang, dan Sore untuk logbook kehadiran pengurus (WIB). Sekarang {jamWib(sekarang)}.
        </KepalaHalaman>

        <section className={cn(kartu, "px-4 py-3.5 text-14 text-pretty text-ink-muted sm:px-5")}>
          <p>
            <b className="text-foreground">Aturannya:</b> Pagi = dari jam mulai pagi s.d. sebelum jam mulai siang; Siang = dari
            mulai siang s.d. sebelum mulai sore; Sore = dari mulai sore s.d. sebelum jam selesai. Yang dicatat per sesi adalah
            tap <b className="text-foreground">pertama</b>.
          </p>
          <p className="mt-1.5">
            Tap di luar rentang (sebelum pagi atau sejak jam selesai) tetap tersimpan di riwayat tap, tetapi tidak mengisi kolom
            logbook mana pun. Mengubah jam di sini hanya berlaku untuk tap berikutnya — isian yang sudah tercatat tidak
            dipindah sesi.
          </p>
          {kantor.updatedBy && (
            <p className="mt-1.5 text-12">
              Pengaturan kantor terakhir diubah {kantor.updatedBy} · {kantor.updatedAt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}
            </p>
          )}
        </section>

        <SetelSesi batas={batasKantor(kantor)} jamKini={jamWibDari(sekarang)} />
      </main>
    </AppShell>
  );
}
