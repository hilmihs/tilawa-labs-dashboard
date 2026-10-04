/**
 * Admin ops service layer. ONE implementation of each privileged operation
 * (create account, set role, grant/revoke program, list). Both entry points —
 * the Admin Panel (Server Actions) and the Ops API (route handlers) — call
 * these, so the logic and the audit trail live in one place.
 *
 * These functions DO NOT authenticate. The caller must authenticate first
 * (requireSuperUser / assertOpsAuth) and pass the resolved `actor` for audit.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { staff, programs, staffPrograms, notificationLog, hkmParticipants } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/session";
import { runAllHkmSyncs, runHkmSyncForSlug } from "@/lib/sync/hkm-sync";
import { runAllTilawahSyncs, runTilawahSyncForSlug } from "@/lib/sync/tilawah-sync";
import { runAllMabniSyncs, runMabniSyncForSlug } from "@/lib/sync/mabni-sync";
import { runAllMaahirSyncs, runMaahirSyncForSlug } from "@/lib/sync/maahir-sync";
import { isSyncRunning } from "@/lib/sync/last-sync";
import { discoverTilawahPrograms } from "@/lib/sync/discover-programs";
import { readDiscovery } from "@/lib/programs/discovery";
import {
  listBatchStrays,
  purgeBatchStrays,
  type PurgeStraysResult,
} from "@/lib/sync/batch-strays";
import { parseMasterWorkbook } from "@/lib/admin/hkm-master-parse";
import { HKM_STATUSES, isHkmStatus, isTracked, toHkmStatus, type HkmStatus } from "@/lib/insights/hkm/status";

export type OpsResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const ROLES: Role[] = ["coordinator", "super_coordinator"];

/** Best-effort audit to notification_log (channel=admin_ops). Never throws. */
async function audit(
  db: ReturnType<typeof getDb>,
  actor: string,
  action: string,
  payload: Record<string, unknown>,
  status: "executed" | "failed",
): Promise<void> {
  try {
    await db.insert(notificationLog).values({
      channel: "admin_ops",
      recipient: actor,
      payload: { action, ...payload },
      status,
    });
  } catch {
    // ignore — logging must never mask the operation result
  }
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type StaffRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  programs: string[]; // program slugs granted
};

/** List all staff accounts with their granted program slugs. */
export async function listStaff(): Promise<StaffRow[]> {
  const db = getDb();
  const rows = await db.select().from(staff);
  const grants = await db
    .select({ staffId: staffPrograms.staffId, slug: programs.slug })
    .from(staffPrograms)
    .innerJoin(programs, eq(staffPrograms.programId, programs.id));

  const bySlug = new Map<string, string[]>();
  for (const g of grants) {
    const list = bySlug.get(g.staffId) ?? [];
    list.push(g.slug);
    bySlug.set(g.staffId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: (r.role === "super_coordinator" ? "super_coordinator" : "coordinator") as Role,
    programs: (bySlug.get(r.id) ?? []).sort(),
  }));
}

