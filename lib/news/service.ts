/**
 * Kabar (news) service for the /tv board: who may write, what they may write,
 * and who may put it on air.
 *
 * Like lib/admin/service.ts, nothing here authenticates. The caller resolves the
 * session first and passes an `Actor`; every mutation re-checks that actor's
 * division rights, because a hidden button is not a gate.
 *
 * Access model — two roles scoped to the news flow only:
 *   contributor  submits kabar for its own division(s)
 *   curator      approves/rejects/orders kabar for its own division(s)
 * A super_coordinator has both, everywhere, without any staff_divisions row.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { newsItems, notificationLog, staff, staffDivisions, tvQuotes } from "@/lib/db/schema";
import { DIVISIONS, divisionLabel, isDivision, type Division } from "@/lib/tv/divisions";
import { weekJumatKamis, todayJakarta } from "@/lib/time/jakarta";

export type NewsResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type NewsStatus = "draft" | "submitted" | "approved" | "rejected";

export type Actor = {
  id: string; // staff.id
  email: string;
  name?: string | null;
  isSuper: boolean;
};

/** What a signed-in staff member may do in the news flow. */
export type NewsAccess = {
  isSuper: boolean;
  /** Divisions this actor may submit kabar for. */
  contribute: Division[];
  /** Divisions this actor may approve/reject/order. */
  curate: Division[];
};

const TITLE_MAX = 90;
const BODY_MAX = 260;

/** Best-effort audit to notification_log (channel=news_ops). Never throws. */
async function audit(
  actor: Actor,
  action: string,
  payload: Record<string, unknown>,
  status: "executed" | "failed" = "executed",
): Promise<void> {
  try {
    await getDb()
      .insert(notificationLog)
      .values({ channel: "news_ops", recipient: actor.email, payload: { action, ...payload }, status });
  } catch {
    // logging must never mask the operation result
  }
}

/** Division rights for one staff member. Super gets everything. */
export async function getNewsAccess(actor: Actor): Promise<NewsAccess> {
  if (actor.isSuper) {
    return { isSuper: true, contribute: [...DIVISIONS], curate: [...DIVISIONS] };
  }
  const rows = await getDb()
    .select({ division: staffDivisions.division, role: staffDivisions.role })
    .from(staffDivisions)
    .where(eq(staffDivisions.staffId, actor.id));

  const contribute: Division[] = [];
  const curate: Division[] = [];
  for (const r of rows) {
    if (!isDivision(r.division)) continue;
    contribute.push(r.division);
    if (r.role === "curator") curate.push(r.division);
  }
  return { isSuper: false, contribute, curate };
}

/** The Jumat→Kamis week a kabar written today belongs to. */
export function currentWeekStart(): string {
  return weekJumatKamis(todayJakarta()).start;
}

