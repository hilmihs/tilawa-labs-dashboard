"use server";

import { revalidatePath } from "next/cache";
import { eq, ilike, and, asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { students, lateIncidents, notificationLog, studentsSync, halaqahSync, warningLetters } from "@/lib/db/schema";
import { sendWhatsApp } from "@/lib/integrations/kirimi";
import { pushLateIncidentToTilawah } from "@/lib/sync/push-late-status";
import { PERIZINAN_OPTIONS, type Perizinan } from "@/lib/kategori-udzur";
import { generateWarningLetterPdf } from "@/lib/pdf/surat-peringatan";
import { buildLetterNumber } from "@/lib/pdf/letter-number";
import { putFile } from "@/lib/storage";
import { getProgram } from "@/lib/programs/resolve";

const SP_ALERT_RECIPIENT = process.env.SP_ALERT_WA_NUMBER ?? "";

export type StudentSearchResult = {
  id: string;
  full_name: string;
  marhalah: string | null;
  father_name: string | null;
  mother_name: string | null;
};

export async function searchStudents(
  programSlug: string,
  query: string,
): Promise<StudentSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const db = getDb();
  const program = await getProgram(programSlug);
  if (!program) return [];

  const rows = await db
    .select({
      id: students.id,
      full_name: students.fullName,
      marhalah: students.marhalah,
      father_name: students.fatherName,
      mother_name: students.motherName,
    })
    .from(students)
    .where(and(eq(students.programId, program.id), ilike(students.fullName, `%${trimmed}%`)))
    .orderBy(asc(students.fullName))
    .limit(8);

  return rows;
}

export type CreateLateIncidentInput = {
  studentId: string;
  marhalah: string;
  occurredAt: string; // YYYY-MM-DD
  arrivalTime: string; // HH:MM
  perizinan: Perizinan;
  alasan: string;
  keterangan?: string;
};

export type CreateLateIncidentResult =
  | {
      ok: true;
      incidentId: string;
      waSent: boolean;
      waReason?: string;
      tilawahSynced: boolean;
      tilawahReason?: string;
    }
  | { ok: false; error: string };

export async function createLateIncident(
  programSlug: string,
  input: CreateLateIncidentInput,
): Promise<CreateLateIncidentResult> {
  if (!input.studentId || !input.occurredAt || !input.arrivalTime || !input.perizinan) {
    return { ok: false, error: "Field wajib belum lengkap." };
  }
  if (!PERIZINAN_OPTIONS.includes(input.perizinan)) {
    return { ok: false, error: "Nilai perizinan tidak valid." };
  }

  const db = getDb();
  const program = await getProgram(programSlug);
  if (!program) {
    return { ok: false, error: `Program "${programSlug}" belum ada di database.` };
  }

  const spRequired = input.perizinan === "Tidak Izin";
  const dayName = new Date(input.occurredAt).toLocaleDateString("id-ID", { weekday: "long" });

  let incident;
  try {
    [incident] = await db
      .insert(lateIncidents)
      .values({
        programId: program.id,
        studentId: input.studentId,
        occurredAt: input.occurredAt,
        dayName,
        marhalah: input.marhalah,
        arrivalTime: input.arrivalTime,
        perizinan: input.perizinan,
        alasan: input.alasan || null,
        keterangan: input.keterangan || null,
        spRequired,
        reportedByRole: "guru_piket",
      })
      .returning({ id: lateIncidents.id });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan insiden." };
  }
  if (!incident) return { ok: false, error: "Gagal menyimpan insiden." };

  // Best-effort side effects below — the incident is already saved, so a
  // notification/sync failure must never look like the whole submit failed.
  let waSent = false;
  let waReason: string | undefined;

  if (spRequired && SP_ALERT_RECIPIENT) {
    const [student] = await db
      .select({ fullName: students.fullName })
      .from(students)
      .where(eq(students.id, input.studentId));

    const message =
      `⚠️ Insiden keterlambatan tanpa izin\n` +
      `Nama: ${student?.fullName ?? "-"}\n` +
      `Marhalah: ${input.marhalah}\n` +
      `Tanggal: ${input.occurredAt} (${dayName})\n` +
      `Jam kedatangan: ${input.arrivalTime}\n` +
      `Alasan: ${input.alasan || "-"}\n` +
      `Perlu tindak lanjut Surat Peringatan.`;

    const result = await sendWhatsApp(SP_ALERT_RECIPIENT, message);
    waSent = result.ok;
    waReason = result.ok ? undefined : result.reason;

    await db.insert(notificationLog).values({
      channel: "kirimi_wa",
      recipient: SP_ALERT_RECIPIENT,
      payload: { late_incident_id: incident.id, message },
      kirimiMessageId: result.ok ? result.messageId : null,
      status: result.ok ? "sent" : "failed",
    });
  }

  // Push-back to tilawah — best-effort, same reasoning as the WA send above:
  // the incident is already saved, so this must never fail the submit itself.
  const tilawahResult = await pushLateIncidentToTilawah(incident.id);

  revalidatePath("/[program]/piket", "page");
  return {
    ok: true,
    incidentId: incident.id,
    waSent,
    waReason,
    tilawahSynced: tilawahResult.pushed,
    tilawahReason: tilawahResult.pushed ? undefined : tilawahResult.reason,
  };
}

export type LateIncidentListItem = {
  id: string;
  occurred_at: string;
  arrival_time: string | null;
  perizinan: string;
  alasan: string | null;
  sp_required: boolean;
  sp_generated_at: string | null;
  students: { full_name: string } | null;
};

