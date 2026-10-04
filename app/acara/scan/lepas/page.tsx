import { requireStaff } from "@/lib/acara/access";
import { listAcaraHariIni } from "@/lib/hadir/queries";
import { todayJakarta } from "@/lib/time/jakarta";
import { tglPendek } from "../../[slug]/_ui";
import { Scanner } from "../../[slug]/scan/Scanner";
import { tambahOrangLepas } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan tanpa kegiatan" };

/**
 * Pemindai global: dipakai saat hari itu belum punya kegiatan. Scan masuk
 * `hadir_lepas`, lalu koordinator menautkannya ke kegiatan yang dibuat
 * menyusul di /acara/hadir-lepas.
 *
 * `qrDaftarSvg` null disengaja: tanpa kegiatan tidak ada /daftar/<slug> yang
 * bisa ditawarkan di layar kiosk.
 */
export default async function ScanLepasPage({ searchParams }: { searchParams: Promise<{ kiosk?: string }> }) {
  await requireStaff();
  const { kiosk } = await searchParams;
  const hariIni = todayJakarta();
  // 26 Sep & 3 Okt 2026: HP panitia tetap di halaman ini padahal kegiatannya ada,
  // jadi panel hadir kosong sampai koordinator menautkan scan-nya.
  const kegiatanHariIni = await listAcaraHariIni(hariIni, new Date());
  return (
    <Scanner
      sumber={{
        kunciLokal: "lepas",
        urlRoster: "/api/hadir/lepas/roster",
        urlScan: "/api/hadir/lepas/scan",
        urlPanel: "/acara/hadir-lepas",
        urlKembali: `/acara/scan/lepas${kiosk === "1" ? "?kiosk=1" : ""}`,
      }}
      namaAcara={`Tanpa kegiatan · ${tglPendek(hariIni)}`}
      kiosk={kiosk === "1"}
      qrDaftarSvg={null}
      urlDaftar=""
      aksiTambah={tambahOrangLepas}
      kegiatanHariIni={kegiatanHariIni}
    />
  );
}
