/**
 * Pendaftaran mandiri (halaman /daftar/[slug] sekarang; situs Vercel terpisah
 * lewat /api/daftar nanti memakai fungsi yang sama). WA adalah kunci identitas:
 * nomor yang sudah ada → orang itu yang dipakai, TANPA membocorkan namanya
 * (yang salah ketik nomor orang lain hanya melihat halaman QR orang itu, sama
 * seperti kalau ia menemukan kartunya — risiko yang diterima pemilik).
 */
import { normalizePhone } from "@/lib/wa";
import { getOrangByWa, insertOrang, upsertPendaftaran } from "./queries";
import type { Konfirmasi } from "./view-model";
import { PROGRAM_PILIHAN } from "./program";


export type InputDaftar = {
  nama: string;
  gender: "L" | "P";
  wa: string;
  programTeks: string;
  konfirmasi: Konfirmasi;
  alasan: string | null;
};

export type HasilDaftar = { ok: true; kode: string; baru: boolean } | { ok: false; error: string };

export function validasiDaftar(raw: Record<string, unknown>): { ok: true; input: InputDaftar } | { ok: false; error: string } {
  const nama = String(raw.nama ?? "").trim().replace(/\s+/g, " ");
  if (nama.length < 3 || nama.length > 120) return { ok: false, error: "Nama minimal 3 huruf." };
  const gender = raw.gender === "P" ? "P" : raw.gender === "L" ? "L" : null;
  if (!gender) return { ok: false, error: "Pilih jenis kelamin." };
  const wa = normalizePhone(String(raw.wa ?? ""));
  if (!wa || !/^628\d{7,11}$/.test(wa)) return { ok: false, error: "Nomor WhatsApp tidak valid (contoh 0812xxxxxxx)." };
  const programTeks = String(raw.program ?? "").trim();
  if (!(PROGRAM_PILIHAN as readonly string[]).includes(programTeks)) return { ok: false, error: "Pilih program." };
  const k = String(raw.konfirmasi ?? "");
  const konfirmasi: Konfirmasi = k === "bisa" ? "bisa" : k === "belum_bisa" ? "belum_bisa" : null;
  const alasan = String(raw.alasan ?? "").trim().slice(0, 300) || null;
  return { ok: true, input: { nama, gender, wa, programTeks, konfirmasi, alasan } };
}

export async function daftarkan(acaraId: string, input: InputDaftar, sumber: "situs" | "dashboard"): Promise<HasilDaftar> {
  let o = await getOrangByWa(input.wa);
  let baru = false;
  if (!o) {
    o = await insertOrang({ nama: input.nama, gender: input.gender, wa: input.wa, programTeks: input.programTeks, sumber });
    baru = true;
  }
  await upsertPendaftaran({ acaraId, orangId: o.id, konfirmasi: input.konfirmasi, alasan: input.alasan, sumber });
  return { ok: true, kode: o.kodeQr, baru };
}
