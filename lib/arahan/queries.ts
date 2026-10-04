import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { directives, programTasks } from "@/lib/db/schema";
import type { Directive } from "./board";
import { seninPekanIni, urutkanProgram, type ProgramWeek } from "./program";

/**
 * Baca arahan untuk papan dan form.
 *
 * Kolom `stakeholders` adalah jsonb bebas isi, jadi hasilnya dinormalisasi di
 * sini: baris lama atau baris yang ditulis tangan lewat psql bisa saja berisi
 * null, string tunggal, atau angka, dan satu baris rusak tidak boleh
 * menjatuhkan seluruh papan TV.
 */
function normalizeStakeholders(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

export async function listActiveDirectives(): Promise<Directive[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: directives.id,
      title: directives.title,
      source: directives.source,
      pic: directives.pic,
      stakeholders: directives.stakeholders,
      requestedAt: directives.requestedAt,
      checkpoint: directives.checkpoint,
      checkpointUpdatedAt: directives.checkpointUpdatedAt,
    })
    .from(directives)
    .where(eq(directives.status, "aktif"))
    .orderBy(asc(directives.requestedAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    source: r.source,
    pic: r.pic,
    stakeholders: normalizeStakeholders(r.stakeholders),
    requestedAt: String(r.requestedAt).slice(0, 10),
    checkpoint: r.checkpoint,
    checkpointUpdatedAt: r.checkpointUpdatedAt ? r.checkpointUpdatedAt.toISOString() : null,
  }));
}

/** Arahan yang sudah ditandai selesai, terbaru dulu. Dipakai hanya di form. */
export async function listDoneDirectives(limit = 20): Promise<(Directive & { completedAt: string | null })[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(directives)
    .where(eq(directives.status, "selesai"))
    .orderBy(sql`${directives.completedAt} desc nulls last`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    source: r.source,
    pic: r.pic,
    stakeholders: normalizeStakeholders(r.stakeholders),
    requestedAt: String(r.requestedAt).slice(0, 10),
    checkpoint: r.checkpoint,
    checkpointUpdatedAt: r.checkpointUpdatedAt ? r.checkpointUpdatedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));
}

/**
 * Apa yang dibutuhkan satu render papan/form: daftar arahan DAN instant server
 * yang dipakai untuk menghitungnya.
 *
 * Jamnya dibaca di sini, bukan di badan komponen, karena `Date.now()` dalam
 * render adalah pemanggilan tak murni — React boleh me-render ulang komponen
 * server kapan saja dan angka usianya ikut bergeser diam-diam. Satu pembacaan
 * per permintaan, dikirim ke bawah sebagai prop.
 */
export async function readBoard(): Promise<{ directives: Directive[]; now: number }> {
  const directives = await listActiveDirectives();
  return { directives, now: Date.now() };
}

/** Fokus program satu pekan (Senin `weekStart`), sudah diurutkan. */
export async function listProgramWeek(weekStart: string): Promise<ProgramWeek> {
  const db = getDb();
  const rows = await db
    .select({ program: programTasks.program, task: programTasks.task, urutan: programTasks.urutan })
    .from(programTasks)
    .where(eq(programTasks.weekStart, weekStart));
  return { weekStart, tasks: urutkanProgram(rows) };
}

/**
 * Pekan yang tampil di papan: pekan berjalan, atau — kalau belum diisi — pekan
 * terakhir sebelumnya. Senin pagi sebelum rapat papan tidak mendadak kosong;
 * labelnya tetap menyebut tanggal pekan lama, jadi tidak ada yang tertipu.
 * null kalau tabelnya belum pernah diisi sama sekali.
 */
export async function readProgramBoard(now: number): Promise<ProgramWeek | null> {
  const db = getDb();
  const [latest] = await db
    .select({ weekStart: programTasks.weekStart })
    .from(programTasks)
    .where(lte(programTasks.weekStart, seninPekanIni(now)))
    .orderBy(desc(programTasks.weekStart))
    .limit(1);
  if (!latest) return null;
  return listProgramWeek(String(latest.weekStart).slice(0, 10));
}

/** Tanggal hari ini menurut kalender Jakarta, bukan menurut zona server. */
export function todayJakarta(now: number): string {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function getDirective(id: string): Promise<Directive | null> {
  const db = getDb();
  const [r] = await db
    .select()
    .from(directives)
    .where(and(eq(directives.id, id), eq(directives.status, "aktif")))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    pic: r.pic,
    stakeholders: normalizeStakeholders(r.stakeholders),
    requestedAt: String(r.requestedAt).slice(0, 10),
    checkpoint: r.checkpoint,
    checkpointUpdatedAt: r.checkpointUpdatedAt ? r.checkpointUpdatedAt.toISOString() : null,
  };
}
