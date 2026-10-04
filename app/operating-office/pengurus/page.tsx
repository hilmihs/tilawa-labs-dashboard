import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { KepalaHalaman, tombolGaris } from "@/components/lintas/brand";
import { requireSuperUser } from "@/lib/auth/require";
import { getNewsNav } from "@/lib/news/auth";
import { belumTerdaftar, samarUid } from "@/lib/kerja/anggota-view";
import { PENGURUS_AWAL } from "@/lib/kerja/pengurus-awal";
import { listAnggota } from "@/lib/kerja/queries";
import { KelolaPengurus, type BarisPengurus } from "./KelolaPengurus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daftar pengurus · Operating Office" };

export default async function PengurusPage() {
  const user = await requireSuperUser();
  const [news, anggota] = await Promise.all([getNewsNav(user), listAnggota({ termasukNonaktif: true })]);

  // UID lengkap tidak perlu sampai ke peramban — layar cukup versi samaran.
  const baris: BarisPengurus[] = anggota.map((a) => ({
    id: a.id,
    orangId: a.orangId,
    nama: a.nama,
    gender: a.gender,
    kodeQr: a.kodeQr,
    aktif: a.aktif,
    uidSamar: a.uidNfc ? samarUid(a.uidNfc) : null,
  }));
  const belum = belumTerdaftar(PENGURUS_AWAL, anggota).length;

  return (
    <AppShell
      email={user.email}
      title="Daftar pengurus"
      railItems={divisionRail({ isSuper: true, kabar: news.kabar, kurasi: news.kurasi, includeOverview: true })}
    >
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 pt-6 pb-14 sm:px-8 sm:pt-7">
        <Link
          href="/operating-office/kehadiran"
          className="inline-flex w-fit items-center gap-1.5 text-12 font-medium text-ink-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Kehadiran pengurus
        </Link>
        <KepalaHalaman
          judul="Daftar pengurus"
          aksi={
            <Link href="/orang/kartu?kelompok=pengurus" className={tombolGaris}>
              <Printer className="size-3.5" /> Cetak kartu (semua pengurus)
            </Link>
          }
        >
          Siapa yang mengisi logbook kehadiran — urutan sama dengan lembar kertas. Kartu memakai kode QR orang; chip NFC
          dipasang per orang dari pembaca USB.
        </KepalaHalaman>

        <KelolaPengurus baris={baris} belumAwal={belum} totalAwal={PENGURUS_AWAL.length} />
      </main>
    </AppShell>
  );
}
