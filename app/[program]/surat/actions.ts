"use server";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { hkmLetters } from "@/lib/db/schema";
import { getSuratCandidates, type SuratCandidate } from "@/lib/hkm/surat-queries";
import { formatTanggalIndonesia } from "@/lib/pdf/date-id";
import { generateHkmLettersPdf, type HkmLetterDoc } from "@/lib/pdf/hkm";
import { resolveProgramAccess, type Program } from "@/lib/programs/resolve";
import { putFile } from "@/lib/storage";

/** Penanggungjawab printed under the signature. Env-overridable so a change of
 *  post is a config edit, not a deploy. */
const SIGNER_NAME = process.env.HKM_LETTER_SIGNER?.trim() || "Ustadz Idris Hakim";

/** One PDF may not carry more letters than this. Guards memory and misclicks. */
const MAX_RECIPIENTS = 200;
const MAX_PELANGGARAN = 8;
const MAX_PELANGGARAN_LEN = 160;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Guard = { ok: true; program: Program; rosterSlug: string; userId: string } | { ok: false; error: string };

/**
 * Session + program-access gate for every action in this file.
 *
 * `rosterSlug` comes from the program's own config (`presensiSlug`), never from
 * the client: the HKM dashboard slug is berkah-backed and its roster lives in
 * the paired tilawah program.
 */
async function guard(programSlug: string): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir, silakan login ulang." };

  const program = await resolveProgramAccess(user, programSlug);
  if (!program) return { ok: false, error: "Akses ditolak untuk program ini." };

  const config = (program.config ?? {}) as { presensiSlug?: string };
  const rosterSlug = config.presensiSlug?.trim() || programSlug;
  return { ok: true, program, rosterSlug, userId: user.sub };
}

export type SuratListResult =
  | { ok: true; rosterSlug: string; rows: SuratCandidate[] }
  | { ok: false; error: string };

export async function listSuratCandidates(programSlug: string): Promise<SuratListResult> {
  const g = await guard(programSlug);
  if (!g.ok) return g;
  return { ok: true, rosterSlug: g.rosterSlug, rows: await getSuratCandidates(g.rosterSlug) };
}

export type SuratRecipientInput = {
  /** null for a manually typed name that isn't in the roster. */
  tilawahUserId: number | null;
  nama: string;
  // penerimaan
  hari?: string;
  pukul?: string;
  tempat?: string;
  pengajar?: string;
  halaqah?: string;
  tanggalMulai?: string; // ISO
  // peringatan
  kelas?: string;
  pelanggaran?: string[];
};

export type GenerateSuratInput = {
  letterType: "penerimaan" | "peringatan";
  level?: 1 | 2 | 3;
  tanggalSurat: string; // ISO
  recipients: SuratRecipientInput[];
};

export type GenerateSuratResult =
  | { ok: true; letterId: string; downloadUrl: string; pageCount: number }
  | { ok: false; error: string };

function validate(input: GenerateSuratInput): string | null {
  if (input.letterType !== "penerimaan" && input.letterType !== "peringatan") {
    return "Jenis surat tidak dikenal.";
  }
  if (input.letterType === "peringatan" && ![1, 2, 3].includes(input.level ?? 0)) {
    return "Tingkat surat peringatan harus 1, 2, atau 3.";
  }
  if (!ISO_DATE.test(input.tanggalSurat)) return "Tanggal surat tidak valid.";
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    return "Pilih minimal satu peserta.";
  }
  if (input.recipients.length > MAX_RECIPIENTS) {
    return `Maksimal ${MAX_RECIPIENTS} peserta dalam satu berkas.`;
  }
  for (const r of input.recipients) {
    if (!r.nama?.trim()) return "Ada penerima tanpa nama.";
    if (input.letterType === "peringatan") {
      const items = (r.pelanggaran ?? []).map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return `Butir pelanggaran untuk ${r.nama} masih kosong.`;
      if (items.length > MAX_PELANGGARAN) {
        return `Butir pelanggaran untuk ${r.nama} lebih dari ${MAX_PELANGGARAN}.`;
      }
      if (items.some((s) => s.length > MAX_PELANGGARAN_LEN)) {
        return `Ada butir pelanggaran untuk ${r.nama} yang lebih dari ${MAX_PELANGGARAN_LEN} karakter.`;
      }
    }
    if (r.tanggalMulai && !ISO_DATE.test(r.tanggalMulai)) {
      return `Tanggal mulai untuk ${r.nama} tidak valid.`;
    }
  }
  return null;
}

