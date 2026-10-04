import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  acara,
  acaraBarang,
  acaraDivisi,
  acaraJobdesk,
  acaraLog,
  acaraPanitia,
  acaraTugas,
} from "@/lib/db/schema";
import type { AcaraRow, BarangRow, DivisiRow, JobdeskRow, PanitiaRow, TugasRow, TugasStatus } from "./types";

/**
 * Semua akses DB modul acara. Tidak ada logika tampilan di sini — pengurutan
 * papan, terlambat, total harga ada di view-model.ts. Fungsi baca per-divisi
 * menerima (acaraId, divisiId): indeks acara_panitia/acara_tugas/acara_barang
 * memimpin dengan acara_id, dan menyaring pada dua kolom sekaligus adalah
 * pembacaan defensif yang benar — satu token menamai satu divisi dari satu
 * acara, jadi baris yang cocok acara_id tapi bukan divisi_id (atau sebaliknya)
 * tidak boleh ikut terbaca atau tertulis. Fungsi tulis mengembalikan baris
 * yang tersentuh (atau null bila tidak ada), supaya action bisa mencocokkan
 * divisi_id-nya.
 */

export async function getAcaraBySlug(slug: string): Promise<AcaraRow | null> {
  const db = getDb();
  const rows = await db.select().from(acara).where(eq(acara.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getDivisiById(id: string): Promise<DivisiRow | null> {
  const db = getDb();
  const rows = await db.select().from(acaraDivisi).where(eq(acaraDivisi.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getAcaraById(id: string): Promise<AcaraRow | null> {
  const db = getDb();
  const rows = await db.select().from(acara).where(eq(acara.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listDivisiAcara(acaraId: string): Promise<DivisiRow[]> {
  const db = getDb();
  return db
    .select()
    .from(acaraDivisi)
    .where(eq(acaraDivisi.acaraId, acaraId))
    .orderBy(asc(acaraDivisi.sisi), asc(acaraDivisi.urutan));
}

/** Panitia satu divisi dalam satu acara. `wa` ikut terbaca; pemanggil yang memutuskan menampilkannya atau tidak. */
export async function listPanitiaDivisi(acaraId: string, divisiId: string): Promise<PanitiaRow[]> {
  const db = getDb();
  return db
    .select()
    .from(acaraPanitia)
    .where(and(eq(acaraPanitia.acaraId, acaraId), eq(acaraPanitia.divisiId, divisiId)))
    .orderBy(asc(acaraPanitia.peran), asc(acaraPanitia.nama));
}

export async function listTugasDivisi(acaraId: string, divisiId: string): Promise<TugasRow[]> {
  const db = getDb();
  return db
    .select()
    .from(acaraTugas)
    .where(and(eq(acaraTugas.acaraId, acaraId), eq(acaraTugas.divisiId, divisiId)))
    .orderBy(asc(acaraTugas.tenggat), asc(acaraTugas.createdAt));
}

/** Jobdesk tidak punya acara_id — indeksnya sendiri (acara_jobdesk_divisi_idx) hanya divisi_id. */
export async function listJobdeskDivisi(divisiId: string): Promise<JobdeskRow[]> {
  const db = getDb();
  return db
    .select()
    .from(acaraJobdesk)
    .where(eq(acaraJobdesk.divisiId, divisiId))
    .orderBy(asc(acaraJobdesk.urutan));
}

export async function listBarangDivisi(acaraId: string, divisiId: string): Promise<BarangRow[]> {
  const db = getDb();
  return db
    .select()
    .from(acaraBarang)
    .where(and(eq(acaraBarang.acaraId, acaraId), eq(acaraBarang.divisiId, divisiId)))
    .orderBy(desc(acaraBarang.createdAt));
}

export async function getTugasById(id: string): Promise<TugasRow | null> {
  const db = getDb();
  const rows = await db.select().from(acaraTugas).where(eq(acaraTugas.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getJobdeskById(id: string): Promise<JobdeskRow | null> {
  const db = getDb();
  const rows = await db.select().from(acaraJobdesk).where(eq(acaraJobdesk.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Ubah status satu tugas, HANYA bila baris itu milik `acaraId` DAN `divisiId`
 * — filter ada di WHERE, bukan hanya diperiksa sebelumnya, supaya balapan dua
 * request tidak bisa menulis ke acara atau divisi lain. Mengembalikan baris
 * baru atau null.
 */
export async function setStatusTugasDivisi(
  acaraId: string,
  tugasId: string,
  divisiId: string,
  status: TugasStatus,
  selesaiAt: Date | null,
): Promise<TugasRow | null> {
  const db = getDb();
  const rows = await db
    .update(acaraTugas)
    .set({ status, selesaiAt, updatedAt: new Date() })
    .where(and(eq(acaraTugas.id, tugasId), eq(acaraTugas.acaraId, acaraId), eq(acaraTugas.divisiId, divisiId)))
    .returning();
  return rows[0] ?? null;
}

export async function insertTugasDivisi(v: {
  acaraId: string;
  divisiId: string;
  judul: string;
  tenggat: string | null;
  prioritas: string;
  dariJobdeskId: string | null;
}): Promise<TugasRow> {
  const db = getDb();
  const rows = await db.insert(acaraTugas).values(v).returning();
  return rows[0];
}

/** Barang yang diajukan divisi selalu lahir sebagai 'diajukan'; approval hanya lewat akun staff. */
export async function insertBarangDivisi(v: {
  acaraId: string;
  divisiId: string;
  nama: string;
  jumlah: string | null;
  satuan: string | null;
  hargaSatuan: string | null;
  kriteria: string | null;
  sumber: string | null;
  peruntukan: string;
  pertanyaan: string | null;
}): Promise<BarangRow> {
  const db = getDb();
  const rows = await db.insert(acaraBarang).values({ ...v, statusApproval: "diajukan" }).returning();
  return rows[0];
}

/**
 * Pelaku log persis satu: token divisi ATAU akun staff. Union ini membuat
 * pemanggil yang mengisi keduanya (atau tidak satu pun) gagal di tsc, bukan
 * menghasilkan baris audit tanpa pelaku.
 */
export type PelakuLog = { divisiId: string; staffId: null } | { divisiId: null; staffId: string };

export async function insertLog(
  v: PelakuLog & {
    acaraId: string;
    aksi: "buka" | "ubah" | "approval";
    objekTabel?: string | null;
    objekId?: string | null;
    dari?: unknown;
    ke?: unknown;
    ipHash?: string | null;
  },
): Promise<void> {
  const db = getDb();
  await db.insert(acaraLog).values(v);
}

export async function listAcara(): Promise<AcaraRow[]> {
  const db = getDb();
  return db.select().from(acara).orderBy(desc(acara.tanggal));
}

/** Semua panitia satu acara (untuk PIC & WA di daftar tugas terlambat). */
export async function listPanitiaAcara(acaraId: string): Promise<PanitiaRow[]> {
  const db = getDb();
  return db.select().from(acaraPanitia).where(eq(acaraPanitia.acaraId, acaraId)).orderBy(asc(acaraPanitia.nama));
}

export async function listTugasAcara(acaraId: string): Promise<TugasRow[]> {
  const db = getDb();
  return db.select().from(acaraTugas).where(eq(acaraTugas.acaraId, acaraId)).orderBy(asc(acaraTugas.tenggat), asc(acaraTugas.createdAt));
}

export async function listBarangAcara(acaraId: string): Promise<BarangRow[]> {
  const db = getDb();
  return db.select().from(acaraBarang).where(eq(acaraBarang.acaraId, acaraId)).orderBy(desc(acaraBarang.createdAt));
}

/** Tulisan staff: tidak dibatasi divisi, tetapi tetap dikunci ke acara di WHERE. */
export async function insertTugasStaff(v: {
  acaraId: string; divisiId: string | null; judul: string; deskripsi: string | null;
  fase: number; prioritas: string; tenggat: string | null; ditugaskanKe: string | null;
  dariJobdeskId?: string | null;
}): Promise<TugasRow> {
  const db = getDb();
  const rows = await db.insert(acaraTugas).values(v).returning();
  return rows[0];
}

export async function updateTugasStaff(
  acaraId: string,
  tugasId: string,
  patch: Partial<Pick<TugasRow, "status" | "selesaiAt" | "tenggat" | "prioritas" | "fase" | "divisiId" | "ditugaskanKe" | "catatan">>,
): Promise<TugasRow | null> {
  const db = getDb();
  const rows = await db
    .update(acaraTugas)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(acaraTugas.id, tugasId), eq(acaraTugas.acaraId, acaraId)))
    .returning();
  return rows[0] ?? null;
}

export async function getBarangById(id: string): Promise<BarangRow | null> {
  const db = getDb();
  const rows = await db.select().from(acaraBarang).where(eq(acaraBarang.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Satu-satunya UPDATE acara_barang di modul. Hanya dipanggil dari action staff
 * (requireStaff); jalur token tidak pernah mengimpornya. acara_id di WHERE.
 */
export async function updateBarangStaff(
  acaraId: string,
  barangId: string,
  patch: Partial<Pick<BarangRow, "statusApproval" | "approvalOlehStaffId" | "approvalAt" | "alasanTolak" | "sudahKembali" | "waktuKembali" | "statusKetersediaan">>,
): Promise<BarangRow | null> {
  const db = getDb();
  const rows = await db
    .update(acaraBarang)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(acaraBarang.id, barangId), eq(acaraBarang.acaraId, acaraId)))
    .returning();
  return rows[0] ?? null;
}
