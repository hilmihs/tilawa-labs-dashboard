"use client";

import { useState } from "react";
import { STATUS_LABEL, angka, type Gender, type StatusKey } from "@/lib/publik/format";

type Tile = {
  key: string;
  nama: string;
  peserta: number;
  level: string | null;
  gender: Gender | null;
  status: StatusKey;
  title: string;
};

type Group = { slug: string; name: string; color: string; kelas: number; peserta: number; tiles: Tile[] };

const FILTER: { key: Gender | "semua"; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "Ikhwan", label: "Ikhwan" },
  { key: "Akhwat", label: "Akhwat" },
];

/** Program dengan kelas lebih dari ini dilipat; HITS Reguler saja ~300 kelas. */
const LIPAT = 36;

/**
 * Peta kelas di Rapor: satu ubin per kelas, dikelompokkan per program. Filter
 * gender meredupkan ubin lain alih-alih menyembunyikannya, supaya proporsinya
 * tetap terlihat.
 */
export function KelasPeta({ total, groups }: { total: number; groups: Group[] }) {
  const [filter, setFilter] = useState<Gender | "semua">("semua");
  const [buka, setBuka] = useState<Set<string>>(new Set());

  return (
    <section className="pk-card flex flex-col gap-3.5 px-[18px] py-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="pk-cap">Kelas · {angka(total)} kelas · jumlah peserta</div>
        <div
          role="group"
          aria-label="Sorot kelas"
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
                  on ? "bg-[var(--pk-card)] text-[var(--pk-ink)] shadow-[var(--pk-shadow)]" : "text-[var(--pk-ink2)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {groups.map((g) => {
        const terbuka = buka.has(g.slug) || g.tiles.length <= LIPAT;
        const tiles = terbuka ? g.tiles : g.tiles.slice(0, LIPAT);
        return (
          <div key={g.slug} className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="flex-[0_0_130px] pt-2.5">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                <span className="size-2 flex-none rounded-[2px]" style={{ background: g.color }} />
                {g.name}
              </div>
              <div className="mt-0.5 ml-4 text-[11px] text-[var(--pk-ink3)]">
                {angka(g.kelas)} kelas · {angka(g.peserta)} peserta
              </div>
            </div>
            <div className="flex flex-[1_1_300px] flex-wrap gap-1.5">
              {tiles.map((h) => (
                <div
                  key={h.key}
                  title={h.title}
                  className="flex w-[136px] flex-col gap-px rounded-md border border-[var(--pk-chip-line)] bg-[var(--pk-sub)] px-2 py-[7px] transition-opacity"
                  style={{ opacity: filter === "semua" || filter === h.gender ? 1 : 0.2 }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-medium text-[var(--pk-ink2)]">{h.nama}</span>
                    <i className="pk-dot" data-s={h.status} title={STATUS_LABEL[h.status]} />
                  </div>
                  <span className="text-base font-bold tabular-nums">
                    {angka(h.peserta)}
                    <span className="text-[10.5px] font-normal text-[var(--pk-ink3)]"> peserta</span>
                  </span>
                  <span className="truncate text-[10.5px] text-[var(--pk-ink3)]">
                    {[h.level, h.gender?.[0]].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>
              ))}
              {!terbuka && (
                <button
                  type="button"
                  onClick={() => setBuka((s) => new Set(s).add(g.slug))}
                  className="flex w-[136px] cursor-pointer items-center justify-center rounded-md border border-dashed border-[var(--pk-bar)] px-2 py-[7px] text-[11px] text-[var(--pk-link)]"
                >
                  +{angka(g.tiles.length - LIPAT)} kelas lagi
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-x-3.5 gap-y-1 border-t border-[var(--pk-line2)] pt-2.5 text-[11px] text-[var(--pk-ink3)]">
        <span>Titik = kehadiran 30 hari vs ambang program:</span>
        {(["sehat", "pantau", "kritis", "idle"] as const).map((s) => (
          <span key={s} className="flex items-center gap-[5px]">
            <i className="pk-dot" data-s={s} />
            {s === "idle" ? "belum ada data" : STATUS_LABEL[s].toLowerCase()}
          </span>
        ))}
      </div>
    </section>
  );
}
