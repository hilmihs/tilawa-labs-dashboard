import { NextResponse } from "next/server";
import { buildMabniMessage, getMabniDigest } from "@/lib/confirmations/mabni-digest";
import { RECAP_PERIOD, lockLabel, periodLabel, PRESENSI_LOCK_AT, isPresensiLocked } from "@/lib/confirmations/period";
import { normalizePhone } from "@/lib/wa";
import { agentAuthOr401 } from "../_auth";
import { agentError, agentJson, readParams } from "../_respond";

export const dynamic = "force-dynamic";

/**
 * Madrasah Nusantara's recap, addressed to ONE recipient.
 *
 * Mabni is the exception to the whole blast design: its upstream exposes no
 * teacher phone numbers at all, so the per-teacher magic link has nobody to go
 * to. Instead the entire roster goes to the program's coordinator, who
 * distributes it — decided by the owner on 16 Aug 2026.
 *
 * Consequences worth stating, since they differ from /api/agent/konfirmasi-rekap:
 *  - No token and no link. The recipient is not the person the recap describes,
 *    so a capability URL granting write access to someone else's attendance
 *    would be exactly the wrong thing to mint.
 *  - One row, one message, one number.
 */
const ALLOW = ["start", "end"] as const;

/**
 * Fixed recipient, per the owner. Hardcoded rather than configurable because it
 * is a person, not a setting: if it changes, that is a decision someone should
 * make in a commit with their name on it.
 */
const RECIPIENT = {
  nama: "Khadijah Sabil Nugroho",
  phone: "081916594871",
  // Sent from the KIRIMI device, not Baileys: this is a coordinator-to-
  // coordinator message, not one of the gendered teacher blasts.
  channel: "kirimi",
  sender: "081902251409",
} as const;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = readParams(new URL(req.url), ALLOW);
  if (!parsed.ok) return agentError(req, 400, parsed.error, { startedAt });
  const params = parsed.params;

  const start = params.start ?? RECAP_PERIOD.start;
  const end = params.end ?? RECAP_PERIOD.end;
  if (start > end) {
    return agentError(req, 400, "start tidak boleh melewati end", {
      query: params,
      startedAt,
      extra: { start, end },
    });
  }

  const digest = await getMabniDigest(start, end);
  if (!digest) {
    return agentError(req, 404, "program mabni tidak ditemukan", { query: params, startedAt });
  }
  if (digest.teachers.length === 0) {
    return agentError(req, 404, "tidak ada pertemuan mabni pada periode ini", {
      query: params,
      startedAt,
      extra: { start, end },
    });
  }

  const label = periodLabel(start, end);
  const lock = lockLabel();

  return agentJson(
    req,
    {
      period: { start, end, label },
      lock: { at: PRESENSI_LOCK_AT, label: lock, locked: isPresensiLocked() },
      recipient: {
        nama: RECIPIENT.nama,
        phone: normalizePhone(RECIPIENT.phone),
        channel: RECIPIENT.channel,
        sender: RECIPIENT.sender,
      },
      totals: digest.totals,
      teachers: digest.teachers,
      message: buildMabniMessage({
        recipientName: RECIPIENT.nama,
        digest,
        periodLabel: label,
        lockLabel: lock,
      }),
    },
    { program: "mabni", query: params, startedAt },
  );
}
