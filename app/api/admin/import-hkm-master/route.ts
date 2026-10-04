import { NextResponse } from "next/server";
import { importHkmMaster } from "@/lib/admin/service";
import { authOr401, opsJson } from "../_auth";

export const dynamic = "force-dynamic";
// Parsing + a 200-row upsert is quick, but give headroom for large masters.
export const maxDuration = 120;

/**
 * Upload the HKM participant master (CSV/XLSX) and import it. Auth: Bearer
 * OPS_SECRET or a super_coordinator session (handled by authOr401). The file
 * is PII and gitignored, so it never ships in the deploy image — this is how it
 * reaches the VPS without SSH.
 *
 * multipart/form-data: field `file` (required), `program` (optional, default
 * "hkm"), `curated` ("true" for hand-curated programs).
 */
export async function POST(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body harus multipart/form-data dengan field `file`." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Field `file` (CSV/XLSX) wajib." }, { status: 400 });
  }

  const programSlug = (form.get("program") as string | null) || undefined;
  const isCurated = form.get("curated") === "true";
  const buffer = Buffer.from(await file.arrayBuffer());

  return opsJson(await importHkmMaster({ buffer, programSlug, isCurated }, actor));
}
