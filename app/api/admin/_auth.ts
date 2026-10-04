import { NextResponse } from "next/server";
import { assertOpsAuth } from "@/lib/auth/require";
import type { OpsResult } from "@/lib/admin/service";

/** Authenticate, or return a 401 NextResponse. Usage: `const actor = await authOr401(req); if (actor instanceof NextResponse) return actor;` */
export async function authOr401(req: Request): Promise<string | NextResponse> {
  const actor = await assertOpsAuth(req);
  if (!actor)
    return NextResponse.json(
      { ok: false, error: "Unauthorized — Bearer OPS_SECRET atau session super_coordinator." },
      { status: 401 },
    );
  return actor;
}

/** Map an OpsResult to a JSON response (200 ok / 400 error). */
export function opsJson<T>(result: OpsResult<T>): NextResponse {
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
