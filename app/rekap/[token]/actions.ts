"use server";

import { verifyRecapToken } from "@/lib/auth/recap-token";
import { getTeacherRecap } from "@/lib/confirmations/recap";
import { isPresensiLocked, lockLabel } from "@/lib/confirmations/period";
import { addRecapNote } from "@/lib/confirmations/notes";
import { upsertAttestation } from "@/lib/confirmations/attestation";
import { upsertConfirmation } from "@/lib/confirmations/queries";
import type { RecapConfirmStatus, RecapMeeting } from "@/lib/confirmations/types";

/**
 * Write path for the monthly recap magic link. Everything the client sends is
 * treated as a claim to be re-checked: the token is verified again here, the
 * lock is enforced here, and the set of meetings the teacher may touch is
 * re-read from the database. The client only ever names a jadwal id — the
 * program, halaqah, order, date and guru attached to that meeting come from our
 * own recap, so a tampered payload cannot write into someone else's halaqah.
 */

const VALID_REASONS = ["izin", "sakit", "badal", "libur", "kegiatan", "lainnya"];
const MAX_REASON_CHARS = 500;

/** Statuses a teacher may set for a meeting the system does NOT count as taught. */
const GAP_STATUSES: RecapConfirmStatus[] = [
  "tidak_mengajar",
  "mengajar_belum_input",
  "mengajar_kendala_sistem",
];

/**
 * One answer as the page sends it. `attest` carries the "saya benar-benar
 * mengajar" checkbox; it is re-checked here because a disabled submit button is
 * a hint, not a guarantee.
 */
export type RecapEntry = {
  jadwalId: number;
  status: RecapConfirmStatus;
  reasonCode: string | null;
  reasonText: string | null;
  attest: boolean;
};

export type RecapSubmitResult = { ok: true } | { ok: false; error: string };

function cleanText(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_REASON_CHARS) : null;
}

/**
 * True when this answer is allowed for this meeting. Two rules, both derived
 * from what the page can legitimately offer:
 *  - a meeting the system records as taught can only be *disputed*; re-answering
 *    it as "tidak mengajar" would silently overwrite synced attendance,
 *  - a gap meeting can be answered with the three gap statuses, and disputing a
 *    record that does not exist is meaningless.
 * `diisi_koordinator` is absent from both lists on purpose: it is a coordinator
 * action, and a teacher must never be able to mint it for themselves.
 */
function isAllowedAnswer(meeting: RecapMeeting, status: RecapConfirmStatus): boolean {
  return meeting.done
    ? status === "data_tidak_sesuai"
    : GAP_STATUSES.includes(status);
}

export async function submitRecapConfirmations(
  token: string,
  entries: RecapEntry[],
  note: string | null,
): Promise<RecapSubmitResult> {
  const claims = await verifyRecapToken(token);
  if (!claims) {
    return { ok: false, error: "Link tidak valid atau sudah kedaluwarsa. Mohon hubungi koordinator." };
  }

  // Enforced server-side, not merely hidden in the UI: after the lock the
  // upstream tilawah data for the period is frozen, so a late write could no
  // longer be reconciled against it.
  if (isPresensiLocked()) {
    return {
      ok: false,
      error: `Presensi sudah dikunci pada ${lockLabel()}. Perubahan tidak bisa disimpan.`,
    };
  }

  // Re-read the teacher's own meetings for the token's period. This — not the
  // payload — decides which jadwal ids are writable and with which program and
  // halaqah they are written.
  const recap = await getTeacherRecap(claims.gid, claims.start, claims.end);
  if (!recap) return { ok: false, error: "Tidak ada pertemuan pada periode ini." };

  const allowed = new Map<number, RecapMeeting>();
  for (const halaqah of recap.halaqah) {
    for (const meeting of halaqah.meetings) allowed.set(meeting.jadwalId, meeting);
  }

  const seen = new Set<number>();
  try {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const meeting = allowed.get(Number(entry?.jadwalId));
      if (!meeting) continue; // not this teacher's meeting, or outside the period
      if (seen.has(meeting.jadwalId)) continue; // duplicate answer for one meeting
      if (!isAllowedAnswer(meeting, entry.status)) continue;

      let reasonCode: string | null = null;
      let reasonText: string | null = null;

      if (entry.status === "tidak_mengajar") {
        reasonCode =
          typeof entry.reasonCode === "string" && VALID_REASONS.includes(entry.reasonCode)
            ? entry.reasonCode
            : "lainnya";
        reasonText = cleanText(entry.reasonText);
      } else if (entry.status === "mengajar_kendala_sistem") {
        // Same gate as /confirm: this status counts the meeting as taught, so
        // without the attestation the answer is dropped rather than saved.
        if (entry.attest !== true) continue;
        reasonText = cleanText(entry.reasonText);
      } else if (entry.status === "data_tidak_sesuai") {
        // Stored even when the teacher wrote nothing: the dispute flag itself is
        // the signal a coordinator has to follow up on; the text only elaborates.
        reasonText = cleanText(entry.reasonText);
      }

      await upsertConfirmation(
        meeting.programId,
        meeting.halaqahId,
        {
          jadwalId: meeting.jadwalId,
          order: meeting.order,
          date: meeting.date,
          guruId: claims.gid,
          status: entry.status,
          reasonCode,
          reasonText,
        },
        null, // the token carries no phone number; the blast list holds the contact
      );
      seen.add(meeting.jadwalId);
    }

    const trimmedNote = typeof note === "string" ? note.trim() : "";
    if (trimmedNote) {
      await addRecapNote({
        guruId: claims.gid,
        guruName: recap.nama || claims.nama,
        periodStart: claims.start,
        periodEnd: claims.end,
        note: trimmedNote,
        phone: null,
      });
    }

    // Record the sign-off itself. Without this row the report cannot tell a
    // teacher whose month was already complete (nothing to answer) from one who
    // never opened the link — the two look identical in the per-meeting table,
    // and they are the opposite of each other to a coordinator chasing the lock.
    const disputed = [...seen].filter((id) => allowed.get(id)?.done).length;
    await upsertAttestation({
      guruId: claims.gid,
      guruName: recap.nama || claims.nama,
      periodStart: claims.start,
      periodEnd: claims.end,
      // A dispute or a written note means someone has to look at this teacher
      // again; a plain confirmation does not.
      verdict: disputed > 0 || trimmedNote ? "ada_koreksi" : "tepat",
      meetingsTotal: recap.counts.meetings,
      meetingsTaught: recap.counts.taught,
      meetingsGap: recap.counts.gaps,
      answered: seen.size - disputed,
      disputed,
    });
  } catch {
    return { ok: false, error: "Gagal menyimpan. Mohon coba lagi sebentar." };
  }

  // Deliberately no pushMeetingsTaughtToTilawah() for "mengajar_kendala_sistem".
  // That CMS write-back is experimental and off by default, /confirm already
  // owns it, and duplicating it here would mean two paths writing the same
  // meeting upstream — added risk for a capability nobody is running.
  return { ok: true };
}
