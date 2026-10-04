"use server";

import { headers } from "next/headers";
import { putuskanAbsen, statusHari, type AlasanTolak, type JenisAbsen } from "@/lib/kantor/aturan";
import { absenHari, catatAbsen, getKantor, getPetugasByToken } from "@/lib/kantor/queries";
import { terlambat } from "@/lib/kantor/izin";
import { tokenSah } from "@/lib/kantor/token";
import { jakartaDate, jamWib } from "@/lib/time/jakarta";

export type HasilAbsen =
  | { ok: true; jenis: JenisAbsen; jam: string; terlambat: boolean }
  | { ok: false; alasan: AlasanTolak | "tautan-tidak-sah"; jarakM?: number };

export async function absen(
  token: string,
  jenis: JenisAbsen,
  pos: { lat: number; lng: number; akurasi: number },
): Promise<HasilAbsen> {
  if (!tokenSah(token) || (jenis !== "masuk" && jenis !== "keluar")) return { ok: false, alasan: "tautan-tidak-sah" };
  const petugas = await getPetugasByToken(token);
  if (!petugas) return { ok: false, alasan: "tautan-tidak-sah" };

  const sekarang = new Date(); // jam server, bukan jam HP
  const tanggal = jakartaDate(sekarang);
  const [kantor, rows] = await Promise.all([getKantor(), absenHari(petugas.id, tanggal)]);
  const k = putuskanAbsen(jenis, kantor, pos, statusHari(rows));
  if (!k.ok) {
    console.warn(`[kantor] tolak ${petugas.namaLatin} ${jenis}: ${k.alasan}${k.jarakM != null ? ` ${Math.round(k.jarakM)} m` : ""}`);
    return { ok: false, alasan: k.alasan, jarakM: k.jarakM };
  }

  const baris = await catatAbsen({
    petugasId: petugas.id,
    jenis,
    tanggal,
    waktu: sekarang,
    lat: pos.lat,
    lng: pos.lng,
    akurasiM: pos.akurasi,
    jarakM: k.jarakM,
    userAgent: (await headers()).get("user-agent"),
  });
  // Kalah balapan dengan tekan kedua yang berbarengan: barisnya sudah ada.
  if (!baris) return { ok: false, alasan: jenis === "masuk" ? "sudah-masuk" : "sudah-keluar" };
  const jam = jamWib(sekarang);
  return { ok: true, jenis, jam, terlambat: jenis === "masuk" && terlambat(jam, petugas.jamMasuk) };
}
