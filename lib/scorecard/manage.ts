/**
 * Write ops for the /scorecard/kelola editor. Everything here mutates workbook
 * line items; the KPI/CAT definitions come from the seed and are not edited from
 * the browser. A CLOSED period is frozen — every op refuses it.
 *
 * Editing the `kuantitas` of an auto-sourced item locks it (locked=true) so the
 * next refresh keeps the human override instead of overwriting it.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { scorecardKpis, scorecardPeriods, scorecardWorkbookItems } from "@/lib/db/schema";

export type ItemInput = {
  detail?: string | null;
  kuantitas?: number | null;
  pembagi?: number | null;
  status?: "achieved" | "outlook";
};

const numStr = (v: number | null | undefined): string | null =>
  v == null || Number.isNaN(v) ? null : String(v);

/** Throws if the item's (or kpi's) period is closed. Returns the item's origin. */
async function guardByItem(itemId: string): Promise<{ origin: string }> {
  const db = getDb();
  const [row] = await db
    .select({ closedAt: scorecardPeriods.closedAt, origin: scorecardWorkbookItems.origin })
    .from(scorecardWorkbookItems)
    .innerJoin(scorecardKpis, eq(scorecardWorkbookItems.kpiId, scorecardKpis.id))
    .innerJoin(scorecardPeriods, eq(scorecardKpis.periodId, scorecardPeriods.id))
    .where(eq(scorecardWorkbookItems.id, itemId));
  if (!row) throw new Error("Item tidak ditemukan.");
  if (row.closedAt) throw new Error("Periode sudah ditutup — tidak bisa diubah.");
  return { origin: row.origin };
}

async function guardByKpi(kpiId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ closedAt: scorecardPeriods.closedAt })
    .from(scorecardKpis)
    .innerJoin(scorecardPeriods, eq(scorecardKpis.periodId, scorecardPeriods.id))
    .where(eq(scorecardKpis.id, kpiId));
  if (!row) throw new Error("KPI tidak ditemukan.");
  if (row.closedAt) throw new Error("Periode sudah ditutup — tidak bisa diubah.");
}

export async function addItem(kpiId: string, input: ItemInput): Promise<string> {
  await guardByKpi(kpiId);
  const db = getDb();
  const [row] = await db
    .insert(scorecardWorkbookItems)
    .values({
      kpiId,
      detail: input.detail?.trim() || null,
      kuantitas: numStr(input.kuantitas),
      pembagi: numStr(input.pembagi),
      status: input.status === "outlook" ? "outlook" : "achieved",
      origin: "manual",
    })
    .returning({ id: scorecardWorkbookItems.id });
  return row.id;
}

export async function updateItem(itemId: string, input: ItemInput): Promise<void> {
  const { origin } = await guardByItem(itemId);
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if ("detail" in input) patch.detail = input.detail?.trim() || null;
  if ("kuantitas" in input) patch.kuantitas = numStr(input.kuantitas);
  if ("pembagi" in input) patch.pembagi = numStr(input.pembagi);
  if (input.status) patch.status = input.status === "outlook" ? "outlook" : "achieved";
  // A hand edit to an auto row must survive the next refresh.
  if (origin === "auto" && "kuantitas" in input) patch.locked = true;
  await db
    .update(scorecardWorkbookItems)
    .set(patch)
    .where(eq(scorecardWorkbookItems.id, itemId));
}

export async function deleteItem(itemId: string): Promise<void> {
  await guardByItem(itemId);
  const db = getDb();
  await db.delete(scorecardWorkbookItems).where(eq(scorecardWorkbookItems.id, itemId));
}

export async function setLock(itemId: string, locked: boolean): Promise<void> {
  await guardByItem(itemId);
  const db = getDb();
  await db
    .update(scorecardWorkbookItems)
    .set({ locked, updatedAt: new Date() })
    .where(and(eq(scorecardWorkbookItems.id, itemId)));
}
