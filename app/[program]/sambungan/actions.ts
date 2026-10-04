"use server";

/**
 * Aksi halaman Sambungan Akun. Tiap aksi adalah satu langkah yang dulu berarti
 * membuka terminal:
 *
 *   cariAkun          scripts/hkm-probe-nafi-akun.ts
 *   sambungkanAkun    scripts/hkm-sambung-*.ts (edit master + tarik ulang)
 *   aktifkanSetoran   scripts/berkah-set-internal.ts
 *   syncSekarang      pnpm sync:hkm
 *
 * Gerbangnya `resolveProgramAccess`, sama seperti reminder-actions.ts: siapa pun
 * yang boleh membuka program ini boleh membereskan sambungannya (koordinator
 * HKM tak perlu menunggu admin). Semua perubahan tercatat di audit log lewat
 * service ops, dan tak satu pun merusak data: menyambung hanya memindah alamat
 * email di baris master, mengaktifkan hanya membalik satu flag — keduanya bisa
 * dikembalikan lewat halaman yang sama.
 */
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveProgramAccess } from "@/lib/programs/resolve";
import { editHkmParticipant, syncProgram } from "@/lib/admin/service";
import { searchNafiAccounts, setNafiInternal, type NafiAccount } from "@/lib/hkm/nafi-accounts";

export type ActionResult<T = void> = { ok: true; data: T; message: string } | { ok: false; error: string };

/** Gerbang bersama: sesi valid + program HKM yang boleh diakses user ini. */
async function gate(programSlug: string): Promise<{ actor: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesi berakhir, silakan login ulang." };
  const program = await resolveProgramAccess(user, programSlug);
  if (!program) return { error: "Akses ditolak untuk program ini." };
  if (program.dataSourceType !== "berkah_api") return { error: "Bukan program setoran (HKM)." };
  return { actor: user.email };
}

export async function cariAkun(programSlug: string, query: string): Promise<ActionResult<NafiAccount[]>> {
  const g = await gate(programSlug);
  if ("error" in g) return { ok: false, error: g.error };
  if (query.trim().length < 3) return { ok: false, error: "Ketik minimal 3 huruf (nama, email, atau nomor HP)." };

  try {
    const akun = await searchNafiAccounts(query);
    return {
      ok: true,
      data: akun,
      message: akun.length ? `${akun.length} akun ditemukan.` : "Tidak ada akun yang cocok di the partner system.",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menghubungi the partner system." };
  }
}

/**
 * Sambungkan satu peserta ke akun the partner system pilihan, lalu tarik ulang datanya.
 *
 * Tiga langkah dalam satu tombol karena ketiganya harus terjadi bersama: alamat
 * email di baris master dipindah, akunnya dinyalakan kalau masih eksternal
 * (kalau tidak, sync tetap tak akan melihatnya), lalu sync memasang
 * `berkah_user_id` dan menarik riwayat bacanya. Sengaja tidak menebak id di
 * sini — `editHkmParticipant` mengosongkan tautan lama dan sync yang memasang
 * ulang dari email, jadi satu sumber kebenaran saja.
 */
export async function sambungkanAkun(
  programSlug: string,
  input: { participantId: string; email: string; berkahUserId: number },
): Promise<ActionResult<{ diaktifkan: boolean }>> {
  const g = await gate(programSlug);
  if ("error" in g) return { ok: false, error: g.error };

  const edit = await editHkmParticipant(
    { programSlug, participantId: input.participantId, newEmail: input.email, note: `Disambungkan ke akun the partner system #${input.berkahUserId} lewat halaman Sambungan.` },
    g.actor,
  );
  if (!edit.ok) return { ok: false, error: edit.error };

  const flag = await setNafiInternal(input.berkahUserId, 1);
  if (!flag.ok) {
    return {
      ok: false,
      error: `Email sudah dipindah, tapi akunnya gagal diaktifkan: ${flag.error ?? "tidak diketahui"}. Coba tombol "Aktifkan" pada barisnya.`,
    };
  }

  const sync = await syncProgram({ slug: programSlug }, g.actor);
  revalidatePath(`/${programSlug}/sambungan`);
  if (!sync.ok) return { ok: false, error: `Sambungan tersimpan, tapi tarik data gagal: ${sync.error}` };

  return {
    ok: true,
    data: { diaktifkan: flag.internal },
    message: sync.data.skipped
      ? "Sambungan tersimpan. Sync sedang berjalan — setorannya muncul setelah sync selesai."
      : "Sambungan tersimpan dan data setorannya sudah ditarik.",
  };
}

/** Nyalakan flag internal sebuah akun, tanpa menyentuh baris master. */
export async function aktifkanSetoran(
  programSlug: string,
  input: { berkahUserId: number; matikan?: boolean },
): Promise<ActionResult<{ internal: boolean }>> {
  const g = await gate(programSlug);
  if ("error" in g) return { ok: false, error: g.error };

  const target = input.matikan ? 0 : 1;
  const res = await setNafiInternal(input.berkahUserId, target);
  if (!res.ok) return { ok: false, error: res.error ?? "the partner system menolak perubahan." };

  const sync = target === 1 ? await syncProgram({ slug: programSlug }, g.actor) : null;
  revalidatePath(`/${programSlug}/sambungan`);
  return {
    ok: true,
    data: { internal: res.internal },
    message:
      target === 0
        ? "Akun dinonaktifkan dari tarikan setoran."
        : sync && !sync.ok
          ? "Akun diaktifkan. Tarik data gagal — coba tombol Sync sekarang."
          : "Akun diaktifkan dan setorannya sudah ditarik.",
  };
}

/** Cari akun untuk sebuah baris master lewat emailnya sendiri, lalu aktifkan. */
export async function aktifkanLewatEmail(
  programSlug: string,
  input: { email: string },
): Promise<ActionResult<{ berkahUserId: number }>> {
  const g = await gate(programSlug);
  if ("error" in g) return { ok: false, error: g.error };

  let kandidat: NafiAccount[];
  try {
    kandidat = await searchNafiAccounts(input.email);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menghubungi the partner system." };
  }

  const cocok = kandidat.find((a) => (a.email ?? "").toLowerCase() === input.email.trim().toLowerCase());
  if (!cocok)
    return {
      ok: false,
      error: `Tidak ada akun the partner system beralamat ${input.email}. Pakai "Cari akun" untuk mencari lewat nama atau nomor HP.`,
    };

  const res = await aktifkanSetoran(programSlug, { berkahUserId: cocok.id });
  return res.ok ? { ok: true, data: { berkahUserId: cocok.id }, message: res.message } : res;
}

export async function syncSekarang(programSlug: string): Promise<ActionResult<{ skipped: boolean }>> {
  const g = await gate(programSlug);
  if ("error" in g) return { ok: false, error: g.error };

  const res = await syncProgram({ slug: programSlug }, g.actor);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(`/${programSlug}/sambungan`);
  return {
    ok: true,
    data: { skipped: res.data.skipped },
    message: res.data.skipped ? "Sync sudah berjalan, ditunggu saja." : "Data setoran selesai ditarik.",
  };
}
