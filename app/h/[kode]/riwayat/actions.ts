"use server";

import { revalidatePath } from "next/cache";
import { getOrangByKode } from "@/lib/hadir/queries";
import { ekstrakKode } from "@/lib/hadir/kode";
import { simpanRiwayatMandiri } from "@/lib/orang/riwayat";

/** Simpan isian riwayat mandiri. Kode QR = kredensial (pola sama dengan /h/[kode]); semua entri menunggu verifikasi. */
export async function simpanRiwayatAction(
  kodeMentah: string,
  entri: { tahun: number; kegiatan: string; peran: string }[],
): Promise<{ ok: boolean; pesan: string }> {
  const kode = ekstrakKode(kodeMentah);
  const o = kode ? await getOrangByKode(kode) : null;
  if (!o) return { ok: false, pesan: "Kode tidak dikenal." };
  if (!Array.isArray(entri)) return { ok: false, pesan: "Isian tidak sah." };
  const h = await simpanRiwayatMandiri(
    o.id,
    entri.map((e) => ({ tahun: Number(e?.tahun), kegiatan: String(e?.kegiatan ?? "").trim(), peran: String(e?.peran ?? "") })),
  );
  revalidatePath(`/h/${o.kodeQr}/riwayat`);
  return { ok: true, pesan: `${h.disimpan} kegiatan tersimpan — menunggu verifikasi tim kaderisasi. Jazakumullahu khairan.` };
}
