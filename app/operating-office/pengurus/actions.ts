"use server";

import { revalidatePath } from "next/cache";
import { requireSuperUser } from "@/lib/auth/require";
import {
  aturAktif,
  cabutNfc,
  cariOrang,
  isiDaftarAwal,
  pasangNfc,
  pindahUrutan,
  tambahAnggota,
  tautkanAwal,
  type Hasil,
  type HasilIsiAwal,
  type OrangDicari,
} from "@/lib/kerja/anggota";

const UUID = /^[0-9a-f-]{36}$/i;

// Daftar anggota juga dibaca logbook & kiosk kehadiran.
function segarkan() {
  revalidatePath("/operating-office/pengurus");
  revalidatePath("/operating-office/kehadiran");
}

export async function isiAwalAksi(): Promise<HasilIsiAwal> {
  const u = await requireSuperUser();
  const h = await isiDaftarAwal(u.email);
  segarkan();
  return h;
}

export async function tautkanAwalAksi(indeks: number, orangId: string): Promise<Hasil> {
  const u = await requireSuperUser();
  if (!Number.isInteger(indeks) || (orangId !== "baru" && !UUID.test(orangId))) return { ok: false, error: "Pilihan tidak sah." };
  const h = await tautkanAwal(indeks, orangId, u.email);
  segarkan();
  return h;
}

export async function tambahAksi(orangId: string): Promise<Hasil> {
  const u = await requireSuperUser();
  if (!UUID.test(orangId)) return { ok: false, error: "Orang tidak sah." };
  const h = await tambahAnggota(orangId, u.email);
  segarkan();
  return h;
}

export async function aturAktifAksi(id: string, aktif: boolean): Promise<Hasil> {
  await requireSuperUser();
  if (!UUID.test(id)) return { ok: false, error: "Anggota tidak sah." };
  const h = await aturAktif(id, Boolean(aktif));
  segarkan();
  return h;
}

export async function pindahAksi(id: string, arah: "naik" | "turun"): Promise<Hasil> {
  await requireSuperUser();
  if (!UUID.test(id) || (arah !== "naik" && arah !== "turun")) return { ok: false, error: "Permintaan tidak sah." };
  const h = await pindahUrutan(id, arah);
  segarkan();
  return h;
}

export async function cariAksi(q: string): Promise<OrangDicari[]> {
  await requireSuperUser();
  return cariOrang(String(q ?? "").slice(0, 80));
}

export async function pasangNfcAksi(orangId: string, uid: string): Promise<Hasil> {
  await requireSuperUser();
  if (!UUID.test(orangId)) return { ok: false, error: "Orang tidak sah." };
  const h = await pasangNfc(orangId, String(uid ?? "").slice(0, 64));
  segarkan();
  return h;
}

export async function cabutNfcAksi(orangId: string): Promise<Hasil> {
  await requireSuperUser();
  if (!UUID.test(orangId)) return { ok: false, error: "Orang tidak sah." };
  const h = await cabutNfc(orangId);
  segarkan();
  return h;
}
