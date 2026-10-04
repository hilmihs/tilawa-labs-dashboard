import Link from "next/link";
import { Maximize2 } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { KepalaHalaman, tombolGaris } from "@/components/lintas/brand";
import { requireStaff } from "@/lib/acara/access";
import { getKantor } from "@/lib/kantor/queries";
import { batasKantor } from "@/lib/kerja/queries";
import { batasValid } from "@/lib/kerja/sesi";
import { BATAS_BAWAAN } from "@/lib/kerja/types";
import { KioskTap } from "./KioskTap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kiosk kehadiran" };

/**
 * Kiosk logbook pengurus: kartu QR di depan kamera, atau kartu NFC di pembaca
 * USB (mengetik UID + Enter). ?kiosk=1 = layar penuh tanpa AppShell untuk
 * tablet di meja kantor. Antrean tap disimpan di localStorage supaya sinyal
 * hilang tidak menghilangkan jam datang.
 */
export default async function ScanKehadiranPage({ searchParams }: { searchParams: Promise<{ kiosk?: string }> }) {
  const user = await requireStaff();
  const { kiosk } = await searchParams;
  const k = await getKantor();
  // Batas kantor yang rusak jangan membuat kiosk salah menyebut sesi — pakai bawaan.
  const b = batasKantor(k);
  const batas = batasValid(b) ? b : BATAS_BAWAAN;

  if (kiosk === "1") return <KioskTap batas={batas} kiosk namaKantor={k.nama} urlKeluar="/scan" />;

  return (
    <AppShell email={user.email} title="Kiosk kehadiran" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 sm:px-8 sm:py-7">
        <KepalaHalaman
          judul="Kiosk kehadiran"
          aksi={
            <Link href="/scan?kiosk=1" className={tombolGaris}>
              <Maximize2 className="size-4" /> Mode kiosk
            </Link>
          }
        >
          Satu tautan scan untuk semua. Sekali tap kartu: check-in kerja pengurus (sesi Pagi, Siang, Sore), hadir kegiatan yang
          sedang berlangsung, dan mengajar kelas offline yang mulai sekitar jam itu — semuanya tercatat bersamaan.
        </KepalaHalaman>
        <KioskTap batas={batas} kiosk={false} namaKantor={k.nama} urlKeluar={null} />
      </main>
    </AppShell>
  );
}
