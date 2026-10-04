import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { baseUrlDariRequest } from "@/lib/hadir/base-url";
import { buatZipKartu } from "@/lib/hadir/qr-zip";
import { listOrangAcara } from "@/lib/hadir/queries";

export const dynamic = "force-dynamic";

/**
 * Zip kartu PNG (QR + nama + program) per orang terdaftar, nama berkas "Nama - Program.png", untuk
 * diunggah ke Drive dan dibagikan per orang. Staff saja.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { slug } = await ctx.params;
  const acara = await getAcaraBySlug(slug);
  if (!acara) return NextResponse.json({ error: "acara tidak ditemukan" }, { status: 404 });
  const base = baseUrlDariRequest(req);
  const rows = await listOrangAcara(acara.id);
  const buf = await buatZipKartu(rows, base);
  return new NextResponse(new Blob([buf as BlobPart]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="QR ${acara.slug}.zip"`,
      "cache-control": "no-store",
    },
  });
}