/** List all programs (for grant checkboxes). */
export async function listPrograms(): Promise<{ slug: string; name: string }[]> {
  const db = getDb();
  const rows = await db.select({ slug: programs.slug, name: programs.name }).from(programs);
  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Create a dashboard login account (password hashed server-side, bcrypt). */
export async function createStaffAccount(
  input: { email: string; password: string; name?: string | null; role?: Role },
  actor: string,
): Promise<OpsResult<{ id: string; email: string }>> {
  const email = normEmail(input.email ?? "");
  if (!email || !email.includes("@")) return { ok: false, error: "Email tidak valid." };
  if (!input.password || input.password.length < 8)
    return { ok: false, error: "Password minimal 8 karakter." };
  const role: Role = input.role && ROLES.includes(input.role) ? input.role : "coordinator";

  const db = getDb();
  const [existing] = await db.select({ id: staff.id }).from(staff).where(eq(staff.email, email));
  if (existing) {
    await audit(db, actor, "createStaffAccount", { email, result: "duplicate" }, "failed");
    return { ok: false, error: `Akun sudah ada: ${email}` };
  }

  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(staff)
    .values({ email, passwordHash, name: input.name ?? null, role })
    .returning({ id: staff.id, email: staff.email });

  await audit(db, actor, "createStaffAccount", { email, role }, "executed");
  return { ok: true, data: row };
}

/** Change a staff account's role. */
export async function setStaffRole(
  input: { email: string; role: Role },
  actor: string,
): Promise<OpsResult> {
  const email = normEmail(input.email ?? "");
  if (!ROLES.includes(input.role)) return { ok: false, error: `Role tidak valid: ${input.role}` };

  const db = getDb();
  const res = await db.update(staff).set({ role: input.role }).where(eq(staff.email, email)).returning({ id: staff.id });
  if (res.length === 0) {
    await audit(db, actor, "setStaffRole", { email, result: "not_found" }, "failed");
    return { ok: false, error: `Akun tidak ditemukan: ${email}` };
  }
  await audit(db, actor, "setStaffRole", { email, role: input.role }, "executed");
  return { ok: true, data: undefined };
}

/**
 * Overwrite a staff account's password (bcrypt, hashed server-side). Existing
 * sessions survive — the session JWT is stateless and carries no password
 * reference, so a reset only blocks the NEXT login with the old password.
 * The audit payload deliberately records the email only, never the password:
 * notification_log is readable from the /admin/sql console.
 */
export async function resetStaffPassword(
  input: { email: string; password: string },
  actor: string,
): Promise<OpsResult> {
  const email = normEmail(input.email ?? "");
  if (!input.password || input.password.length < 8)
    return { ok: false, error: "Password minimal 8 karakter." };

  const db = getDb();
  const passwordHash = await hashPassword(input.password);
  const res = await db
    .update(staff)
    .set({ passwordHash })
    .where(eq(staff.email, email))
    .returning({ id: staff.id });
  if (res.length === 0) {
    await audit(db, actor, "resetStaffPassword", { email, result: "not_found" }, "failed");
    return { ok: false, error: `Akun tidak ditemukan: ${email}` };
  }
  await audit(db, actor, "resetStaffPassword", { email }, "executed");
  return { ok: true, data: undefined };
}

async function resolveStaffAndPrograms(
  db: ReturnType<typeof getDb>,
  email: string,
  slugs: string[],
): Promise<OpsResult<{ staffId: string; programIds: { id: string; slug: string }[]; missing: string[] }>> {
  const [account] = await db.select({ id: staff.id }).from(staff).where(eq(staff.email, email));
  if (!account) return { ok: false, error: `Akun tidak ditemukan: ${email}` };
  if (slugs.length === 0) return { ok: false, error: "Tidak ada program dipilih." };

  const progs = await db
    .select({ id: programs.id, slug: programs.slug })
    .from(programs)
    .where(inArray(programs.slug, slugs));
  const found = new Set(progs.map((p) => p.slug));
  const missing = slugs.filter((s) => !found.has(s));
  return { ok: true, data: { staffId: account.id, programIds: progs, missing } };
}

/** Grant one or more programs to a staff account (idempotent). */
export async function grantPrograms(
  input: { email: string; slugs: string[] },
  actor: string,
): Promise<OpsResult<{ granted: string[]; missing: string[] }>> {
  const email = normEmail(input.email ?? "");
  const db = getDb();
  const resolved = await resolveStaffAndPrograms(db, email, input.slugs ?? []);
  if (!resolved.ok) return resolved;
  const { staffId, programIds, missing } = resolved.data;

  for (const p of programIds) {
    await db
      .insert(staffPrograms)
      .values({ staffId, programId: p.id })
      .onConflictDoNothing();
  }
  const granted = programIds.map((p) => p.slug);
  await audit(db, actor, "grantPrograms", { email, granted, missing }, "executed");
  return { ok: true, data: { granted, missing } };
}

/** Revoke one or more programs from a staff account. */
export async function revokePrograms(
  input: { email: string; slugs: string[] },
  actor: string,
): Promise<OpsResult<{ revoked: string[]; missing: string[] }>> {
  const email = normEmail(input.email ?? "");
  const db = getDb();
  const resolved = await resolveStaffAndPrograms(db, email, input.slugs ?? []);
  if (!resolved.ok) return resolved;
  const { staffId, programIds, missing } = resolved.data;

  if (programIds.length > 0) {
    await db.delete(staffPrograms).where(
      and(
        eq(staffPrograms.staffId, staffId),
        inArray(
          staffPrograms.programId,
          programIds.map((p) => p.id),
        ),
      ),
    );
  }
  const revoked = programIds.map((p) => p.slug);
  await audit(db, actor, "revokePrograms", { email, revoked, missing }, "executed");
  return { ok: true, data: { revoked, missing } };
}

// ── HKM participant roster (status + manual enrolment) ───────────────────
/**
 * Roster edits that the CSV master cannot express: someone leaves, takes leave,
 * or passes away; someone joins mid-batch. Both live here (not in a script) so
 * they work without SSH and land in the audit log.
 */
export type HkmParticipantResult = {
  programSlug: string;
  nama: string;
  email: string | null;
  status: HkmStatus;
  statusNote: string | null;
  halaqah: string | null;
  created: boolean;
};

type ParticipantSelector = { email?: string; nama?: string; participantId?: string };

export type HkmParticipantListRow = {
  participantId: string;
  nama: string;
  email: string | null;
  halaqah: string | null;
  pengajar: string | null;
  gender: string | null;
  status: HkmStatus;
  statusNote: string | null;
  source: string | null;
  // Provenance of the email↔name link. confidence < 1 means the master CSV was
  // fuzzy-matched, i.e. this row's reading data may belong to someone else.
  matchMethod: string | null;
  confidence: string | null;
};

/** Read the master roster — the lookup that makes a status edit verifiable. */
export async function listHkmParticipants(input: {
  programSlug?: string;
  q?: string;
  status?: string;
}): Promise<OpsResult<{ programSlug: string; total: number; rows: HkmParticipantListRow[] }>> {
  const programSlug = input.programSlug ?? "hkm";
  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, programSlug));
  if (!program) return { ok: false, error: `Program "${programSlug}" tidak ada.` };

  const all = await db.select().from(hkmParticipants).where(eq(hkmParticipants.programId, program.id));
  const q = input.q?.trim().toLowerCase();
  const rows = all
    .filter((r) => !q || r.namaPeserta.toLowerCase().includes(q) || (r.emailMaster ?? "").includes(q))
    .filter((r) => !input.status || r.status === input.status)
    .map((r) => ({
      participantId: r.id,
      nama: r.namaPeserta,
      email: r.emailMaster,
      halaqah: r.namaHalaqah,
      pengajar: r.namaPengajar,
      gender: r.gender,
      status: toHkmStatus(r.status),
      statusNote: r.statusNote,
      source: r.source,
      matchMethod: r.matchMethod,
      confidence: r.confidence,
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama));

  return { ok: true, data: { programSlug, total: all.length, rows } };
}

