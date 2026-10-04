"use server";

import { catatAksesToken, resolveDivisiToken } from "@/lib/acara/access";
import { simpanNilaiPic } from "@/lib/penilaian/pic";

/** Simpan nilai satu anggota dari tautan PIC. Token = satu-satunya kredensial, dicek tiap panggilan. */
export async function simpanNilaiPicAction(
  token: string,
  panitiaId: string,
  nilai: Record<string, string>,
  evidence: string,
): Promise<{ ok: boolean; pesan: string }> {
  const akses = await resolveDivisiToken(token);
  if (!akses) return { ok: false, pesan: "Tautan tidak valid atau sudah kedaluwarsa." };
  if (typeof panitiaId !== "string" || !nilai || typeof nilai !== "object") return { ok: false, pesan: "Isian tidak sah." };
  const h = await simpanNilaiPic({
    acaraId: akses.acara.id,
    divisiId: akses.divisi.id,
    panitiaId,
    nilai: Object.fromEntries(Object.entries(nilai).map(([k, v]) => [String(k), String(v)])),
    evidence: typeof evidence === "string" ? evidence : "",
  });
  if (h.ok) await catatAksesToken(akses, "ubah", { tabel: "penilaian", id: panitiaId });
  return h;
}
