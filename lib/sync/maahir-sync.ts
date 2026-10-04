/**
 * Ingest the Maahir Public API into a generic local mirror (`maahir_sync`),
 * one row per upstream entity row, `raw` verbatim. v1 is INGEST-ONLY: no UI and
 * no cron — a manual/dispatch trigger that pulls scopes maahir / hits /
 * penilaian (+ person refs) gently and records what it did.
 *
 * Gentleness (see lib/integrations/maahir/client.ts): the client serializes all
 * requests and spaces them; this module additionally walks entities SEQUENTIALLY
 * and uses per-entity state to shrink each run — ETag/304 for stable tables,
 * `sejak` high-water for updated_at tables, a rolling date window for dated ones,
 * and a `forbidden` flag so a scope the key lacks is never re-requested.
 */
import { kirimAntreanMaahir } from "@/lib/kerja/kirim-maahir";
import { sinkronOrangSetelahSync } from "@/lib/orang/sinkron-otomatis";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { programs, maahirRekap, maahirSync, maahirSyncState, syncRuns } from "@/lib/db/schema";
import { isSyncRunning } from "@/lib/sync/last-sync";
import {
  fetchEntity,
  fetchRekap,
  MaahirScopeForbiddenError,
  type MaahirRow,
} from "@/lib/integrations/maahir/client";
import { MAAHIR_ENTITIES, FIRST_DATE, type MaahirEntity } from "@/lib/integrations/maahir/registry";
import { maahirRekapPulls } from "@/lib/integrations/maahir/rekap-routes";

export type MaahirEntityResult = {
  entity: string;
  rows: number;
  skipped?: "forbidden" | "not_modified" | "paused";
  error?: string;
};

/** One `rekap/*` pull. `periode` is the storage key, so it is reported as-is. */
export type MaahirRekapResult = {
  route: string;
  periode: string;
  ok: boolean;
  skipped?: "forbidden";
  /** Upstream served its own cache (`meta.dari_cache`) — worth seeing in the log. */
  fromCache?: boolean;
  error?: string;
};

/** `partial` = something failed but something else landed; the rows that DID land
 *  are already committed, so the run must not be reported as a plain failure. */
export type MaahirSyncStatus = "success" | "partial" | "failed";

export type MaahirSyncResult = {
  ok: boolean;
  programSlug: string;
  status?: MaahirSyncStatus;
  error?: string;
  entities?: MaahirEntityResult[];
  rekap?: MaahirRekapResult[];
  totalRows?: number;
  requestNote?: string;
};

type StateRow = {
  entity: string;
  etag: string | null;
  highWaterUpdatedAt: Date | null;
  forbidden: boolean;
  lastFullAt: Date | null;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Rolling window: first run pulls from FIRST_DATE, later runs from the 1st of last month. */
function dateWindow(lastFullAt: Date | null): { tanggal_dari: string; tanggal_sampai: string } {
  const today = new Date();
  const from = lastFullAt
    ? isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1))
    : FIRST_DATE;
  return { tanggal_dari: from, tanggal_sampai: isoDate(today) };
}

function rowId(row: MaahirRow, idKey: string): string | null {
  const v = row[idKey];
  if (v == null) return null;
  return String(v);
}

/**
 * The public API pages with OFFSET over a single, often non-unique sort column
 * (`evaluasi/sesi` sorts on `tgl_jadwal`, null on every row; `evaluasi/peserta`
 * on `urutan`, mostly 0). Ties are not stably ordered between pages, so a pull
 * can skip rows and repeat others while every page answers 200 — on 30 Sep 2026
 * prod mirrored 10 302 of 13 805 `evaluasi/nilai` rows and called it success.
 *
 * A pull is only trusted when its distinct ids reach `meta.total`. Otherwise it
 * is retried once (the union usually closes the gap) and, if still short, its
 * rows are kept but the high-water / ETag / window are NOT advanced — advancing
 * them would make the skipped rows unreachable by every later `sejak` pull.
 */
const MAX_PASSES = 2;

