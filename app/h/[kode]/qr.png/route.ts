import { NextResponse } from "next/server";
import { baseUrlDariRequest } from "@/lib/hadir/base-url";
import { ekstrakKode, urlQr } from "@/lib/hadir/kode";
import { buatKartuPng } from "@/lib/hadir/kartu-png";
import { getOrangByKode } from "@/lib/hadir/queries";

export const dynamic = "force-dynamic";

/** Kartu PNG (QR + nama + program) untuk galeri / Drive. Isi QR = URL halaman /h/[kode]. */
export async function GET(req: Request, ctx: { params: Promise<{ kode: string }> }) {
  const { kode: mentah } = await ctx.params;
  const kode = ekstrakKode(mentah);
  const o = kode ? await getOrangByKode(kode) : null;
  if (!o) return new NextResponse("tidak dikenal", { status: 404 });
  const base = baseUrlDariRequest(req);
  const png = await buatKartuPng({ nama: o.nama, program: o.programTeks, gender: o.gender, kode: o.kodeQr, url: urlQr(base, o.kodeQr) });
  const nama = o.nama.replace(/[^\w .-]/g, "").trim();
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="QR - ${nama}.png"`,
      "cache-control": "no-store",
    },
  });
}
