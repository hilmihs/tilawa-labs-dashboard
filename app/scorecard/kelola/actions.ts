"use server";

import { revalidatePath } from "next/cache";
import { requireSuperUser } from "@/lib/auth/require";
import { getActivePeriod } from "@/lib/scorecard/queries";
import { addItem, deleteItem, setLock, updateItem, type ItemInput } from "@/lib/scorecard/manage";
import { refreshPeriod } from "@/lib/scorecard/metrics/refresh";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/scorecard/kelola");
  revalidatePath("/scorecard");
}

export async function addItemAction(kpiId: string, input: ItemInput): Promise<ActionResult> {
  await requireSuperUser();
  try {
    await addItem(kpiId, input);
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateItemAction(itemId: string, input: ItemInput): Promise<ActionResult> {
  await requireSuperUser();
  try {
    await updateItem(itemId, input);
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteItemAction(itemId: string): Promise<ActionResult> {
  await requireSuperUser();
  try {
    await deleteItem(itemId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setLockAction(itemId: string, locked: boolean): Promise<ActionResult> {
  await requireSuperUser();
  try {
    await setLock(itemId, locked);
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Pull auto-sourced items of the active period from their upstream now. */
export async function refreshNowAction(): Promise<ActionResult> {
  await requireSuperUser();
  try {
    const period = await getActivePeriod();
    if (!period) return { ok: false, error: "Tidak ada periode aktif." };
    const summary = await refreshPeriod(period.id);
    revalidate();
    if (summary.errors > 0) {
      return { ok: false, error: `${summary.refreshed} ok, ${summary.errors} gagal.` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
