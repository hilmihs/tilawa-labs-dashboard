import * as React from "react";
import { cn } from "@/lib/utils";
import {
  attendanceCellClass,
  attendanceCellEmptyClass,
  attendanceStatus,
} from "@/lib/ui/status";

/**
 * Cell colors live in `lib/ui/status.ts` (`attendanceCellClass` /
 * `attendanceCellEmptyClass`) so every attendance matrix paints the design's
 * squares — H #3D7A57, T #94600E, I #3D6078, A #A63F2D, "belum" hollow with a
 * control-weight outline. The contrast rationale is documented there.
 */
const CELL_CLASS = attendanceCellClass;
const EMPTY_CLASS = attendanceCellEmptyClass;

/**
 * Per-meeting attendance strip (P1..Pn) — one small square per meeting painted
 * in the shared presensi tones. `null` marks a meeting that hasn't happened yet.
 */
export function AttendanceHeatmap({
  cells,
  className,
}: {
  cells: Array<number | null>;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex", className)}>
      {cells.map((code, i) => {
        const known = code != null && code in attendanceStatus;
        const status = known ? attendanceStatus[code as number] : null;
        return (
          <i
            key={i}
            title={status ? `P${i + 1} · ${status.name}` : `P${i + 1} · belum`}
            className={cn(
              "block size-3.5",
              known ? CELL_CLASS[code as number] : EMPTY_CLASS,
            )}
          />
        );
      })}
    </span>
  );
}

/** Legend row (H/T/I/A) matching the heatmap tones — for table footers. */
export function AttendanceLegend({ className }: { className?: string }) {
  const items: Array<[string, string]> = [
    ["H", CELL_CLASS[1]],
    ["T", CELL_CLASS[2]],
    ["I", CELL_CLASS[3]],
    ["A", CELL_CLASS[0]],
  ];
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {items.map(([label, color], i) => (
        <span key={label} className={cn("inline-flex items-center gap-1", i > 0 && "ml-2")}>
          <i className={cn("block size-2.5", color)} />
          {label}
        </span>
      ))}
    </span>
  );
}
