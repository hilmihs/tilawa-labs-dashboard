import { getAccessiblePrograms, getAllPrograms, getProgram } from "@/lib/programs/resolve";
import { getBatchSiblings } from "@/lib/programs/families";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Report scope: which program rows a participant report reads from.
 *
 * A "program" in this codebase is really one BATCH of a program (hits-regular,
 * hits-regular-apr, hits-regular-jan are three rows of the same real program,
 * tied together by config.batch.family — see lib/programs/families.ts). The
 * report tab lets a coordinator read one batch, or every batch of the family at
 * once; this module resolves the URL (`slug` + `?batch=`) into the set of
 * program ids the queries should filter on.
 *
 * Access is enforced HERE, not by the caller: the combined scope is intersected
 * with the programs the session may see, so `?batch=all` can never widen a
 * coordinator's reach past their own grants.
 */
export type ScopeMember = {
  slug: string;
  label: string; // batch label, e.g. "April 2026"
  order: number;
  programId: string;
  programName: string;
};

export type ReportScope = {
  combined: boolean;
  /** The slug in the URL. Its threshold and name anchor the report. */
  primary: ScopeMember;
  /** [primary] when not combined; every accessible sibling when combined. */
  members: ScopeMember[];
  programIds: string[];
  /** "April 2026" / "Semua batch" — shown in the UI. */
  label: string;
  /** Title for the xlsx / report header. */
  programName: string;
};

/** One pill in the report's batch picker. `combined` marks the all-batches pill. */
export type BatchOption = { label: string; href: string; current: boolean; combined: boolean };

export const COMBINED = "all";

/** "HITS Reguler (Batch April 2026)" → "HITS Reguler". */
function familyName(programName: string): string {
  return programName.replace(/\s*\(Batch[^)]*\)\s*$/i, "").trim();
}

/**
 * Members of `slug`'s batch family, newest first, filtered to what the caller
 * may read. Empty when the program has no family at all (→ single-batch
 * program, no picker).
 *
 * `allowed` is passed IN rather than read from the session, because a bearer
 * caller has no session: the old version called getCurrentUser() here and
 * returned [] for machines, which made `?batch=all` silently collapse to a
 * single batch instead of failing. Pass "all" for a credential that legitimately
 * spans every program; pass a slug set for a human.
 */
function siblingScope(
  siblings: Awaited<ReturnType<typeof getBatchSiblings>>,
  byslug: Map<string, { id: string; name: string }>,
): ScopeMember[] {
  return siblings
    .map((s) => {
      const p = byslug.get(s.slug);
      return p
        ? { slug: s.slug, label: s.label, order: s.order, programId: p.id, programName: p.name }
        : null;
    })
    .filter((m): m is ScopeMember => m !== null);
}

/** Family members the CURRENT SESSION may read. Empty with no session. */
async function accessibleSiblings(slug: string): Promise<ScopeMember[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const siblings = await getBatchSiblings(slug);
  if (siblings.length === 0) return [];
  const allowed = new Map((await getAccessiblePrograms(user)).map((p) => [p.slug, p]));
  return siblingScope(siblings, allowed);
}

/** Family members with no access filter — for AGENT_TOKEN, which spans all programs. */
async function allSiblings(slug: string): Promise<ScopeMember[]> {
  const siblings = await getBatchSiblings(slug);
  if (siblings.length === 0) return [];
  const all = new Map((await getAllPrograms()).map((p) => [p.slug, p]));
  return siblingScope(siblings, all);
}

/**
 * Resolve `?batch=` into a scope. Returns null when the slug is unknown — the
 * CALLER must already have checked access to `slug` (requireProgramAccess);
 * this only widens to siblings the session can also see.
 */
export async function resolveReportScope(
  slug: string,
  batch?: string | null,
): Promise<ReportScope | null> {
  return buildScope(slug, batch, accessibleSiblings);
}

/**
 * Same resolution for a bearer (AGENT_TOKEN) caller: no session, so family
 * members come from the full program list. Read-only either way — this widens
 * nothing a machine could not already read one slug at a time.
 */
export async function resolveReportScopeForAgent(
  slug: string,
  batch?: string | null,
): Promise<ReportScope | null> {
  return buildScope(slug, batch, allSiblings);
}

async function buildScope(
  slug: string,
  batch: string | null | undefined,
  siblingsOf: (slug: string) => Promise<ScopeMember[]>,
): Promise<ReportScope | null> {
  const program = await getProgram(slug);
  if (!program) return null;

  const self: ScopeMember = {
    slug,
    label: "",
    order: 0,
    programId: program.id,
    programName: program.name,
  };
  const single = (m: ScopeMember): ReportScope => ({
    combined: false,
    primary: m,
    members: [m],
    programIds: [m.programId],
    label: m.label || m.programName,
    programName: m.programName,
  });

  const siblings = await siblingsOf(slug);
  const me = siblings.find((s) => s.slug === slug) ?? self;

  // Combining needs a family with at least two batches this session may read.
  if (batch !== COMBINED || siblings.length < 2) return single(me);

  return {
    combined: true,
    primary: me,
    members: siblings,
    programIds: siblings.map((m) => m.programId),
    label: "Semua batch",
    programName: `${familyName(me.programName)} — Semua Batch`,
  };
}

/** Same scope, narrowed to one member — used to build the per-batch breakdown. */
export function memberScope(scope: ReportScope, member: ScopeMember): ReportScope {
  return {
    combined: false,
    primary: member,
    members: [member],
    programIds: [member.programId],
    label: member.label || member.programName,
    programName: member.programName,
  };
}

/** Members oldest → newest, the order the per-batch breakdown reads in. */
export function chronological(scope: ReportScope): ScopeMember[] {
  return [...scope.members].sort((a, b) => a.order - b.order);
}

/**
 * Pills for the report's batch picker: one per accessible batch (newest first,
 * matching BatchSwitcher) plus a combined option. Empty when there is nothing
 * to choose between — a program with one batch renders no picker at all.
 */
export async function getBatchOptions(
  slug: string,
  batch?: string | null,
  /** Sub-path the pills link to — the picker is shared by /report and /perubahan. */
  path = "report",
): Promise<BatchOption[]> {
  const siblings = await accessibleSiblings(slug);
  if (siblings.length < 2) return [];
  const isCombined = batch === COMBINED;
  // The newest batch anchors the combined URL so it stays the same link from
  // whichever batch page the coordinator started on.
  const canonical = siblings[0].slug;
  return [
    ...siblings.map((s) => ({
      label: s.label,
      href: `/${s.slug}/${path}`,
      current: !isCombined && s.slug === slug,
      combined: false,
    })),
    {
      label: "Semua batch",
      href: `/${canonical}/${path}?batch=${COMBINED}`,
      current: isCombined,
      combined: true,
    },
  ];
}
