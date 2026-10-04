/**
 * Juz/Surah reading heatmap — a plain CSS grid of cells whose colour intensity
 * reflects how many times that juz/surah was touched. Server-rendered (no
 * interactivity); no chart lib needed.
 */
function intensityClass(count: number): string {
  if (count <= 0) return "bg-neutral-100 text-ink-faint dark:bg-neutral-800 dark:text-neutral-600";
  if (count === 1) return "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100";
  if (count === 2) return "bg-emerald-400 text-emerald-950 dark:bg-emerald-700 dark:text-emerald-50";
  return "bg-emerald-600 text-white dark:bg-emerald-500";
}

export function Heatmap({
  title,
  counts,
  labelPrefix,
}: {
  title: string;
  counts: number[]; // index i → count for item (i+1)
  labelPrefix: string; // "Juz" | "Surah"
}) {
  const covered = counts.filter((c) => c > 0).length;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink-muted">{title}</h3>
        <span className="text-xs text-ink-faint">
          {covered}/{counts.length} terbaca
        </span>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(1.75rem, 1fr))` }}
      >
        {counts.map((c, i) => (
          <div
            key={i}
            title={`${labelPrefix} ${i + 1}: ${c}×`}
            className={`flex aspect-square items-center justify-center rounded text-11 tabular-nums ${intensityClass(c)}`}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
