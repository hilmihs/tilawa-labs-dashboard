/**
 * Baris `matrix-rekap` Maahir milik satu orang, lewat tautan
 * `maahir:pengajar_hits:<uuid>` di CV-nya. `pengajar_id` matrix adalah id
 * `hits/pengajar` (178/178 cocok, lihat lib/maahir/types.ts), jadi tautan itu
 * menyambung langsung tanpa pencocokan nama.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { MaahirMatrixSkor } from "@/lib/maahir/types";
import type { TautanOrang } from "@/lib/orang/cv";

export function idPengajarMaahir(tautan: TautanOrang[]): string[] {
  return [
    ...new Set(
      tautan.filter((t) => t.sumber === "maahir" && t.peran === "pengajar_hits").map((t) => t.idUpstream),
    ),
  ];
}

export async function getMatrixOrang(
  pengajarIds: string[],
): Promise<{ rows: MaahirMatrixSkor[]; rankedPerBulan: Record<string, number> }> {
  if (pengajarIds.length === 0) return { rows: [], rankedPerBulan: {} };
  const db = getDb();
  const ids = sql.join(pengajarIds.map((i) => sql`${i}`), sql`, `);
  const [rows, ranked] = await Promise.all([
    db.execute<{ raw: MaahirMatrixSkor }>(sql`
      select ms.raw
      from maahir_sync ms
      join programs p on p.id = ms.program_id
      where p.data_source_type = 'maahir_api'
        and ms.entity = 'matrix-rekap'
        and ms.raw->>'pengajar_id' in (${ids})
    `),
    // Penyebut "#25 dari N": pengajar yang diberi ranking bulan itu.
    db.execute<{ ym: string; n: number }>(sql`
      select ms.raw->>'year_month' as ym, count(*)::int as n
      from maahir_sync ms
      join programs p on p.id = ms.program_id
      where p.data_source_type = 'maahir_api'
        and ms.entity = 'matrix-rekap'
        and ms.raw->>'ranking' is not null
      group by 1
    `),
  ]);
  return {
    rows: rows.rows.map((r) => r.raw),
    rankedPerBulan: Object.fromEntries(ranked.rows.map((r) => [r.ym, Number(r.n)])),
  };
}
