/**
 * Which programs the /tv board shows, and under which label.
 *
 * Two wrinkles the board has to swallow:
 *
 *  1. A program whose own data source carries no presensi (HKM, on the berkah
 *     API) points at a paired tilawah program through `config.presensiSlug`.
 *     Both slugs then resolve to the SAME read-model rows, so they must collapse
 *     into one display row — otherwise HKM is counted twice in the headline.
 *  2. Batches are separate program rows (hits-regular / -jan / -apr). They stay
 *     separate rows on the board (the coordinator asked for one row per slug),
 *     but the label gets the batch month appended so nobody has to guess.
 */
import { getAllPrograms, type Program } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { readBatchConfig } from "@/lib/programs/families";

export type TvSource = "tilawah_api" | "mabni_api" | "berkah_api" | "maahir_api";

export type TvProgramRef = {
  /** The display row's stable key: the slug of the program that holds the data. */
  key: string;
  label: string;
  /** Program row whose read-model tables actually hold the presensi. */
  statsProgramId: string;
  /** Data source OF statsProgram — never 'berkah_api' once the pairing resolved. */
  source: TvSource;
  /** Every program slug folded into this row (usually one; HKM has two). */
  slugs: string[];
  syncPaused: boolean;
  order: number;
};

/** Rows the board renders, in display order. */
export async function getTvProgramRefs(): Promise<TvProgramRef[]> {
  const all = await getAllPrograms();
  const bySlug = new Map(all.map((p) => [p.slug, p]));

  const byStatsId = new Map<string, { stats: Program; members: Program[] }>();
  for (const p of all) {
    const stats = statsProgram(p, bySlug);
    const slot = byStatsId.get(stats.id) ?? { stats, members: [] };
    slot.members.push(p);
    byStatsId.set(stats.id, slot);
  }

  const refs = [...byStatsId.values()].map(({ stats, members }): TvProgramRef => {
    // When two slugs collapse, label after the parent (the program a human would
    // name in a meeting), not after the presensi twin.
    const labelled = members.find((m) => m.id !== stats.id) ?? stats;
    return {
      key: stats.slug,
      label: tvLabel(labelled),
      statsProgramId: stats.id,
      source: stats.dataSourceType as TvSource,
      slugs: members.map((m) => m.slug).sort(),
      syncPaused: members.some((m) => isSyncPaused(m)),
      order: 0,
    };
  });

  refs.sort((a, b) => a.label.localeCompare(b.label, "id"));
  return refs.map((r, i) => ({ ...r, order: i }));
}

export function partitionBySource(refs: TvProgramRef[]): {
  tilawahIds: string[];
  mabniIds: string[];
  allIds: string[];
} {
  const tilawahIds: string[] = [];
  const mabniIds: string[] = [];
  for (const r of refs) {
    // Maahir has no jadwal/attendance tables; its facts come from the cached
    // rekap payload (lib/tv/maahir-facts.ts), never from these SQL statements.
    if (r.source === "maahir_api") continue;
    if (r.source === "mabni_api") mabniIds.push(r.statsProgramId);
    else tilawahIds.push(r.statsProgramId);
  }
  return { tilawahIds, mabniIds, allIds: [...tilawahIds, ...mabniIds] };
}

/** Same pairing rule as the coordinator overview (lib/insights/overview.ts). */
function statsProgram(program: Program, bySlug: Map<string, Program>): Program {
  const { presensiSlug } = getProgramConfig(program);
  if (!presensiSlug || presensiSlug === program.slug) return program;
  return bySlug.get(presensiSlug) ?? program;
}

function isSyncPaused(program: Program): boolean {
  return (program.config as { syncPaused?: boolean } | null)?.syncPaused === true;
}

/**
 * Screen label: short enough to read at six metres, and derived rather than
 * hardcoded so a new batch inherits the right shape without a code change.
 *   "HITS Reguler Batch Jan 2026" + batch "Januari 2026" -> "HITS Reguler · Januari"
 *   "HKM — Presensi (Household Recitation Programme)"          -> "HKM"
 */
function tvLabel(program: Program): string {
  const batch = readBatchConfig(program.config);
  let base = program.name
    .replace(/\s*\([^)]*\)\s*/g, " ") // drop parentheticals
    .replace(/\s*batch\s+\S+\s+\d{4}\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^hkm\b/i.test(base)) base = "HKM";
  base = base.replace(/\bRegular\b/i, "Reguler");
  if (!batch?.label) return base;
  const period = batch.label.split(" ")[0]; // "Januari 2026" -> "Januari", "LAZ #40" -> "LAZ"
  return `${base} · ${period}`;
}
