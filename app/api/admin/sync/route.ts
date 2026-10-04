import { NextResponse } from "next/server";
import { triggerSync, syncProgram, type SyncSource } from "@/lib/admin/service";
import { authOr401, opsJson, parseBody } from "../_auth";

export const dynamic = "force-dynamic";
// Sync pulls from external APIs across many programs — give it room.
export const maxDuration = 300;

export async function POST(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;
  const b = await parseBody(req);
  // `slug` narrows to a single program (dispatched by its data source); without
  // it the request means "run every program of `source`", as before.
  const slug = typeof b.slug === "string" ? b.slug.trim() : "";
  if (slug) return opsJson(await syncProgram({ slug }, actor));
  const source = (b.source as SyncSource) ?? "all";
  return opsJson(await triggerSync({ source }, actor));
}
