import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hariDalamBulan, susunLogbook } from "@/lib/kerja/logbook";
import { hadirRentang, listAnggota } from "@/lib/kerja/queries";
import { bangunLogbookXlsx, namaBerkasLogbook } from "@/lib/kerja/xlsx-logbook";
import { jakartaDate } from "@/lib/time/jakarta";

export const dynamic = "force-dynamic";
const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** GET ?bulan=YYYY-MM (bawaan: bulan berjalan WIB) → Logbook-Kehadiran-Pengurus_YYYY-MM.xlsx. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "super_coordinator") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const hariIni = jakartaDate();
  const minta = new URL(req.url).searchParams.get("bulan") ?? "";
  const bulan = BULAN.test(minta) ? minta : hariIni.slice(0, 7);
  const hari = hariDalamBulan(bulan);

  const [anggota, hadir] = await Promise.all([listAnggota({ termasukNonaktif: true }), hadirRentang(hari[0], hari[hari.length - 1])]);
  // Anggota yang kini nonaktif tetap muncul bila bulan itu punya catatan hadir — logbook lampau tidak boleh kehilangan baris.
  const adaHadir = new Set(hadir.map((h) => h.orangId));
  const tampil = anggota.filter((a) => a.aktif || adaHadir.has(a.orangId));
  const lb = susunLogbook(tampil, hadir, hari);

  const buf = await bangunLogbookXlsx(lb, { bulan, hariIni }).xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${namaBerkasLogbook(bulan)}"`,
      "cache-control": "no-store",
    },
  });
}
