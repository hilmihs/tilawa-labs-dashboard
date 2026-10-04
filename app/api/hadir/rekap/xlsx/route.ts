import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  anggotaPerGolongan,
  barisRekap,
  listKlasifikasi,
  listSesiRekap,
  listTargetAcara,
} from "@/lib/hadir/queries-golongan";
import { namaBerulang, pivotGolongan, rekapSesi, type TargetSesi } from "@/lib/hadir/rekap";
import { bangunRekapKajianXlsx } from "@/lib/reports/rekap-kajian-xlsx";
import { todayJakarta } from "@/lib/time/jakarta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const f = {
    seri: url.searchParams.get("seri"),
    dari: url.searchParams.get("dari"),
    sampai: url.searchParams.get("sampai"),
  };

  const [sesi, golongan, anggota] = await Promise.all([listSesiRekap(f), listKlasifikasi(), anggotaPerGolongan()]);
  const acaraIds = sesi.map((s) => s.acaraId);
  const [hadir, targetPerSesi] = await Promise.all([
    barisRekap(acaraIds),
    Promise.all(acaraIds.map((id) => listTargetAcara(id))),
  ]);
  const target: TargetSesi[] = targetPerSesi.flat();

  const rekap = rekapSesi(sesi, hadir, target, anggota);
  const berulang = namaBerulang(hadir);
  const slugHadir = [...new Set(rekap.flatMap((r) => r.perGolongan.map((g) => g.slug)))];
  const wb = bangunRekapKajianXlsx({
    rekap,
    kolomQism: [...new Set(rekap.flatMap((r) => r.perQism.map((q) => q.qism)))],
    sebaran: berulang.sebaran,
    orang: berulang.orang,
    pivot: pivotGolongan(rekap, slugHadir),
    namaGolongan: new Map(golongan.map((g) => [g.slug, g.nama])),
  });
  const buf = await wb.xlsx.writeBuffer();
  const nama = `Rekap kajian${f.seri ? ` ${f.seri}` : ""} ${todayJakarta()}.xlsx`;
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nama}"`,
    },
  });
}
