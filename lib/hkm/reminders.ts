import { getDb } from "@/lib/db/client";
import { notificationLog } from "@/lib/db/schema";
import { sendWhatsApp } from "@/lib/integrations/kirimi";
import { getHkmDashboardData, type HkmParticipantRow } from "@/app/[program]/hkm/queries";

/** Indonesian WA nudge for an at-risk HKM participant. */
export function buildReminderMessage(r: HkmParticipantRow, targetPages: number): string {
  const kurang = Math.max(0, Math.round(targetPages - r.cumulativePages));
  const lines = [
    `Assalamu'alaikum ${r.nama} 🌙`,
    "",
    `Semoga istiqamah tilawahnya. Ringkasan progres HKM:`,
    `• Realisasi: ${r.cumulativePages} halaman (${r.cumulativeJuz} juz)`,
    `• Target saat ini: ${targetPages} halaman`,
    kurang > 0 ? `• Kekurangan: ${kurang} halaman` : `• Alhamdulillah sudah mencapai target`,
    "",
    `Yuk lanjutkan tilawahnya, sedikit demi sedikit setiap hari 💪`,
  ];
  return lines.join("\n");
}

export type ReminderResult = {
  ok: boolean;
  total: number;
  sent: number;
  failed: number;
  skippedNoPhone: number;
  error?: string;
};

/**
 * Send WA reminders to at-risk participants (those with a phone). Each send is
 * logged to notification_log. kirimi.ts no-ops safely when unconfigured, so a
 * failed/absent gateway is reported, not thrown.
 */
export async function sendHkmReminders(programSlug: string): Promise<ReminderResult> {
  const data = await getHkmDashboardData(programSlug);
  if (!data) return { ok: false, total: 0, sent: 0, failed: 0, skippedNoPhone: 0, error: "program HKM tidak ditemukan" };

  const db = getDb();
  const targets = data.atRisk;
  let sent = 0;
  let failed = 0;
  let skippedNoPhone = 0;

  for (const r of targets) {
    if (!r.phone) {
      skippedNoPhone += 1;
      continue;
    }
    const message = buildReminderMessage(r, data.target.targetPages);
    const res = await sendWhatsApp(r.phone, message);
    await db.insert(notificationLog).values({
      channel: "kirimi_wa",
      recipient: r.phone,
      payload: { programSlug, participantId: r.participantId, nama: r.nama, reasons: r.riskReasons, message },
      kirimiMessageId: res.ok ? res.messageId : null,
      status: res.ok ? "sent" : "failed",
    });
    if (res.ok) sent += 1;
    else failed += 1;
  }

  return { ok: true, total: targets.length, sent, failed, skippedNoPhone };
}
