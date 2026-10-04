import { NextResponse } from "next/server";
import { auditAgentRead } from "./_audit";

/**
 * The ONE way an /api/agent/* route returns a body. It owns the `meta`
 * envelope, the size ceiling, the no-store headers, and the audit call — put
 * here so they cannot be forgotten in route number fourteen.
 */

/** Hard ceiling on a single agent response. One badly-phrased question must not dump a whole roster. */
const MAX_BYTES = 512 * 1024;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

export type AgentOpts = {
  program?: string;
  /** The per-key limit that was applied. */
  caps?: Record<string, number>;
  /**
   * The REAL total for each capped key — always present, even when nothing was
   * cut. The agent must never be able to read "3 at-risk" off a list that was
   * silently trimmed.
   */
  truncated?: Record<string, number>;
  /** Allowlisted params only (see readParams). Goes to the audit row. */
  query?: Record<string, string>;
  startedAt?: number;
};

/** Collects caps + real totals while a route trims its lists. */
export function collector() {
  const caps: Record<string, number> = {};
  const truncated: Record<string, number> = {};
  return {
    caps,
    truncated,
    /** Trim `items` to `limit`, recording the limit and the FULL length. */
    take<T>(key: string, items: readonly T[], limit: number): T[] {
      caps[key] = limit;
      truncated[key] = items.length;
      return items.slice(0, limit);
    },
  };
}

export async function agentJson(
  req: Request,
  data: Record<string, unknown>,
  opts: AgentOpts = {},
): Promise<NextResponse> {
  const body = {
    ...data,
    meta: {
      ...(opts.program ? { program: opts.program } : {}),
      generatedAt: new Date().toISOString(),
      ...(opts.caps && Object.keys(opts.caps).length ? { caps: opts.caps } : {}),
      ...(opts.truncated && Object.keys(opts.truncated).length
        ? { truncated: opts.truncated }
        : {}),
    },
  };

  const text = JSON.stringify(body);
  const bytes = Buffer.byteLength(text);
  const ms = opts.startedAt ? Date.now() - opts.startedAt : undefined;

  if (bytes > MAX_BYTES) {
    return agentError(req, 413, "respons terlalu besar", {
      ...opts,
      extra: { bytes, limit: MAX_BYTES, hint: "pakai ?limit / ?fields / ?offset" },
    });
  }

  await auditAgentRead(req, {
    status: 200,
    program: opts.program,
    query: opts.query,
    ms,
    bytes,
  });
  return new NextResponse(text, { status: 200, headers: JSON_HEADERS });
}

export async function agentError(
  req: Request,
  status: number,
  error: string,
  opts: AgentOpts & { extra?: Record<string, unknown> } = {},
): Promise<NextResponse> {
  await auditAgentRead(req, {
    status,
    program: opts.program,
    query: opts.query,
    ms: opts.startedAt ? Date.now() - opts.startedAt : undefined,
    failed: true,
  });
  return NextResponse.json({ error, ...(opts.extra ?? {}) }, { status, headers: JSON_HEADERS });
}

// ── Query params ─────────────────────────────────────────────────────────────

/**
 * Per-key value rules, shared across endpoints. A key with no rule here is a
 * programming error — readParams rejects it so a typo in an ALLOW list cannot
 * silently become an unvalidated param.
 */
const RULES: Record<string, (v: string) => boolean> = {
  limit: (v) => /^\d{1,4}$/.test(v) && Number(v) <= 1000,
  offset: (v) => /^\d{1,6}$/.test(v),
  start: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  end: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  month: (v) => /^\d{4}-\d{2}$/.test(v),
  fields: (v) => /^[a-zA-Z]+(,[a-zA-Z]+)*$/.test(v),
  batch: (v) => v === "all",
  mode: (v) => v === "kumulatif" || v === "bulanan",
  status: (v) => /^[a-z_]{1,20}$/.test(v),
  type: (v) => /^[a-z-]{1,30}$/.test(v),
  programs: (v) => /^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(v),
  // boolean flags — presence with "1" is the only accepted form
  raw: (v) => v === "1",
  grid: (v) => v === "1",
  rows: (v) => v === "1",
  quality: (v) => v === "1",
  summary: (v) => v === "1",
  expand: (v) => /^[a-zA-Z]+$/.test(v),
};

export type ParamResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; error: string };

/**
 * Read the query string against a per-endpoint allowlist. An unknown key is a
 * 400 that NAMES the valid keys — never a silent ignore. Silently ignoring is
 * how the agent ends up reporting a field the server never sent.
 */
export function readParams(url: URL, allow: readonly string[]): ParamResult {
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (!allow.includes(key)) {
      return {
        ok: false,
        error: `parameter "${key}" tidak dikenal. Yang sah: ${allow.join(", ") || "(tidak ada)"}`,
      };
    }
    const rule = RULES[key];
    if (!rule) return { ok: false, error: `parameter "${key}" belum punya aturan validasi` };
    if (!rule(value)) return { ok: false, error: `nilai parameter "${key}" tidak sah: ${value}` };
    params[key] = value;
  }
  return { ok: true, params };
}

/** A bounded integer param with a default and a hard ceiling. */
export function intParam(
  params: Record<string, string>,
  key: string,
  fallback: number,
  ceiling: number,
): number {
  const raw = params[key];
  if (raw == null) return fallback;
  return Math.min(Number(raw), ceiling);
}

/**
 * A program slug is interpolated into a path segment and read from user text,
 * so validate its shape before it reaches any loader.
 */
export function validSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(slug);
}
