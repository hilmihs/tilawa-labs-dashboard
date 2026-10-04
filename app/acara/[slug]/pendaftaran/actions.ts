"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { catatAksesStaff, requireStaff } from "@/lib/acara/access";
import { teks } from "@/lib/acara/input";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { bacaBarisForm, ringkasRencana, siapkanImporForm, type RencanaOrang } from "@/lib/hadir/impor";
import { getOrangById, insertOrang, petaCocokOrang, teleponGuruByNamaKunci, updateAcaraPresensi, upsertPendaftaran } from "@/lib/hadir/queries";
import { setTargetAcara } from "@/lib/hadir/queries-golongan";
import { bacaSeriDariForm, bacaTargetCentang } from "@/lib/hadir/target-input";
import { normalizePhone } from "@/lib/wa";
import { PROGRAM_PILIHAN } from "@/lib/hadir/program";
import { isUuid } from "@/lib/acara/input";
import { getDb } from "@/lib/db/client";
import { orang } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export type AksiResult = { ok: true } | { ok: false; error: string };

/** Jam mulai, toleransi, jendela scan, pintu daftar. Semua opsional kecuali toleransi. */
export async function simpanPresensi(slug: string, form: FormData): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  const jamRaw = String(form.get("jam_mulai") ?? "").trim();
  const jamMulai = /^\d{2}:\d{2}(:\d{2})?$/.test(jamRaw) ? jamRaw.slice(0, 5) + ":00" : null;
  const tol = Number(form.get("toleransi_menit"));
  const toleransiMenit = Number.isFinite(tol) && tol >= 0 && tol <= 240 ? Math.floor(tol) : 15;
  // datetime-local tanpa zona → dibaca sebagai WIB.
  const wib = (v: unknown): Date | null => {
    const s = String(v ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
    const d = new Date(`${s.slice(0, 16)}:00+07:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const v = { jamMulai, toleransiMenit, scanBukaAt: wib(form.get("scan_buka")), scanTutupAt: wib(form.get("scan_tutup")), terimaPendaftaran: form.get("terima_pendaftaran") === "on", pemateri: teks(form.get("pemateri"), 120), lokasi: teks(form.get("lokasi"), 200), tema: teks(form.get("tema"), 200), seri: bacaSeriDariForm(form.get("seri"), form.get("seri_nama")) };
  const target = bacaTargetCentang(form.getAll("wajib").map(String), form.getAll("diundang").map(String));
  try {
    await updateAcaraPresensi(acara.id, v);
    await setTargetAcara(acara.id, target);
  } catch (e) {
    console.error("simpan presensi gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "acara", id: acara.id, ke: { ...v, scanBukaAt: v.scanBukaAt?.toISOString() ?? null, scanTutupAt: v.scanTutupAt?.toISOString() ?? null } });
  revalidatePath(`/acara/${slug}/pendaftaran`);
  return { ok: true };
}

export type Pratinjau = {
  ok: true;
  sheet: string;
  kolomHilang: string[];
  ditolak: { no: number; alasan: string }[];
  rencana: RencanaOrang[];
  ringkas: ReturnType<typeof ringkasRencana>;
} | { ok: false; error: string };

/** Baca xlsx respons form → rencana (belum menulis apa pun). */
export async function pratinjauImpor(slug: string, form: FormData): Promise<Pratinjau> {
  await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  const file = form.get("berkas");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih berkas xlsx." };
  if (file.size > 5_000_000) return { ok: false, error: "Berkas terlalu besar (maks 5 MB)." };
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: false });
  } catch {
    return { ok: false, error: "Berkas tidak terbaca sebagai xlsx." };
  }
  const pilihan = String(form.get("sheet") ?? "").trim();
  const namaSheet = pilihan && wb.SheetNames.includes(pilihan) ? pilihan : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[namaSheet], { defval: "" });
  const { baris, kolomHilang } = bacaBarisForm(rows);
  if (kolomHilang.length) return { ok: false, error: `Kolom tidak ditemukan di sheet "${namaSheet}": ${kolomHilang.join(", ")}. Sheet tersedia: ${wb.SheetNames.join(", ")}` };
  const [peta, telepon] = await Promise.all([petaCocokOrang(), teleponGuruByNamaKunci()]);
  const rencana = siapkanImporForm(baris, { ...peta, teleponByNamaKunci: telepon, normalisasiWa: normalizePhone });
  return {
    ok: true,
    sheet: namaSheet,
    kolomHilang,
    ditolak: baris.filter((b) => !b.baris).map((b) => ({ no: b.no, alasan: b.alasanTolak ?? "" })),
    rencana,
    ringkas: ringkasRencana(rencana),
  };
}

export type HasilTulis = { ok: true; orangBaru: number; pendaftaran: number; hpDilengkapi: number } | { ok: false; error: string };

/**
 * Tulis rencana. Idempoten: rencana yang sama dijalankan dua kali → nol orang
 * baru (semua sudah cocok_nama/cocok_wa pada pratinjau kedua). `ragu` tetap
 * dibuat sebagai orang baru ber-tanda perlu_review supaya ia punya QR besok;
 * penggabungan duplikat = pekerjaan Fase 2.
 */
export async function tulisImpor(slug: string, rencana: RencanaOrang[]): Promise<HasilTulis> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  if (!Array.isArray(rencana) || rencana.length > 5000) return { ok: false, error: "Rencana tidak valid." };
  const db = getDb();
  let orangBaru = 0, pendaftaran = 0, hpDilengkapi = 0;
  try {
    for (const r of rencana) {
      let orangId = r.orangId;
      if ((r.status === "cocok_wa" || r.status === "cocok_nama") && orangId) {
        const ada = await getOrangById(orangId);
        if (!ada) continue;
        if (!ada.wa && r.input.wa) {
          // Lengkapi HP hanya bila kosong dan nomor itu belum dipakai orang lain.
          const res = await db.update(orang).set({ wa: r.input.wa, updatedAt: new Date() }).where(and(eq(orang.id, orangId), isNull(orang.wa))).returning({ id: orang.id }).catch(() => []);
          if (res.length) hpDilengkapi++;
        }
      } else {
        const o = await insertOrang({
          nama: r.input.nama, gender: r.input.gender, wa: r.input.wa, programTeks: r.input.programTeks,
          sumber: "impor_xlsx", perluReview: r.status === "ragu",
        }).catch(async (e) => {
          // WA sudah dipakai (unik parsial) → simpan tanpa WA, tandai review.
          console.error("insert orang gagal, ulang tanpa wa", e instanceof Error ? e.message : e);
          return insertOrang({ nama: r.input.nama, gender: r.input.gender, wa: null, programTeks: r.input.programTeks, sumber: "impor_xlsx", perluReview: true });
        });
        orangId = o.id;
        orangBaru++;
      }
      await upsertPendaftaran({ acaraId: acara.id, orangId, konfirmasi: r.input.konfirmasi, alasan: r.input.alasan, sumber: "impor_xlsx" });
      pendaftaran++;
    }
  } catch (e) {
    console.error("tulis impor gagal", e);
    return { ok: false, error: `Gagal di tengah: ${orangBaru} orang baru, ${pendaftaran} pendaftaran sudah tertulis. Jalankan pratinjau lagi — yang sudah masuk akan terbaca "cocok".` };
  }
  await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "acara_pendaftaran", id: acara.id, ke: { orangBaru, pendaftaran, hpDilengkapi } });
  revalidatePath(`/acara/${slug}/pendaftaran`);
  revalidatePath(`/acara/${slug}/hadir`);
  return { ok: true, orangBaru, pendaftaran, hpDilengkapi };
}

/** Koreksi deklarasi diri di form: program (dari daftar pilihan) dan/atau gender. Dicatat di acara_log. */
export async function ubahOrang(slug: string, orangId: string, v: { programTeks?: string; gender?: string }): Promise<AksiResult> {
  const user = await requireStaff();
  const acara = await getAcaraBySlug(slug);
  if (!acara) return { ok: false, error: "Acara tidak ditemukan." };
  if (!isUuid(orangId)) return { ok: false, error: "Orang tidak ditemukan." };
  const o = await getOrangById(orangId);
  if (!o) return { ok: false, error: "Orang tidak ditemukan." };
  const set: { programTeks?: string; gender?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (v.programTeks !== undefined) {
    if (!(PROGRAM_PILIHAN as readonly string[]).includes(v.programTeks)) return { ok: false, error: "Program tidak dikenal." };
    set.programTeks = v.programTeks;
  }
  if (v.gender !== undefined) {
    if (v.gender !== "L" && v.gender !== "P") return { ok: false, error: "Gender tidak dikenal." };
    set.gender = v.gender;
  }
  try {
    await getDb().update(orang).set(set).where(eq(orang.id, orangId));
  } catch (e) {
    console.error("ubah orang gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
  await catatAksesStaff(user.sub, acara.id, "ubah", { tabel: "orang", id: orangId, dari: { programTeks: o.programTeks, gender: o.gender }, ke: set });
  revalidatePath(`/acara/${slug}/pendaftaran`);
  revalidatePath(`/acara/${slug}/hadir`);
  return { ok: true };
}
