"use server";

import { verifyApprovalToken } from "@/lib/auth/approval-token";
import { getRequest, markDecision } from "@/lib/guru-requests/queries";
import { applyGuruChangeRequest } from "@/lib/guru-requests/apply";
import { notifyGuruOfDecision } from "@/lib/guru-requests/notify";

export type DecisionResult =
  | { ok: true; status: "applied" | "rejected"; note?: string }
  | { ok: false; error: string };

function changeSummary(req: Awaited<ReturnType<typeof getRequest>>): string {
  if (!req) return "-";
  if (req.requestType === "badal") {
    return `Badal → ${req.newGuruName ?? `guru #${req.newGuruId}`}`;
  }
  return `Reschedule → ${req.newScheduleDate ?? "-"} ${(req.newStartAt ?? "").slice(11, 16)}–${(req.newEndAt ?? "").slice(11, 16)}`;
}

function meetingLabel(req: Awaited<ReturnType<typeof getRequest>>): string {
  if (!req) return "-";
  return `Pertemuan · jadwal #${req.tilawahJadwalId}`;
}

export async function approve(token: string): Promise<DecisionResult> {
  const claims = await verifyApprovalToken(token);
  if (!claims) return { ok: false, error: "Link tidak valid atau kedaluwarsa." };

  const req = await getRequest(claims.rid);
  if (!req) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (req.status === "applied") return { ok: true, status: "applied", note: "Sudah diterapkan sebelumnya." };
  if (req.status === "rejected") return { ok: false, error: "Pengajuan ini sudah ditolak." };

  await markDecision(req.id, "approved", req.coordinatorPhone ?? "coordinator");
  const applied = await applyGuruChangeRequest(req.id);

  await notifyGuruOfDecision({
    guruPhone: req.requestedByPhone,
    guruName: req.requestedByName ?? "Guru",
    halaqahName: `Halaqah #${req.tilawahHalaqahId}`,
    meetingLabel: meetingLabel(req),
    changeSummary: changeSummary(req),
    approved: true,
    applyError: applied.ok ? null : applied.error,
  });

  if (!applied.ok) return { ok: false, error: `Disetujui, tapi gagal diterapkan: ${applied.error}` };
  return { ok: true, status: "applied" };
}

export async function reject(token: string): Promise<DecisionResult> {
  const claims = await verifyApprovalToken(token);
  if (!claims) return { ok: false, error: "Link tidak valid atau kedaluwarsa." };

  const req = await getRequest(claims.rid);
  if (!req) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (req.status === "applied") return { ok: false, error: "Pengajuan sudah diterapkan, tak bisa ditolak." };
  if (req.status === "rejected") return { ok: true, status: "rejected", note: "Sudah ditolak sebelumnya." };

  await markDecision(req.id, "rejected", req.coordinatorPhone ?? "coordinator");
  await notifyGuruOfDecision({
    guruPhone: req.requestedByPhone,
    guruName: req.requestedByName ?? "Guru",
    halaqahName: `Halaqah #${req.tilawahHalaqahId}`,
    meetingLabel: meetingLabel(req),
    changeSummary: changeSummary(req),
    approved: false,
  });
  return { ok: true, status: "rejected" };
}
