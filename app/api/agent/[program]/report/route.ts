import { getAllPrograms } from "@/lib/programs/resolve";
import {
  getExitedParticipants,
  getHitsMonthlyReport,
  getParticipantReport,
  getTeacherReport,
} from "@/lib/reports/queries";
import { COMBINED, resolveReportScopeForAgent } from "@/lib/reports/scope";
import { agentProgram } from "../../_program";
import { agentError, agentJson, collector, intParam } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["type", "start", "end", "batch", "rows", "limit", "offset"] as const;

const TYPES = ["participant", "hits-bulanan", "teacher"] as const;

/**
 * `teachers` is sorted by meetings taught DESC, so a fixed cut kept the roster's
 * TAIL — the teachers who taught least, which is exactly who a "siapa yang jarang
 * mengajar" question is about — permanently out of reach: 167 teachers, 100
 * returned, and no way to ask for the rest. `?limit`/`?offset` page the list;
 * `meta.truncated.teachers` stays the real total on every page.
 */
const DEFAULT_ROWS = 100;
const MAX_ROWS = 500;

/**
 * The monthly reports as JSON — the same numbers the XLSX carries, without the
 * XLSX. Aggregate blocks by default; `?rows=1` adds the per-student /
 * per-teacher rows.
 *
 * For `type=teacher` the scope is EVERY program, matching what a
 * super_coordinator gets. The cookie path derives that from the session; a
 * bearer caller has none, and the old code path silently produced an empty
 * report rather than an error (see /api/reports route).
 */
export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  const type = params.type ?? "participant";
  if (!TYPES.includes(type as (typeof TYPES)[number])) {
    return agentError(req, 400, `type tidak dikenal: ${type}`, {
      program: slug, query: params, startedAt, extra: { valid: TYPES },
    });
  }

  const { start, end } = params;
  if (!start || !end) {
    return agentError(req, 400, "start & end (YYYY-MM-DD) wajib", {
      program: slug, query: params, startedAt,
    });
  }

  const c = collector();
  const withRows = params.rows === "1";
  const limit = intParam(params, "limit", DEFAULT_ROWS, MAX_ROWS);
  const offset = intParam(params, "offset", 0, 100_000);

  /**
   * take() records the length of what it was handed, so it gets the FULL list and
   * the offset is applied after: `meta.truncated` must stay the real total, never
   * "rows left after the offset" — an agent paging through would read the tail as
   * the whole roster.
   */
  function page<T>(key: string, rows: readonly T[]): T[] {
    const slice = c.take(key, rows, offset + limit).slice(offset);
    c.caps[key] = limit;
    return slice;
  }

  if (type === "teacher") {
    const ids = (await getAllPrograms()).map((p) => p.id);
    const rep = await getTeacherReport(start, end, ids);
    const teachers = page("teachers", rep.teachers);
    return agentJson(
      req,
      {
        program: slug,
        type,
        range: { start, end },
        scope: "semua program",
        totalReal: rep.totalReal,
        totalIdeal: rep.totalIdeal,
        offset,
        // The per-halaqah breakdown is the bulk of this payload; the totals are
        // what a "how are the teachers doing" question needs.
        teachers: withRows
          ? teachers
          : teachers.map((t) => {
              const copy: Partial<typeof t> = { ...t };
              delete copy.halaqah;
              return copy;
            }),
      },
      { program: slug, caps: c.caps, truncated: c.truncated, query: params, startedAt },
    );
  }

  const scope = await resolveReportScopeForAgent(slug, params.batch);
  if (!scope) {
    return agentError(req, 404, "program tidak ditemukan", { program: slug, query: params, startedAt });
  }
  if (params.batch === COMBINED && !scope.combined) {
    return agentError(req, 400, "batch=all diminta tapi program ini hanya punya satu batch", {
      program: slug, query: params, startedAt,
    });
  }

  const exited = await getExitedParticipants(scope, start, end);
  const scopeInfo = {
    combined: scope.combined,
    label: scope.label,
    programName: scope.programName,
    members: scope.members.map((m) => m.slug),
  };

  if (type === "hits-bulanan") {
    const rep = await getHitsMonthlyReport(scope, start, end);
    return agentJson(
      req,
      {
        program: slug, type, range: { start, end }, scope: scopeInfo,
        ...rep,
        exitedCount: exited.length,
        ...(withRows ? { offset, exited: page("exited", exited) } : {}),
      },
      { program: slug, caps: c.caps, truncated: c.truncated, query: params, startedAt },
    );
  }

  const rep = await getParticipantReport(scope, start, end);
  return agentJson(
    req,
    {
      program: slug, type, range: { start, end }, scope: scopeInfo,
      ...rep,
      exitedCount: exited.length,
      ...(withRows ? { offset, exited: page("exited", exited) } : {}),
    },
    { program: slug, caps: c.caps, truncated: c.truncated, query: params, startedAt },
  );
}
