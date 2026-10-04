import { NextResponse } from "next/server";
import { grantPrograms } from "@/lib/admin/service";
import { authOr401, opsJson, parseBody } from "../_auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;
  const b = await parseBody(req);
  const slugs = Array.isArray(b.slugs) ? b.slugs.map(String) : [];
  return opsJson(await grantPrograms({ email: String(b.email ?? ""), slugs }, actor));
}
