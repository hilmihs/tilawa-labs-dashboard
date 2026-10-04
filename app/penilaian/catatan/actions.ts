"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { requireStaff } from "@/lib/acara/access";
import { getDb } from "@/lib/db/client";
import { ASPEK } from "@/lib/penilaian/aspek";

/** Catatan cepat (design p3) → catatan_orang. Validasi ulang semua masukan. */
export async function simpanCatatanAction(input: {
  orangIds: string[];
  acaraId: string | null;
  jenis: string;
  aspek: string[];
  isi: string;
}): Promise<{ ok: boolean; pesan: string }> {
  const user = await requireStaff();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const orangIds = (Array.isArray(input.orangIds) ? input.orangIds : []).filter((x) => typeof x === "string" && uuid.test(x)).slice(0, 10);
  if (orangIds.length === 0) return { ok: false, pesan: "Pilih minimal satu orang." };
  const jenis = input.jenis === "kekurangan" ? "kekurangan" : "kelebihan";
  const aspek = (Array.isArray(input.aspek) ? input.aspek : []).filter((a) => (ASPEK as readonly string[]).includes(a));
  const isi = typeof input.isi === "string" ? input.isi.trim().slice(0, 2000) : "";
  if (isi.length < 5) return { ok: false, pesan: "Tulis catatannya dulu (minimal satu kalimat pendek)." };
  const acaraId = typeof input.acaraId === "string" && uuid.test(input.acaraId) ? input.acaraId : null;
  const db = getDb();
  const ada = (
    await db.execute(sql`select id from orang where id = any(array[${sql.join(orangIds.map((i) => sql`${i}`), sql`, `)}]::uuid[])`)
  ).rows as { id: string }[];
  if (ada.length === 0) return { ok: false, pesan: "Orang tidak ditemukan." };
  const aspekArr = aspek.length ? sql`array[${sql.join(aspek.map((a) => sql`${a}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;
  for (const o of ada) {
    await db.execute(sql`
      insert into catatan_orang (orang_id, acara_id, jenis, aspek, isi, oleh_staff_id)
      values (${o.id}, ${acaraId}, ${jenis}, ${aspekArr}, ${isi}, ${user.sub})`);
  }
  revalidatePath("/penilaian/catatan");
  return { ok: true, pesan: `Tersimpan ke CV ${ada.length} orang.` };
}
