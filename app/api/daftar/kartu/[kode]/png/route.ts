import { NextResponse } from "next/server";
import { baseUrlDariRequest } from "@/lib/hadir/base-url";
import { buatKartuPng } from "@/lib/hadir/kartu-png";
import { ekstrakKode, urlQr } from "@/lib/hadir/kode";
import { getOrangByKode } from "@/lib/hadir/queries";
import { json, tolakBilaBukanSitus } from "../../../_shared";

export const dynamic = "force-dynamic";

/** Kartu PNG A6 yang sama dengan /h/[kode]/qr.png, untuk tombol "Simpan" di situs. */
export async function GET(req: Request, ctx: { params: Promise<{ kode: string }> }) {
  const tolak = tolakBilaBukanSitus(req);
  if (tolak) return tolak;
  const kode = ekstrakKode((await ctx.params).kode);
  const o = kode ? await getOrangByKode(kode) : null;
  if (!o) return json({ error: "Kode tidak dikenal." }, 404);
  const png = await buatKartuPng({
    nama: o.nama,
    program: o.programTeks,
    gender: o.gender,
    kode: o.kodeQr,
    url: urlQr(baseUrlDariRequest(req), o.kodeQr),
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
