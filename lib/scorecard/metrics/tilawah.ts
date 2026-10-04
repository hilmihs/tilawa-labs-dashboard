/**
 * Tilawah metric source — reads the already-synced tables (students_sync,
 * halaqah_sync), NOT an external API. Feeds scorecard KPIs whose numbers are the
 * live tilawah enrollment/class counts instead of a stale spreadsheet figure.
 *
 * What the tilawah data supports cleanly:
 *   - peserta_aktif : DISTINCT active students (enrollment_status_code = 1)
 *                     across one or more program slugs, deduped by tilawah_user_id
 *                     so someone enrolled in two batches counts once. Optional
 *                     gender filter (1 = ikhwan, 2 = akhwat).
 *   - kelas         : number of synced halaqah across the program slugs, optionally
 *                     split by mode (halaqah_sync.type) and gender (halaqah.ts).
 *   - jam_halaqah   : Jam/Minggu teacher hours, a flat N hours per halaqah
 *                     (per-program override), same filters as `kelas`.
 *   - batch         : number of distinct tilawah batches with at least one
 *                     halaqah. For programs where one batch IS one class (Tahsin
 *                     Al-Fatihah Mustahik: a batch runs its halaqah for one week),
 *                     which is how the workbook counts "Jumlah Kelas".
 *
 * A peserta/kelas count is a "current" snapshot, so it ignores the period window.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { programs, studentsSync, halaqahSync } from "@/lib/db/schema";
import { jamHalaqah, pilihHalaqah, type HalaqahRow } from "./halaqah";

export type TilawahMetric = "peserta_aktif" | "kelas" | "batch" | "jam_halaqah";

export type TilawahParams = {
  metric: TilawahMetric;
  /** Program slugs to aggregate over, e.g. HITS reguler dasar = 3 batch slugs. */
  programSlugs: string[];
  /** 1 = ikhwan, 2 = akhwat; omit for both. For kelas/jam_halaqah it is the halaqah's gender. */
  gender?: 1 | 2;
  /** kelas/jam_halaqah: halaqah mode as tilawah reports it; omit for all. */
  type?: "offline" | "online";
  /** jam_halaqah: hours per halaqah per week (default 3). */
  jamPerHalaqah?: number;
  /** jam_halaqah: per-program-slug override of jamPerHalaqah. */
  jamPerProgram?: Record<string, number>;
};

/** Halaqah of the programs with their roster gender tally, for kelas/jam_halaqah. */
async function loadHalaqah(ids: string[]): Promise<HalaqahRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      programSlug: programs.slug,
      name: halaqahSync.name,
      type: halaqahSync.type,
      ikhwan: sql<number>`count(${studentsSync.id}) filter (where ${studentsSync.gender} = 1)::int`,
      akhwat: sql<number>`count(${studentsSync.id}) filter (where ${studentsSync.gender} = 2)::int`,
    })
    .from(halaqahSync)
    .innerJoin(programs, eq(programs.id, halaqahSync.programId))
    .leftJoin(
      studentsSync,
      sql`${studentsSync.programId} = ${halaqahSync.programId} and ${studentsSync.halaqahId} = ${halaqahSync.tilawahHalaqahId}`,
    )
    .where(inArray(halaqahSync.programId, ids))
    .groupBy(halaqahSync.id, programs.slug);
  return rows;
}

async function programIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ id: programs.id })
    .from(programs)
    .where(inArray(programs.slug, slugs));
  return rows.map((r) => r.id);
}

/** Resolve one tilawah metric to a single number. */
export async function computeTilawah(p: TilawahParams): Promise<number> {
  const ids = await programIds(p.programSlugs);
  if (ids.length === 0) return 0;
  const db = getDb();

  if (p.metric === "batch") {
    const [row] = await db
      .select({ n: sql<number>`count(distinct ${halaqahSync.tilawahBatchId})::int` })
      .from(halaqahSync)
      .where(inArray(halaqahSync.programId, ids));
    return row?.n ?? 0;
  }

  if (p.metric === "kelas" || p.metric === "jam_halaqah") {
    const rows = pilihHalaqah(await loadHalaqah(ids), { type: p.type, gender: p.gender });
    return p.metric === "kelas" ? rows.length : jamHalaqah(rows, p.jamPerHalaqah ?? 3, p.jamPerProgram);
  }

  // A stored item with a metric this build doesn't know must fail loudly, not
  // fall through to the peserta count below and report a plausible wrong number.
  if (p.metric !== "peserta_aktif") throw new Error(`metric tilawah tidak dikenal: ${String(p.metric)}`);

  // peserta_aktif — distinct people, active only, optional gender.
  const conds = [
    inArray(studentsSync.programId, ids),
    sql`${studentsSync.enrollmentStatusCode} = 1`,
  ];
  if (p.gender) conds.push(sql`${studentsSync.gender} = ${p.gender}`);
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${studentsSync.tilawahUserId})::int` })
    .from(studentsSync)
    .where(sql.join(conds, sql` and `));
  return row?.n ?? 0;
}
