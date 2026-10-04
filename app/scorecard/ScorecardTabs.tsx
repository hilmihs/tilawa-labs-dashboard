import Link from "next/link";
import { OYP_SUBS, SUB_LABEL, type Subdivision } from "@/lib/scorecard/queries";

/**
 * Tabs for the scorecard: CAT + one per OYP sub-division. Server component, active
 * tab read from ?tab= (same shape as the dashboard's MabniTabs). `period` is
 * carried through so switching tabs stays on the selected quarter.
 */
export function ScorecardTabs({ tab, periodId }: { tab: Subdivision; periodId?: string }) {
  const q = periodId ? `&period=${periodId}` : "";
  const tabs: { key: Subdivision; label: string }[] = [
    { key: "cat", label: "CAT" },
    ...OYP_SUBS.map((s) => ({ key: s, label: SUB_LABEL[s].replace("OYP ", "") })),
  ];
  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/scorecard?tab=${t.key}${q}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700 dark:text-blue-300"
                : "border-transparent text-ink-muted hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
