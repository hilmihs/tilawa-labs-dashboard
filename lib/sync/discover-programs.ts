import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { programs, tilawahSyncCursor } from "@/lib/db/schema";
import { loginToTilawah } from "@/lib/integrations/tilawah-auth";
import { tilawahGet } from "@/lib/integrations/tilawah-client";
import { readBatchConfig } from "@/lib/programs/families";
import {
  slugifyProgramName,
  uniqueSlug,
  type DiscoveryMark,
} from "@/lib/programs/discovery";

/**
 * Find upstream programs and batches that have no row here, and create one for
 * each — paused, hidden, awaiting a super coordinator's approval.
 *
 * Why this exists: every program row used to come from scripts/seed-programs.ts,
 * so anything opened in the tilawah CMS was invisible until a human noticed and
 * shipped a deploy. HITS Armalah (upstream program 11, batch 15, three halaqah)
 * had been running unmirrored; nothing in the system was capable of saying so.
 *
 * Why it creates rather than merely reports: a report nobody reads is the state
 * we are already in. Why it creates *paused and hidden*: a machine can copy a
 * name and a batch id, but not the judgement calls — the display name, the
 * report layout, which coordinators may see it — and an unattended program row
 * appearing in everyone's nav is worse than a late one. See
 * lib/programs/discovery.ts for the mark and the approval contract.
 */

type TilawahSession = Awaited<ReturnType<typeof loginToTilawah>>;
type UpstreamProgram = { id: number; name: string };
type UpstreamBatch = { id: number; name: string };

/**
 * Discovery costs one request per upstream program (13 today) and the answer
 * changes a few times a year, so it does not belong on the 15-minute sync tick.
 * Six hours puts a new program on the admin's screen the same working day.
 */
const DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CURSOR_KEY = "program_discovery";

export type DiscoveredRow = {
  slug: string;
  name: string;
  kind: "program" | "batch";
  tilawahProgramId: number;
  tilawahBatchId: number | null;
  upstreamBatchName: string | null;
};

export type UpstreamProgramWithBatches = UpstreamProgram & { batches: UpstreamBatch[] };

/** The subset of a program row the plan needs — so the planner stays testable. */
export type LocalProgramRow = {
  slug: string;
  dataSourceType: string;
  tilawahProgramId: number | null;
  tilawahBatchId: number | null;
  config: unknown;
};

export type PlannedRow = {
  slug: string;
  name: string;
  tilawahProgramId: number;
  tilawahBatchId: number;
  config: Record<string, unknown> & { discovery: DiscoveryMark };
};

/**
 * Decide what to create, given what the CMS has and what we already mirror.
 *
 * Pure on purpose: this is the part with the judgement in it, and the part that
 * would be expensive to get wrong (a bad plan creates program rows). Kept free
 * of db and network so lib/sync/discover-programs.test.ts can drive every branch.
 */