/** Resolve one master row by id, email, or (case-insensitive, substring) name. */
async function findParticipant(
  db: ReturnType<typeof getDb>,
  programId: string,
  sel: ParticipantSelector,
): Promise<{ ok: true; row: typeof hkmParticipants.$inferSelect } | { ok: false; error: string }> {
  const rows = await db.select().from(hkmParticipants).where(eq(hkmParticipants.programId, programId));

  if (sel.participantId) {
    const row = rows.find((r) => r.id === sel.participantId);
    return row ? { ok: true, row } : { ok: false, error: `Peserta id "${sel.participantId}" tidak ada.` };
  }
  if (sel.email) {
    const e = normEmail(sel.email);
    const row = rows.find((r) => r.emailMaster === e);
    return row ? { ok: true, row } : { ok: false, error: `Peserta dengan email "${e}" tidak ada di master.` };
  }
  if (sel.nama) {
    const n = sel.nama.trim().toLowerCase();
    const matches = rows.filter((r) => r.namaPeserta.trim().toLowerCase().includes(n));
    if (matches.length === 0) return { ok: false, error: `Peserta "${sel.nama}" tidak ada di master.` };
    // Ambiguity is a stop, not a coin flip — the wrong person gets dropped.
    if (matches.length > 1)
      return {
        ok: false,
        error: `Nama "${sel.nama}" cocok ${matches.length} peserta: ${matches
          .map((m) => `${m.namaPeserta}${m.emailMaster ? ` <${m.emailMaster}>` : ""}`)
          .join(", ")}. Pakai email/participantId.`,
      };
    return { ok: true, row: matches[0] };
  }
  return { ok: false, error: "Butuh salah satu dari: participantId, email, atau nama." };
}

/** Set a participant's enrollment status (aktif/cuti/keluar/wafat). */
export async function setHkmParticipantStatus(
  input: ParticipantSelector & { programSlug?: string; status: string; note?: string },
  actor: string,
): Promise<OpsResult<HkmParticipantResult>> {
  const programSlug = input.programSlug ?? "hkm";
  const db = getDb();

  if (!isHkmStatus(input.status)) {
    return { ok: false, error: `Status "${input.status}" tidak sah — pilih: ${HKM_STATUSES.join(" | ")}.` };
  }
  const [program] = await db.select().from(programs).where(eq(programs.slug, programSlug));
  if (!program) return { ok: false, error: `Program "${programSlug}" tidak ada.` };

  const found = await findParticipant(db, program.id, input);
  if (!found.ok) {
    await audit(db, actor, "setHkmParticipantStatus", { programSlug, ...input, error: found.error }, "failed");
    return { ok: false, error: found.error };
  }

  const note = input.note?.trim() || null;
  await db
    .update(hkmParticipants)
    .set({
      status: input.status,
      statusNote: note,
      statusChangedAt: new Date(),
      // `active` predates `status`; keep the older flag consistent so nothing
      // reading it drifts from what the dashboard shows.
      active: isTracked(input.status),
    })
    .where(eq(hkmParticipants.id, found.row.id));

  const data: HkmParticipantResult = {
    programSlug,
    nama: found.row.namaPeserta,
    email: found.row.emailMaster,
    status: input.status,
    statusNote: note,
    halaqah: found.row.namaHalaqah,
    created: false,
  };
  await audit(db, actor, "setHkmParticipantStatus", { ...data, previousStatus: found.row.status }, "executed");
  return { ok: true, data };
}

/**
 * Repair a master row's identity: name, halaqah, pengajar, gender, and — the
 * reason this exists — the email.
 *
 * The master was built by fuzzy-matching a registration sheet against the partner system
 * accounts, and some rows ended up holding *someone else's* email, so one
 * person's tilawah was being reported under another person's name. Fixing that
 * means freeing the email from the wrong row before it can be attached to the
 * right one (emailMaster is unique per program), hence `clearEmail`.
 */
