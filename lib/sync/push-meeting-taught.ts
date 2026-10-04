import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { halaqahSync, jadwalSync } from "@/lib/db/schema";
import { loginToTilawah } from "@/lib/integrations/tilawah-auth";
import { updatePertemuan, type PertemuanInput } from "@/lib/integrations/tilawah";

export type PushTaughtResult = {
  jadwalId: number;
  pushed: boolean;
  reason?: string;
};

// Tilawah jadwal status treated as "taught". We push Selesai for a meeting the
// teacher attests they held but the system never registered (couldn't run the
// full 90-minute session). See lib/reports/queries.ts for how 3/4 = Mulai/Selesai.
const STATUS_SELESAI = 4;

/**
 * Best-effort write-back: ask tilawah to mark these meetings as taught (status
 * Selesai) after a teacher confirmed "mengajar tapi terkendala sistem" via the
 * magic link. There is no endpoint that sets jadwal status directly, so we re-PUT
 * the pertemuan (full body, rebuilt from the synced `raw`) with status Selesai —
 * experimental; tilawah may recompute the status server-side.
 *
 * Fails soft per meeting AND overall: the local teacher_meeting_confirmations row
 * is already the source of truth and the report counts it regardless. If a push
 * (and the next sync) lands, the report switches to the synced status on its own.
 */
export async function pushMeetingsTaughtToTilawah(
  programId: string,
  tilawahJadwalIds: number[],
): Promise<PushTaughtResult[]> {
  // Off by default: this write-back to live tilawah is experimental (there is no
  // endpoint that sets jadwal status directly — we re-PUT the pertemuan as Selesai
  // and rely on the next sync to confirm). Enable only after verifying it on a
  // non-production tilawah tenant by setting TILAWAH_PUSH_TAUGHT=1. The local
  // confirmation is already saved and the report counts it regardless.
  if (process.env.TILAWAH_PUSH_TAUGHT !== "1") {
    return tilawahJadwalIds.map((jadwalId) => ({
      jadwalId,
      pushed: false,
      reason: "tilawah push disabled (set TILAWAH_PUSH_TAUGHT=1 to enable)",
    }));
  }

  const baseUrl = process.env.TILAWAH_BASE_URL;
  if (!baseUrl) {
    return tilawahJadwalIds.map((jadwalId) => ({
      jadwalId,
      pushed: false,
      reason: "TILAWAH_BASE_URL not set",
    }));
  }

  const db = getDb();
  const session = await loginToTilawah(baseUrl);
  const auth = { baseUrl, cookieHeader: session.cookieHeader, xsrfToken: session.xsrfToken };

  const results: PushTaughtResult[] = [];
  for (const jadwalId of tilawahJadwalIds) {
    try {
      const [row] = await db
        .select({
          tilawahHalaqahId: jadwalSync.tilawahHalaqahId,
          raw: jadwalSync.raw,
        })
        .from(jadwalSync)
        .where(
          and(
            eq(jadwalSync.programId, programId),
            eq(jadwalSync.tilawahJadwalId, jadwalId),
          ),
        );
      if (!row) {
        results.push({ jadwalId, pushed: false, reason: "jadwal not found in jadwal_sync" });
        continue;
      }

      const [halaqah] = await db
        .select({ batchId: halaqahSync.tilawahBatchId })
        .from(halaqahSync)
        .where(
          and(
            eq(halaqahSync.programId, programId),
            eq(halaqahSync.tilawahHalaqahId, row.tilawahHalaqahId),
          ),
        );
      const batchId = halaqah?.batchId;
      if (batchId == null) {
        results.push({ jadwalId, pushed: false, reason: "batch id not found in halaqah_sync" });
        continue;
      }

      const raw = (row.raw ?? {}) as Record<string, unknown>;
      const input = pertemuanInputFromRaw(raw, row.tilawahHalaqahId, batchId);
      if (!input) {
        results.push({ jadwalId, pushed: false, reason: "incomplete jadwal raw (missing session dates)" });
        continue;
      }

      const res = await updatePertemuan(auth, jadwalId, { ...input, status: STATUS_SELESAI });
      results.push(
        res.ok
          ? { jadwalId, pushed: true }
          : { jadwalId, pushed: false, reason: `tilawah ${res.status}: ${res.message}` },
      );
    } catch (e) {
      results.push({ jadwalId, pushed: false, reason: e instanceof Error ? e.message : "unknown error" });
    }
  }

  return results;
}

/** Rebuild the full PertemuanInput tilawah's PUT expects from a synced jadwal raw. */
function pertemuanInputFromRaw(
  raw: Record<string, unknown>,
  halaqahId: number,
  batchId: number,
): PertemuanInput | null {
  const start = str(raw.start_session_date);
  const end = str(raw.end_session_date);
  const scheduleDate = str(raw.schedule_date);
  // start/end must be present or tilawah rejects the PUT (400 on invalid range).
  if (!start || !end || !scheduleDate) return null;

  const type = str(raw.type);
  return {
    name: str(raw.name) ?? "",
    order: num(raw.order) ?? 0,
    type: type === "online" || type === "hybrid" ? type : "offline",
    startSessionDate: start,
    endSessionDate: end,
    guruId: num(raw.guru_id) ?? 0,
    scheduleDate,
    halaqahId,
    batchId,
    offlinePlace: str(raw.offline_place) ?? "",
    onlineUrl: str(raw.online_url) ?? "",
    notes: str(raw.notes) ?? "",
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null;
}
