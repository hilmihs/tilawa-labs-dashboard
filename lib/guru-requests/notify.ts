import { getDb } from "@/lib/db/client";
import { notificationLog } from "@/lib/db/schema";
import { sendWhatsApp } from "@/lib/integrations/kirimi";
import { waLink } from "@/lib/wa";
import { signApprovalToken } from "@/lib/auth/approval-token";

function baseUrl(): string {
  return (process.env.APP_BASE_URL || "https://tilawa-labs-dashboard.vercel.app").replace(/\/$/, "");
}

async function logSend(recipient: string, payload: object, res: Awaited<ReturnType<typeof sendWhatsApp>>) {
  try {
    await getDb()
      .insert(notificationLog)
      .values({
        recipient,
        payload,
        kirimiMessageId: res.ok ? res.messageId : null,
        status: res.ok ? "sent" : "failed",
      });
  } catch {
    // logging is best-effort; never block the request flow
  }
}

export type CoordinatorNotice = {
  rid: string;
  coordinatorPhone: string;
  guruName: string;
  halaqahName: string;
  meetingLabel: string;
  changeSummary: string;
};

/** WA the coordinator with an approval link. Returns a manual wa.me fallback. */
export async function notifyCoordinatorOfRequest(
  n: CoordinatorNotice,
): Promise<{ sent: boolean; reason?: string; link: string | null }> {
  const token = await signApprovalToken({ rid: n.rid });
  const url = `${baseUrl()}/persetujuan/${token}`;
  const message =
    `*Pengajuan perubahan pertemuan*\n\n` +
    `Guru: ${n.guruName}\n` +
    `Halaqah: ${n.halaqahName}\n` +
    `Pertemuan: ${n.meetingLabel}\n` +
    `Perubahan: ${n.changeSummary}\n\n` +
    `Setujui / tolak di sini:\n${url}`;

  const res = await sendWhatsApp(n.coordinatorPhone, message);
  await logSend(n.coordinatorPhone, { kind: "coordinator_request", rid: n.rid, url }, res);
  return {
    sent: res.ok,
    reason: res.ok ? undefined : res.reason,
    link: waLink(n.coordinatorPhone, message),
  };
}

export type GuruDecisionNotice = {
  guruPhone: string | null;
  guruName: string;
  halaqahName: string;
  meetingLabel: string;
  changeSummary: string;
  approved: boolean;
  applyError?: string | null;
};

/** WA the requesting guru the coordinator's decision (best-effort). */
export async function notifyGuruOfDecision(n: GuruDecisionNotice): Promise<void> {
  if (!n.guruPhone) return;
  const head = n.approved
    ? n.applyError
      ? "❗ Pengajuan disetujui, tapi gagal diterapkan ke sistem"
      : "✅ Pengajuan Anda disetujui & sudah diterapkan"
    : "❌ Pengajuan Anda ditolak koordinator";
  const message =
    `${head}\n\n` +
    `Halaqah: ${n.halaqahName}\n` +
    `Pertemuan: ${n.meetingLabel}\n` +
    `Perubahan: ${n.changeSummary}` +
    (n.applyError ? `\n\nKeterangan: ${n.applyError}` : "");

  const res = await sendWhatsApp(n.guruPhone, message);
  await logSend(n.guruPhone, { kind: "guru_decision", approved: n.approved }, res);
}
