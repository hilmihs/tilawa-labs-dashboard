import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { baseUrlDariRequest } from "@/lib/hadir/base-url";
import { buatZipKartu } from "@/lib/hadir/qr-zip";
import { listOrangDiLuarAcara } from "@/lib/hadir/queries-ekspor";

export const dynamic = "force-dynamic";

/**
 * Zip kartu PNG untuk orang aktif di LUAR acara tertentu
 * (`?kecuali=<slug>&kecuali=<slug>`), mis. semua yang belum masuk kajian
 * pembekalan — untuk diunggah ke Drive. Staff saja. Tanpa `kecuali` = semua
 * orang aktif.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const kecuali = new URL(req.url).searchParams.getAll("kecuali").filter((s) => /^[a-z0-9-]{1,120}$/.test(s));
  const rows = await listOrangDiLuarAcara(kecuali);
  const buf = await buatZipKartu(rows, baseUrlDariRequest(req));
  const nama = kecuali.length ? `QR di luar ${kecuali.length} acara (${rows.length} orang).zip` : `QR semua orang (${rows.length}).zip`;
  return new NextResponse(new Blob([buf as BlobPart]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${nama}"`,
      "cache-control": "no-store",
    },
  });
}
