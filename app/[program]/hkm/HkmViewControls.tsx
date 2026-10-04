"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented";
import { monthLabel } from "@/lib/insights/hkm";

/** Kumulatif ↔ Bulanan toggle + month picker. Drives the RSC via URL query. */
export function HkmViewControls({
  mode,
  month,
  monthOptions,
}: {
  mode: "kumulatif" | "bulanan";
  month: string;
  monthOptions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function setParam(next: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(next)) params.set(k, v);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        size="sm"
        value={mode}
        onChange={(v) => setParam({ mode: v })}
        options={[
          { value: "bulanan", label: "Bulanan" },
          { value: "kumulatif", label: "Kumulatif" },
        ]}
      />
      {mode === "bulanan" && (
        <select
          value={month}
          onChange={(e) => setParam({ month: e.target.value })}
          className="rounded-lg border border-neutral-300 bg-transparent px-2.5 py-1 text-xs dark:border-neutral-700"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
