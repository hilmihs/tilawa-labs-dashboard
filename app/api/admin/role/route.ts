import { NextResponse } from "next/server";
import { setStaffRole } from "@/lib/admin/service";
import type { Role } from "@/lib/auth/session";
import { authOr401, opsJson, parseBody } from "../_auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;
  const b = await parseBody(req);
  return opsJson(await setStaffRole({ email: String(b.email ?? ""), role: b.role as Role }, actor));
}
