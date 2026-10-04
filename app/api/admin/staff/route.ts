import { NextResponse } from "next/server";
import { createStaffAccount, listStaff } from "@/lib/admin/service";
import type { Role } from "@/lib/auth/session";
import { authOr401, opsJson, parseBody } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;
  return NextResponse.json({ ok: true, data: await listStaff() });
}

export async function POST(req: Request) {
  const actor = await authOr401(req);
  if (actor instanceof NextResponse) return actor;
  const b = await parseBody(req);
  return opsJson(
    await createStaffAccount(
      {
        email: String(b.email ?? ""),
        password: String(b.password ?? ""),
        name: b.name == null ? null : String(b.name),
        role: b.role as Role | undefined,
      },
      actor,
    ),
  );
}
