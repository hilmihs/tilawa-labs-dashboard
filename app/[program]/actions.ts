"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveProgramAccess } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { runTilawahSyncForSlug } from "@/lib/sync/tilawah-sync";
import { runHkmSyncForSlug } from "@/lib/sync/hkm-sync";
import { isSyncRunning } from "@/lib/sync/last-sync";

export type TriggerSyncResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * On-demand "Refresh sekarang": sync one program from tilawah now. Gated to a
 * user with access to the program, and guarded so a click can't stack on top of
 * an in-progress sync (cron / another click / another replica).
 *
 * `deep` turns off the fingerprint skip for this run. The normal sync only
 * re-reads a halaqah whose attendance fingerprint moved, so an upstream edit
 * that touches no presensi — swapping the per-meeting teacher after a handover
 * or a badal, renaming a meeting — is invisible to it, and the run still
 * reports success. Until now the only cures were waiting up to 20 hours for the
 * scheduled full sweep or clearing `halaqah_sync.absensi_fingerprint` by hand
 * over a psql shell on the server. This is that second cure, minus the shell.
 *
 * It costs one detail request per halaqah in the program, so it stays a
 * deliberate second button rather than the default.
 */
export async function triggerSync(
  programSlug: string,
  deep = false,
): Promise<TriggerSyncResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir, silakan login ulang." };

  const program = await resolveProgramAccess(user, programSlug);
  if (!program) return { ok: false, error: "Akses ditolak untuk program ini." };

  if (await isSyncRunning(program.id)) {
    return { ok: false, error: "Sedang menyinkron, tunggu sebentar…" };
  }

  // HKM programs pull from cms.example.com via a separate engine.
  // HKM and its paired presensi program are one program to the user, so one
  // click refreshes both: presensi (tilawah) first, because the setoran match
  // reads that roster, then setoran (berkah).
  if (program.dataSourceType === "berkah_api") {
    const { presensiSlug } = getProgramConfig(program);
    let presensiMsg = "";
    if (presensiSlug && presensiSlug !== programSlug) {
      const presensiProgram = await resolveProgramAccess(user, presensiSlug);
      if (presensiProgram && !(await isSyncRunning(presensiProgram.id))) {
        const p = await runTilawahSyncForSlug(presensiSlug, { forceSweep: deep });
        if (p && !p.ok) return { ok: false, error: `Presensi: ${p.error ?? "sync gagal."}` };
        if (p) {
          presensiMsg = ` Presensi: ${p.studentCount} peserta, ${p.attendanceCount} presensi.`;
          revalidatePath(`/${presensiSlug}/dashboard`);
          revalidatePath(`/${presensiSlug}/inbox`);
        }
      }
    }
    const result = await runHkmSyncForSlug(programSlug);
    if (!result) return { ok: false, error: "Program ini tidak tersambung ke HKM CMS." };
    if (!result.ok) return { ok: false, error: result.error ?? "Sync gagal." };
    revalidatePath(`/${programSlug}/dashboard`);
    return {
      ok: true,
      message: `Tersinkron: ${result.matchedParticipants} peserta cocok, ${result.readingCount} baris tilawah, ${result.snapshotCount} snapshot.${presensiMsg}`,
    };
  }

  const result = await runTilawahSyncForSlug(programSlug, { forceSweep: deep });
  if (!result) return { ok: false, error: "Program ini tidak tersambung ke tilawah." };
  if (!result.ok) return { ok: false, error: result.error ?? "Sync gagal." };

  revalidatePath(`/${programSlug}/dashboard`);
  revalidatePath(`/${programSlug}/inbox`);
  return {
    ok: true,
    message: `${deep ? "Tersinkron penuh" : "Tersinkron"}: ${result.studentCount} peserta, ${result.jadwalCount} pertemuan, ${result.attendanceCount} presensi.`,
  };
}
