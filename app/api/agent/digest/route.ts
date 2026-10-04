import { NextResponse } from "next/server";
import { getAllPrograms, type Program } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { readBatchConfig } from "@/lib/programs/families";
import { getInsights } from "@/lib/insights/queries";
import { getProgramsOverview } from "@/lib/insights/overview";
import { getLastSync } from "@/lib/sync/last-sync";
import { getHkmDashboardData } from "@/app/[program]/hkm/queries";
import { listRecentIncidents } from "@/app/[program]/piket/actions";
import { agentAuthOr401 } from "../_auth";
import { agentJson, readParams } from "../_respond";

export const dynamic = "force-dynamic";

const ALLOW = ["programs"] as const;

/**
 * One call that answers "what needs my attention" across every program.
 *
 * Without it the agent makes 1 + N + 1 calls and dumps a full InsightBundle per
 * program into its context. That is the difference between the feature working
 * and the feature being unusable, so the shape here is chosen for a reader with
 * a token budget, not for completeness.
 *
 * Three rules that are not negotiable:
 *  1. Every `top.*` list is capped, and `truncated` always carries the REAL
 *     total — so "3 at-risk" can never be read off a list that was trimmed.
 *  2. No phone numbers. Anywhere. Ever. They live on /insights, /pengajar and
 *     /peserta?fields=phone, which means getting one is a deliberate, audited
 *     second call — and forwarding this digest cannot leak contact data.
 *  3. Nothing is summed across a batch family. `family` is on every row;
 *     grouping is the caller's decision (HERMES.md:110-113).
 */
const TOP = 3;

/** Data older than this (and not paused) means alert + hold reminders. HERMES.md §6. */
const STALE_AFTER_MINUTES = 120;

/**
 * Programs processed per wave. getInsights runs ~6 statements, so the whole set
 * at once would put ~70+ concurrent queries on one pg pool. Widen this only
 * after measuring against the real VPS.
 */
const WAVE = 4;

async function inWaves<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await agentAuthOr401(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = readParams(new URL(req.url), ALLOW);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const wanted = parsed.params.programs ? parsed.params.programs.split(",") : null;
  const all = await getAllPrograms();
  const scoped = wanted ? all.filter((p) => wanted.includes(p.slug)) : all;

  const overview = new Map(
    (await getProgramsOverview(scoped.map((p) => p.slug))).map((o) => [o.slug, o]),
  );

  const now = Date.now();
  const programs = await inWaves(scoped, WAVE, async (p: Program) => {
    const cfg = getProgramConfig(p);
    const batch = readBatchConfig(p.config);
    const paused = (p.config as { syncPaused?: boolean } | null)?.syncPaused === true;

    const ls = await getLastSync(p.slug);
    const ageMinutes =
      ls?.finishedAt != null ? Math.floor((now - new Date(ls.finishedAt).getTime()) / 60_000) : null;

    const base = {
      slug: p.slug,
      name: p.name,
      family: batch?.family ?? null,
      batchLabel: batch?.label ?? null,
      dataSource: p.dataSourceType,
      paused,
      sync: {
        finishedAt: ls?.finishedAt ?? null,
        lastStatus: ls?.lastStatus ?? null,
        running: ls?.running ?? false,
        ageMinutes,
        stale: paused ? false : ageMinutes == null || ageMinutes > STALE_AFTER_MINUTES,
      },
    };

    // HKM is measured in PAGES against a target, never in attendance percent.
    // Giving it an `avgKehadiran` key at all is how that mistake gets made.
    if (p.dataSourceType === "berkah_api") {
      const hkm = await getHkmDashboardData(p.slug, { mode: "kumulatif" });
      if (!hkm) return { ...base, counts: null, top: null, truncated: null };
      return {
        ...base,
        counts: {
          participants: hkm.kpis.total,
          targetPages: hkm.target.targetPages,
          targetJuz: hkm.target.targetJuz,
          avgJuz: hkm.kpis.avgJuz,
          sudahTarget: hkm.kpis.sudahTarget,
          belumTarget: hkm.kpis.belumTarget,
          belumMulai: hkm.kpis.belumMulai,
          atRisk: hkm.kpis.atRisk,
        },
        top: {
          atRisk: hkm.atRisk.slice(0, TOP).map((r) => ({
            nama: r.nama,
            halaqah: r.halaqah,
            pengajar: r.pengajar,
          })),
        },
        truncated: { atRisk: hkm.atRisk.length },
      };
    }

    const ins = await getInsights(p.slug);
    const ov = overview.get(p.slug);

    let piketNeedsSp: number | null = null;
    if (cfg.features.piket) {
      const incidents = await listRecentIncidents(p.slug, 200);
      piketNeedsSp = incidents.filter((i) => i.sp_required && !i.sp_generated_at).length;
    }

    if (!ins) {
      return { ...base, counts: { ...(ov ?? {}), piketNeedsSp }, top: null, truncated: null };
    }

    const kritis = ins.halaqahHealth.filter((h) => h.tier === "kritis");

    return {
      ...base,
      counts: {
        students: ov?.studentCount ?? null,
        halaqah: ov?.halaqahCount ?? null,
        avgKehadiran: ov?.avgKehadiran ?? null,
        thresholdPct: ins.thresholdPct,
        belowThreshold: ov?.belowThresholdCount ?? null,
        presensiGapHalaqah: ins.counts.presensiGapHalaqah,
        teacherGapMeetings: ins.counts.teacherGapMeetings,
        partialMeetings: ins.counts.partialMeetings,
        atRisk: ins.counts.atRisk,
        halaqahKritis: ins.counts.halaqahKritis,
        piketNeedsSp,
      },
      top: {
        // guruPhone is deliberately dropped on the way out — see rule 2 above.
        presensiGaps: ins.presensiGaps.slice(0, TOP).map((g) => ({
          halaqah: g.halaqahName,
          pengajar: g.pengajar,
          empty: g.emptyMeetings.length,
          partial: g.partialMeetings.length,
          oldestDate: g.emptyMeetings[0]?.date ?? g.partialMeetings[0]?.date ?? null,
        })),
        halaqahKritis: kritis.slice(0, TOP).map((h) => ({
          halaqah: h.halaqahName,
          pengajar: h.pengajar,
          avgKehadiran: h.avgKehadiran,
        })),
        atRisk: ins.atRisk.slice(0, TOP).map((s) => ({
          nama: s.name,
          halaqah: s.halaqahName,
          kehadiran: s.kehadiran,
        })),
      },
      truncated: {
        presensiGaps: ins.presensiGaps.length,
        halaqahKritis: kritis.length,
        atRisk: ins.atRisk.length,
      },
    };
  });

  return agentJson(
    req,
    {
      staleAfterMinutes: STALE_AFTER_MINUTES,
      stalenessRule: "lastSync > 2 jam DAN tidak paused",
      topPerList: TOP,
      note: "top.* dipotong ke 3; angka sebenarnya ada di truncated. Jangan menjumlahkan slug satu family.",
      programs,
    },
    { query: parsed.params, startedAt },
  );
}
