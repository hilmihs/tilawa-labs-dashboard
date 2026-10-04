"use server";

import { requireStaff } from "@/lib/acara/access";
import { tanggalScan } from "@/lib/hadir/lepas";
import { cariAtauBuatOrang } from "@/lib/hadir/orang-baru";
import { insertHadirLepasBatch } from "@/lib/hadir/queries-lepas";
import type { HasilTambah } from "../../[slug]/hadir/actions";

/**
 * Walk-in di pemindai global: buat/temukan orang, lalu catat kehadiran lepas
 * hari ini. Tidak ada pendaftaran yang bisa di-upsert — tanpa kegiatan tidak
 * ada `acara_pendaftaran`.
 */
export async function tambahOrangLepas(v: { nama: string; gender: string; programTeks: string; wa?: string | null }): Promise<HasilTambah> {
  const user = await requireStaff();
  const hasil = await cariAtauBuatOrang(v);
  if (!hasil.ok) return { ok: false, error: hasil.error };
  const o = hasil.orang;
  const waktu = new Date().toISOString();
  try {
    const ditulis = await insertHadirLepasBatch(
      [{ klienId: `tambah-lepas:${user.sub}:${Date.now()}`, orangId: o.id, waktu, metode: "manual", perangkatId: null, tanggal: tanggalScan(waktu) }],
      user.sub,
    );
    return { ok: true, orangId: o.id, nama: o.nama, kode: o.kodeQr, sudahAda: hasil.sudahAda, hadirBaru: ditulis.size > 0 };
  } catch (e) {
    console.error("tambah orang lepas gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
}
