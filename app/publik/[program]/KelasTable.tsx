"use client";

import { useState } from "react";
import type { PublikKelas } from "@/lib/publik/snapshot";
import { STATUS_LABEL, angka, pctLabel, type Gender } from "@/lib/publik/format";

const FILTER: { key: Gender | "semua"; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "Ikhwan", label: "Ikhwan" },
  { key: "Akhwat", label: "Akhwat" },
];

/** Daftar kelas dengan filter gender — satu-satunya state klien di halaman publik. */
export function KelasTable({ rows, total, jenjang }: { rows: PublikKelas[]; total: number; jenjang: boolean }) {
  const [filter, setFilter] = useState<Gender | "semua">("semua");
  const shown = filter === "semua" ? rows : rows.filter((h) => h.gender === filter);

  return (
    <section className="pk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--pk-line2)] bg-[var(--pk-sub)] px-[18px] py-3">
        <div className="pk-cap">Daftar kelas · {angka(total)} kelas</div>
        <div
          role="group"
          aria-label="Saring kelas"
          className="flex gap-1 rounded-lg border border-[var(--pk-bar)] bg-[var(--pk-chip)] p-[3px]"
        >
          {FILTER.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.key)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs ${
                  on
                    ? "bg-[var(--pk-card)] text-[var(--pk-ink)] shadow-[var(--pk-shadow)]"
                    : "text-[var(--pk-ink2)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.09em] text-[var(--pk-ink3)] uppercase">
              <th className="px-[18px] py-2.5 font-semibold">Kelas</th>
              {jenjang && <th className="px-3 py-2.5 font-semibold">Jenjang</th>}
              <th className="px-3 py-2.5 font-semibold">Ikhwan/Akhwat</th>
              <th className="px-3 py-2.5 font-semibold">Jadwal</th>
              <th className="px-3 py-2.5 text-right font-semibold">Peserta</th>
              <th className="py-2.5 pr-[18px] pl-3 text-right font-semibold">Kehadiran 30 hari</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((h) => (
              <tr key={h.key} className="border-t border-[var(--pk-line2)]">
                <td className="px-[18px] py-2.5 font-semibold">{h.nama}</td>
                {jenjang && <td className="px-3 py-2.5 text-[var(--pk-ink2)]">{h.level ?? "—"}</td>}
                <td className="px-3 py-2.5 text-[var(--pk-ink2)]">{h.gender ?? "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[var(--pk-ink2)]">{h.jadwal ?? "—"}</td>
                <td className="pk-mono px-3 py-2.5 text-right text-[15px] font-semibold">{angka(h.peserta)}</td>
                <td className="py-2.5 pr-[18px] pl-3 text-right">
                  {h.pct == null ? (
                    <span className="text-xs text-[var(--pk-ink3)]">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-[var(--pk-ink2)] tabular-nums">{pctLabel(h.pct)}</span>
                      <span className="pk-pill w-[58px] px-0 text-center" data-s={h.status}>
                        {STATUS_LABEL[h.status]}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr className="border-t border-[var(--pk-line2)]">
                <td colSpan={jenjang ? 6 : 5} className="px-[18px] py-6 text-center text-xs text-[var(--pk-ink3)]">
                  Tidak ada kelas {filter === "semua" ? "" : filter.toLowerCase()}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
