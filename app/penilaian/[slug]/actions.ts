"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/acara/access";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { simpanGrid, type IsianGrid } from "@/lib/penilaian/queries";
import { butuhEvidence, isNilai } from "@/lib/penilaian/skala";
import { tautkanManual } from "@/lib/orang/tautan-panitia";

export type HasilSimpan = { ok: boolean; pesan: string };

/** Simpan isian grid penilaian satu acara. Klien tidak dipercaya: semua divalidasi ulang di sini. */
export async function simpanGridAction(slug: string, isian: IsianGrid[]): Promise<HasilSimpan> {
  const user = await requireStaff();
  const a = (await getDb().execute(sql`select id from acara where slug = ${slug} limit 1`)).rows[0] as { id: string } | undefined;
  if (!a) return { ok: false, pesan: "Acara tidak ditemukan." };
  if (!Array.isArray(isian) || isian.length > 500) return { ok: false, pesan: "Isian tidak sah." };

  const bersih: IsianGrid[] = [];
  const kurangEvidence: string[] = [];
  for (const row of isian) {
    if (typeof row?.panitiaId !== "string") continue;
    const nilai: IsianGrid["nilai"] = {};
    for (const [k, v] of Object.entries(row.nilai ?? {})) {
      if (typeof k === "string" && (v === "" || isNilai(v))) nilai[k] = v;
    }
    const evidence = typeof row.evidence === "string" ? row.evidence : "";
    // Pagar mutu: D/E wajib disertai contoh kejadian.
    if (butuhEvidence(Object.values(nilai).filter((v) => v !== "")) && !evidence.trim()) kurangEvidence.push(row.panitiaId);
    bersih.push({ panitiaId: row.panitiaId, nilai, evidence });
  }
  if (kurangEvidence.length) {
    return { ok: false, pesan: `${kurangEvidence.length} panitia bernilai D/E belum diberi contoh kejadian.` };
  }
  const h = await simpanGrid(a.id, bersih, user.sub);
  revalidatePath(`/penilaian/${slug}`);
  revalidatePath("/penilaian");
  const bagian = [`${h.disimpan} nilai disimpan`];
  if (h.dihapus) bagian.push(`${h.dihapus} dikosongkan`);
  if (h.dilewati.length) bagian.push(`${h.dilewati.length} panitia dilewati karena belum tertaut ke Daftar Individu (${h.dilewati.slice(0, 3).join(", ")}${h.dilewati.length > 3 ? ", …" : ""})`);
  return { ok: true, pesan: bagian.join(" · ") + "." };
}

/** Konfirmasi tautan panitia → orang dari grid (kandidat yang ditawarkan, atau orang baru). */
export async function tautkanPanitiaAction(slug: string, panitiaId: string, orangId: string): Promise<HasilSimpan> {
  await requireStaff();
  if (typeof panitiaId !== "string" || typeof orangId !== "string") return { ok: false, pesan: "Isian tidak sah." };
  const ok = await tautkanManual(panitiaId, orangId === "baru" ? "baru" : orangId);
  revalidatePath(`/penilaian/${slug}`);
  return ok ? { ok: true, pesan: "Panitia tertaut ke Daftar Individu." } : { ok: false, pesan: "Gagal menautkan." };
}