export async function editHkmParticipant(
  input: ParticipantSelector & {
    programSlug?: string;
    // `nama`/`email` above SELECT the row; these CHANGE it — keeping the two
    // roles in separate fields so a rename can never be read as a lookup.
    newNama?: string;
    newEmail?: string;
    clearEmail?: boolean;
    halaqah?: string;
    pengajar?: string;
    gender?: string;
    note?: string;
  },
  actor: string,
): Promise<OpsResult<HkmParticipantResult>> {
  const programSlug = input.programSlug ?? "hkm";
  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, programSlug));
  if (!program) return { ok: false, error: `Program "${programSlug}" tidak ada.` };

  const found = await findParticipant(db, program.id, input);
  if (!found.ok) {
    await audit(db, actor, "editHkmParticipant", { programSlug, ...input, error: found.error }, "failed");
    return { ok: false, error: found.error };
  }
  if (input.newEmail && input.clearEmail)
    return { ok: false, error: "Pilih salah satu: `newEmail` (ganti) atau `clearEmail` (kosongkan)." };

  const patch: Record<string, unknown> = {};
  if (input.newNama?.trim()) patch.namaPeserta = input.newNama.trim();
  if (input.halaqah?.trim()) patch.namaHalaqah = input.halaqah.trim();
  if (input.pengajar?.trim()) patch.namaPengajar = input.pengajar.trim();
  if (input.gender?.trim()) patch.gender = input.gender.trim();
  if (input.clearEmail) {
    // Also drop the stamped berkah link, or the next sync would re-attach the
    // same user id to this row and undo the repair.
    patch.emailMaster = null;
    patch.berkahUserId = null;
    patch.matchMethod = "manual:cleared";
    patch.confidence = null;
  } else if (input.newEmail) {
    patch.emailMaster = normEmail(input.newEmail);
    patch.berkahUserId = null;
    patch.matchMethod = "manual";
    patch.confidence = "1";
  }
  if (input.note?.trim()) patch.statusNote = input.note.trim();
  if (Object.keys(patch).length === 0) return { ok: false, error: "Tidak ada field yang diubah." };

  try {
    await db.update(hkmParticipants).set(patch).where(eq(hkmParticipants.id, found.row.id));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Update gagal.";
    await audit(db, actor, "editHkmParticipant", { programSlug, ...input, error }, "failed");
    return { ok: false, error: `Gagal: ${error}` };
  }

  const [after] = await db.select().from(hkmParticipants).where(eq(hkmParticipants.id, found.row.id));
  const data: HkmParticipantResult = {
    programSlug,
    nama: after.namaPeserta,
    email: after.emailMaster,
    status: toHkmStatus(after.status),
    statusNote: after.statusNote,
    halaqah: after.namaHalaqah,
    created: false,
  };
  await audit(
    db,
    actor,
    "editHkmParticipant",
    { ...data, before: { nama: found.row.namaPeserta, email: found.row.emailMaster } },
    "executed",
  );
  return { ok: true, data };
}

/**
 * Add or update one participant by hand (source='manual', so a master re-import
 * never deletes them). Used when someone joins mid-batch and is not in the CSV.
 */
export async function upsertHkmParticipant(
  input: {
    programSlug?: string;
    nama: string;
    email: string;
    halaqah?: string;
    pengajar?: string;
    gender?: string;
    hkm?: string;
    status?: string;
    note?: string;
  },
  actor: string,
): Promise<OpsResult<HkmParticipantResult>> {
  const programSlug = input.programSlug ?? "hkm";
  const db = getDb();

  const nama = input.nama?.trim();
  const email = input.email ? normEmail(input.email) : "";
  if (!nama) return { ok: false, error: "Field `nama` wajib." };
  if (!email) return { ok: false, error: "Field `email` wajib — email adalah kunci join ke data tilawah." };
  const status = input.status ?? "aktif";
  if (!isHkmStatus(status)) {
    return { ok: false, error: `Status "${status}" tidak sah — pilih: ${HKM_STATUSES.join(" | ")}.` };
  }

  const [program] = await db.select().from(programs).where(eq(programs.slug, programSlug));
  if (!program) return { ok: false, error: `Program "${programSlug}" tidak ada.` };

  const [existing] = await db
    .select()
    .from(hkmParticipants)
    .where(and(eq(hkmParticipants.programId, program.id), eq(hkmParticipants.emailMaster, email)));

  const values = {
    namaPeserta: nama,
    namaPengajar: input.pengajar?.trim() || null,
    namaHalaqah: input.halaqah?.trim() || null,
    hkm: input.hkm?.trim() || null,
    gender: input.gender?.trim() || null,
    status,
    statusNote: input.note?.trim() || null,
    statusChangedAt: new Date(),
    active: isTracked(status),
  };

  if (existing) {
    await db.update(hkmParticipants).set(values).where(eq(hkmParticipants.id, existing.id));
  } else {
    await db.insert(hkmParticipants).values({
      programId: program.id,
      emailMaster: email,
      matchMethod: "manual",
      source: "manual",
      ...values,
    });
  }

  const data: HkmParticipantResult = {
    programSlug,
    nama,
    email,
    status,
    statusNote: values.statusNote,
    halaqah: values.namaHalaqah,
    created: !existing,
  };
  await audit(db, actor, "upsertHkmParticipant", { ...data }, "executed");
  return { ok: true, data };
}

export type HkmMasterImportResult = {
  programSlug: string;
  parsed: number;
  withEmail: number;
  noEmail: number;
  deleted: number;
  upserted: number;
};

