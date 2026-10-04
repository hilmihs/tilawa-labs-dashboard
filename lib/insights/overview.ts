import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { students, studentsSync, halaqahSync, attendanceThresholds } from "@/lib/db/schema";
import { getAllPrograms, type Program } from "@/lib/programs/resolve";
import { getProgramConfig, hidePairedPresensi } from "@/lib/programs/config";
import { readBatchConfig } from "@/lib/programs/families";
import { readKehadiran } from "@/lib/maahir/rekap";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";

const DEFAULT_PERIOD_TYPE = "yaumiy";

export type ProgramOverview = {
  slug: string;
  name: string;
  studentCount: number;
  halaqahCount: number;
  avgKehadiran: number | null;
  belowThresholdCount: number;
  thresholdPct: number;
  /**
   * Why `avgKehadiran` is null, when the reason is something other than "no
   * data yet". A card showing an em dash with no explanation reads as a bug;
   * this lets it read as a fact. Only set where a genuine explanation exists.
   */
  avgKehadiranNote?: string | null;
};

/**
 * One compact health row per program, for the coordinator overview grid.
 * `slugs` limits the set (a scoped coordinator); omit for all programs (super).
 */
export async function getProgramsOverview(slugs?: string[]): Promise<ProgramOverview[]> {
  const db = getDb();
  const all = await getAllPrograms();
  // HKM — Presensi is HKM's Presensi tab, and HKM's card already reads its
  // numbers (statsProgram) — a card of its own would count HKM twice.
  const scoped = hidePairedPresensi(slugs ? all.filter((p) => slugs.includes(p.slug)) : all);
  const bySlug = new Map(all.map((p) => [p.slug, p]));

  return Promise.all(
    scoped.map(async (program): Promise<ProgramOverview> => {
      // Programs whose own data source carries no roster/presensi (HKM, on the
      // berkah API) point at a paired tilawah program via config.presensiSlug.
      // Read the headline numbers from there — otherwise every tile reads 0/—
      // even though the participants exist, just under the paired slug.
      // Maahir writes none of the tilawah mirror, so every query below returns
      // zero for it. Its numbers live in the cached rekap payloads instead.
      if (program.dataSourceType === "maahir_api") return maahirOverview(program);

      const stats = statsProgram(program, bySlug);
      // A card stands for the real program, not for one of its batches, so its
      // numbers cover the whole batch family. Without this a tile reports only
      // the newest batch — HITS Reguler read 1381 instead of all three batches.
      const statsIds = statsProgramIds(program, all, bySlug);

      // The threshold stays the primary batch's: it is a per-program policy,
      // and batches of one program share it.
      const [threshold] = await db
        .select({ pct70: attendanceThresholds.pct70 })
        .from(attendanceThresholds)
        .where(
          and(
            eq(attendanceThresholds.programId, stats.id),
            eq(attendanceThresholds.periodType, DEFAULT_PERIOD_TYPE),
          ),
        )
        .limit(1);
      const thresholdPct = threshold?.pct70 != null ? Number(threshold.pct70) : 70;

      // Enrolled roster (from halaqah detail) — the real participant count,
      // available even before any attendance has been recorded.
      //
      // Enrolments, not distinct people: someone who took HITS Reguler in
      // Januari and again in Juni counts twice (47 such people today). Chosen
      // deliberately — the tile reads as seats filled. For a head count of
      // people, dedupe on students.tilawahUserId instead.
      const [rosterAgg] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(students)
        .where(inArray(students.programId, statsIds));

      // Attendance-derived figures come from students_sync (empty until the
      // program has recorded presensi). Averaging across the family is
      // participant-weighted, so a big batch moves the number more than a
      // small one — which is what a single headline percentage should do.
      const [attAgg] = await db
        .select({
          avg: sql<number | null>`avg(${studentsSync.attendanceRate})`,
          below: sql<number>`count(*) filter (where ${studentsSync.attendanceRate} < ${thresholdPct})::int`,
        })
        .from(studentsSync)
        .where(inArray(studentsSync.programId, statsIds));

      const [halaqahAgg] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(halaqahSync)
        .where(inArray(halaqahSync.programId, statsIds));

      return {
        slug: program.slug,
        name: program.name,
        studentCount: rosterAgg?.count ?? 0,
        halaqahCount: halaqahAgg?.count ?? 0,
        avgKehadiran: attAgg?.avg != null ? Number(attAgg.avg) : null,
        belowThresholdCount: attAgg?.below ?? 0,
        thresholdPct,
      };
    }),
  );
}

