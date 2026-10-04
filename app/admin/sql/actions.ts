"use server";

import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { notificationLog } from "@/lib/db/schema";

export type SqlResult =
  | {
      ok: true;
      columns: string[];
      rows: Record<string, string | null>[];
      rowCount: number;
      truncated: boolean;
    }
  | { ok: false; error: string };

const MAX_ROWS = 1000;

/**
 * Run a single read-only SQL statement for a super_coordinator. Executed inside a
 * READ ONLY transaction with a short statement timeout, so any write (INSERT/
 * UPDATE/DELETE/DDL) fails at the database, not just by string inspection. Multi-
 * statement input is rejected. Every run is audited to notification_log.
 *
 * DANGEROUS surface — gated to super_coordinator and disable-able via
 * ADMIN_SQL_ENABLED=false.
 */
export async function runReadOnlyQuery(query: string): Promise<SqlResult> {
  if (process.env.ADMIN_SQL_ENABLED === "false") {
    return { ok: false, error: "Console SQL dinonaktifkan (ADMIN_SQL_ENABLED=false)." };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "super_coordinator") {
    return { ok: false, error: "Akses ditolak — khusus super coordinator." };
  }

  const trimmed = query.trim().replace(/;\s*$/, "");
  if (!trimmed) return { ok: false, error: "Query kosong." };
  if (trimmed.includes(";")) {
    return { ok: false, error: "Hanya satu statement yang diperbolehkan." };
  }

  const db = getDb();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      await tx.execute(sql`set local statement_timeout = 8000`);
      return tx.execute(sql.raw(trimmed));
    });

    const rawRows = (result.rows ?? []) as Record<string, unknown>[];
    const columns =
      result.fields?.map((f) => f.name) ?? (rawRows[0] ? Object.keys(rawRows[0]) : []);
    // Coerce every cell to a serialization-safe string so RSC can send it back
    // (dates, bigints, json, buffers would otherwise break the boundary).
    const rows = rawRows.slice(0, MAX_ROWS).map((r) => {
      const o: Record<string, string | null> = {};
      for (const k of columns) {
        const v = r[k];
        o[k] = v == null ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      return o;
    });

    // Best-effort audit — never let a logging failure mask the query result.
    try {
      await db.insert(notificationLog).values({
        channel: "admin_sql",
        recipient: user.email,
        payload: { query: trimmed, rowCount: rawRows.length },
        status: "executed",
      });
    } catch {
      // ignore
    }

    return { ok: true, columns, rows, rowCount: rawRows.length, truncated: rawRows.length > MAX_ROWS };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Query gagal." };
  }
}