/**
 * Import the HKM participant master from an uploaded file buffer. Replaces the
 * program's existing csv_import rows first (idempotent — rows with a NULL email
 * would otherwise duplicate on every run, since Postgres treats NULLs as
 * distinct in the unique index), then upserts every parsed row.
 *
 * This is the no-SSH path for the master (which is gitignored PII, so it never
 * ships in the deploy image): a super_coordinator uploads it from the panel.
 */
export async function importHkmMaster(
  input: { buffer: Buffer; programSlug?: string; isCurated?: boolean },
  actor: string,
): Promise<OpsResult<HkmMasterImportResult>> {
  const programSlug = input.programSlug ?? "hkm";
  const db = getDb();

  let rows: ReturnType<typeof parseMasterWorkbook>;
  try {
    rows = parseMasterWorkbook(input.buffer);
  } catch (err) {
    const error = err instanceof Error ? err.message : "File master tidak bisa dibaca.";
    await audit(db, actor, "importHkmMaster", { programSlug, error }, "failed");
    return { ok: false, error: `Gagal parse file: ${error}` };
  }
  if (rows.length === 0) {
    await audit(db, actor, "importHkmMaster", { programSlug, error: "empty" }, "failed");
    return { ok: false, error: "Tidak ada baris peserta terbaca (kolom nama_peserta kosong?)." };
  }

  const [program] = await db.select().from(programs).where(eq(programs.slug, programSlug));
  if (!program) {
    await audit(db, actor, "importHkmMaster", { programSlug, error: "program_not_found" }, "failed");
    return { ok: false, error: `Program "${programSlug}" tidak ada — seed dulu.` };
  }

  try {
    // Status is app-owned and NOT in the CSV, so the delete+reinsert below would
    // silently resurrect everyone who left. Carry it across by email.
    const priorStatus = new Map<string, { status: string; note: string | null; changedAt: Date | null }>();
    for (const r of await db
      .select()
      .from(hkmParticipants)
      .where(eq(hkmParticipants.programId, program.id))) {
      if (r.emailMaster && r.status !== "aktif")
        priorStatus.set(r.emailMaster, {
          status: r.status,
          note: r.statusNote,
          changedAt: r.statusChangedAt,
        });
    }

    // Rows the sync seeded from the presensi roster (source 'presensi', see
    // lib/sync/hkm-seed-master.ts) are a stand-in for exactly this upload, so
    // they go too — otherwise the ~half without an email would sit beside
    // their curated twins as duplicates.
    const deletedRows = await db
      .delete(hkmParticipants)
      .where(
        and(
          eq(hkmParticipants.programId, program.id),
          inArray(hkmParticipants.source, ["csv_import", "presensi"]),
        ),
      )
      .returning({ id: hkmParticipants.id });

    let upserted = 0;
    for (const m of rows) {
      const prior = m.emailMaster ? priorStatus.get(m.emailMaster) : undefined;
      const carried = prior
        ? { status: prior.status, statusNote: prior.note, statusChangedAt: prior.changedAt, active: isTracked(toHkmStatus(prior.status)) }
        : {};
      await db
        .insert(hkmParticipants)
        .values({
          programId: program.id,
          namaPeserta: m.namaPeserta,
          namaPengajar: m.namaPengajar,
          namaHalaqah: m.namaHalaqah,
          hkm: m.hkm,
          gender: m.gender,
          usernameNafi: m.usernameNafi,
          emailMaster: m.emailMaster,
          statusEmail: m.statusEmail,
          matchMethod: m.matchMethod,
          confidence: m.confidence,
          isCurated: input.isCurated ?? false,
          source: "csv_import",
          ...carried,
        })
        .onConflictDoUpdate({
          target: [hkmParticipants.programId, hkmParticipants.emailMaster],
          set: {
            namaPeserta: m.namaPeserta,
            namaPengajar: m.namaPengajar,
            namaHalaqah: m.namaHalaqah,
            hkm: m.hkm,
            gender: m.gender,
            usernameNafi: m.usernameNafi,
            statusEmail: m.statusEmail,
            matchMethod: m.matchMethod,
            confidence: m.confidence,
            // NOT status/statusNote — a re-import must never revive someone who left.
          },
        });
      upserted += 1;
    }

    const result: HkmMasterImportResult = {
      programSlug,
      parsed: rows.length,
      withEmail: rows.filter((r) => r.emailMaster).length,
      noEmail: rows.filter((r) => !r.emailMaster).length,
      deleted: deletedRows.length,
      upserted,
    };
    await audit(db, actor, "importHkmMaster", { ...result }, "executed");
    return { ok: true, data: result };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Import gagal.";
    await audit(db, actor, "importHkmMaster", { programSlug, error }, "failed");
    return { ok: false, error };
  }
}

// ── Per-program sync control ─────────────────────────────────────────────
/**
 * `programs.config.syncPaused` freezes a program's synced data — set when an
 * upstream batch was corrupted and we did not want the cron overwriting the
 * local mirror. Clearing it used to need psql on the VPS; these two functions
 * put it behind the admin panel instead.
 */
