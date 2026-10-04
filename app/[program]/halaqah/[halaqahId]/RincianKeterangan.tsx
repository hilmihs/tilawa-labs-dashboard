import { ChevronDown } from "lucide-react";
import type { AttendanceCell, DetailStudent, HalaqahDetail, Meeting } from "@/lib/insights/halaqah";
import { attendanceStatus, toneBadgeClass } from "@/lib/ui/status";

/**
 * The reason a pengajar recorded for one presensi cell, or null when there is
 * nothing to show. Exported so the matrix cell tooltip and this list are
 * always built from the same string.
 *
 * Parts are only ever assembled from values that are present, so there is no
 * way to emit a half-filled phrase like "telat  menit".
 */
export function reasonText(cell: AttendanceCell): string | null {
  const late =
    cell.lateMinutes != null
      ? `telat ${cell.lateMinutes} menit`
      : cell.lateAt != null
        ? `telat pukul ${cell.lateAt}`
        : null;
  if (cell.note && late) return `${cell.note} (${late})`;
  return cell.note ?? late;
}

/** "2026-07-21" → "21/07". Mirrors the matrix header's date format. */
function shortDate(d: string | null): string {
  if (!d) return "-";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

type Entry = { student: DetailStudent; cell: AttendanceCell; reason: string };
type Group = { meeting: Meeting; index: number; entries: Entry[] };

/**
 * Flat list of every recorded reason under the matrix, so the information is
 * reachable without hovering — which is the only way it works on a phone, and
 * the only way the 256-character reasons are readable in full.
 *
 * Grouping deliberately mirrors the grid: meetings in column order, students in
 * row order, so scanning the two together needs no re-orientation.
 */
export function RincianKeterangan({
  meetings,
  students,
  matrix,
}: {
  meetings: Meeting[];
  students: DetailStudent[];
  matrix: HalaqahDetail["matrix"];
}) {
  const groups: Group[] = [];
  let total = 0;

  meetings.forEach((meeting, index) => {
    const entries: Entry[] = [];
    for (const student of students) {
      const cell = matrix[student.halaqahUserId]?.[meeting.jadwalId];
      if (!cell) continue;
      const reason = reasonText(cell);
      if (!reason) continue;
      entries.push({ student, cell, reason });
    }
    if (entries.length > 0) {
      groups.push({ meeting, index, entries });
      total += entries.length;
    }
  });

  // Nothing recorded — render nothing rather than an empty-state card, which
  // would be a loud affordance for data that simply does not exist.
  if (total === 0) return null;

  return (
    <details className="group rounded-xl border border-neutral-200 dark:border-neutral-800">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>Rincian keterangan ({total})</span>
        <ChevronDown className="size-4 text-ink-faint transition-transform group-open:rotate-180" />
      </summary>

      <div className="max-h-80 space-y-3 overflow-y-auto border-t border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-xs text-ink-muted">
          Keterangan diisi pengajar saat presensi; tidak semua ketidakhadiran ada keterangannya.
        </p>

        {groups.map(({ meeting, index, entries }) => (
          <div key={meeting.jadwalId}>
            <div className="text-xs font-medium text-ink-muted">
              P{meeting.order ?? index + 1} · {shortDate(meeting.date)}
            </div>
            <ul className="mt-1 space-y-1">
              {entries.map(({ student, cell, reason }) => {
                const st = attendanceStatus[cell.status];
                return (
                  <li key={student.halaqahUserId} className="flex min-w-0 items-baseline gap-2 text-xs">
                    <span
                      className={`shrink-0 rounded px-1 py-0.5 ${
                        st ? toneBadgeClass[st.tone] : "bg-neutral-100 dark:bg-neutral-800"
                      }`}
                    >
                      {st ? st.label : "?"}
                    </span>
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{student.name ?? "-"}</span>{" "}
                      <span className="text-ink-muted">— {reason}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
