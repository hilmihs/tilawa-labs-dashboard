"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { isian, kartu, labelMikro, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { batasValid, jamTitik, sesiDariJam } from "@/lib/kerja/sesi";
import { BATAS_BAWAAN, LABEL_SESI, SESI, SINGKAT_SESI, type BatasSesi, type Sesi } from "@/lib/kerja/types";
import { toneBadgeClass, type StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";
import { simpanSesi } from "./actions";

type Pesan = { teks: string; tone: "ok" | "danger" };

const label = "flex flex-col gap-1.5 text-12 font-medium text-neutral-700 dark:text-neutral-300";

const ISIAN: { kunci: keyof BatasSesi; label: string; ket: string }[] = [
  { kunci: "pagiMulai", label: "Pagi mulai", ket: "sebelum ini: di luar sesi" },
  { kunci: "siangMulai", label: "Siang mulai", ket: "sekaligus akhir Pagi" },
  { kunci: "soreMulai", label: "Sore mulai", ket: "sekaligus akhir Siang" },
  { kunci: "selesai", label: "Selesai", ket: "sejak ini: di luar sesi" },
];

const NADA: Record<Sesi, StatusTone> = { pagi: "warning", siang: "success", sore: "indigo" };

const menit = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const persen = (hhmm: string) => `${(menit(hhmm) / 1440) * 100}%`;

function rentangSesi(s: Sesi, b: BatasSesi): [string, string] {
  return s === "pagi" ? [b.pagiMulai, b.siangMulai] : s === "siang" ? [b.siangMulai, b.soreMulai] : [b.soreMulai, b.selesai];
}

export function SetelSesi(props: { batas: BatasSesi; jamKini: string }) {
  const [b, setB] = useState<BatasSesi>(props.batas);
  const [coba, setCoba] = useState(props.jamKini);
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const sah = batasValid(b);
  const berubah = (Object.keys(b) as (keyof BatasSesi)[]).some((k) => b[k] !== props.batas[k]);
  const cobaSah = /^([01]\d|2[0-3]):[0-5]\d$/.test(coba);
  const sesiCoba = sah && cobaSah ? sesiDariJam(coba, b) : null;

  function ubah(k: keyof BatasSesi, v: string) {
    setB((lama) => ({ ...lama, [k]: v.slice(0, 5) }));
    setPesan(null);
  }

  async function simpan() {
    if (!sah) return setPesan({ tone: "danger", teks: "Jam harus urut naik: pagi < siang < sore < selesai." });
    setSibuk(true);
    const h = await simpanSesi(b);
    setSibuk(false);
    setPesan(h.ok ? { tone: "ok", teks: "Tersimpan. Tap berikutnya dibaca dengan jam baru." } : { tone: "danger", teks: h.error });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ── Isian jam ───────────────────────────────────────────── */}
      <div className={cn(kartu, "flex flex-col gap-4 p-4 sm:p-5")}>
        <div className="grid grid-cols-2 gap-3">
          {ISIAN.map((i) => (
            <div key={i.kunci} className={label}>
              <label htmlFor={`sesi-${i.kunci}`}>{i.label}</label>
              <input
                id={`sesi-${i.kunci}`}
                type="time"
                step={60}
                value={b[i.kunci]}
                onChange={(e) => ubah(i.kunci, e.target.value)}
                className={cn(isian, "h-[38px] font-mono tabular-nums")}
              />
              <span className="text-11 font-normal text-ink-muted">{i.ket}</span>
            </div>
          ))}
        </div>

        {!sah && <p className="text-12 text-danger">Jam harus urut naik: pagi &lt; siang &lt; sore &lt; selesai.</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setB(BATAS_BAWAAN);
              setPesan(null);
            }}
            className={cn(tombolGaris, "h-[38px] rounded-[10px]")}
          >
            <RotateCcw className="size-3.5" aria-hidden /> Jam bawaan
          </button>
          <button
            type="button"
            onClick={simpan}
            disabled={sibuk || !sah || !berubah}
            className={cn(tombolUtama, "h-[38px] rounded-[10px] text-12")}
          >
            {sibuk ? "Menyimpan…" : "Simpan"}
          </button>
        </div>

        {pesan && <p className={cn("text-sm", pesan.tone === "ok" ? "text-ok" : "text-danger")}>{pesan.teks}</p>}
      </div>

      {/* ── Pratinjau ───────────────────────────────────────────── */}
      <div className={cn(kartu, "flex flex-col gap-4 p-4 sm:p-5")}>
        <div>
          <div className={labelMikro}>Pratinjau sehari</div>
          <div className="relative mt-2 h-8 overflow-hidden rounded-[8px] bg-neutral-100 dark:bg-neutral-800" aria-hidden>
            {sah &&
              SESI.map((s) => {
                const [dari, sampai] = rentangSesi(s, b);
                return (
                  <span
                    key={s}
                    className={cn("absolute inset-y-0 flex items-center justify-center border-x border-card text-11 font-bold", toneBadgeClass[NADA[s]])}
                    style={{ left: persen(dari), width: `calc(${persen(sampai)} - ${persen(dari)})` }}
                  >
                    {SINGKAT_SESI[s]}
                  </span>
                );
              })}
            {cobaSah && (
              <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: persen(coba) }} />
            )}
          </div>
          <div className="mt-1 flex justify-between font-mono text-11 text-ink-muted" aria-hidden>
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </div>

        {sah && (
          <ul className="flex flex-col gap-1.5 text-14">
            {SESI.map((s) => {
              const [dari, sampai] = rentangSesi(s, b);
              return (
                <li key={s} className="flex items-center gap-2">
                  <span className={cn("w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-11 font-bold", toneBadgeClass[NADA[s]])}>
                    {LABEL_SESI[s]}
                  </span>
                  <span className="tabular-nums">
                    {jamTitik(dari)} s.d. sebelum {jamTitik(sampai)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className={label}>
            <label htmlFor="sesi-coba">Coba jam tap</label>
            <input
              id="sesi-coba"
              type="time"
              step={60}
              value={coba}
              onChange={(e) => setCoba(e.target.value.slice(0, 5))}
              className={cn(isian, "h-[38px] w-[120px] font-mono tabular-nums")}
            />
          </div>
          <p className="pb-2 text-14" aria-live="polite">
            {!sah || !cobaSah ? (
              <span className="text-ink-muted">—</span>
            ) : (
              <>
                Tap <b className="tabular-nums">{jamTitik(coba)}</b> →{" "}
                {sesiCoba ? (
                  <b className="text-primary">{LABEL_SESI[sesiCoba]}</b>
                ) : (
                  <span className="text-warn">di luar sesi</span>
                )}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
