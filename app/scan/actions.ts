"use server";

import { requireStaff } from "@/lib/acara/access";
import { catatTap } from "@/lib/kerja/queries";
import type { InputTap, JawabanTap, MetodeTap } from "@/lib/kerja/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METODE: readonly MetodeTap[] = ["qr", "nfc", "ketik"];

/**
 * Satu tap dari kiosk (langsung atau dari antrean offline). Idempoten per
 * `klienId` di catatTap, jadi kirim ulang yang sama aman. Masukan ditolak
 * dengan Error — kiosk menganggapnya galat permanen, bukan "coba lagi".
 */
export async function kirimTap(input: InputTap): Promise<JawabanTap> {
  const user = await requireStaff();
  const v = input as Partial<Record<keyof InputTap, unknown>> | null;
  if (!v || typeof v !== "object") throw new Error("Tap tidak sah.");
  if (typeof v.klienId !== "string" || !UUID.test(v.klienId)) throw new Error("klienId tidak sah.");
  if (typeof v.metode !== "string" || !METODE.includes(v.metode as MetodeTap)) throw new Error("Metode tidak sah.");
  const dibaca = typeof v.dibaca === "string" ? v.dibaca.trim() : "";
  if (!dibaca || dibaca.length > 200) throw new Error("Isi kartu kosong atau terlalu panjang.");
  // Jam perangkat yang rusak tidak menggagalkan tap — catatTap jatuh ke jam server.
  const waktu = typeof v.waktu === "string" ? v.waktu.slice(0, 40) : "";
  return catatTap({ klienId: v.klienId.toLowerCase(), dibaca, metode: v.metode as MetodeTap, waktu }, { email: user.email, staffId: user.sub });
}