export type ProgramSyncRow = {
  slug: string;
  name: string;
  dataSourceType: string;
  syncPaused: boolean;
  lastSuccessAt: string | null;
  lastStatus: "success" | "failed" | "running" | null;
  /** Halaqah from a batch this program is no longer pinned to — see purgeStrays. */
  strayHalaqah: number;
};

export async function listProgramSync(): Promise<ProgramSyncRow[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    select p.slug, p.name, p.data_source_type,
           coalesce((p.config->>'syncPaused')::boolean, false) as sync_paused,
           (select max(r.finished_at) from sync_runs r
             where r.program_id = p.id and r.status = 'success') as last_success,
           (select r.status from sync_runs r
             where r.program_id = p.id order by r.started_at desc limit 1) as last_status,
           -- Halaqah mirrored under this program whose own batch contradicts the
           -- batch it is pinned to. The automatic prune gives up once these
           -- outnumber its safety cap, so the count is surfaced here and cleared
           -- by hand (see lib/sync/batch-strays.ts).
           -- Skipped for rolling-batch programs: they mirror every batch by
           -- design, so a differing batch id is not a contradiction (see
           -- lib/sync/batch-strays.ts).
           (select count(*) from halaqah_sync h
             where h.program_id = p.id
               and coalesce((p.config->>'syncAllBatches')::boolean, false) = false
               and p.tilawah_batch_id is not null
               and h.tilawah_batch_id is not null
               and h.tilawah_batch_id <> p.tilawah_batch_id)::int as stray_halaqah
    from programs p
    -- Rows the sync created for itself sit in their own section until approved
    -- (they hold no data yet), so they are not listed here as ordinary programs.
    where p.config->'discovery' is null or p.config->'discovery'->>'approvedAt' is not null
    order by p.slug
  `);
  return rows.rows.map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    dataSourceType: String(r.data_source_type),
    syncPaused: r.sync_paused === true,
    lastSuccessAt: r.last_success ? new Date(r.last_success as string).toISOString() : null,
    lastStatus: (r.last_status as ProgramSyncRow["lastStatus"]) ?? null,
    strayHalaqah: Number(r.stray_halaqah ?? 0),
  }));
}

// ── Program discovery (rows the sync created by itself) ──────────────────
/**
 * A program or batch the tilawah CMS has and we did not, mirrored into a row
 * that is paused and hidden until a super coordinator says yes.
 *
 * The decision is a human's because the machine cannot supply the parts that
 * matter — the display name people will read, whether the monthly report should
 * use the HITS layout, which coordinators get access. What the machine does
 * supply is the thing that was missing: noticing at all. See
 * lib/sync/discover-programs.ts.
 */
export type ProgramDiscoveryRow = {
  slug: string;
  name: string;
  kind: "program" | "batch";
  tilawahProgramId: number;
  tilawahBatchId: number | null;
  upstreamProgramName: string;
  upstreamBatchName: string | null;
  discoveredAt: string | null;
  /** Halaqah already mirrored — 0 until it is approved and synced once. */
  halaqahCount: number;
};

export async function listProgramDiscoveries(): Promise<ProgramDiscoveryRow[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    select p.slug, p.name, p.tilawah_program_id, p.tilawah_batch_id,
           p.config->'discovery' as d,
           (select count(*) from halaqah_sync h where h.program_id = p.id)::int as halaqah
    from programs p
    where p.config->'discovery' is not null
      and p.config->'discovery'->>'approvedAt' is null
      and coalesce((p.config->'discovery'->>'dismissed')::boolean, false) = false
    order by p.config->'discovery'->>'discoveredAt' desc, p.slug
  `);
  return rows.rows.map((r) => {
    const d = (r.d ?? {}) as Record<string, unknown>;
    return {
      slug: String(r.slug),
      name: String(r.name),
      kind: d.kind === "batch" ? "batch" : "program",
      tilawahProgramId: Number(r.tilawah_program_id ?? 0),
      tilawahBatchId: r.tilawah_batch_id != null ? Number(r.tilawah_batch_id) : null,
      upstreamProgramName: String(d.upstreamProgramName ?? r.name),
      upstreamBatchName: d.upstreamBatchName ? String(d.upstreamBatchName) : null,
      discoveredAt: d.discoveredAt ? String(d.discoveredAt) : null,
      halaqahCount: Number(r.halaqah ?? 0),
    };
  });
}

/**
 * Publish a discovered program: stamp the approval, lift the pause, and pull it
 * once so the operator sees real numbers instead of an empty shell.
 *
 * `name` is optional and overrides the upstream name — upstream names are terse
 * ("Tahsin Al Fatihah Mustahik") and the dashboard's are not.
 */
