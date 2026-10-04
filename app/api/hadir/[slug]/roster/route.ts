import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { listOrangAcara } from "@/lib/hadir/queries";
import { anggotaPerGolongan, listTargetAcara } from "@/lib/hadir/queries-golongan";
import { rosterScanner } from "@/lib/hadir/view-model";

export const dynamic = "force-dynamic";

/** Roster untuk pemindai (disimpan lokal di HP): SEMUA orang aktif, tanpa WA penuh. Sesi staff wajib. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { slug } = await ctx.params;
  const acara = await getAcaraBySlug(slug);
  if (!acara) return NextResponse.json({ error: "acara tidak ditemukan" }, { status: 404 });
  const [rows, target, anggota] = await Promise.all([
    listOrangAcara(acara.id, { semua: true }),
    listTargetAcara(acara.id),
    anggotaPerGolongan(),
  ]);
  // Wajib dihitung di server: pemindai offline tidak boleh perlu tabel golongan.
  const wajibIds = new Set<string>();
  for (const t of target) {
    if (t.sifat !== "wajib") continue;
    for (const id of anggota.get(t.klasifikasiSlug) ?? []) wajibIds.add(id);
  }
  return NextResponse.json(
    {
      acara: {
        slug: acara.slug,
        nama: acara.nama,
        tanggal: acara.tanggal,
        jamMulai: acara.jamMulai,
        toleransiMenit: acara.toleransiMenit,
        scanBukaAt: acara.scanBukaAt?.toISOString() ?? null,
        scanTutupAt: acara.scanTutupAt?.toISOString() ?? null,
        terimaPendaftaran: acara.terimaPendaftaran,
      },
      diambilAt: new Date().toISOString(),
      orang: rosterScanner(rows, wajibIds),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