export function planDiscovery(
  upstream: UpstreamProgramWithBatches[],
  local: LocalProgramRow[],
  now: string,
): { creates: PlannedRow[]; emptyUpstream: string[] } {
  const taken = new Set(local.map((p) => p.slug));
  const byUpstreamId = new Map<number, LocalProgramRow[]>();
  for (const p of local) {
    if (p.dataSourceType !== "tilawah_api" || p.tilawahProgramId == null) continue;
    const list = byUpstreamId.get(p.tilawahProgramId) ?? [];
    list.push(p);
    byUpstreamId.set(p.tilawahProgramId, list);
  }

  const creates: PlannedRow[] = [];
  const emptyUpstream: string[] = [];

  for (const up of upstream) {
    // A program with no batch has no halaqah either — an upstream shell
    // (ids 1, 2 and 4 are exactly this). Creating a row for it would put an
    // empty program in front of an operator for no reason.
    if (up.batches.length === 0) {
      emptyUpstream.push(`${up.id}:${up.name}`);
      continue;
    }

    const rows = byUpstreamId.get(up.id);

    // ── Case 1: nothing here mirrors this upstream program at all.
    if (!rows || rows.length === 0) {
      const slug = uniqueSlug(slugifyProgramName(up.name), taken);
      taken.add(slug);
      const newest = up.batches[0];
      creates.push({
        slug,
        name: up.name,
        tilawahProgramId: up.id,
        tilawahBatchId: newest.id,
        // syncAllBatches from birth: a brand-new program owns exactly one row,
        // so mirroring every batch into it cannot duplicate anything, and its
        // second batch then attaches with nobody doing anything.
        config: {
          features: { piket: false, perubahan: true },
          segmentation: { primary: "level", secondary: "gender" },
          syncAllBatches: true,
          syncPaused: true,
          discovery: {
            kind: "program",
            tilawahProgramId: up.id,
            tilawahBatchId: newest.id,
            upstreamProgramName: up.name,
            upstreamBatchName: newest.name,
            discoveredAt: now,
          },
        },
      });
      continue;
    }

    // ── Case 2: a row already takes every batch of this program.
    if (rows.some((r) => (r.config as { syncAllBatches?: boolean } | null)?.syncAllBatches)) continue;

    // ── Case 3: pinned rows (a batch family, or a lone pinned program). A batch
    // no row is pinned to gets its own sibling row, because the monthly report
    // is written per batch — folding a new batch into an existing row would
    // silently widen what an already-published report covers.
    const covered = new Set(rows.map((r) => r.tilawahBatchId).filter((b): b is number => b != null));
    const missing = up.batches.filter((b) => !covered.has(b.id));
    if (missing.length === 0) continue;

    const template = [...rows].sort(
      (a, b) => (readBatchConfig(b.config)?.order ?? 0) - (readBatchConfig(a.config)?.order ?? 0),
    )[0];
    const family = readBatchConfig(template.config)?.family ?? template.slug;
    const maxOrder = rows.reduce((acc, r) => Math.max(acc, readBatchConfig(r.config)?.order ?? 0), 0);

    for (const [i, batch] of missing.entries()) {
      const slug = uniqueSlug(`${family}-${slugifyProgramName(batch.name)}`, taken);
      taken.add(slug);
      // Inherit the sibling's config (report layout, segmentation, features) —
      // a new batch of HITS Reguler is still HITS Reguler — then override the
      // batch identity and mark it pending.
      const base = (template.config ?? {}) as Record<string, unknown>;
      creates.push({
        slug,
        name: `${up.name} (Batch ${batch.name})`,
        tilawahProgramId: up.id,
        tilawahBatchId: batch.id,
        config: {
          ...base,
          batch: { family, label: batch.name, order: maxOrder + i + 1 },
          syncPaused: true,
          discovery: {
            kind: "batch",
            tilawahProgramId: up.id,
            tilawahBatchId: batch.id,
            upstreamProgramName: up.name,
            upstreamBatchName: batch.name,
            discoveredAt: now,
          },
        },
      });
    }
  }

  return { creates, emptyUpstream };
}

export type DiscoveryResult = {
  ran: boolean;
  /** Set when the throttle (or a missing base url) skipped the pass. */
  skipped?: string;
  created: DiscoveredRow[];
  /** Upstream programs with no batch at all — nothing to mirror, so ignored. */
  emptyUpstream: string[];
};

/** Batches of one upstream program, newest first. */
async function fetchBatches(
  baseUrl: string,
  session: TilawahSession,
  programId: number,
): Promise<UpstreamBatch[]> {
  const body = await tilawahGet<{ batches: UpstreamBatch[] }>(
    baseUrl,
    session,
    `/api/batches?page=1&per_page=50&sort_by=id&sort=desc&filters[program_id]=${programId}`,
  );
  return body.data.batches ?? [];
}