export async function approveProgramDiscovery(
  input: { slug: string; name?: string },
  actor: string,
): Promise<OpsResult<{ slug: string; synced: boolean; syncError?: string }>> {
  const slug = (input.slug ?? "").trim();
  if (!slug) return { ok: false, error: "Slug program wajib diisi." };
  const name = (input.name ?? "").trim();

  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!program) return { ok: false, error: `Program tidak ditemukan: ${slug}` };
  const mark = readDiscovery(program.config);
  if (!mark) return { ok: false, error: `${slug} bukan program hasil deteksi otomatis.` };
  if (mark.approvedAt) return { ok: false, error: `${slug} sudah disetujui.` };

  try {
    // One statement: stamp the approval inside config.discovery, drop the pause,
    // and (optionally) rename. Leaving any of these to a second write risks a
    // half-approved row that is live but still paused.
    await db.execute(sql`
      update programs
         set config = (coalesce(config, '{}'::jsonb) - 'syncPaused')
                      || jsonb_build_object('discovery',
                           coalesce(config->'discovery', '{}'::jsonb)
                           -- ::text casts are required: jsonb_build_object is
                           -- variadic "any", so Postgres cannot infer a type for
                           -- a bare bind parameter and the statement fails with
                           -- "could not determine data type of parameter $1".
                           || jsonb_build_object('approvedAt', ${new Date().toISOString()}::text,
                                                 'approvedBy', ${actor}::text)),
             name = ${name || program.name}
       where slug = ${slug}
    `);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Gagal menyetujui program.";
    await audit(db, actor, "approveProgramDiscovery", { slug, error }, "failed");
    return { ok: false, error };
  }

  // The pull is best-effort: the row is already live, and a CMS hiccup here
  // should read as "belum tersinkron", not as a failed approval.
  let synced = false;
  let syncError: string | undefined;
  try {
    const res = await runTilawahSyncForSlug(slug);
    synced = res?.ok === true;
    syncError = res?.error;
  } catch (err) {
    syncError = err instanceof Error ? err.message : "sync gagal";
  }
  await audit(db, actor, "approveProgramDiscovery", { slug, name: name || program.name, synced, syncError }, "executed");
  return { ok: true, data: { slug, synced, syncError } };
}

/**
 * "Not a real program." Keeps the row (so discovery does not recreate it every
 * six hours) but stops asking: it stays paused, stays out of the nav, and
 * disappears from the pending list.
 */
export async function dismissProgramDiscovery(
  input: { slug: string },
  actor: string,
): Promise<OpsResult<{ slug: string }>> {
  const slug = (input.slug ?? "").trim();
  if (!slug) return { ok: false, error: "Slug program wajib diisi." };

  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!program) return { ok: false, error: `Program tidak ditemukan: ${slug}` };
  if (!readDiscovery(program.config)) {
    return { ok: false, error: `${slug} bukan program hasil deteksi otomatis.` };
  }

  try {
    await db.execute(sql`
      update programs
         set config = coalesce(config, '{}'::jsonb)
                      || jsonb_build_object('discovery',
                           coalesce(config->'discovery', '{}'::jsonb)
                           || jsonb_build_object('dismissed', true))
       where slug = ${slug}
    `);
    await audit(db, actor, "dismissProgramDiscovery", { slug }, "executed");
    return { ok: true, data: { slug } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Gagal mengabaikan program.";
    await audit(db, actor, "dismissProgramDiscovery", { slug, error }, "failed");
    return { ok: false, error };
  }
}

