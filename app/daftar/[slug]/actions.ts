"use server";

import { redirect } from "next/navigation";
import { ipHash } from "@/lib/acara/access";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { daftarkan, validasiDaftar } from "@/lib/hadir/daftar";

export type StatusDaftar = { error?: string; nilai?: Record<string, string> };

// Batas per alamat: 30/jam. Satu kampus/masjid bisa satu NAT — puluhan, bukan satuan.
const BATAS = 30;
const JENDELA_MS = 60 * 60_000;
const hitung = new Map<string, number[]>();
function lewatBatas(kunci: string): boolean {
  const now = Date.now();
  const arr = (hitung.get(kunci) ?? []).filter((t) => now - t < JENDELA_MS);
  if (arr.length >= BATAS) { hitung.set(kunci, arr); return true; }
  arr.push(now); hitung.set(kunci, arr);
  return false;
}

export async function kirimDaftar(slug: string, _prev: StatusDaftar, form: FormData): Promise<StatusDaftar> {
  const acara = await getAcaraBySlug(slug);
  if (!acara || !acara.terimaPendaftaran) return { error: "Pendaftaran untuk acara ini sedang ditutup." };
  if (String(form.get("hp_website") ?? "") !== "") return { error: "Gagal." }; // honeypot
  const nilai: Record<string, string> = {};
  for (const k of ["nama", "gender", "wa", "program", "konfirmasi", "alasan"]) nilai[k] = String(form.get(k) ?? "");
  const v = validasiDaftar(nilai);
  if (!v.ok) return { error: v.error, nilai };
  const ip = (await ipHash()) ?? "tanpa-ip";
  if (lewatBatas(ip)) return { error: "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.", nilai };
  let kode: string;
  try {
    const r = await daftarkan(acara.id, v.input, "situs");
    if (!r.ok) return { error: r.error, nilai };
    kode = r.kode;
  } catch (e) {
    console.error("daftar gagal", e);
    return { error: "Gagal menyimpan. Coba lagi.", nilai };
  }
  redirect(`/h/${kode}?baru=1`);
}
