"use server";

import { revalidatePath } from "next/cache";
import { catatAksesStaff, requireStaff } from "@/lib/acara/access";
import { isUuid } from "@/lib/acara/input";
import { hapusHadirLepas, tautkanKeAcara } from "@/lib/hadir/queries-lepas";

export type HasilTautkan = { ok: true; pesan: string } | { ok: false; error: string };

const JAM_RE = /^\d{2}:\d{2}$/;

/**
 * Pindahkan scan lepas satu tanggal ke satu kegiatan. Jam kosong/tidak sah
 * diperlakukan sebagai "tanpa batas di ujung itu", bukan galat — koordinator
 * yang mengosongkan satu ujung jelas bermaksud "semua sejak/sampai".
 */
export async function tautkan(
  acaraId: string,
  tanggal: string,
  dariJam: string,
  sampaiJam: string,
): Promise<HasilTautkan> {
  const user = await requireStaff();
  if (!isUuid(acaraId)) return { ok: false, error: "Pilih kegiatan tujuan." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { ok: false, error: "Tanggal tidak sah." };
  const dari = JAM_RE.test(dariJam) ? dariJam : null;
  const sampai = JAM_RE.test(sampaiJam) ? sampaiJam : null;
  try {
    const { dipindah, dilewati } = await tautkanKeAcara(acaraId, tanggal, { dariJam: dari, sampaiJam: sampai });
    if (dipindah === 0 && dilewati === 0) return { ok: false, error: "Tidak ada scan di rentang jam itu." };
    await catatAksesStaff(user.sub, acaraId, "ubah", { tabel: "hadir_lepas", id: tanggal, ke: { dipindah, dilewati, dari, sampai } });
    revalidatePath("/acara/hadir-lepas");
    revalidatePath("/acara");
    return {
      ok: true,
      pesan: dilewati > 0
        ? `${dipindah} dipindah, ${dilewati} sudah tercatat lewat pemindai kegiatan.`
        : `${dipindah} dipindah.`,
    };
  } catch (e) {
    console.error("tautkan scan lepas gagal", e);
    return { ok: false, error: "Gagal menyimpan." };
  }
}

export async function hapusBaris(id: string): Promise<HasilTautkan> {
  await requireStaff();
  if (!isUuid(id)) return { ok: false, error: "Baris tidak ditemukan." };
  const ada = await hapusHadirLepas(id);
  revalidatePath("/acara/hadir-lepas");
  revalidatePath("/acara");
  return ada ? { ok: true, pesan: "Baris dihapus." } : { ok: false, error: "Baris tidak ditemukan." };
}
