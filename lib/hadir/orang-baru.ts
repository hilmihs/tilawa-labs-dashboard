/**
 * Cari-atau-buat orang dari input walk-in. Dipisah dari
 * app/acara/[slug]/hadir/actions.ts supaya pemindai global (yang tidak punya
 * acara) memakai aturan pencocokan yang SAMA. Dua salinan aturan ini akan
 * pelan-pelan berbeda, dan yang satu akan membuat duplikat orang yang tidak
 * dibuat yang lain.
 *
 * Urutan: WA (kalau diisi) → nama_kunci yang tepat satu kandidat → buat baru.
 */
import { normalizePhone } from "@/lib/wa";
import { namaKunci } from "./nama";
import { PROGRAM_PILIHAN } from "./program";
import { getOrangById, getOrangByWa, insertOrang, petaCocokOrang, type OrangRow } from "./queries";

export type InputOrangBaru = { nama: string; gender: string; programTeks: string; wa?: string | null };
export type HasilCariAtauBuat = { ok: true; orang: OrangRow; sudahAda: boolean } | { ok: false; error: string };

export async function cariAtauBuatOrang(v: InputOrangBaru): Promise<HasilCariAtauBuat> {
  const nama = String(v.nama ?? "").trim().replace(/\s+/g, " ");
  if (nama.length < 3 || nama.length > 120) return { ok: false, error: "Nama minimal 3 huruf." };
  const gender = v.gender === "P" ? "P" : v.gender === "L" ? "L" : null;
  if (!gender) return { ok: false, error: "Pilih I/A." };
  if (!(PROGRAM_PILIHAN as readonly string[]).includes(v.programTeks)) return { ok: false, error: "Pilih program." };
  const wa = v.wa ? normalizePhone(v.wa) : null;
  if (v.wa && !wa) return { ok: false, error: "Nomor WA tidak valid." };

  let o = wa ? await getOrangByWa(wa) : null;
  let sudahAda = Boolean(o);
  if (!o) {
    const kunci = namaKunci(nama);
    const { byNamaKunci } = await petaCocokOrang();
    const kandidat = byNamaKunci.get(kunci) ?? [];
    // Tepat satu kandidat → orang itu. Dua atau lebih → jangan menebak, buat baru
    // dan biarkan direktori orang yang menggabungkan.
    if (kandidat.length === 1) { o = await getOrangById(kandidat[0]); sudahAda = Boolean(o); }
  }
  if (!o) o = await insertOrang({ nama, gender, wa, programTeks: v.programTeks, sumber: "dashboard" });
  return { ok: true, orang: o, sudahAda };
}
