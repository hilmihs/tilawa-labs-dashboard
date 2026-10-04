"use server";

import { revalidatePath } from "next/cache";
import { requireSuperUser } from "@/lib/auth/require";
import { getKantor } from "@/lib/kantor/queries";
import { tanggalSah } from "@/lib/kerja/logbook-view";
import { batasKantor, setelSel } from "@/lib/kerja/queries";
import { sesiDariJam } from "@/lib/kerja/sesi";
import { LABEL_SESI, SESI, type Sesi } from "@/lib/kerja/types";
import { jakartaDate } from "@/lib/time/jakarta";

export type Hasil = { ok: true } | { ok: false; error: string };

const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Isi/ubah/kosongkan satu sel logbook dari layar admin (lupa kartu, koreksi).
 * `jam` null = kosongkan. Jam harus jatuh di sesi yang sama dengan kolomnya —
 * kalau tidak, logbook akan memuat "16.00" di kolom Pagi dan tak sama lagi
 * dengan aturan kiosk.
 */
export async function ubahSel(v: {
  orangId: string;
  tanggal: string;
  sesi: Sesi;
  jam: string | null;
  catatan?: string | null;
}): Promise<Hasil> {
  const u = await requireSuperUser();
  if (!/^[0-9a-f-]{36}$/i.test(v.orangId)) return { ok: false, error: "Anggota tidak dikenal." };
  if (!(SESI as readonly string[]).includes(v.sesi)) return { ok: false, error: "Sesi tidak sah." };
  if (!tanggalSah(v.tanggal)) return { ok: false, error: "Tanggal tidak sah." };
  if (v.tanggal > jakartaDate()) return { ok: false, error: "Tanggal belum tiba — sel masa depan tidak bisa diisi." };
  const jam = v.jam?.trim() ? v.jam.trim().replace(".", ":").slice(0, 5) : null;
  if (jam !== null) {
    if (!JAM.test(jam)) return { ok: false, error: "Jam tidak sah — tulis HH:MM, mis. 16:00." };
    const k = await getKantor();
    const s = sesiDariJam(jam, batasKantor(k));
    if (s !== v.sesi)
      return {
        ok: false,
        error: s
          ? `Jam ${jam} masuk sesi ${LABEL_SESI[s]}, bukan ${LABEL_SESI[v.sesi]}.`
          : `Jam ${jam} di luar semua sesi (${k.sesiPagiMulai}–${k.sesiSelesai}).`,
      };
  }
  const catatan = v.catatan?.trim().slice(0, 300) || null;
  await setelSel({ orangId: v.orangId, tanggal: v.tanggal, sesi: v.sesi, jam, catatan, oleh: u.email });
  revalidatePath("/operating-office/kehadiran");
  return { ok: true };
}