/**
 * The overview tile for a `maahir_api` program.
 *
 * The tilawah queries above cannot serve it: the Maahir sync writes only
 * `maahir_sync` / `maahir_rekap`, so `students`, `students_sync` and
 * `halaqah_sync` all hold zero rows for this program — verified 8 Sep 2026.
 * That is why the card read "0 peserta · 0 halaqah · — rata² hadir" while the
 * program plainly had 207 people in 22 classes.
 *
 * Counts come from the cached `rekap/kehadiran` payload — the class grid the
 * `/maahir/kehadiran` screen already renders — so the card and that screen can
 * never disagree. Both are list lengths, not derived figures.
 *
 * **`avgKehadiran` stays null on purpose, and this is the interesting part.**
 * Maahir publishes attendance as *three* percentages over three different
 * denominators — Takhassus, Kelas Maahir, At-Tibyan — inside
 * `rekap/laporan-maahir`, and no combined figure. On 8 Sep 2026 those read 47%,
 * 80% and 71%. Two wrong ways out:
 *
 *   - average the three (66%) — a number upstream never published, derived
 *     across incompatible denominators, forbidden by docs/API-PUBLIC.md §9;
 *   - show the "Kelas Maahir" block's 80% because the program row happens to
 *     carry that name — but the counts beside it cover all 22 classes, so the
 *     tile would silently mix scopes.
 *
 * So the tile says "—" and carries the reason. The three real figures are one
 * click away on the program's own dashboard, each against its own benchmark.
 */
async function maahirOverview(program: Program): Promise<ProgramOverview> {
  const [bulanIni, bulanLalu] = rekapMonths();
  // Fall back to last month the same way the Maahir screens do: the current
  // 28→27 window may not have been pulled yet, and a card that blanks on the
  // 28th of every month would look broken once a month.
  const read = (await readKehadiran(bulanIni)) ?? (await readKehadiran(bulanLalu));
  const kelas = Array.isArray(read?.payload) ? read.payload : [];

  return {
    slug: program.slug,
    name: program.name,
    // Enrolments across classes, matching the tilawah tiles' "seats filled"
    // reading — someone in two Maahir classes counts twice.
    studentCount: kelas.reduce((n, k) => n + (k.anggota?.length ?? 0), 0),
    halaqahCount: kelas.length,
    avgKehadiran: null,
    avgKehadiranNote:
      "Maahir menerbitkan tiga angka kehadiran terpisah (Takhassus, Kelas Maahir, At-Tibyan) dengan penyebut berbeda, dan tidak ada angka gabungan. Lihat dashboard programnya.",
    // No halaqah-level attention signal comes out of the Maahir rekap, and the
    // card's footnote counts halaqah — feeding it a people count would mislabel.
    belowThresholdCount: 0,
    thresholdPct: 70,
  };
}

/**
 * Which program's read-model rows back the overview tiles. Normally the program
 * itself; for one with a configured `presensiSlug`, the paired program that
 * actually holds the roster and presensi. Falls back to the program itself when
 * the paired slug is missing from the DB, so a stale config never blanks a card.
 */
function statsProgram(program: Program, bySlug: Map<string, Program>): Program {
  const { presensiSlug } = getProgramConfig(program);
  if (!presensiSlug || presensiSlug === program.slug) return program;
  return bySlug.get(presensiSlug) ?? program;
}

/**
 * Every program id whose rows belong on this card. A batch is a slice of one
 * real program (hits-regular / -jan / -apr), and the nav shows one entry per
 * family — so the tile has to sum the family, or it silently reports the newest
 * batch as if it were the whole program.
 *
 * Each member still goes through `statsProgram`, so a paired presensi program
 * is followed per batch rather than only for the family head.
 */
export function statsProgramIds(
  program: Program,
  all: Program[],
  bySlug: Map<string, Program>,
): string[] {
  const family = readBatchConfig(program.config)?.family;
  const members = family
    ? all.filter((p) => readBatchConfig(p.config)?.family === family)
    : [program];
  return [...new Set(members.map((p) => statsProgram(p, bySlug).id))];
}
