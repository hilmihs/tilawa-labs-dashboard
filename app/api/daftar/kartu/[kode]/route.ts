import { baseUrlDariRequest } from "@/lib/hadir/base-url";
import { ekstrakKode, urlQr } from "@/lib/hadir/kode";
import { getOrangByKode } from "@/lib/hadir/queries";
import { kartuPublik } from "@/lib/hadir/situs";
import { json, tolakBilaBukanSitus } from "../../_shared";

export const dynamic = "force-dynamic";

/** Isi kartu untuk situs. Kode = kredensial (49 bit acak), pola /h/[kode]. */
export async function GET(req: Request, ctx: { params: Promise<{ kode: string }> }) {
  const tolak = tolakBilaBukanSitus(req);
  if (tolak) return tolak;
  const kode = ekstrakKode((await ctx.params).kode);
  const o = kode ? await getOrangByKode(kode) : null;
  if (!o) return json({ error: "Kode tidak dikenal." }, 404);
  return json(kartuPublik(o, urlQr(baseUrlDariRequest(req), o.kodeQr)));
}
