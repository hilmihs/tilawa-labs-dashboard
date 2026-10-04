"use server";

import { revalidatePath } from "next/cache";
import { requireSuperUser } from "@/lib/auth/require";
import {
  createStaffAccount,
  setStaffRole,
  resetStaffPassword,
  grantPrograms,
  revokePrograms,
  triggerSync,
  type OpsResult,
  type SyncSource,
  type SyncItem,
} from "@/lib/admin/service";
import { setDivisionRole } from "@/lib/news/service";
import type { Role } from "@/lib/auth/session";

/** Thin Server Action wrappers: authenticate (super only), call the shared
 * service, revalidate the page. Same logic the Ops API uses. */

export async function createStaffAction(input: {
  email: string;
  password: string;
  name?: string;
  role?: Role;
}): Promise<OpsResult<{ id: string; email: string }>> {
  const user = await requireSuperUser();
  const res = await createStaffAccount(input, user.email);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

export async function setRoleAction(input: { email: string; role: Role }): Promise<OpsResult> {
  const user = await requireSuperUser();
  const res = await setStaffRole(input, user.email);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

/** No revalidatePath — the page never renders the hash, so nothing to refresh. */
export async function resetPasswordAction(input: {
  email: string;
  password: string;
}): Promise<OpsResult> {
  const user = await requireSuperUser();
  return resetStaffPassword(input, user.email);
}

export async function grantAction(input: {
  email: string;
  slugs: string[];
}): Promise<OpsResult<{ granted: string[]; missing: string[] }>> {
  const user = await requireSuperUser();
  const res = await grantPrograms(input, user.email);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

export async function revokeAction(input: {
  email: string;
  slugs: string[];
}): Promise<OpsResult<{ revoked: string[]; missing: string[] }>> {
  const user = await requireSuperUser();
  const res = await revokePrograms(input, user.email);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

/**
 * Division membership for the /tv news flow (contributor submits, curator
 * approves). Separate from program grants: the Zakat and Kaderisasi
 * contributors have no program in this dashboard at all.
 */
export async function setDivisionAction(input: {
  email: string;
  division: string;
  role: "contributor" | "curator" | null;
}): Promise<OpsResult> {
  const user = await requireSuperUser();
  const res = await setDivisionRole(
    { id: user.sub, email: user.email, isSuper: true },
    input,
  );
  if (res.ok) revalidatePath("/admin/users");
  return res.ok ? { ok: true, data: undefined } : { ok: false, error: res.error };
}

export async function syncAction(input: {
  source: SyncSource;
}): Promise<OpsResult<{ source: SyncSource; skipped: boolean; items: SyncItem[] }>> {
  const user = await requireSuperUser();
  return triggerSync(input, user.email);
}
