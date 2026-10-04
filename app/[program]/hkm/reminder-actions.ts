"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveProgramAccess } from "@/lib/programs/resolve";
import { sendHkmReminders, type ReminderResult } from "@/lib/hkm/reminders";

export type RemindActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Bulk-send WA reminders to at-risk HKM participants. User-initiated (button). */
export async function triggerHkmReminders(programSlug: string): Promise<RemindActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sesi berakhir, silakan login ulang." };

  const program = await resolveProgramAccess(user, programSlug);
  if (!program) return { ok: false, error: "Akses ditolak untuk program ini." };
  if (program.dataSourceType !== "berkah_api") return { ok: false, error: "Bukan program HKM." };

  const r: ReminderResult = await sendHkmReminders(programSlug);
  if (!r.ok) return { ok: false, error: r.error ?? "Gagal mengirim." };
  return {
    ok: true,
    message: `${r.sent} terkirim, ${r.failed} gagal, ${r.skippedNoPhone} tanpa nomor (dari ${r.total} at-risk).`,
  };
}
