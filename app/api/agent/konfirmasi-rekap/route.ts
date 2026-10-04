import { NextResponse } from "next/server";
import { signRecapToken } from "@/lib/auth/recap-token";
import { buildRecapMessage } from "@/lib/confirmations/message";
import {
  PRESENSI_LOCK_AT,
  RECAP_PERIOD,
  isPresensiLocked,
  lockLabel,
  periodLabel,
} from "@/lib/confirmations/period";
import { listRecapTeachers, listRecapTeachersWithoutGuruId } from "@/lib/confirmations/recap";
import type { RecapSkipped, RecapTeacherSummary } from "@/lib/confirmations/types";
import { getTeacherPhoneMap } from "@/lib/guru/phone";
import { getTeacherSides, type GuruSide } from "@/lib/guru/gender";
import { getRecapPrograms } from "@/lib/confirmations/scope";
import { agentAuthOr401 } from "../_auth";
import { agentError, agentJson, collector, intParam, readParams } from "../_respond";

export const dynamic = "force-dynamic";

/**
 * The blast list for the monthly teaching recap: one row per teacher, with the
 * number to message, the counts to quote, the magic link to /rekap/<token> and
 * the finished WhatsApp copy. Cross-program by design — a teacher holding
 * halaqah in two programs must get ONE message, not two, so this route does not
 * go through agentProgram().
 *
 * Rules that are not negotiable:
 *  1. A teacher without a usable number never appears in `teachers`. They land
 *     in `skipped` with a reason, because HERMES.md §9 forbids guessing a
 *     number — a wrong recipient here means someone else's attendance record
 *     read out to a stranger.
 *  2. The link base comes from env, never from the request Host header. The
 *     caller controls that header, and a signed token pointed at an attacker's
 *     host is a working credential handed away.
 *  3. `skipped` is part of the contract, not an error path. Anyone left out has
 *     to be visible so a human can chase the number.
 *
 * Deliberately NOT offered: a per-teacher filter (`?guru=` / `?only=`). The
 * param allowlist in _respond.ts is shared by every agent route, and adding a
 * name there for one endpoint's convenience widens the validated surface for
 * all of them. To dry-run a single message, page to it: `?limit=1&offset=N`.
 */
const ALLOW = ["start", "end", "limit", "offset"] as const;

/**
 * The roster is ~100 teachers, so the default page covers a whole blast in one
 * call. Each row carries a ~1.5 KB message + token, which means a caller asking
 * for the 1000 ceiling will hit agentJson's 512 KB guard and get a 413 telling
 * it to page — a loud failure, not a silently trimmed blast list.
 */
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * `skipped` carries no message and no link, so it stays cheap — but it is also
 * the list a human has to act on, and silently trimming it to a page would hide
 * exactly the teachers nobody is contacting.
 */
const SKIPPED_CAP = 500;

/** Public origin of the /rekap page. Env only — see rule 2 above. */
const FALLBACK_BASE_URL = "https://tilawa-labs-dashboard.vercel.app";

function recapBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  return (configured || FALLBACK_BASE_URL).replace(/\/+$/, "");
}

/** A summary that survived phone resolution — `phone` is no longer nullable. */
type BlastRow = Omit<RecapTeacherSummary, "phone"> & { phone: string; side: GuruSide | null };

/**
 * Which sender each side is contacted from, decided by the coordinator 16 Aug
 * 2026. Ikhwan go out through the KIRIMI device, akhwat through Baileys — two
 * different coordinator identities, so sending on the wrong one puts the wrong
 * coordinator's name in front of a teacher. A teacher whose side cannot be
 * determined gets NO channel and is reported instead of guessed.
 */
const CHANNEL_BY_SIDE: Record<GuruSide, { channel: string; sender: string }> = {
  ikhwan: { channel: "kirimi", sender: "Koordinator HITS Ikhwan" },
  akhwat: { channel: "baileys", sender: "Koordinator HITS Akhwat" },
};