function distinctRows(rows: MaahirRow[], idKey: string): Map<string, MaahirRow> {
  const out = new Map<string, MaahirRow>();
  for (const row of rows) {
    const id = rowId(row, idKey);
    if (id != null) out.set(id, row);
  }
  return out;
}

function rowUpdatedAt(row: MaahirRow): Date | null {
  const v = row["updated_at"];
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Upsert a batch of rows for one entity into the generic mirror. */
async function upsertRows(
  db: ReturnType<typeof getDb>,
  programId: string,
  entity: MaahirEntity,
  rows: MaahirRow[],
): Promise<{ written: number; maxUpdatedAt: Date | null }> {
  const idKey = entity.idKey ?? "id";
  const values: {
    programId: string;
    entity: string;
    maahirId: string;
    updatedAt: Date | null;
    raw: MaahirRow;
  }[] = [];
  let maxUpdatedAt: Date | null = null;

  for (const row of rows) {
    const maahirId = rowId(row, idKey);
    if (maahirId == null) continue; // can't key it — skip
    const updatedAt = rowUpdatedAt(row);
    if (updatedAt && (!maxUpdatedAt || updatedAt > maxUpdatedAt)) maxUpdatedAt = updatedAt;
    values.push({ programId, entity: entity.path, maahirId, updatedAt, raw: row });
  }

  const CHUNK = 500;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    await db
      .insert(maahirSync)
      .values(chunk)
      .onConflictDoUpdate({
        target: [maahirSync.programId, maahirSync.entity, maahirSync.maahirId],
        set: {
          updatedAt: sql`excluded.updated_at`,
          raw: sql`excluded.raw`,
          syncedAt: sql`now()`,
        },
      });
  }
  return { written: values.length, maxUpdatedAt };
}

async function saveState(
  db: ReturnType<typeof getDb>,
  programId: string,
  entity: string,
  patch: { etag?: string | null; highWaterUpdatedAt?: Date | null; forbidden?: boolean; lastFullAt?: Date | null },
): Promise<void> {
  await db
    .insert(maahirSyncState)
    .values({
      programId,
      entity,
      etag: patch.etag ?? null,
      highWaterUpdatedAt: patch.highWaterUpdatedAt ?? null,
      forbidden: patch.forbidden ?? false,
      lastFullAt: patch.lastFullAt ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [maahirSyncState.programId, maahirSyncState.entity],
      set: {
        ...(patch.etag !== undefined ? { etag: patch.etag } : {}),
        ...(patch.highWaterUpdatedAt !== undefined ? { highWaterUpdatedAt: patch.highWaterUpdatedAt } : {}),
        ...(patch.forbidden !== undefined ? { forbidden: patch.forbidden } : {}),
        ...(patch.lastFullAt !== undefined ? { lastFullAt: patch.lastFullAt } : {}),
        updatedAt: new Date(),
      },
    });
}

/**
 * Second pass: the seven `rekap/*` routes (12 pulls, see `maahirRekapPulls`).
 * Runs AFTER the entity pass and through the same client throttle, so the two
 * passes never race and the upstream still sees one request at a time.
 *
 * Each pull is caught on its own: a route that 502s leaves its previously stored
 * payload untouched (we only ever upsert on success — there is no delete here),
 * so the dashboard keeps rendering last run's numbers with an older `fetchedAt`
 * instead of falling back to an empty state.
 */
