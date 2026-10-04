import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { acara } from "@/lib/db/schema";
import type { AcaraRow } from "@/lib/acara/types";

/**
 * Kajian yang boleh muncul di situs: pendaftaran dibuka dan belum lewat.
 * `hariIni` wajib dari lib/time/jakarta — DB berjalan dalam UTC, jadi
 * `current_date` salah hari antara 00.00 dan 07.00 WIB.
 */
export async function listAcaraTerbuka(hariIni: string): Promise<AcaraRow[]> {
  const db = getDb();
  return db
    .select()
    .from(acara)
    .where(and(eq(acara.terimaPendaftaran, true), gte(acara.tanggal, hariIni)))
    .orderBy(asc(acara.tanggal), asc(acara.jamMulai));
}
