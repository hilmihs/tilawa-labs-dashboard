import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jadwalSync } from "@/lib/db/schema";
import { getProgram } from "@/lib/programs/resolve";
import { loginToTilawah } from "@/lib/integrations/tilawah-auth";
import { updatePertemuan, type PertemuanInput } from "@/lib/integrations/tilawah";
import { getRequest, markApplyResult } from "./queries";

/**
 * Apply an approved guru change request to the tilawah CMS. Mirrors the correct
 * preserve-raw pattern in scripts/reassign-guru.ts — it rebuilds PertemuanInput
 * from the synced jadwal `raw` and overrides ONLY the fields the request changes
 * (guru for badal; date+times for reschedule). This avoids updatePertemuanFor's
 * bug of clobbering the per-meeting guru with the halaqah's main guru.
 *
 * Writes with the shared service account (TILAWAH_LOGIN_*), which must be admin
 * level (HITS+) for the PUT to succeed.
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null;
}

export type ApplyResult = { ok: true } | { ok: false; error: string };

export async function applyGuruChangeRequest(rid: string): Promise<ApplyResult> {
  const req = await getRequest(rid);
  if (!req) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (req.status === "applied") return { ok: true }; // idempotent

  const program = await getProgram(req.programSlug);
  if (!program || program.tilawahProgramId == null) {
    return { ok: false, error: "Program tidak bisa ditulis (tilawah_program_id kosong)." };
  }
  const baseUrl = process.env.TILAWAH_BASE_URL;
  if (!baseUrl) return { ok: false, error: "TILAWAH_BASE_URL belum di-set." };

  const db = getDb();
  const [row] = await db
    .select({ raw: jadwalSync.raw })
    .from(jadwalSync)
    .where(
      and(
        eq(jadwalSync.programId, req.programId),
        eq(jadwalSync.tilawahJadwalId, req.tilawahJadwalId),
      ),
    );
  if (!row) return { ok: false, error: "Data pertemuan tidak tersinkron (jadwal_sync)." };

  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const batchId = num(raw.batch_id);
  const rawStart = str(raw.start_session_date);
  const rawEnd = str(raw.end_session_date);
  const rawScheduleDate = str(raw.schedule_date);
  const rawGuruId = num(raw.guru_id);
  if (batchId == null || !rawStart || !rawEnd || !rawScheduleDate) {
    return { ok: false, error: "Field pertemuan tidak lengkap di raw (batch/tanggal sesi)." };
  }

  const type = str(raw.type);
  const base: PertemuanInput = {
    name: str(raw.name) ?? "",
    order: num(raw.order) ?? 0,
    type: type === "online" || type === "hybrid" ? type : "offline",
    startSessionDate: rawStart,
    endSessionDate: rawEnd,
    guruId: rawGuruId ?? 0,
    scheduleDate: rawScheduleDate,
    halaqahId: req.tilawahHalaqahId,
    batchId,
    offlinePlace: str(raw.offline_place) ?? "",
    onlineUrl: str(raw.online_url) ?? "",
    notes: str(raw.notes) ?? "",
    status: num(raw.status) ?? 1, // preserve (e.g. Selesai stays Selesai)
  };

  let input: PertemuanInput;
  if (req.requestType === "badal") {
    if (req.newGuruId == null) return { ok: false, error: "Guru pengganti kosong." };
    input = { ...base, guruId: req.newGuruId };
  } else {
    // reschedule
    if (!req.newScheduleDate || !req.newStartAt || !req.newEndAt) {
      return { ok: false, error: "Tanggal/jam baru kosong." };
    }
    if (!(req.newEndAt > req.newStartAt)) {
      return { ok: false, error: "Jam selesai harus setelah jam mulai." };
    }
    input = {
      ...base,
      scheduleDate: req.newScheduleDate,
      startSessionDate: req.newStartAt,
      endSessionDate: req.newEndAt,
    };
  }

  const session = await loginToTilawah(baseUrl);
  const auth = { baseUrl, cookieHeader: session.cookieHeader, xsrfToken: session.xsrfToken };
  const res = await updatePertemuan(auth, req.tilawahJadwalId, input);

  await markApplyResult(rid, res.ok, res.ok ? res.data : { status: res.status, message: res.message });
  if (!res.ok) return { ok: false, error: `${res.message} (HTTP ${res.status})` };
  return { ok: true };
}
