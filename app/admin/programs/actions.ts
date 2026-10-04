"use server";

import { revalidatePath } from "next/cache";
import { requireSuperUser } from "@/lib/auth/require";
import type { PurgeStraysResult } from "@/lib/sync/batch-strays";
import {
  approveProgramDiscovery,
  dismissProgramDiscovery,
  purgeStrays,
  scanForNewPrograms,
  setSyncPaused,
  syncProgram,
  triggerSync,
  type OpsResult,
  type SyncItem,
  type SyncSource,
} from "@/lib/admin/service";

/** Thin Server Action wrappers: authenticate (super only), call the shared
 * service, revalidate the page. Same logic the Ops API uses. */

export async function setSyncPausedAction(input: {
  slug: string;
  paused: boolean;
}): Promise<OpsResult<{ slug: string; paused: boolean }>> {
  const user = await requireSuperUser();
  const res = await setSyncPaused(input, user.email);
  if (res.ok) revalidatePath("/admin/programs");
  return res;
}

export async function syncProgramAction(input: {
  slug: string;
}): Promise<OpsResult<{ slug: string; skipped: boolean; wasPaused: boolean }>> {
  const user = await requireSuperUser();
  const res = await syncProgram(input, user.email);
  if (res.ok) revalidatePath("/admin/programs");
  return res;
}

/**
 * One pass over every program of a source — what the cron does.
 *
 * This is not the same work as pressing "Sync sekarang" on each row in turn.
 * The per-program path logs in to tilawah and pulls the whole cross-program
 * /api/reports/absensi-murid on its own, so eight tilawah rows means eight
 * logins and eight full report pulls. runAllTilawahSyncs() does one of each and
 * shares them, which is why the source-wide button exists.
 */
export async function triggerSyncAction(input: {
  source: SyncSource;
}): Promise<OpsResult<{ source: SyncSource; skipped: boolean; items: SyncItem[] }>> {
  const user = await requireSuperUser();
  const res = await triggerSync(input, user.email);
  if (res.ok) revalidatePath("/admin/programs");
  return res;
}

/**
 * Publish a program the sync found in the CMS on its own.
 *
 * Revalidates the whole app, not just this page: approval is what puts the
 * program into every nav, switcher and overview, all of which read the cached
 * getAllPrograms().
 */
export async function approveDiscoveryAction(input: {
  slug: string;
  name?: string;
}): Promise<OpsResult<{ slug: string; synced: boolean; syncError?: string }>> {
  const user = await requireSuperUser();
  const res = await approveProgramDiscovery(input, user.email);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function dismissDiscoveryAction(input: {
  slug: string;
}): Promise<OpsResult<{ slug: string }>> {
  const user = await requireSuperUser();
  const res = await dismissProgramDiscovery(input, user.email);
  if (res.ok) revalidatePath("/admin/programs");
  return res;
}

/** Scan the CMS now instead of waiting for the sync's six-hourly pass. */
export async function scanProgramsAction(): Promise<
  OpsResult<{ created: number; slugs: string[] }>
> {
  const user = await requireSuperUser();
  const res = await scanForNewPrograms(user.email);
  if (res.ok) revalidatePath("/admin/programs");
  return res;
}

/**
 * Remove halaqah left behind under this program from a batch it is no longer
 * pinned to. Destructive on mirror data only — a re-sync rebuilds anything that
 * still exists upstream — and deliberately uncapped, because the coordinator
 * pressing it has just been shown how many rows disappear.
 */
export async function purgeStraysAction(input: {
  slug: string;
}): Promise<OpsResult<{ slug: string; removed: PurgeStraysResult }>> {
  const user = await requireSuperUser();
  const res = await purgeStrays(input, user.email);
  if (res.ok) revalidatePath("/admin/programs");
  return res;
}
