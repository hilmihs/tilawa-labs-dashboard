"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/acara/access";
import { verifikasiRiwayat } from "@/lib/orang/riwayat";

/** Terima / tolak isian riwayat mandiri. Dipanggil dari form (tanpa JS pun jalan). */
export async function verifikasiAction(form: FormData): Promise<void> {
  const user = await requireStaff();
  const status = form.get("status") === "ditolak" ? "ditolak" : "terverifikasi";
  const ids = form.getAll("id").map(String);
  await verifikasiRiwayat(ids, status, user.sub);
  revalidatePath("/penilaian/riwayat");
}