export type NewsRow = {
  id: string;
  division: string;
  divisionLabel: string;
  weekStart: string;
  title: string;
  body: string;
  programSlug: string | null;
  status: NewsStatus;
  pinned: boolean;
  sortOrder: number;
  submittedByName: string | null;
  submittedAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

const rowSelect = {
  id: newsItems.id,
  division: newsItems.division,
  weekStart: newsItems.weekStart,
  title: newsItems.title,
  body: newsItems.body,
  programSlug: newsItems.programSlug,
  status: newsItems.status,
  pinned: newsItems.pinned,
  sortOrder: newsItems.sortOrder,
  submittedByName: newsItems.submittedByName,
  submittedAt: newsItems.submittedAt,
  reviewedByName: newsItems.reviewedByName,
  reviewedAt: newsItems.reviewedAt,
  reviewNote: newsItems.reviewNote,
};

type RawRow = {
  id: string;
  division: string;
  weekStart: string;
  title: string;
  body: string;
  programSlug: string | null;
  status: string;
  pinned: boolean;
  sortOrder: number;
  submittedByName: string | null;
  submittedAt: Date;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
};

function toRow(r: RawRow): NewsRow {
  return {
    ...r,
    divisionLabel: divisionLabel(r.division),
    status: (["draft", "submitted", "approved", "rejected"] as const).includes(r.status as NewsStatus)
      ? (r.status as NewsStatus)
      : "submitted",
    submittedAt: r.submittedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}

/** Everything this actor wrote for the given week — any status. */
export async function listMyNews(actor: Actor, weekStart: string): Promise<NewsRow[]> {
  const rows = await getDb()
    .select(rowSelect)
    .from(newsItems)
    .where(and(eq(newsItems.submittedBy, actor.id), eq(newsItems.weekStart, weekStart)))
    .orderBy(desc(newsItems.submittedAt));
  return rows.map(toRow);
}

/** Every kabar of the given week in the divisions this curator owns. */
export async function listForCuration(divisions: Division[], weekStart: string): Promise<NewsRow[]> {
  if (divisions.length === 0) return [];
  const rows = await getDb()
    .select(rowSelect)
    .from(newsItems)
    .where(and(inArray(newsItems.division, divisions), eq(newsItems.weekStart, weekStart)))
    .orderBy(desc(newsItems.pinned), asc(newsItems.sortOrder), asc(newsItems.submittedAt));
  return rows.map(toRow);
}

export type NewsInput = {
  division: string;
  weekStart: string;
  title: string;
  body: string;
  programSlug?: string | null;
};

function validate(input: NewsInput): string | null {
  if (!isDivision(input.division)) return "Divisi tidak dikenal.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)) return "Pekan tidak valid.";
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 4) return "Judul terlalu pendek.";
  if (title.length > TITLE_MAX) return `Judul maksimal ${TITLE_MAX} karakter (layar dibaca dari jauh).`;
  if (body.length < 10) return "Isi kabar terlalu pendek.";
  if (body.length > BODY_MAX) return `Isi maksimal ${BODY_MAX} karakter.`;
  return null;
}

/**
 * Write a kabar. `status` is 'submitted' straight away — the agreed flow has one
 * approval gate, and a separate draft state only adds a place for kabar to be
 * forgotten. A curator writing in its own division still goes through review, so
 * the queue always shows what is about to air.
 */
export async function submitNews(actor: Actor, access: NewsAccess, input: NewsInput): Promise<NewsResult<{ id: string }>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };
  if (!access.contribute.includes(input.division as Division)) {
    return { ok: false, error: "Anda tidak terdaftar di divisi itu." };
  }

  const [row] = await getDb()
    .insert(newsItems)
    .values({
      division: input.division,
      weekStart: input.weekStart,
      title: input.title.trim(),
      body: input.body.trim(),
      programSlug: input.programSlug?.trim() || null,
      status: "submitted",
      submittedBy: actor.id,
      submittedByName: actor.name ?? actor.email,
    })
    .returning({ id: newsItems.id });

  await audit(actor, "news.submit", { id: row.id, division: input.division, weekStart: input.weekStart });
  return { ok: true, data: { id: row.id } };
}

/** Edit own kabar. Once approved it is on air — editing then is a curator act. */
export async function updateNews(actor: Actor, id: string, input: NewsInput): Promise<NewsResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = getDb();
  const [existing] = await db
    .select({ status: newsItems.status, submittedBy: newsItems.submittedBy })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: "Kabar tidak ditemukan." };
  if (existing.submittedBy !== actor.id && !actor.isSuper) {
    return { ok: false, error: "Hanya penulisnya yang bisa mengubah kabar ini." };
  }
  if (existing.status === "approved" && !actor.isSuper) {
    return { ok: false, error: "Kabar sudah tayang. Minta kurator menurunkannya dulu." };
  }

  // A rejected kabar that gets edited goes back into the queue — otherwise the
  // fix sits invisible and the contributor thinks it is waiting for review.
  await db
    .update(newsItems)
    .set({
      division: input.division,
      weekStart: input.weekStart,
      title: input.title.trim(),
      body: input.body.trim(),
      programSlug: input.programSlug?.trim() || null,
      status: existing.status === "rejected" ? "submitted" : existing.status,
      updatedAt: new Date(),
    })
    .where(eq(newsItems.id, id));

  await audit(actor, "news.update", { id });
  return { ok: true, data: undefined };
}

