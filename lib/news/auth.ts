/**
 * Session → news Actor. One place resolves "who is writing this kabar", so the
 * pages and the Server Actions cannot drift apart on who counts as a curator.
 */
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { staff } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { SessionPayload } from "@/lib/auth/session";
import { getNewsAccess, type Actor, type NewsAccess } from "@/lib/news/service";

export type NewsSession = { actor: Actor; access: NewsAccess };

/** Which news links the chrome should show. Never redirects — nav only. */
export type NewsNav = { kabar: boolean; kurasi: boolean };

/**
 * Nav-only view of the division rights, for headers on pages that have nothing
 * to do with kabar. Returns all-false for a signed-out visitor rather than
 * redirecting, so a page can render its own guard.
 */
export async function getNewsNav(user: SessionPayload | null): Promise<NewsNav> {
  if (!user) return { kabar: false, kurasi: false };
  const access = await getNewsAccess({
    id: user.sub,
    email: user.email,
    name: null,
    isSuper: user.role === "super_coordinator",
  });
  return { kabar: access.contribute.length > 0, kurasi: access.curate.length > 0 };
}

/**
 * Gate a news screen or action. Redirects to /login when signed out and to
 * /overview when the account belongs to no division — every mutation calls this
 * too, so the division check is enforced server-side, not by hiding buttons.
 */
export async function requireNewsUser(opts: { curator?: boolean } = {}): Promise<NewsSession> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isSuper = user.role === "super_coordinator";
  const [row] = await getDb()
    .select({ name: staff.name })
    .from(staff)
    .where(eq(staff.id, user.sub))
    .limit(1);

  const actor: Actor = { id: user.sub, email: user.email, name: row?.name ?? null, isSuper };
  const access = await getNewsAccess(actor);

  if (access.contribute.length === 0) redirect("/overview");
  if (opts.curator && access.curate.length === 0) redirect("/berita");

  return { actor, access };
}
