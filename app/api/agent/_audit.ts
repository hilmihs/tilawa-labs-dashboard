import { getDb } from "@/lib/db/client";
import { notificationLog } from "@/lib/db/schema";

/**
 * Best-effort audit of agent reads, to notification_log (channel=agent_read).
 * Never throws — same contract and shape as `audit()` in lib/admin/service.ts,
 * which covers writes only. Reads were logged nowhere before this.
 *
 * Why reads are worth logging here when they are not elsewhere: AGENT_TOKEN
 * grants full-PII read across every program. If it ever leaks, this table is
 * the only way to answer "what did they take, and when did it start".
 *
 * Never logs the response body. Never logs the token. `query` must be the
 * per-endpoint ALLOWLISTED params, never the raw query string — a raw one can
 * carry a secret somebody pasted into the wrong place.
 */
export async function auditAgentRead(
  req: Request,
  info: {
    status: number;
    program?: string;
    query?: Record<string, string>;
    ms?: number;
    bytes?: number;
    failed?: boolean;
  },
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(notificationLog).values({
      channel: "agent_read",
      // One credential today. If a second is ever issued, name it here.
      recipient: "agent-token",
      payload: {
        path: new URL(req.url).pathname,
        ...(info.program ? { program: info.program } : {}),
        ...(info.query && Object.keys(info.query).length ? { query: info.query } : {}),
        status: info.status,
        ...(info.ms != null ? { ms: info.ms } : {}),
        ...(info.bytes != null ? { bytes: info.bytes } : {}),
      },
      status: info.failed ? "failed" : "executed",
    });
  } catch {
    // ignore — logging must never turn a successful read into a 500
  }
}
