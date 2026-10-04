/**
 * Data for the "Matrix skill" tab on `/[program]/pengajar`.
 *
 * `rekap/matrix-guru` answers for the whole of HITS at once — the 3 Sep 2026
 * capture holds 178 pengajar across eight batches — so the program scoping
 * happens HERE, exactly like `/[program]/disiplin` does it: the batch ids pinned
 * on the program → the halaqah in those batches → how many of them each pengajar
 * teaches. A coordinator who holds one batch must not open a table of 178 rows
 * belonging to other people.
 *
 * Every failure mode gets its own outcome rather than an empty payload, because
 * "no pin", "scope refused", "never fetched" and "snapshot not computed yet" are
 * four different sentences and none of them is a zero.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { attendanceThresholds, maahirSyncState, programs } from "@/lib/db/schema";
import {
  matrixSnapshotState,
  periodLabel,
  readMatrixGuru,
  type MaahirRekapRead,
} from "@/lib/maahir/rekap";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import type { MaahirMatrixPayload } from "@/lib/maahir/types";
import { hitsBatchIds } from "../disiplin/queries";
import { buildMatrixView, type MatrixView } from "./view-model";

export const DEFAULT_THRESHOLD_PCT = 70;

/**
 * Ambang program (`attendance_thresholds.pct_70`, periode yaumiy), untuk KPI
 * kepala halaman. Laporan bulanan memakai angka yang sama sebagai "ambang
 * pengajar" pada rasio mengajar, jadi target di KPI dan di xlsx satu sumber.
 * Lib hanya membacanya di dalam bundel besar (`getInsights`, laporan) yang
 * menjalankan belasan query lain — di sini cukup satu baris.
 */
export async function getAttendanceThresholdPct(programId: string): Promise<number> {
  const [row] = await getDb()
    .select({ pct70: attendanceThresholds.pct70 })
    .from(attendanceThresholds)
    .where(
      and(
        eq(attendanceThresholds.programId, programId),
        eq(attendanceThresholds.periodType, "yaumiy"),
      ),
    )
    .limit(1);
  return row?.pct70 != null ? Number(row.pct70) : DEFAULT_THRESHOLD_PCT;
}

/**
 * Halaqah count per `pengajar_id` inside the pinned batches, from the
 * `hits/halaqah` mirror.
 *
 * Scoped to the `maahir_api` program because that is the only program row the
 * Maahir sync writes into; reading it under the HITS program's own id finds
 * nothing. An empty map therefore means the mirror was never synced — the
 * caller reports that instead of falling back to "show everyone".
 */
export async function halaqahPerPengajar(batchIds: string[]): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map();
  const db = getDb();
  // Expanded into one bind per id instead of `= any(${batchIds})`: drizzle binds a
  // JS array as a SINGLE parameter, which Postgres then tries to read as an array
  // literal and rejects with `array_in: malformed array literal`.
  const rows = await db.execute<{ pengajar_id: string; n: string }>(sql`
    select ms.raw->>'pengajar_id' as pengajar_id, count(*)::text as n
    from maahir_sync ms
    join programs p on p.id = ms.program_id and p.data_source_type = 'maahir_api'
    where ms.entity = 'hits/halaqah'
      and ms.raw->>'batch_id' in (${sql.join(batchIds.map((b) => sql`${b}`), sql`, `)})
      and ms.raw->>'pengajar_id' is not null
    group by 1
  `);
  return new Map(rows.rows.map((r) => [r.pengajar_id, Number(r.n)]));
}

/** A 403 `forbidden_scope` is recorded per route, so a permission problem is
 *  never reported as a missing sync. */
async function scopeDitolak(): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ entity: maahirSyncState.entity })
    .from(maahirSyncState)
    .innerJoin(programs, eq(programs.id, maahirSyncState.programId))
    .where(
      and(
        eq(programs.dataSourceType, "maahir_api"),
        eq(maahirSyncState.forbidden, true),
        sql`${maahirSyncState.entity} in ('rekap/matrix-guru', 'hits/halaqah')`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export type MatrixData =
  | { state: "tanpa-pin" }
  | { state: "scope-ditolak" }
  | { state: "belum-ditarik" }
  | { state: "mirror-kosong"; batchIds: string[] }
  /** Upstream answered, but has not recomputed the snapshot for that month.
   *  Explicitly NOT the same as every score being zero. */
  | { state: "belum-dihitung"; periode: string | null; snapshotTerakhir: string | null; fetchedAt: Date }
  | {
      state: "siap";
      view: MatrixView;
      periode: string | null;
      /** true = the stored snapshot is older than the month it describes. */
      basi: boolean;
      snapshotTerakhir: string | null;
      fetchedAt: Date;
      dariCache: boolean;
    };

/** The two months the sync keeps warm, newest first. */
export function bulanPilihan(today: Date = new Date()): string[] {
  return [...rekapMonths(today)];
}

/** Render the requested month only when the sync actually stores it; anything
 *  else would only ever be able to say "belum ditarik". */
export function resolveBulan(requested: string | undefined, today: Date = new Date()): string {
  const pilihan = bulanPilihan(today);
  return requested && pilihan.includes(requested) ? requested : pilihan[0];
}

export async function loadMatrix(config: unknown, bulan: string): Promise<MatrixData> {
  const batchIds = hitsBatchIds(config);
  if (batchIds.length === 0) return { state: "tanpa-pin" };

  const [halaqah, rekap] = await Promise.all([
    halaqahPerPengajar(batchIds),
    readMatrixGuru(bulan) as Promise<MaahirRekapRead<MaahirMatrixPayload> | null>,
  ]);

  if (!rekap) {
    return (await scopeDitolak()) ? { state: "scope-ditolak" } : { state: "belum-ditarik" };
  }
  if (halaqah.size === 0) return { state: "mirror-kosong", batchIds };

  const snapshotTerakhir = rekap.meta?.snapshot_terakhir ?? null;
  const snapshot = matrixSnapshotState(rekap.meta, rekap.payload);
  if (snapshot === "belum-dihitung") {
    return {
      state: "belum-dihitung",
      periode: periodLabel(rekap.meta),
      snapshotTerakhir,
      fetchedAt: rekap.fetchedAt,
    };
  }

  return {
    state: "siap",
    view: buildMatrixView(rekap.payload, halaqah),
    periode: periodLabel(rekap.meta),
    basi: snapshot === "basi",
    snapshotTerakhir,
    fetchedAt: rekap.fetchedAt,
    dariCache: rekap.meta?.dari_cache === true,
  };
}