/** Client values are overrides on top of freshly-read defaults, never the source of truth. */
function buildDoc(
  input: GenerateSuratInput,
  r: SuratRecipientInput,
  base: SuratCandidate | undefined,
  tanggalSurat: string,
): HkmLetterDoc {
  const nama = r.nama.trim();
  if (input.letterType === "penerimaan") {
    const mulai = r.tanggalMulai || base?.tanggalMulai || null;
    return {
      type: "penerimaan",
      nama,
      hari: r.hari?.trim() || base?.hari || "",
      pukul: r.pukul?.trim() || base?.pukul || "",
      tempat: r.tempat?.trim() || base?.tempat || "",
      pengajar: r.pengajar?.trim() || base?.pengajar || "",
      halaqah: r.halaqah?.trim() || base?.halaqah || "",
      tanggalMulai: mulai ? formatTanggalIndonesia(mulai) : "",
      tanggalSurat,
      signerName: SIGNER_NAME,
    };
  }
  return {
    type: "peringatan",
    nama,
    kelas: r.kelas?.trim() || base?.kelas || "",
    level: (input.level ?? 1) as 1 | 2 | 3,
    pelanggaran: (r.pelanggaran ?? []).map((s) => s.trim()).filter(Boolean),
    tanggalSurat,
    signerName: SIGNER_NAME,
  };
}

export async function generateSurat(
  programSlug: string,
  input: GenerateSuratInput,
): Promise<GenerateSuratResult> {
  const g = await guard(programSlug);
  if (!g.ok) return g;

  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const candidates = await getSuratCandidates(g.rosterSlug);
  const byId = new Map(candidates.map((c) => [c.tilawahUserId, c]));
  const tanggalSurat = formatTanggalIndonesia(input.tanggalSurat);

  const docs = input.recipients.map((r) =>
    buildDoc(input, r, r.tilawahUserId == null ? undefined : byId.get(r.tilawahUserId), tanggalSurat),
  );

  let bytes: Uint8Array;
  try {
    bytes = await generateHkmLettersPdf(docs);
  } catch (err) {
    // The renderer throws with the offending recipient's name when a letter
    // cannot fit on its page — surface that verbatim, it is actionable.
    return { ok: false, error: err instanceof Error ? err.message : "Gagal membuat PDF." };
  }

  // Path segments are slug/year/uuid only — no operator text ever reaches it.
  const year = input.tanggalSurat.slice(0, 4);
  const pdfPath = `${programSlug}/${year}/${randomUUID()}.pdf`;
  try {
    await putFile(`hkm-letters/${pdfPath}`, bytes);
  } catch (err) {
    // Storage failures are environmental (permissions on the mount, missing
    // blob credentials) and look identical from the UI, so the cause has to
    // reach the server log or nobody can tell them apart.
    console.error("[surat] putFile failed", err);
    return {
      ok: false,
      error: `Gagal menyimpan berkas surat: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  const db = getDb();
  const [row] = await db
    .insert(hkmLetters)
    .values({
      programId: g.program.id,
      letterType: input.letterType,
      level: input.letterType === "peringatan" ? (input.level ?? null) : null,
      recipientCount: docs.length,
      recipientNames: docs.map((d) => d.nama),
      pdfPath,
      letterDate: input.tanggalSurat,
      signerName: SIGNER_NAME,
      generatedBy: g.userId,
      contentSnapshot: { docs },
    })
    .returning({ id: hkmLetters.id });

  if (!row) return { ok: false, error: "Gagal menyimpan catatan surat." };

  revalidatePath("/[program]/surat", "page");
  return {
    ok: true,
    letterId: row.id,
    downloadUrl: `/api/hkm-letters/${row.id}`,
    pageCount: docs.length,
  };
}

export type RecentSuratItem = {
  id: string;
  letterType: string;
  level: number | null;
  recipientCount: number;
  recipientNames: string[];
  letterDate: string;
  generatedAt: string;
  downloadUrl: string;
};

export async function listRecentSurat(programSlug: string, limit = 20): Promise<RecentSuratItem[]> {
  const g = await guard(programSlug);
  if (!g.ok) return [];

  const db = getDb();
  const rows = await db
    .select({
      id: hkmLetters.id,
      letterType: hkmLetters.letterType,
      level: hkmLetters.level,
      recipientCount: hkmLetters.recipientCount,
      recipientNames: hkmLetters.recipientNames,
      letterDate: hkmLetters.letterDate,
      generatedAt: hkmLetters.generatedAt,
    })
    .from(hkmLetters)
    .where(eq(hkmLetters.programId, g.program.id))
    .orderBy(desc(hkmLetters.generatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows.map((r) => ({
    id: r.id,
    letterType: r.letterType,
    level: r.level,
    recipientCount: r.recipientCount,
    recipientNames: Array.isArray(r.recipientNames) ? (r.recipientNames as string[]) : [],
    letterDate: r.letterDate,
    generatedAt: r.generatedAt.toISOString(),
    downloadUrl: `/api/hkm-letters/${r.id}`,
  }));
}
