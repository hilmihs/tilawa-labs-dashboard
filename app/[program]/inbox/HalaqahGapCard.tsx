import { Badge } from "@/components/ui/badge";
import {
  fmtDate,
  groupTitle,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  type GapGroup,
  type HalaqahGapView,
} from "./grouping";

/**
 * One halaqah's backlog: a summary header a coordinator can triage without
 * expanding, then one collapsed row per *cause*. The meeting-by-meeting detail
 * still exists — it is one click away inside each row — but it no longer sets
 * the page's colour or its length.
 */

const GROUPS_VISIBLE = 6;

function MeetingChips({ meetings }: { meetings: GapGroup["meetings"] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {meetings.map((m, i) => (
        <span
          key={`${m.order ?? "?"}-${m.date ?? i}`}
          className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs whitespace-nowrap text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          Pertemuan {m.order ?? "?"} · {fmtDate(m.date)}
        </span>
      ))}
    </div>
  );
}

function GroupRow({ group }: { group: GapGroup }) {
  const urgent = group.severity === "urgent";
  return (
    <details className="group rounded-lg border border-neutral-200 dark:border-neutral-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
        <span
          aria-hidden
          className="text-[11px] text-neutral-400 transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span
          className={
            urgent
              ? "font-medium text-red-700 dark:text-red-300"
              : "text-neutral-800 dark:text-neutral-200"
          }
        >
          {groupTitle(group)}
        </span>
        {urgent && (
          <Badge tone="danger" className="shrink-0">
            {group.ageDays != null ? `${group.ageDays} hari` : "mendesak"}
          </Badge>
        )}
        <span className="ml-auto shrink-0 text-[11px] text-neutral-500">
          {group.kind === "untouched" ? "belum disentuh" : `${group.students.length} peserta`}
        </span>
      </summary>
      <div className="space-y-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
        {group.students.length > 3 && (
          <div className="text-xs text-neutral-500">
            Peserta: <span className="text-neutral-700 dark:text-neutral-300">{group.students.join(", ")}</span>
          </div>
        )}
        <MeetingChips meetings={group.meetings} />
      </div>
    </details>
  );
}

export function HalaqahGapCard({
  view,
  action,
}: {
  view: HalaqahGapView;
  /** The WA reminder control — one per halaqah, rendered by the page. */
  action?: React.ReactNode;
}) {
  const { halaqah, groups, summary, severity } = view;
  const bits: string[] = [];
  if (summary.untouchedMeetings > 0) {
    bits.push(`${summary.untouchedMeetings} pertemuan belum diisi`);
  }
  if (summary.partialMeetings > 0) {
    bits.push(`${summary.partialMeetings} pertemuan belum lengkap`);
  }
  if (summary.affectedStudents > 0) {
    bits.push(`${summary.affectedStudents} peserta terdampak`);
  }
  if (summary.oldestDate) {
    bits.push(
      `tertua ${fmtDate(summary.oldestDate)}` +
        (summary.oldestAgeDays != null ? ` (${summary.oldestAgeDays} hari)` : ""),
    );
  }

  const head = groups.slice(0, GROUPS_VISIBLE);
  const rest = groups.slice(GROUPS_VISIBLE);

  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{halaqah.halaqahName ?? "-"}</span>
            <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Badge>
            {view.isKritis && <Badge tone="warning">halaqah kritis</Badge>}
          </div>
          <div className="text-sm text-neutral-500">{halaqah.pengajar ?? "-"}</div>
          <div className="mt-1 text-xs text-neutral-500">{bits.join(" · ")}</div>
        </div>
        {action}
      </div>

      {groups.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {head.map((g) => (
            <GroupRow key={g.key} group={g} />
          ))}
          {rest.length > 0 && (
            <details className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800">
              <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-500">
                {rest.length} kelompok lain
              </summary>
              <div className="space-y-1.5 border-t border-neutral-200 p-2 dark:border-neutral-800">
                {rest.map((g) => (
                  <GroupRow key={g.key} group={g} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
