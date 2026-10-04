import { acaraPublik } from "@/lib/hadir/situs";
import { listAcaraTerbuka } from "@/lib/hadir/queries-situs";
import { PROGRAM_PILIHAN } from "@/lib/hadir/program";
import { todayJakarta } from "@/lib/time/jakarta";
import { json, tolakBilaBukanSitus } from "../_shared";

export const dynamic = "force-dynamic";

/** Kajian yang sedang buka pendaftaran + pilihan program formulir. */
export async function GET(req: Request) {
  const tolak = tolakBilaBukanSitus(req);
  if (tolak) return tolak;
  const rows = await listAcaraTerbuka(todayJakarta());
  return json({ acara: rows.map(acaraPublik), program: PROGRAM_PILIHAN });
}
