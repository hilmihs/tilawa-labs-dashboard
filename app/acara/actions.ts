"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { catatAksesStaff, requireStaff } from "@/lib/acara/access";
import { tanggalISO, teks } from "@/lib/acara/input";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { insertAcara } from "@/lib/hadir/queries";
import { setTargetAcara } from "@/lib/hadir/queries-golongan";
import { sinkronNawa, sinkronSemuaNawa } from "@/lib/hadir/queries-nawa";
import { NAWA_SLUG_RE, NawaError, pesanNawaError } from "@/lib/integrations/nawa/client";
import { bacaSeriDariForm, bacaTargetCentang } from "@/lib/hadir/target-input";

export type BuatAcaraState = { error?: string };

/** Buat acara dari UI — dipakai untuk kajian yang tidak butuh seed kepanitiaan. */
export async function buatAcara(_prev: BuatAcaraState, form: FormData): Promise<BuatAcaraState> {
  await requireStaff();
  const nama = teks(form.get("nama"), 120);
  if (!nama || nama.length < 3) return { error: "Nama acara minimal 3 huruf." };
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return { error: "Slug hanya huruf kecil, angka, dan tanda hubung." };
  const tanggal = tanggalISO(form.get("tanggal"));
  if (!tanggal) return { error: "Tanggal wajib (YYYY-MM-DD)." };
  const jamRaw = String(form.get("jam_mulai") ?? "").trim();
  const jamMulai = /^\d{2}:\d{2}$/.test(jamRaw) ? `${jamRaw}:00` : null;
  const tol = Number(form.get("toleransi_menit") ?? 15);
  const toleransiMenit = Number.isFinite(tol) && tol >= 0 && tol <= 240 ? Math.floor(tol) : 15;
  if (await getAcaraBySlug(slug)) return { error: "Slug sudah dipakai." };
  const tema = teks(form.get("tema"), 200);
  const seri = bacaSeriDariForm(form.get("seri"), form.get("seri_nama"));
  const target = bacaTargetCentang(form.getAll("wajib").map(String), form.getAll("diundang").map(String));
  try {
    const acaraId = await insertAcara({ slug, nama, tanggal, lokasi: teks(form.get("lokasi"), 200), pemateri: teks(form.get("pemateri"), 120), jamMulai, toleransiMenit, tema, seri });
    if (target.length > 0) await setTargetAcara(acaraId, target);
  } catch (e) {
    console.error("buat acara gagal", e);
    return { error: "Gagal menyimpan." };
  }
  revalidatePath("/acara");
  redirect(`/acara/${slug}/pendaftaran`);
}

export type TarikNawaHasil =
  | {
      ok: true;
      acaraSlug: string;
      acaraBaru: boolean;
      orangBaru: number;
      cocok: number;
      pendaftaran: number;
      hadir: number;
      dicabut: number;
      dilewati: number;
    }
  | { ok: false; error: string };

/**
 * Tarik satu program NAWA (GET /api/export) ke acara `nawa-<slug>`. Manual dulu
 * (keputusan pemilik 21 Sep); cron menyusul. Gagal tarik tidak menghapus apa pun —
 * tarikan terakhir tetap tampil, galatnya dicatat di acara_peserta_cache.
 */
export async function tarikDariNawa(nawaSlug: string): Promise<TarikNawaHasil> {
  const user = await requireStaff();
  const slug = String(nawaSlug ?? "").trim().toLowerCase();
  if (!NAWA_SLUG_RE.test(slug)) return { ok: false, error: "Slug NAWA hanya huruf kecil, angka, dan tanda hubung." };
  try {
    const h = await sinkronNawa(slug);
    await catatAksesStaff(user.sub, h.acaraId, "ubah", {
      tabel: "acara_peserta_cache",
      id: h.acaraId,
      ke: { sumber: "nawa", nawaSlug: slug, orangBaru: h.orangBaru, pendaftaran: h.pendaftaran, hadir: h.hadir, dicabut: h.dicabut },
    });
    revalidatePath("/acara");
    revalidatePath(`/acara/${h.acaraSlug}`, "layout");
    const c = h.cocok;
    return {
      ok: true,
      acaraSlug: h.acaraSlug,
      acaraBaru: h.acaraBaru,
      orangBaru: h.orangBaru,
      cocok: c.tautan + c.cocok_wa + c.cocok_nama,
      pendaftaran: h.pendaftaran,
      hadir: h.hadir,
      dicabut: h.dicabut.pendaftaran + h.dicabut.hadir,
      dilewati: h.dilewati,
    };
  } catch (e) {
    if (!(e instanceof NawaError)) console.error("tarik nawa gagal", e);
    return { ok: false, error: pesanNawaError(e) };
  }
}

export type TarikSemuaNawaHasil =
  | {
      ok: true;
      program: ({ nawaSlug: string; nama: string } & (
        | { ok: true; acaraSlug: string; acaraBaru: boolean; orangBaru: number; pendaftaran: number; hadir: number }
        | { ok: false; error: string }
      ))[];
    }
  | { ok: false; error: string };

/**
 * Tarik semua program NAWA sekaligus (GET /api/export/semua, tanpa draft & batal).
 * Program baru muncul sendiri sebagai acara `nawa-<slug>` — panitia tidak perlu tahu slug.
 */
export async function tarikSemuaDariNawa(): Promise<TarikSemuaNawaHasil> {
  const user = await requireStaff();
  try {
    const h = await sinkronSemuaNawa();
    const program = h.program.map((p) =>
      p.ok
        ? { nawaSlug: p.nawaSlug, nama: p.nama, ok: true as const, acaraSlug: p.hasil.acaraSlug, acaraBaru: p.hasil.acaraBaru, orangBaru: p.hasil.orangBaru, pendaftaran: p.hasil.pendaftaran, hadir: p.hasil.hadir }
        : { nawaSlug: p.nawaSlug, nama: p.nama, ok: false as const, error: p.error },
    );
    for (const p of h.program) {
      if (!p.ok) continue;
      await catatAksesStaff(user.sub, p.hasil.acaraId, "ubah", {
        tabel: "acara_peserta_cache",
        id: p.hasil.acaraId,
        ke: { sumber: "nawa", nawaSlug: p.nawaSlug, semua: true, orangBaru: p.hasil.orangBaru, pendaftaran: p.hasil.pendaftaran, hadir: p.hasil.hadir, dicabut: p.hasil.dicabut },
      });
      revalidatePath(`/acara/${p.hasil.acaraSlug}`, "layout");
    }
    revalidatePath("/acara");
    return { ok: true, program };
  } catch (e) {
    if (!(e instanceof NawaError)) console.error("tarik semua nawa gagal", e);
    return { ok: false, error: pesanNawaError(e) };
  }
}