/** Upstream batch names carry stray double spaces ("LAZ  #40"). */
function tidy(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * One discovery pass. Throttled to DISCOVERY_INTERVAL_MS unless `force`.
 *
 * Takes a session so it can ride along with the sync's single login; pass none
 * and it logs in itself (the script path).
 */
export async function discoverTilawahPrograms(
  opts: { force?: boolean; dryRun?: boolean; session?: TilawahSession } = {},
): Promise<DiscoveryResult> {
  const baseUrl = (process.env.TILAWAH_BASE_URL ?? "").replace(/\/$/, "");
  if (!baseUrl) return { ran: false, skipped: "TILAWAH_BASE_URL not set", created: [], emptyUpstream: [] };

  const db = getDb();

  if (!opts.force) {
    const [cursor] = await db
      .select()
      .from(tilawahSyncCursor)
      .where(eq(tilawahSyncCursor.key, CURSOR_KEY));
    if (cursor && Date.now() - cursor.updatedAt.getTime() < DISCOVERY_INTERVAL_MS) {
      return { ran: false, skipped: "throttled", created: [], emptyUpstream: [] };
    }
  }

  const session = opts.session ?? (await loginToTilawah(baseUrl));

  const upstream = (
    await tilawahGet<{ programs: UpstreamProgram[] }>(
      baseUrl,
      session,
      "/api/programs?page=1&per_page=100&sort_by=id&sort=asc",
    )
  ).data.programs;

  const withBatches: UpstreamProgramWithBatches[] = [];
  for (const up of upstream) {
    const batches = (await fetchBatches(baseUrl, session, up.id)).map((b) => ({
      id: b.id,
      name: tidy(b.name),
    }));
    withBatches.push({ ...up, batches });
  }

  const local = await db.select().from(programs);
  const { creates, emptyUpstream } = planDiscovery(withBatches, local, new Date().toISOString());

  if (!opts.dryRun) {
    for (const c of creates) {
      await db.insert(programs).values({
        slug: c.slug,
        name: c.name,
        dataSourceType: "tilawah_api",
        tilawahProgramId: c.tilawahProgramId,
        tilawahBatchId: c.tilawahBatchId,
        berkahBusinessUnitId: null,
        config: c.config,
      });
    }
  }
  const created: DiscoveredRow[] = creates.map((c) => ({
    slug: c.slug,
    name: c.name,
    kind: c.config.discovery.kind,
    tilawahProgramId: c.tilawahProgramId,
    tilawahBatchId: c.tilawahBatchId,
    upstreamBatchName: c.config.discovery.upstreamBatchName,
  }));

  if (!opts.dryRun) {
    await db
      .insert(tilawahSyncCursor)
      .values({ key: CURSOR_KEY, updatedAt: new Date() })
      .onConflictDoUpdate({ target: tilawahSyncCursor.key, set: { updatedAt: new Date() } });
  }

  return { ran: true, created, emptyUpstream };
}

/**
 * Discovery as the sync calls it: never throws into the sync run (a CMS hiccup
 * here must not sink a data pull) and says what it did in the log.
 */
export async function runDiscoveryQuietly(session: TilawahSession): Promise<void> {
  try {
    const res = await discoverTilawahPrograms({ session });
    if (!res.ran) return;
    if (res.created.length === 0) {
      console.log("[discovery] tidak ada program/batch baru di CMS");
      return;
    }
    console.log(
      `[discovery] ${res.created.length} baris baru menunggu persetujuan di /admin/programs: ` +
        res.created
          .map((c) => `${c.slug} (${c.kind === "batch" ? "batch " : "program "}${c.upstreamBatchName ?? ""})`)
          .join(", "),
    );
  } catch (err) {
    console.warn(`[discovery] gagal, lanjut tanpa: ${(err as Error).message.slice(0, 200)}`);
  }
}

/** Count of rows the sync created and nobody has decided on yet. */
export async function countAwaitingDecision(): Promise<number> {
  const rows = await getDb().execute(sql`
    select count(*)::int as n from programs
    where config->'discovery' is not null
      and config->'discovery'->>'approvedAt' is null
      and coalesce((config->'discovery'->>'dismissed')::boolean, false) = false
  `);
  return Number(rows.rows[0]?.n ?? 0);
}
