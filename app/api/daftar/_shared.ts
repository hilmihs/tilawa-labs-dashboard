import { NextResponse } from "next/server";
import { buatPembatas, situsBolehMasuk } from "@/lib/hadir/situs";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { todayJakarta } from "@/lib/time/jakarta";

/** Satu pembatas per proses, dipakai bersama semua rute POST. */
export const pembatas = buatPembatas();

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** null = boleh lanjut; selain itu respons 401 yang harus dikembalikan. */
export function tolakBilaBukanSitus(req: Request): NextResponse | null {
  return situsBolehMasuk(req) ? null : json({ error: "unauthorized" }, 401);
}

/** Kajian yang sedang buka pendaftaran dan belum lewat, atau null. */
export async function acaraTerbuka(slug: string) {
  const a = await getAcaraBySlug(slug);
  if (!a || !a.terimaPendaftaran || a.tanggal < todayJakarta()) return null;
  return a;
}
