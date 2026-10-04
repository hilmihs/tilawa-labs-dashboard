import { NextResponse } from "next/server";
import { setSyncPaused } from "@/lib/admin/service";
import { authOr401, opsJson, parseBody } from "../_auth";

export const dynamic = "force-dynamic";

/** POST { slug, paused } — freeze or resume one program's sync. */
export async function POST(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;
  const b = await parseBody(req);
  return opsJson(
    await setSyncPaused({ slug: String(b.slug ?? ""), paused: b.paused === true }, actor),
  );
}
