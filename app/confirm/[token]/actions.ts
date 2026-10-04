"use server";

import { verifyGapToken } from "@/lib/auth/gap-token";
import {
  getHalaqahConfirmView,
  upsertConfirmation,
  type ConfirmStatus,
} from "@/lib/confirmations/queries";
import { pushMeetingsTaughtToTilawah } from "@/lib/sync/push-meeting-taught";

const VALID_STATUS: ConfirmStatus[] = [
  "tidak_mengajar",
  "mengajar_belum_input",
  "mengajar_kendala_sistem",
];
const VALID_REASONS = ["izin", "sakit", "badal", "libur", "kegiatan", "lainnya"];

export type SubmitResult = { ok: true; saved: number } | { ok: false; error: string };

export async function submitConfirmations(
  token: string,
  formData: FormData,
): Promise<SubmitResult> {
  const claims = await verifyGapToken(token);
  if (!claims) return { ok: false, error: "Link tidak valid atau sudah kedaluwarsa." };

  // Re-fetch the halaqah's allowed meetings server-side; only these jadwal ids
  // may be written — the client cannot inject arbitrary meetings.
  const view = await getHalaqahConfirmView(claims.pid, claims.hid);
  const allowed = new Map(view.meetings.map((m) => [m.jadwalId, m]));

  let saved = 0;
  const taughtDespiteSystem: number[] = [];
  for (const m of view.meetings) {
    const raw = formData.get(`status_${m.jadwalId}`);
    const status = typeof raw === "string" ? raw : "";
    if (!VALID_STATUS.includes(status as ConfirmStatus)) continue; // unanswered → skip

    const meeting = allowed.get(m.jadwalId)!;
    let reasonCode: string | null = null;
    let reasonText: string | null = null;
    if (status === "tidak_mengajar") {
      const rc = formData.get(`reasonCode_${m.jadwalId}`);
      reasonCode = typeof rc === "string" && VALID_REASONS.includes(rc) ? rc : "lainnya";
      const rt = formData.get(`reasonText_${m.jadwalId}`);
      reasonText = typeof rt === "string" && rt.trim() ? rt.trim().slice(0, 500) : null;
    } else if (status === "mengajar_kendala_sistem") {
      // Gate: this status counts the meeting as taught, so require the teacher's
      // attestation. Without it, treat the answer as unanswered (skip) — the
      // server is the authority, not just the disabled submit button.
      if (formData.get(`attest_${m.jadwalId}`) !== "on") continue;
      const kt = formData.get(`kendalaText_${m.jadwalId}`);
      reasonText = typeof kt === "string" && kt.trim() ? kt.trim().slice(0, 500) : null;
    }

    await upsertConfirmation(
      claims.pid,
      claims.hid,
      {
        jadwalId: meeting.jadwalId,
        order: meeting.order,
        date: meeting.date,
        guruId: meeting.guruId ?? claims.gid,
        status: status as ConfirmStatus,
        reasonCode,
        reasonText,
      },
      null,
    );
    if (status === "mengajar_kendala_sistem") taughtDespiteSystem.push(meeting.jadwalId);
    saved++;
  }

  // Best-effort: ask tilawah to register these meetings as taught. Fail-soft —
  // never affects the confirmation that was already saved locally. If it (and the
  // next sync) succeed, the report switches to the synced status automatically.
  if (taughtDespiteSystem.length > 0) {
    try {
      await pushMeetingsTaughtToTilawah(claims.pid, taughtDespiteSystem);
    } catch {
      // swallow — local confirmation is the source of truth
    }
  }

  return { ok: true, saved };
}