export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = readParams(new URL(req.url), ALLOW);
  if (!parsed.ok) return agentError(req, 400, parsed.error, { startedAt });
  const params = parsed.params;

  const start = params.start ?? RECAP_PERIOD.start;
  const end = params.end ?? RECAP_PERIOD.end;
  // Both ends are shape-checked by readParams but not ordered, and an inverted
  // window returns zero meetings — which reads as "everyone is done" instead of
  // "you asked for an empty range".
  if (start > end) {
    return agentError(req, 400, "start tidak boleh melewati end", {
      query: params,
      startedAt,
      extra: { start, end },
    });
  }

  const summaries = await listRecapTeachers(start, end);

  // One round trip for the whole roster: a per-teacher phone lookup would be an
  // N+1 against guru_sync, and the blast walks every teacher every time.
  const phones = await getTeacherPhoneMap(
    summaries.map((s) => ({ guruId: s.guruId, nama: s.nama })),
  );

  // Which side of the program each teacher is on, so Hermes knows which sender
  // to use. Inferred from their halaqah — see lib/guru/gender.ts.
  const sides = await getTeacherSides(
    start,
    end,
    (await getRecapPrograms()).map((p) => p.id),
  );

  const skipped: RecapSkipped[] = [];
  const withPhone: BlastRow[] = [];

  for (const s of summaries) {
    // listRecapTeachers deliberately returns no phone (it carries no PII), so
    // the number comes from the identity-keyed resolver or not at all.
    const phone = phones.get(s.guruId) ?? null;
    if (!phone) {
      skipped.push({ guruId: s.guruId, nama: s.nama, reason: "no_phone" });
      continue;
    }
    withPhone.push({ ...s, phone, side: sides.get(s.guruId) ?? null });
  }

  // Meetings whose teacher tilawah never gave an id for cannot be tokenized (the
  // token IS the guru id), so they are reported by name for a manual follow-up.
  for (const nama of await listRecapTeachersWithoutGuruId(start, end)) {
    skipped.push({ guruId: null, nama, reason: "no_guru_id" });
  }

  const limit = intParam(params, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const offset = intParam(params, "offset", 0, 100_000);

  const c = collector();
  // take() records the length of what it was handed, so it is given the FULL
  // list and the offset is applied afterwards: meta.truncated.teachers must be
  // the real roster size, not "rows remaining after the offset" — an agent
  // paging through would otherwise read the tail as the total.
  const page = c.take("teachers", withPhone, offset + limit).slice(offset);
  c.caps.teachers = limit;

  const label = periodLabel(start, end);
  const lock = lockLabel();
  const baseUrl = recapBaseUrl();

  // Only the page is signed: a token is a live credential, so minting one for a
  // teacher the caller never asked for is avoidable exposure.
  const teachers = await Promise.all(
    page.map(async (t) => {
      const token = await signRecapToken({ gid: t.guruId, nama: t.nama, start, end });
      const link = `${baseUrl}/rekap/${token}`;
      const routing = t.side ? CHANNEL_BY_SIDE[t.side] : null;
      return {
        guruId: t.guruId,
        nama: t.nama,
        phone: t.phone,
        // null side = do not send blind. Hermes must report these back rather
        // than pick a sender, because the wrong sender is a wrong coordinator.
        side: t.side,
        channel: routing?.channel ?? null,
        sender: routing?.sender ?? null,
        programs: t.programs,
        counts: t.counts,
        link,
        message: buildRecapMessage({
          nama: t.nama,
          programs: t.programs,
          programSlugs: t.programSlugs,
          counts: t.counts,
          link,
          periodLabel: label,
          lockLabel: lock,
          periodEnd: end,
        }),
      };
    }),
  );

  return agentJson(
    req,
    {
      period: { start, end, label },
      lock: { at: PRESENSI_LOCK_AT, label: lock, locked: isPresensiLocked() },
      offset,
      teachers,
      skipped: c.take("skipped", skipped, SKIPPED_CAP),
      counts: {
        teachers: summaries.length,
        withPhone: withPhone.length,
        skipped: skipped.length,
      },
    },
    { caps: c.caps, truncated: c.truncated, query: params, startedAt },
  );
}
