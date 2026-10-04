import { acaraPublik, kunciKlien } from "@/lib/hadir/situs";
import { daftarkan, validasiDaftar } from "@/lib/hadir/daftar";
import { PROGRAM_PILIHAN } from "@/lib/hadir/program";
import { acaraTerbuka, json, pembatas, tolakBilaBukanSitus } from "../../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const tolak = tolakBilaBukanSitus(req);
  if (tolak) return tolak;
  const a = await acaraTerbuka((await ctx.params).slug);
  if (!a) return json({ error: "Pendaftaran untuk kajian ini tidak dibuka." }, 404);
  return json({ acara: acaraPublik(a), program: PROGRAM_PILIHAN });
}

/**
 * Daftar mandiri dari situs — jalur yang sama dengan /daftar/[slug]
 * (`validasiDaftar` + `daftarkan(…, "situs")`). WA yang sudah terdaftar
 * mengembalikan kode orang itu tanpa membocorkan namanya di respons ini.
 */
export async function POST(req: Request, ctx: Ctx) {
  const tolak = tolakBilaBukanSitus(req);
  if (tolak) return tolak;
  const a = await acaraTerbuka((await ctx.params).slug);
  if (!a) return json({ error: "Pendaftaran untuk kajian ini sedang ditutup." }, 404);

  let body: Record<string, unknown>;
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("bukan objek");
    body = b as Record<string, unknown>;
  } catch {
    return json({ error: "Isi permintaan tidak terbaca." }, 400);
  }

  const v = validasiDaftar(body);
  if (!v.ok) return json({ error: v.error }, 422);
  if (pembatas.lewat(kunciKlien(req))) {
    return json({ error: "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti." }, 429);
  }

  try {
    const r = await daftarkan(a.id, v.input, "situs");
    if (!r.ok) return json({ error: r.error }, 422);
    return json({ kode: r.kode, baru: r.baru });
  } catch (e) {
    console.error("api daftar gagal", e);
    return json({ error: "Gagal menyimpan. Coba lagi." }, 500);
  }
}