/** Withdraw own kabar (or any, as super). Hard delete: nothing has aired yet. */
export async function deleteNews(actor: Actor, id: string): Promise<NewsResult> {
  const db = getDb();
  const [row] = await db
    .select({ submittedBy: newsItems.submittedBy, status: newsItems.status })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Kabar tidak ditemukan." };
  if (row.submittedBy !== actor.id && !actor.isSuper) {
    return { ok: false, error: "Hanya penulisnya yang bisa menghapus kabar ini." };
  }
  if (row.status === "approved" && !actor.isSuper) {
    return { ok: false, error: "Kabar sudah tayang. Minta kurator menurunkannya dulu." };
  }
  await db.delete(newsItems).where(eq(newsItems.id, id));
  await audit(actor, "news.delete", { id });
  return { ok: true, data: undefined };
}

/** Approve / reject / take back off air. Curator of that division, or super. */
export async function reviewNews(
  actor: Actor,
  access: NewsAccess,
  id: string,
  decision: "approve" | "reject" | "unpublish",
  note?: string,
): Promise<NewsResult> {
  const db = getDb();
  const [row] = await db
    .select({ division: newsItems.division, status: newsItems.status })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Kabar tidak ditemukan." };
  if (!access.curate.includes(row.division as Division)) {
    return { ok: false, error: "Anda bukan kurator divisi itu." };
  }

  const status: NewsStatus =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "submitted";

  await db
    .update(newsItems)
    .set({
      status,
      // Unpublishing keeps the pin off so it does not jump back to the top when
      // it is approved again.
      pinned: decision === "approve" ? undefined : false,
      reviewedBy: actor.id,
      reviewedByName: actor.name ?? actor.email,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(newsItems.id, id));

  await audit(actor, `news.${decision}`, { id, division: row.division });
  return { ok: true, data: undefined };
}

/** Pin to the top of the rail, or unpin. */
export async function setPinned(actor: Actor, access: NewsAccess, id: string, pinned: boolean): Promise<NewsResult> {
  const db = getDb();
  const [row] = await db
    .select({ division: newsItems.division })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Kabar tidak ditemukan." };
  if (!access.curate.includes(row.division as Division)) {
    return { ok: false, error: "Anda bukan kurator divisi itu." };
  }
  await db.update(newsItems).set({ pinned, updatedAt: new Date() }).where(eq(newsItems.id, id));
  await audit(actor, "news.pin", { id, pinned });
  return { ok: true, data: undefined };
}

/**
 * Move a kabar one slot up or down within its week. Ordering is a small,
 * curator-only act; a full drag-and-drop reorder would be a lot of machinery for
 * a list that never exceeds six visible rows.
 */
export async function moveNews(
  actor: Actor,
  access: NewsAccess,
  id: string,
  direction: "up" | "down",
): Promise<NewsResult> {
  const db = getDb();
  const [row] = await db
    .select({ division: newsItems.division, weekStart: newsItems.weekStart, sortOrder: newsItems.sortOrder })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Kabar tidak ditemukan." };
  if (!access.curate.includes(row.division as Division)) {
    return { ok: false, error: "Anda bukan kurator divisi itu." };
  }

  const delta = direction === "up" ? -1 : 1;
  await db
    .update(newsItems)
    .set({ sortOrder: sql`${newsItems.sortOrder} + ${delta}`, updatedAt: new Date() })
    .where(eq(newsItems.id, id));
  await audit(actor, "news.move", { id, direction });
  return { ok: true, data: undefined };
}

// ── Quotes ────────────────────────────────────────────────────────────────

export type QuoteRow = {
  id: string;
  text: string;
  arabic: string | null;
  source: string | null;
  active: boolean;
  sortOrder: number;
};

export async function listAllQuotes(): Promise<QuoteRow[]> {
  const rows = await getDb()
    .select({
      id: tvQuotes.id,
      text: tvQuotes.text,
      arabic: tvQuotes.arabic,
      source: tvQuotes.source,
      active: tvQuotes.active,
      sortOrder: tvQuotes.sortOrder,
    })
    .from(tvQuotes)
    .orderBy(asc(tvQuotes.sortOrder), asc(tvQuotes.createdAt));
  return rows;
}

export type QuoteInput = { text: string; arabic?: string | null; source?: string | null };

/** Any curator may edit the quote list — it is shared, not per-division. */
export async function addQuote(actor: Actor, access: NewsAccess, input: QuoteInput): Promise<NewsResult> {
  if (access.curate.length === 0) return { ok: false, error: "Hanya kurator yang bisa mengubah quote." };
  const text = input.text.trim();
  if (text.length < 8) return { ok: false, error: "Quote terlalu pendek." };
  if (text.length > 200) return { ok: false, error: "Quote maksimal 200 karakter." };

  await getDb().insert(tvQuotes).values({
    text,
    arabic: input.arabic?.trim() || null,
    source: input.source?.trim() || null,
    createdBy: actor.id,
  });
  await audit(actor, "quote.add", { text });
  return { ok: true, data: undefined };
}

export async function setQuoteActive(actor: Actor, access: NewsAccess, id: string, active: boolean): Promise<NewsResult> {
  if (access.curate.length === 0) return { ok: false, error: "Hanya kurator yang bisa mengubah quote." };
  await getDb().update(tvQuotes).set({ active, updatedAt: new Date() }).where(eq(tvQuotes.id, id));
  await audit(actor, "quote.active", { id, active });
  return { ok: true, data: undefined };
}

export async function deleteQuote(actor: Actor, access: NewsAccess, id: string): Promise<NewsResult> {
  if (access.curate.length === 0) return { ok: false, error: "Hanya kurator yang bisa mengubah quote." };
  await getDb().delete(tvQuotes).where(eq(tvQuotes.id, id));
  await audit(actor, "quote.delete", { id });
  return { ok: true, data: undefined };
}

// ── Division membership (used by /admin/users) ────────────────────────────

export type DivisionGrant = { staffId: string; division: string; role: string };

export async function listDivisionGrants(): Promise<DivisionGrant[]> {
  return getDb()
    .select({
      staffId: staffDivisions.staffId,
      division: staffDivisions.division,
      role: staffDivisions.role,
    })
    .from(staffDivisions);
}

/**
 * Set (or clear) one staff member's role in one division. `role: null` removes
 * the row — there is no "member with no rights" state worth keeping.
 */
export async function setDivisionRole(
  actor: Actor,
  input: { email: string; division: string; role: "contributor" | "curator" | null },
): Promise<NewsResult> {
  if (!isDivision(input.division)) return { ok: false, error: "Divisi tidak dikenal." };

  const db = getDb();
  const [row] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.email, input.email.trim().toLowerCase()))
    .limit(1);
  if (!row) return { ok: false, error: `Akun ${input.email} tidak ditemukan.` };

  if (input.role === null) {
    await db
      .delete(staffDivisions)
      .where(and(eq(staffDivisions.staffId, row.id), eq(staffDivisions.division, input.division)));
  } else {
    await db
      .insert(staffDivisions)
      .values({ staffId: row.id, division: input.division, role: input.role })
      .onConflictDoUpdate({
        target: [staffDivisions.staffId, staffDivisions.division],
        set: { role: input.role },
      });
  }

  await audit(actor, "division.set", { email: input.email, division: input.division, role: input.role });
  return { ok: true, data: undefined };
}
