import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { programs } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isPendingApproval } from "@/lib/programs/discovery";
import { presensiParentOf } from "@/lib/programs/config";
import type { SessionPayload } from "@/lib/auth/session";

export type Program = typeof programs.$inferSelect;

/**
 * Resolve a program by slug. Memoized per request (React `cache`) so the many
 * call sites that each need the program row don't re-query within one render.
 */
export const getProgram = cache(async (slug: string): Promise<Program | null> => {
  const db = getDb();
  const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
  return program ?? null;
});

/**
 * All *live* programs, ordered by name — for the nav, the switcher, the
 * coordinator overview and the report pickers.
 *
 * Rows the sync created by itself are excluded until approved: they carry
 * `config.discovery` without `approvedAt` and hold no data (they are seeded
 * paused), so surfacing them would put an empty program in everyone's nav.
 * /admin/programs reads the full table separately. See lib/programs/discovery.ts.
 */
export const getAllPrograms = cache(async (): Promise<Program[]> => {
  const db = getDb();
  const rows = await db.select().from(programs).orderBy(asc(programs.name));
  return rows.filter((p) => !isPendingApproval(p.config));
});

/** Every row including unapproved discoveries — admin surfaces only. */
export const getAllProgramsIncludingPending = cache(async (): Promise<Program[]> => {
  const db = getDb();
  return db.select().from(programs).orderBy(asc(programs.name));
});

/** Program ids the user may access: all for a super_coordinator, else the granted slugs. */
export async function getAccessiblePrograms(user: SessionPayload): Promise<Program[]> {
  const all = await getAllPrograms();
  if (user.role === "super_coordinator") return all;
  return all.filter((p) => user.programs.includes(p.slug));
}

/**
 * Returns the program only if `user` is allowed to see it: a super_coordinator
 * sees every program; a coordinator only the slugs granted in their session
 * claim (populated from `staff_programs` at login). Sessions issued before P2
 * carry no grants, so their holders must re-login before any program access.
 */
export async function resolveProgramAccess(
  user: SessionPayload,
  slug: string,
): Promise<Program | null> {
  if (user.role === "super_coordinator" || user.programs.includes(slug)) return getProgram(slug);
  // A paired presensi program (hkm-presensi) belongs to its parent (hkm): the
  // parent's dashboard embeds it as a tab, so a grant on the parent covers it.
  const parent = presensiParentOf(await getAllPrograms(), slug);
  if (parent && user.programs.includes(parent.slug)) return getProgram(slug);
  return null;
}

/**
 * Page/action guard: require an authenticated user with access to `slug`.
 * Throws sentinel errors the caller maps to redirect()/notFound(); kept free of
 * next/navigation imports so it stays usable from both pages and server actions.
 */
export async function requireProgramAccess(
  slug: string,
): Promise<{ user: SessionPayload; program: Program }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const program = await resolveProgramAccess(user, slug);
  if (!program) throw new Error("PROGRAM_FORBIDDEN");
  return { user, program };
}
