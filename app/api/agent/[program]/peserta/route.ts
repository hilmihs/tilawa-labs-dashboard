import { getPesertaDirectory, type PesertaRow } from "@/lib/directory/queries";
import { agentProgram } from "../../_program";
import { agentError, agentJson, intParam } from "../../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["limit", "offset", "fields"] as const;

/** Every field a caller may ask for. Anything outside this list is a 400. */
const FIELDS = [
  "tilawahUserId", "name", "userCode", "phone", "gender", "halaqahId", "halaqahName",
  "level", "type", "jadwal", "pengajar", "statusCode", "statusText", "attendanceRate",
  "hadirCount", "effectiveMeetings", "izinCount", "recordedMeetings", "pertemuan",
  "semesterPct",
] as const satisfies readonly (keyof PesertaRow)[];

/**
 * `phone` is NOT in the default set. The common questions ("who is below
 * threshold", "how many peserta") never need a contact number, so getting one
 * has to be an explicit `?fields=…,phone` — a deliberate, audited request
 * rather than a side effect of asking about attendance.
 */
const DEFAULT_FIELDS = FIELDS.filter((f) => f !== "phone");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export async function GET(req: Request, ctx: { params: Promise<{ program: string }> }) {
  const gate = await agentProgram(req, ctx.params, ALLOW);
  if (!gate.ok) return gate.response;
  const { slug, params, startedAt } = gate.ctx;

  let fields: readonly string[] = DEFAULT_FIELDS;
  if (params.fields) {
    const asked = params.fields.split(",");
    const unknown = asked.filter((f) => !FIELDS.includes(f as (typeof FIELDS)[number]));
    if (unknown.length) {
      return agentError(req, 400, `field tidak dikenal: ${unknown.join(", ")}`, {
        program: slug,
        query: params,
        startedAt,
        extra: { valid: FIELDS },
      });
    }
    fields = asked;
  }

  const dir = await getPesertaDirectory(slug);
  if (!dir) {
    return agentError(req, 404, "program tidak punya direktori peserta", {
      program: slug, query: params, startedAt,
    });
  }

  const limit = intParam(params, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const offset = intParam(params, "offset", 0, 100_000);
  const page = dir.rows.slice(offset, offset + limit).map((row) =>
    Object.fromEntries(fields.map((f) => [f, row[f as keyof PesertaRow]])),
  );

  return agentJson(
    req,
    {
      program: slug,
      programName: dir.programName,
      fields,
      offset,
      rows: page,
    },
    {
      program: slug,
      caps: { rows: limit },
      truncated: { rows: dir.rows.length },
      query: params,
      startedAt,
    },
  );
}
