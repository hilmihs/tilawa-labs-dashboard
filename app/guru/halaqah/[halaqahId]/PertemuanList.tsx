"use client";

import { useState } from "react";
import type { PortalMeeting } from "@/lib/guru-portal/queries";
import { Button } from "@/components/ui/button";
import { RescheduleForm } from "./RescheduleForm";
import { BadalForm } from "./BadalForm";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

type OpenState = { jadwalId: number; mode: "reschedule" | "badal" } | null;

export function PertemuanList({
  halaqahId,
  meetings,
}: {
  halaqahId: number;
  meetings: PortalMeeting[];
}) {
  const [open, setOpen] = useState<OpenState>(null);
  const [done, setDone] = useState<Record<number, string>>({});

  function toggle(jadwalId: number, mode: "reschedule" | "badal") {
    setOpen((cur) =>
      cur && cur.jadwalId === jadwalId && cur.mode === mode ? null : { jadwalId, mode },
    );
  }

  if (meetings.length === 0) {
    return <p className="text-sm text-neutral-500">Belum ada pertemuan pada halaqah ini.</p>;
  }

  return (
    <ul className="space-y-2">
      {meetings.map((m) => {
        const isOpen = open?.jadwalId === m.jadwalId;
        const submitted = done[m.jadwalId];
        return (
          <li
            key={m.jadwalId}
            className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  {m.order != null ? `Pertemuan ${m.order}` : "Pertemuan"}
                </div>
                <div className="text-xs text-neutral-500">
                  {fmtDate(m.date)}
                  {m.statusLabel ? ` · ${m.statusLabel}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isOpen && open?.mode === "reschedule" ? "default" : "secondary"}
                  onClick={() => toggle(m.jadwalId, "reschedule")}
                >
                  Reschedule
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={isOpen && open?.mode === "badal" ? "default" : "secondary"}
                  onClick={() => toggle(m.jadwalId, "badal")}
                >
                  Badal
                </Button>
              </div>
            </div>

            {submitted && (
              <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {submitted}
              </p>
            )}

            {isOpen && open?.mode === "reschedule" && (
              <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <RescheduleForm
                  halaqahId={halaqahId}
                  jadwalId={m.jadwalId}
                  defaultDate={m.date}
                  onDone={(msg) => {
                    setDone((d) => ({ ...d, [m.jadwalId]: msg }));
                    setOpen(null);
                  }}
                />
              </div>
            )}

            {isOpen && open?.mode === "badal" && (
              <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <BadalForm
                  halaqahId={halaqahId}
                  jadwalId={m.jadwalId}
                  onDone={(msg) => {
                    setDone((d) => ({ ...d, [m.jadwalId]: msg }));
                    setOpen(null);
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