export async function listRecentIncidents(
  programSlug: string,
  limit = 30,
): Promise<LateIncidentListItem[]> {
  const db = getDb();
  const program = await getProgram(programSlug);
  if (!program) return [];

  const rows = await db
    .select({
      id: lateIncidents.id,
      occurred_at: lateIncidents.occurredAt,
      arrival_time: lateIncidents.arrivalTime,
      perizinan: lateIncidents.perizinan,
      alasan: lateIncidents.alasan,
      sp_required: lateIncidents.spRequired,
      sp_generated_at: lateIncidents.spGeneratedAt,
      full_name: students.fullName,
    })
    .from(lateIncidents)
    .innerJoin(students, eq(lateIncidents.studentId, students.id))
    .where(eq(lateIncidents.programId, program.id))
    .orderBy(desc(lateIncidents.occurredAt), desc(lateIncidents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    occurred_at: r.occurred_at,
    arrival_time: r.arrival_time,
    perizinan: r.perizinan,
    alasan: r.alasan,
    sp_required: r.sp_required,
    sp_generated_at: r.sp_generated_at ? r.sp_generated_at.toISOString() : null,
    students: { full_name: r.full_name },
  }));
}

export type GenerateWarningLetterResult =
  | { ok: true; warningLetterId: string }
  | { ok: false; error: string };

export async function generateWarningLetter(
  lateIncidentId: string,
): Promise<GenerateWarningLetterResult> {
  const db = getDb();

  const [row] = await db
    .select({
      incidentId: lateIncidents.id,
      programId: lateIncidents.programId,
      occurredAt: lateIncidents.occurredAt,
      arrivalTime: lateIncidents.arrivalTime,
      perizinan: lateIncidents.perizinan,
      alasan: lateIncidents.alasan,
      marhalah: lateIncidents.marhalah,
      studentId: students.id,
      fullName: students.fullName,
      fatherName: students.fatherName,
      motherName: students.motherName,
      tilawahUserId: students.tilawahUserId,
    })
    .from(lateIncidents)
    .innerJoin(students, eq(lateIncidents.studentId, students.id))
    .where(eq(lateIncidents.id, lateIncidentId));

  if (!row) {
    return { ok: false, error: "Insiden tidak ditemukan." };
  }

  const now = new Date();
  const [history, teacherRow, seqRow] = await Promise.all([
    db
      .select({
        occurred_at: lateIncidents.occurredAt,
        perizinan: lateIncidents.perizinan,
        alasan: lateIncidents.alasan,
      })
      .from(lateIncidents)
      .where(eq(lateIncidents.studentId, row.studentId))
      .orderBy(asc(lateIncidents.occurredAt)),
    // Halaqah teacher(s) + level for the signatory line. Resolved via the synced
    // read-model: student → students_sync (pengajar) → halaqah_sync (level).
    row.tilawahUserId != null
      ? db
          .select({ pengajar: studentsSync.pengajar, level: halaqahSync.level })
          .from(studentsSync)
          .leftJoin(
            halaqahSync,
            and(
              eq(halaqahSync.programId, studentsSync.programId),
              eq(halaqahSync.tilawahHalaqahId, studentsSync.halaqahId),
            ),
          )
          .where(
            and(
              eq(studentsSync.programId, row.programId),
              eq(studentsSync.tilawahUserId, row.tilawahUserId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    // Running letter number within the current year (global across programs).
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(warningLetters)
      .where(sql`extract(year from ${warningLetters.generatedAt}) = ${now.getFullYear()}`),
  ]);

  const pengajar = teacherRow[0]?.pengajar ?? null;
  const marhalah = teacherRow[0]?.level ?? row.marhalah ?? null;
  const letterNumber = buildLetterNumber(Number(seqRow[0]?.cnt ?? 0) + 1, now);

  const generatedAt = now.toISOString();
  const pdfBytes = await generateWarningLetterPdf({
    letterNumber,
    studentName: row.fullName,
    parentName: row.fatherName ?? row.motherName,
    pengajar,
    marhalah,
    incidentDate: row.occurredAt,
    generatedAt,
  });

  const storagePath = `${row.studentId}/${lateIncidentId}-${Date.now()}.pdf`;
  try {
    await putFile(`warning-letters/${storagePath}`, pdfBytes);
  } catch (err) {
    return { ok: false, error: `Gagal simpan PDF: ${err instanceof Error ? err.message : "unknown"}` };
  }

  let letter;
  try {
    [letter] = await db
      .insert(warningLetters)
      .values({
        lateIncidentId,
        studentId: row.studentId,
        pdfPath: storagePath,
        letterNumber,
        generatedAt: new Date(generatedAt),
        contentSnapshot: { incident: row, history, letterNumber, pengajar, marhalah },
      })
      .returning({ id: warningLetters.id });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan record surat." };
  }
  if (!letter) return { ok: false, error: "Gagal menyimpan record surat." };

  await db
    .update(lateIncidents)
    .set({ spGeneratedAt: new Date(generatedAt) })
    .where(eq(lateIncidents.id, lateIncidentId));

  revalidatePath("/[program]/piket", "page");
  return { ok: true, warningLetterId: letter.id };
}

export async function getWarningLetterDownloadUrl(lateIncidentId: string): Promise<string | null> {
  const db = getDb();
  const [letter] = await db
    .select({ pdfPath: warningLetters.pdfPath })
    .from(warningLetters)
    .where(eq(warningLetters.lateIncidentId, lateIncidentId))
    .orderBy(desc(warningLetters.generatedAt))
    .limit(1);

  if (!letter?.pdfPath) return null;

  // pdfPath is "{studentId}/{file}.pdf" — served (with auth check) via
  // app/api/warning-letters/[...path]/route.ts, which stores under storage/warning-letters/.
  return `/api/warning-letters/${letter.pdfPath}`;
}
