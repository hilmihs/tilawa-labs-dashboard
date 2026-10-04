import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listOrangAcaraSemua } from "@/lib/hadir/queries";
import { petaHadirLepas } from "@/lib/hadir/queries-lepas";
import { rosterScanner } from "@/lib/hadir/view-model";
import { todayJakarta } from "@/lib/time/jakarta";

export const dynamic = "force-dynamic";

/**
 * Roster pemindai global: SELURUH orang aktif, tanpa WA penuh, tanpa penanda
 * `wajib` (tanpa kegiatan tidak ada target). `acara: null` memberi tahu
 * pemindai bahwa tidak ada jendela scan dan tidak ada hitungan terlambat.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const tanggal = todayJakarta();
  const [rows, hadir] = await Promise.all([listOrangAcaraSemua(), petaHadirLepas(tanggal)]);
  // `hadirAt` wajib ikut: pemindai membangun ulang peta hadir lokalnya dari
  // roster setiap kali menyegarkan, jadi tanpa ini bilah "Hadir n" jatuh ke 0
  // dan scan ulang berhenti berwarna kuning.
  const denganHadir = rows.map((o) => ({ ...o, hadirAt: hadir.get(o.id) ?? null }));
  return NextResponse.json(
    { acara: null, tanggal, diambilAt: new Date().toISOString(), orang: rosterScanner(denganHadir) },
    { headers: { "cache-control": "no-store" } },
  );
}