/** Scan the CMS for new programs/batches now, ignoring the six-hour throttle. */
export async function scanForNewPrograms(
  actor: string,
): Promise<OpsResult<{ created: number; slugs: string[] }>> {
  const db = getDb();
  try {
    const res = await discoverTilawahPrograms({ force: true });
    const slugs = res.created.map((c) => c.slug);
    await audit(db, actor, "scanForNewPrograms", { created: slugs }, "executed");
    return { ok: true, data: { created: slugs.length, slugs } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Pemindaian gagal.";
    await audit(db, actor, "scanForNewPrograms", { error }, "failed");
    return { ok: false, error };
  }
}

/**
 * Remove halaqah mirrored under a program whose batch contradicts the one the
 * program is pinned to.
 *
 * Separate from the sync's own prune on purpose. That prune infers "gone" from
 * absence in an upstream list, so it must refuse to act at scale — a partial
 * fetch looks exactly like a mass deletion. This one acts on a contradiction the
 * database can prove without asking upstream anything, and only when a
 * coordinator has been shown the row counts and pressed the button.
 */
export async function purgeStrays(
  input: { slug: string },
  actor: string,
): Promise<OpsResult<{ slug: string; removed: PurgeStraysResult }>> {
  const slug = (input.slug ?? "").trim();
  if (!slug) return { ok: false, error: "slug wajib diisi" };

  const db = getDb();
  const rows = await db.execute(sql`select id from programs where slug = ${slug} limit 1`);
  const programId = rows.rows[0]?.id as string | undefined;
  if (!programId) return { ok: false, error: `program ${slug} tidak ditemukan` };

  const strays = await listBatchStrays(programId);
  if (strays.length === 0) return { ok: false, error: "tidak ada halaqah asing di program ini" };

  const removed = await purgeBatchStrays(programId);
  await audit(
    db,
    actor,
    "purge_strays",
    {
      slug,
      removed,
      halaqah: strays.map((s) => ({ id: s.halaqahId, name: s.name, batch: s.batchId })),
    },
    "executed",
  );
  return { ok: true, data: { slug, removed } };
}

/**
 * Pause or resume a program's sync. Unpausing DELETES the key rather than
 * writing `false`, so "not paused" has exactly one representation in config.
 */
export async function setSyncPaused(
  input: { slug: string; paused: boolean },
  actor: string,
): Promise<OpsResult<{ slug: string; paused: boolean }>> {
  const slug = (input.slug ?? "").trim();
  if (!slug) return { ok: false, error: "Slug program wajib diisi." };
  const paused = input.paused === true;

  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!program) return { ok: false, error: `Program tidak ditemukan: ${slug}` };

  try {
    await db.execute(
      paused
        ? sql`update programs
                 set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('syncPaused', true)
               where slug = ${slug}`
        : sql`update programs
                 set config = coalesce(config, '{}'::jsonb) - 'syncPaused'
               where slug = ${slug}`,
    );
    await audit(db, actor, "setSyncPaused", { slug, paused }, "executed");
    return { ok: true, data: { slug, paused } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Gagal mengubah status sync.";
    await audit(db, actor, "setSyncPaused", { slug, paused, error }, "failed");
    return { ok: false, error };
  }
}

/**
 * Sync ONE program now, dispatched by its data source. Runs even when the
 * program is paused — the click is an explicit override, and the result says so.
 */
export async function syncProgram(
  input: { slug: string },
  actor: string,
): Promise<OpsResult<{ slug: string; skipped: boolean; wasPaused: boolean; error?: string }>> {
  const slug = (input.slug ?? "").trim();
  if (!slug) return { ok: false, error: "Slug program wajib diisi." };

  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!program) return { ok: false, error: `Program tidak ditemukan: ${slug}` };
  const wasPaused = (program.config as { syncPaused?: boolean } | null)?.syncPaused === true;

  if (await isSyncRunning(program.id)) {
    await audit(db, actor, "syncProgram", { slug, result: "skipped_running" }, "executed");
    return { ok: true, data: { slug, skipped: true, wasPaused } };
  }

  try {
    const res =
      program.dataSourceType === "tilawah_api"
        ? await runTilawahSyncForSlug(slug)
        : program.dataSourceType === "berkah_api"
          ? await runHkmSyncForSlug(slug)
          : program.dataSourceType === "mabni_api"
            ? await runMabniSyncForSlug(slug)
            : program.dataSourceType === "maahir_api"
              ? await runMaahirSyncForSlug(slug)
              : null;
    if (!res) {
      return { ok: false, error: `Sumber data "${program.dataSourceType}" belum bisa disinkron per program.` };
    }
    await audit(db, actor, "syncProgram", { slug, ok: res.ok, error: res.error }, res.ok ? "executed" : "failed");
    return res.ok
      ? { ok: true, data: { slug, skipped: false, wasPaused } }
      : { ok: false, error: res.error ?? "Sync gagal." };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Sync gagal.";
    await audit(db, actor, "syncProgram", { slug, error }, "failed");
    return { ok: false, error };
  }
}

export type SyncSource = "hkm" | "tilawah" | "mabni" | "maahir" | "all";
export type SyncItem = { source: "hkm" | "tilawah" | "mabni" | "maahir"; programSlug: string; ok: boolean; error?: string };
const SYNC_SOURCES: SyncSource[] = ["hkm", "tilawah", "mabni", "maahir", "all"];

/**
 * Manually trigger a data sync (same work the cron does). Runs every program of
 * the requested source(s) in one pass — the per-program syncers need full
 * Program+session context, so "run all of source" is the reusable unit.
 * Skips if a sync is already running (avoids overlap/stacking). Synchronous:
 * returns after the pull completes.
 */
export async function triggerSync(
  input: { source: SyncSource },
  actor: string,
): Promise<OpsResult<{ source: SyncSource; skipped: boolean; items: SyncItem[] }>> {
  const source = input.source;
  if (!SYNC_SOURCES.includes(source)) return { ok: false, error: `Source tidak valid: ${source}` };

  const db = getDb();
  if (await isSyncRunning()) {
    await audit(db, actor, "triggerSync", { source, result: "skipped_running" }, "executed");
    return { ok: true, data: { source, skipped: true, items: [] } };
  }

  const items: SyncItem[] = [];
  try {
    if (source === "hkm" || source === "all") {
      for (const r of await runAllHkmSyncs())
        items.push({ source: "hkm", programSlug: r.programSlug, ok: r.ok, error: r.error });
    }
    if (source === "tilawah" || source === "all") {
      for (const r of await runAllTilawahSyncs())
        items.push({ source: "tilawah", programSlug: r.programSlug, ok: r.ok, error: r.error });
    }
    if (source === "mabni" || source === "all") {
      for (const r of await runAllMabniSyncs())
        items.push({ source: "mabni", programSlug: r.programSlug, ok: r.ok, error: r.error });
    }
    if (source === "maahir" || source === "all") {
      for (const r of await runAllMaahirSyncs())
        items.push({ source: "maahir", programSlug: r.programSlug, ok: r.ok, error: r.error });
    }
    const allOk = items.every((i) => i.ok);
    await audit(db, actor, "triggerSync", { source, count: items.length, allOk }, allOk ? "executed" : "failed");
    return { ok: true, data: { source, skipped: false, items } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Sync gagal.";
    await audit(db, actor, "triggerSync", { source, error }, "failed");
    return { ok: false, error };
  }
}
