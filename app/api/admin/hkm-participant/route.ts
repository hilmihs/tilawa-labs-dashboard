import { NextResponse } from "next/server";
import {
  editHkmParticipant,
  listHkmParticipants,
  setHkmParticipantStatus,
  upsertHkmParticipant,
} from "@/lib/admin/service";
import { authOr401, opsJson, parseBody } from "../_auth";

export const dynamic = "force-dynamic";

/**
 * Look up master rows before editing them: `?program=hkm&q=naura`. Without `q`
 * it returns the whole roster, so a wrong name never has to be discovered by
 * writing the wrong row.
 */
export async function GET(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;

  const url = new URL(req.url);
  return opsJson(
    await listHkmParticipants({
      programSlug: url.searchParams.get("program") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    }),
  );
}

/**
 * Roster edits for an HKM (berkah_api) program, without SSH. Auth: Bearer
 * OPS_SECRET or a super_coordinator session.
 *
 * Two actions, chosen by the `action` field:
 *
 *   {"action":"status", "email":"…"|"nama":"…"|"participantId":"…",
 *    "status":"aktif|cuti|keluar|wafat", "note":"…", "program":"hkm"}
 *      → keluar/wafat drop the peserta off the dashboard; cuti keeps them
 *        listed but never flags them as kendala setoran.
 *
 *   {"action":"edit", "email"|"nama"|"participantId": <selector>,
 *    "newNama":"…", "newEmail":"…"|"clearEmail":true, "halaqah":"…"}
 *      → repair a row whose fuzzy-matched email belongs to someone else.
 *        Free the email from the wrong row (clearEmail) before attaching it
 *        to the right one — emailMaster is unique per program.
 *
 *   {"action":"upsert", "nama":"…", "email":"…", "halaqah":"…",
 *    "pengajar":"…", "gender":"Ikhwan|Akhwat", "program":"hkm"}
 *      → add someone who joined mid-batch (source=manual, so a master
 *        re-import will not delete them).
 */
export async function POST(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;

  const b = await parseBody(req);
  const str = (k: string): string | undefined => {
    const v = b[k];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  const programSlug = str("program");
  const action = str("action") ?? "status";

  if (action === "status") {
    const status = str("status");
    if (!status) return NextResponse.json({ ok: false, error: "Field `status` wajib." }, { status: 400 });
    return opsJson(
      await setHkmParticipantStatus(
        {
          programSlug,
          status,
          note: str("note"),
          email: str("email"),
          nama: str("nama"),
          participantId: str("participantId"),
        },
        actor,
      ),
    );
  }

  if (action === "edit") {
    return opsJson(
      await editHkmParticipant(
        {
          programSlug,
          // selector
          participantId: str("participantId"),
          email: str("email"),
          nama: str("nama"),
          // patch
          newNama: str("newNama"),
          newEmail: str("newEmail"),
          clearEmail: b["clearEmail"] === true,
          halaqah: str("halaqah"),
          pengajar: str("pengajar"),
          gender: str("gender"),
          note: str("note"),
        },
        actor,
      ),
    );
  }

  if (action === "upsert") {
    const nama = str("nama");
    const email = str("email");
    if (!nama || !email)
      return NextResponse.json({ ok: false, error: "Field `nama` dan `email` wajib." }, { status: 400 });
    return opsJson(
      await upsertHkmParticipant(
        {
          programSlug,
          nama,
          email,
          halaqah: str("halaqah"),
          pengajar: str("pengajar"),
          gender: str("gender"),
          hkm: str("hkm"),
          status: str("status"),
          note: str("note"),
        },
        actor,
      ),
    );
  }

  return NextResponse.json(
    { ok: false, error: `action "${action}" tidak dikenal — pakai "status" atau "upsert".` },
    { status: 400 },
  );
}
