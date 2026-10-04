import type { HkmCategory } from "./categorize";

export type RiskInput = {
  category: HkmCategory;
  avgPerDay: number;
  cumulativePages: number;
  lastReadAt: string | Date | null;
};

export type RiskResult = {
  atRisk: boolean;
  reasons: string[]; // human-readable (Indonesian), used in the WA message
};

/**
 * Flag participants needing follow-up. `now` is injectable for testability.
 * A participant is at-risk if they have not started, are below the daily target
 * pace while still behind target, or have gone `staleDays` without reading.
 */
export function assessRisk(
  input: RiskInput,
  opts: { pagesPerDay?: number; staleDays?: number; now?: Date } = {},
): RiskResult {
  const pagesPerDay = opts.pagesPerDay ?? 4;
  const staleDays = opts.staleDays ?? 5;
  const now = opts.now ?? new Date();
  const reasons: string[] = [];

  if (input.category === "Belum Sama Sekali" || input.cumulativePages <= 0) {
    reasons.push("belum mulai tilawah");
  } else {
    if (input.category === "Belum Mencapai Target" && input.avgPerDay < pagesPerDay) {
      reasons.push(
        `rata-rata ${input.avgPerDay} hal/hari (di bawah target ${pagesPerDay} hal/hari)`,
      );
    }
    if (input.lastReadAt) {
      const last = typeof input.lastReadAt === "string" ? Date.parse(input.lastReadAt) : input.lastReadAt.getTime();
      const daysSince = Math.floor((now.getTime() - last) / 86_400_000);
      if (daysSince >= staleDays) {
        reasons.push(`terakhir baca ${daysSince} hari lalu`);
      }
    }
  }

  return { atRisk: reasons.length > 0, reasons };
}
