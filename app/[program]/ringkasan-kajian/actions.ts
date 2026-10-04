"use server";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ringkasanPeserta, ringkasanSetor } from "@/lib/db/schema";
import { requireProgramAccess } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { berlaku, hariIniWib } from "@/lib/ringkasan/hitung";

export type HasilAksi = { ok: true } | { ok: false; error: string };

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

async function aksesProgram(slug: string) {
  const { user, program } = await requireProgramAccess(slug);
  if (!getProgramConfig(program).features.ringkasan) throw new Error("FITUR_MATI");
  return { user, program };
}

function pesanGalat(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m === "UNAUTHENTICATED") return "Sesi habis — masuk ulang.";
  if (m === "PROGRAM_FORBIDDEN" || m === "FITUR_MATI") return "Tidak punya akses ke program ini.";
  return "Gagal menyimpan. Coba lagi.";
}

/** Centang (setor=true) atau batal (setor=false) satu kotak. */
export async function setSetor(
  programSlug: string,
  pesertaId: string,
  tanggal: string,
  setor: boolean,
): Promise<HasilAksi> {
  try {
    const { user, program } = await aksesProgram(programSlug);
    if (!TANGGAL.test(tanggal)) return { ok: false, error: "Tanggal tidak valid." };
    const db = getDb();
    const [p] = await db
      .select()
      .from(ringkasanPeserta)
      .where(and(eq(ringkasanPeserta.id, pesertaId), eq(ringkasanPeserta.programId, program.id)));
    if (!p) return { ok: false, error: "Peserta tidak ditemukan." };
    if (!berlaku(tanggal, { mulai: p.mulai, selesai: p.selesai }, hariIniWib())) {
      return { ok: false, error: "Tanggal ini belum/tidak berlaku untuk peserta." };
    }
    if (setor) {
      await db
        .insert(ringkasanSetor)
        .values({ pesertaId, tanggal, dicatatOleh: user.sub })
        .onConflictDoNothing();
    } else {
      await db
        .delete(ringkasanSetor)
        .where(and(eq(ringkasanSetor.pesertaId, pesertaId), eq(ringkasanSetor.tanggal, tanggal)));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: pesanGalat(e) };
  }
}

/**
 * Ikutkan / keluarkan peserta dari ceklis. Masuk: mulai = hari ini WIB (baris
 * baru) atau selesai := null (baris lama). Keluar: selesai = kemarin WIB.
 */
export async function setPesertaAktif(
  programSlug: string,
  tilawahUserId: number,
  aktif: boolean,
): Promise<HasilAksi> {
  try {
    const { program } = await aksesProgram(programSlug);
    const db = getDb();
    const roster = await db.execute(sql`
      select 1 from students_sync
      where program_id = ${program.id} and tilawah_user_id = ${tilawahUserId}
    `);
    if (roster.rows.length === 0) return { ok: false, error: "Akun tidak ada di roster program." };

    const hariIni = hariIniWib();
    const kemarin = new Date(Date.parse(`${hariIni}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const now = new Date();
    if (aktif) {
      await db
        .insert(ringkasanPeserta)
        .values({ programId: program.id, tilawahUserId, mulai: hariIni })
        .onConflictDoUpdate({
          target: [ringkasanPeserta.programId, ringkasanPeserta.tilawahUserId],
          set: { selesai: null, updatedAt: now },
        });
    } else {
      await db
        .update(ringkasanPeserta)
        .set({ selesai: kemarin, updatedAt: now })
        .where(
          and(eq(ringkasanPeserta.programId, program.id), eq(ringkasanPeserta.tilawahUserId, tilawahUserId)),
        );
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: pesanGalat(e) };
  }
}
