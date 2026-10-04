/**
 * Programs the sync found upstream and created by itself.
 *
 * Until now every program row came from scripts/seed-programs.ts, so a program
 * or batch that appeared in the tilawah CMS stayed invisible here until someone
 * noticed and shipped a deploy — HITS Armalah (upstream program 11, batch 15,
 * three halaqah) ran unmirrored for exactly that reason, and the LAZ batches
 * only attached because tafm-laz had been switched to `syncAllBatches` by hand.
 *
 * The sync now creates the row itself and marks it here. A marked row is
 * deliberately inert: `syncPaused` is set, so the cron leaves it alone, and
 * `getAllPrograms()` filters it out, so it reaches no nav, switcher, overview or
 * report until a super coordinator approves it from /admin/programs. Approval is
 * what a machine cannot supply — the real name, who may see it, whether its
 * report should use the HITS layout.
 *
 * The mark lives in `programs.config.discovery` so this needs no migration and
 * no second table; the config column already carries every other per-program
 * flag. seed-programs.ts never touches slugs it does not list, so an approved
 * discovery survives a deploy.
 */
export type DiscoveryMark = {
  /** "program" = upstream program with no row at all; "batch" = new batch of a
   * pinned batch-family (hits-regular/-jan/-apr), which gets a sibling row. */
  kind: "program" | "batch";
  tilawahProgramId: number;
  tilawahBatchId: number | null;
  upstreamProgramName: string;
  upstreamBatchName: string | null;
  /** ISO. When the sync first created the row. */
  discoveredAt: string;
  /** ISO + actor. Set on approval; its presence is what makes the row live. */
  approvedAt?: string;
  approvedBy?: string;
  /** Operator said "not a real program" — stays paused and hidden, but no
   * longer shown as something awaiting a decision. */
  dismissed?: boolean;
};

type WithDiscovery = { discovery?: Partial<DiscoveryMark> } | null;

/** Read `config.discovery`, or null for a hand-seeded program. */
export function readDiscovery(config: unknown): DiscoveryMark | null {
  const d = (config as WithDiscovery)?.discovery;
  if (!d || typeof d.tilawahProgramId !== "number") return null;
  return {
    kind: d.kind === "batch" ? "batch" : "program",
    tilawahProgramId: d.tilawahProgramId,
    tilawahBatchId: typeof d.tilawahBatchId === "number" ? d.tilawahBatchId : null,
    upstreamProgramName: d.upstreamProgramName ?? "",
    upstreamBatchName: d.upstreamBatchName ?? null,
    discoveredAt: d.discoveredAt ?? "",
    approvedAt: d.approvedAt,
    approvedBy: d.approvedBy,
    dismissed: d.dismissed === true,
  };
}

/**
 * Is this row still waiting for a human? True for both undecided and dismissed
 * discoveries — dismissing hides the card, it does not publish the program.
 */
export function isPendingApproval(config: unknown): boolean {
  const d = readDiscovery(config);
  return d !== null && !d.approvedAt;
}

/** Undecided: created by the sync, neither approved nor dismissed. */
export function isAwaitingDecision(config: unknown): boolean {
  const d = readDiscovery(config);
  return d !== null && !d.approvedAt && d.dismissed !== true;
}

/**
 * Slug from an upstream program name: lowercase, ascii-ish, dash-separated.
 * Collisions are resolved by the caller against the slugs already taken.
 */
export function slugifyProgramName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "program";
}

/** First free slug in `base`, `base-2`, `base-3`, … */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
