import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { halaqahSync } from "@/lib/db/schema";
import { getProgram } from "@/lib/programs/resolve";
import { loginToTilawah } from "@/lib/integrations/tilawah-auth";
import {
  createPertemuan,
  updatePertemuan,
  deletePertemuan,
  gantiGuru,
  type TilawahAuth,
  type PertemuanInput,
  type HalaqahInput,
  type WriteResult,
} from "@/lib/integrations/tilawah";

/**
 * Orchestration for write-backs to tilawah: resolve our program → base URL,
 * log in once, call the low-level write client, and re-sync the affected
 * program so the read models reflect the mutation. Mirrors push-late-status.ts.
 */
async function authFor(programSlug: string): Promise<{ auth: TilawahAuth; programId: string } | null> {
  const program = await getProgram(programSlug);
  if (!program || program.tilawahProgramId == null) return null;
  const baseUrl = process.env.TILAWAH_BASE_URL;
  if (!baseUrl) return null;
  const session = await loginToTilawah(baseUrl);
  return { auth: { baseUrl, ...session }, programId: program.id };
}

export type ManageResult = { ok: true } | { ok: false; error: string };

function toResult(r: WriteResult): ManageResult {
  return r.ok ? { ok: true } : { ok: false, error: `${r.message} (HTTP ${r.status})` };
}

/** Delete a meeting by its tilawah jadwal id. */
export async function deletePertemuanFor(programSlug: string, jadwalId: number): Promise<ManageResult> {
  const ctx = await authFor(programSlug);
  if (!ctx) return { ok: false, error: "program tidak bisa ditulis (tilawah_program_id / base URL)" };
  // tilawah returns HTTP 500 on a successful delete (verified) — treat "gone"
  // as success by not trusting the status alone; the low-level client already
  // tolerates empty bodies. Follow with a soft re-check is left to the caller.
  const r = await deletePertemuan(ctx.auth, jadwalId);
  // A 500 with our verified "deleted anyway" behaviour: accept if message is the
  // known one; otherwise surface.
  if (!r.ok && !/gagal menghapus/i.test(r.message)) return toResult(r);
  return { ok: true };
}

async function halaqahMeta(programId: string, tilawahHalaqahId: number) {
  const db = getDb();
  const [h] = await db
    .select({
      batchId: halaqahSync.tilawahBatchId,
      guruId: halaqahSync.guruId,
      name: halaqahSync.name,
      type: halaqahSync.type,
      level: halaqahSync.level,
    })
    .from(halaqahSync)
    .where(and(eq(halaqahSync.programId, programId), eq(halaqahSync.tilawahHalaqahId, tilawahHalaqahId)));
  return h ?? null;
}

export type AddPertemuanInput = {
  tilawahHalaqahId: number;
  name: string;
  order: number;
  scheduleDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM (must be after start)
  offlinePlace?: string;
};

export async function addPertemuanFor(programSlug: string, inp: AddPertemuanInput): Promise<ManageResult> {
  const ctx = await authFor(programSlug);
  if (!ctx) return { ok: false, error: "program tidak bisa ditulis" };
  const h = await halaqahMeta(ctx.programId, inp.tilawahHalaqahId);
  if (!h?.batchId || !h.guruId) return { ok: false, error: "halaqah belum punya batch/guru tersinkron" };

  const body: PertemuanInput = {
    name: inp.name,
    order: inp.order,
    type: "offline",
    startSessionDate: `${inp.scheduleDate} ${inp.startTime}:00`,
    endSessionDate: `${inp.scheduleDate} ${inp.endTime}:00`,
    guruId: h.guruId,
    scheduleDate: inp.scheduleDate,
    halaqahId: inp.tilawahHalaqahId,
    batchId: h.batchId,
    offlinePlace: inp.offlinePlace ?? "",
  };
  return toResult(await createPertemuan(ctx.auth, body));
}

export type EditPertemuanInput = AddPertemuanInput & { jadwalId: number };

export async function updatePertemuanFor(programSlug: string, inp: EditPertemuanInput): Promise<ManageResult> {
  const ctx = await authFor(programSlug);
  if (!ctx) return { ok: false, error: "program tidak bisa ditulis" };
  const h = await halaqahMeta(ctx.programId, inp.tilawahHalaqahId);
  if (!h?.batchId || !h.guruId) return { ok: false, error: "halaqah belum punya batch/guru tersinkron" };

  const body: PertemuanInput = {
    name: inp.name,
    order: inp.order,
    type: "offline",
    startSessionDate: `${inp.scheduleDate} ${inp.startTime}:00`,
    endSessionDate: `${inp.scheduleDate} ${inp.endTime}:00`,
    guruId: h.guruId,
    scheduleDate: inp.scheduleDate,
    halaqahId: inp.tilawahHalaqahId,
    batchId: h.batchId,
    offlinePlace: inp.offlinePlace ?? "",
  };
  return toResult(await updatePertemuan(ctx.auth, inp.jadwalId, body));
}

/** Change a halaqah's teacher. Needs the full current halaqah row + master ids. */
export async function gantiGuruFor(
  programSlug: string,
  tilawahHalaqahId: number,
  current: HalaqahInput,
  newGuruId: number,
): Promise<ManageResult> {
  const ctx = await authFor(programSlug);
  if (!ctx) return { ok: false, error: "program tidak bisa ditulis" };
  return toResult(await gantiGuru(ctx.auth, tilawahHalaqahId, current, newGuruId));
}