async function runRekapPass(
  db: ReturnType<typeof getDb>,
  programId: string,
): Promise<MaahirRekapResult[]> {
  const results: MaahirRekapResult[] = [];

  for (const pull of maahirRekapPulls()) {
    try {
      const { data, meta } = await fetchRekap(pull.route, pull.params);
      await db
        .insert(maahirRekap)
        .values({
          programId,
          route: pull.route,
          periode: pull.periode,
          paramsKey: pull.paramsKey,
          // Verbatim: `data` is the upstream shape (object, or array for
          // rekap/kehadiran) and stays unflattened so new upstream fields ride
          // along without a migration.
          payload: (data ?? {}) as object,
          meta: meta as object,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [maahirRekap.programId, maahirRekap.route, maahirRekap.periode, maahirRekap.paramsKey],
          set: {
            payload: sql`excluded.payload`,
            meta: sql`excluded.meta`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
      // Clear a stale forbidden flag: a scope granted after an earlier 403 must
      // not leave the route marked as refused.
      await saveState(db, programId, pull.route, { forbidden: false });
      results.push({
        route: pull.route,
        periode: pull.periode,
        ok: true,
        fromCache: meta.dari_cache === true,
      });
    } catch (err) {
      if (err instanceof MaahirScopeForbiddenError) {
        // Recorded so a screen can say "scope belum diberikan" rather than
        // showing an unexplained blank. Unlike the entity pass we do NOT skip it
        // on later runs: one 403 costs a single cheap request, and a scope
        // granted later should heal itself without anyone clearing a flag.
        await saveState(db, programId, pull.route, { forbidden: true });
        results.push({ route: pull.route, periode: pull.periode, ok: false, skipped: "forbidden" });
        continue;
      }
      results.push({
        route: pull.route,
        periode: pull.periode,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export async function runMaahirSyncForProgram(program: {
  id: string;
  slug: string;
  config: unknown;
}): Promise<MaahirSyncResult> {
  const db = getDb();
  const paused = (program.config as { syncPaused?: boolean } | null)?.syncPaused === true;
  if (paused)
    return {
      ok: true,
      programSlug: program.slug,
      status: "success",
      entities: [{ entity: "*", rows: 0, skipped: "paused" }],
    };
  if (await isSyncRunning(program.id)) return { ok: true, programSlug: program.slug, requestNote: "skipped: already running" };

  const [runRow] = await db
    .insert(syncRuns)
    .values({ programId: program.id, runType: "maahir_full", status: "running" })
    .returning({ id: syncRuns.id });

  const stateRows = (await db
    .select({
      entity: maahirSyncState.entity,
      etag: maahirSyncState.etag,
      highWaterUpdatedAt: maahirSyncState.highWaterUpdatedAt,
      forbidden: maahirSyncState.forbidden,
      lastFullAt: maahirSyncState.lastFullAt,
    })
    .from(maahirSyncState)
    .where(eq(maahirSyncState.programId, program.id))) as StateRow[];
  const stateByEntity = new Map(stateRows.map((s) => [s.entity, s]));

  const entities: MaahirEntityResult[] = [];
  let totalRows = 0;
  let requests = 0;
  const startedMs = Date.now();

  try {
    for (const entity of MAAHIR_ENTITIES) {
      const st = stateByEntity.get(entity.path);
      if (st?.forbidden) {
        entities.push({ entity: entity.path, rows: 0, skipped: "forbidden" });
        continue;
      }

      // Build request shape per strategy.
      const params: Record<string, string | number> = {};
      let etag: string | null = null;
      if (entity.strategy === "full") {
        etag = st?.etag ?? null;
      } else if (entity.strategy === "sejak") {
        // Docs §5 say to send back the highest `updated_at`, but the server
        // validates `sejak` as a plain date and answers 400 `bad_param`
        // ("Tanggal harus YYYY-MM-DD") to a full timestamp. Send the date only.
        // `sejak` is `>=`, so the high-water day is re-pulled whole — harmless,
        // rows are deduped by id on upsert.
        if (st?.highWaterUpdatedAt) params.sejak = isoDate(st.highWaterUpdatedAt);
      } else {
        Object.assign(params, dateWindow(st?.lastFullAt ?? null));
      }

      try {
        const res = await fetchEntity(entity.path, { params, etag });
        requests += 1; // at least one; multi-page pulls make more but this is a floor
        if (res.notModified) {
          entities.push({ entity: entity.path, rows: 0, skipped: "not_modified" });
          continue;
        }

        const idKey = entity.idKey ?? "id";
        const seen = distinctRows(res.rows, idKey);
        for (let pass = 1; pass < MAX_PASSES && res.total != null && seen.size < res.total; pass++) {
          const again = await fetchEntity(entity.path, { params, etag: null });
          requests += 1;
          for (const [id, row] of distinctRows(again.rows, idKey)) seen.set(id, row);
        }
        const lengkap = res.total == null || seen.size >= res.total;

        const { written, maxUpdatedAt } = await upsertRows(db, program.id, entity, [...seen.values()]);
        totalRows += written;
        if (!lengkap) {
          // Rows that did land are kept; state stays put so the next run pulls the same range again.
          entities.push({
            entity: entity.path,
            rows: written,
            error: `tidak lengkap: ${seen.size} dari ${res.total} baris (urutan API tidak stabil)`,
          });
          continue;
        }
        entities.push({ entity: entity.path, rows: written });

        const patch: Parameters<typeof saveState>[3] = { forbidden: false, lastFullAt: new Date() };
        if (entity.strategy === "full") patch.etag = res.etag;
        if (entity.strategy === "sejak" && maxUpdatedAt) patch.highWaterUpdatedAt = maxUpdatedAt;
        await saveState(db, program.id, entity.path, patch);
      } catch (err) {
        if (err instanceof MaahirScopeForbiddenError) {
          await saveState(db, program.id, entity.path, { forbidden: true });
          entities.push({ entity: entity.path, rows: 0, skipped: "forbidden" });
          continue;
        }
        // Record and carry on. A single upstream hiccup (502 on one entity) used
        // to abort the whole loop, which is how `koordinator-ketua-kelas` — last
        // in the registry — ended up missing after the first run. The entities
        // are independent tables; there is nothing to roll back.
        entities.push({
          entity: entity.path,
          rows: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const rekap = await runRekapPass(db, program.id);
    requests += rekap.length;

    const failed = [
      ...entities.filter((e) => e.error).map((e) => e.entity),
      ...rekap.filter((r) => !r.ok && !r.skipped).map((r) => `${r.route}${r.periode ? ` (${r.periode})` : ""}`),
    ];
    const succeeded =
      entities.some((e) => !e.error && !e.skipped) || rekap.some((r) => r.ok);
    const status: MaahirSyncStatus = failed.length === 0 ? "success" : succeeded ? "partial" : "failed";
    const error = failed.length
      ? `${failed.length} gagal: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ", …" : ""}`
      : undefined;

    await db
      .update(syncRuns)
      .set({ status, error: error ?? null, finishedAt: new Date() })
      .where(eq(syncRuns.id, runRow.id));
    const secs = Math.round((Date.now() - startedMs) / 1000);
    return {
      ok: status === "success",
      programSlug: program.slug,
      status,
      error,
      entities,
      rekap,
      totalRows,
      requestNote: `${requests}+ requests over ~${secs}s`,
    };
  } catch (err) {
    // Only infrastructure failures reach here now (DB down, bad config) — the
    // per-entity and per-route errors above are caught and reported instead.
    const error = err instanceof Error ? err.message : "Maahir sync failed.";
    await db.update(syncRuns).set({ status: "failed", error, finishedAt: new Date() }).where(eq(syncRuns.id, runRow.id));
    return { ok: false, programSlug: program.slug, status: "failed", error, entities, totalRows };
  }
}

export async function runMaahirSyncForSlug(slug: string): Promise<MaahirSyncResult | null> {
  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!program || program.dataSourceType !== "maahir_api") return null;
  const hasil = await runMaahirSyncForProgram(program);
  await sinkronOrangSetelahSync(`maahir ${slug}`);
  return hasil;
}

export async function runAllMaahirSyncs(): Promise<MaahirSyncResult[]> {
  const db = getDb();
  const rows = await db.select().from(programs).where(eq(programs.dataSourceType, "maahir_api"));
  const results: MaahirSyncResult[] = [];
  for (const program of rows) results.push(await runMaahirSyncForProgram(program));
  await sinkronOrangSetelahSync("maahir");
  // Scan terpadu: hadir anggota Maahir dari kiosk — satu request batch, nol bila kosong.
  try {
    const k = await kirimAntreanMaahir();
    if (k.request > 0) console.log(`[kirim maahir] ${k.dikirim} terkirim · ${k.dilewati} dilewati · ${k.ditahan} ditahan`);
  } catch (err) {
    console.warn(`[kirim maahir] gagal, dicoba putaran berikut: ${(err as Error).message.slice(0, 200)}`);
  }
  return results;
}
