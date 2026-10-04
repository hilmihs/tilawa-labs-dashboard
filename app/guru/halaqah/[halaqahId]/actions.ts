"use server";

import { getGuruSession } from "@/lib/guru-portal/session";
import {
  getHalaqahForGuruById,
  searchGuruInProgram,
  getGuruName,
  coordinatorPhoneFor,
  type GuruOption,
} from "@/lib/guru-portal/queries";
import { createRequest } from "@/lib/guru-requests/queries";
import { notifyCoordinatorOfRequest } from "@/lib/guru-requests/notify";

export type SubmitResult =
  | { ok: true; sent: boolean; waFallback: string | null; reason?: string }
  | { ok: false; error: string };

function meetingLabel(order: number | null, date: string | null): string {
  return `${order != null ? `Pertemuan ${order}` : "Pertemuan"}${date ? ` · ${date}` : ""}`;
}

export async function searchGuru(halaqahId: number, query: string): Promise<GuruOption[]> {
  const session = await getGuruSession();
  if (!session) return [];
  const halaqah = await getHalaqahForGuruById(session.guruIds, halaqahId);
  if (!halaqah) return [];
  return searchGuruInProgram(halaqah.programId, query);
}

export async function submitReschedule(
  halaqahId: number,
  jadwalId: number,
  input: { date: string; startTime: string; endTime: string; reason?: string },
): Promise<SubmitResult> {
  const session = await getGuruSession();
  if (!session) return { ok: false, error: "Sesi berakhir. Silakan masuk kembali." };

  const halaqah = await getHalaqahForGuruById(session.guruIds, halaqahId);
  if (!halaqah) return { ok: false, error: "Anda tidak berhak mengubah halaqah ini." };

  const meeting = halaqah.meetings.find((m) => m.jadwalId === jadwalId);
  if (!meeting) return { ok: false, error: "Pertemuan tidak ditemukan." };

  if (!input.date || !input.startTime || !input.endTime) {
    return { ok: false, error: "Tanggal & jam wajib diisi." };
  }
  if (!(input.endTime > input.startTime)) {
    return { ok: false, error: "Jam selesai harus setelah jam mulai." };
  }

  const newStartAt = `${input.date} ${input.startTime}:00`;
  const newEndAt = `${input.date} ${input.endTime}:00`;
  const coordinatorPhone = coordinatorPhoneFor(halaqah.gender);

  const rid = await createRequest({
    programId: halaqah.programId,
    tilawahHalaqahId: halaqahId,
    tilawahJadwalId: jadwalId,
    requestType: "reschedule",
    requestedByGuruId: session.guruIds[0] ?? null,
    requestedByName: session.name,
    requestedByPhone: session.phone,
    newScheduleDate: input.date,
    newStartAt,
    newEndAt,
    reasonText: input.reason?.trim() || null,
    coordinatorPhone,
  });

  const notice = await notifyCoordinatorOfRequest({
    rid,
    coordinatorPhone,
    guruName: session.name,
    halaqahName: halaqah.name ?? `Halaqah #${halaqahId}`,
    meetingLabel: meetingLabel(meeting.order, meeting.date),
    changeSummary: `Reschedule → ${input.date} ${input.startTime}–${input.endTime}`,
  });

  return { ok: true, sent: notice.sent, waFallback: notice.link, reason: notice.reason };
}

export async function submitBadal(
  halaqahId: number,
  jadwalId: number,
  input: { newGuruId: number; reason?: string },
): Promise<SubmitResult> {
  const session = await getGuruSession();
  if (!session) return { ok: false, error: "Sesi berakhir. Silakan masuk kembali." };

  const halaqah = await getHalaqahForGuruById(session.guruIds, halaqahId);
  if (!halaqah) return { ok: false, error: "Anda tidak berhak mengubah halaqah ini." };

  const meeting = halaqah.meetings.find((m) => m.jadwalId === jadwalId);
  if (!meeting) return { ok: false, error: "Pertemuan tidak ditemukan." };
  if (!input.newGuruId) return { ok: false, error: "Pilih guru pengganti." };

  const newGuruName = await getGuruName(halaqah.programId, input.newGuruId);
  const coordinatorPhone = coordinatorPhoneFor(halaqah.gender);

  const rid = await createRequest({
    programId: halaqah.programId,
    tilawahHalaqahId: halaqahId,
    tilawahJadwalId: jadwalId,
    requestType: "badal",
    requestedByGuruId: session.guruIds[0] ?? null,
    requestedByName: session.name,
    requestedByPhone: session.phone,
    newGuruId: input.newGuruId,
    newGuruName,
    reasonText: input.reason?.trim() || null,
    coordinatorPhone,
  });

  const notice = await notifyCoordinatorOfRequest({
    rid,
    coordinatorPhone,
    guruName: session.name,
    halaqahName: halaqah.name ?? `Halaqah #${halaqahId}`,
    meetingLabel: meetingLabel(meeting.order, meeting.date),
    changeSummary: `Badal → ${newGuruName ?? `guru #${input.newGuruId}`}`,
  });

  return { ok: true, sent: notice.sent, waFallback: notice.link, reason: notice.reason };
}
