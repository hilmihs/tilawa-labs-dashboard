"use client";

import { useRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bilah saringan /pengajar. Tetap formulir GET biasa (URL = sumber kebenaran,
 * halaman dirender server); klien hanya mengirim ulang otomatis saat gender,
 * program, atau urutan diganti — pencarian dikirim dengan Enter.
 */
export function SaringanPengajar({
  q,
  g,
  program,
  urut,
  beban,
  programs,
}: {
  q?: string;
  g?: "L" | "P";
  program?: string;
  urut?: string;
  beban?: string;
  programs: string[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const gender = useRef<HTMLInputElement>(null);
  const kirim = () => form.current?.requestSubmit();
  const pilih = "h-[38px] rounded-[10px] border border-border-strong/70 bg-card px-2.5 text-12 text-foreground outline-none focus:border-brand-bronze focus:ring-[3px] focus:ring-brand-gold/30 dark:focus:border-brand-gold";

  return (
    <form ref={form} action="/pengajar" role="search" className="flex flex-wrap items-center gap-2.5 border-b border-neutral-200 p-3 sm:px-3.5 dark:border-neutral-800">
      {beban && <input type="hidden" name="beban" value={beban} />}
      <input ref={gender} type="hidden" name="g" value={g ?? ""} />
      <label className="flex h-[38px] min-w-0 flex-[1_1_240px] items-center gap-2 rounded-[10px] border border-border-strong/70 bg-card px-3 focus-within:border-brand-bronze focus-within:ring-[3px] focus-within:ring-brand-gold/30 dark:focus-within:border-brand-gold">
        <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <span className="sr-only">Cari nama, no HP, atau halaqah</span>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Cari nama, no HP, atau halaqah — mis. Aisyah, 0812, HITS 017"
          className="min-w-0 flex-1 bg-transparent text-14 text-foreground outline-none placeholder:text-ink-faint"
        />
      </label>
      <div role="group" aria-label="Gender" className="flex gap-0.5 rounded-[10px] bg-neutral-100 p-[3px] dark:bg-neutral-900">
        {([["", "Semua"], ["L", "Ikhwan"], ["P", "Akhwat"]] as const).map(([v, label]) => {
          const aktif = (g ?? "") === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={aktif}
              onClick={() => {
                if (gender.current) gender.current.value = v;
                kirim();
              }}
              className={cn(
                "h-8 rounded-lg px-3 text-12 font-medium transition-colors",
                aktif
                  ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                  : "text-ink-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <select name="program" defaultValue={program ?? ""} onChange={kirim} aria-label="Program" className={cn(pilih, "max-w-[240px]")}>
        <option value="">Semua program</option>
        {programs.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select name="urut" defaultValue={urut ?? ""} onChange={kirim} aria-label="Urutkan" className={pilih}>
        <option value="">Urut: Nama A–Z</option>
        <option value="beban">Halaqah paling sedikit</option>
        <option value="matrix">Matrix tertinggi</option>
      </select>
      <button type="submit" className="sr-only">
        Terapkan
      </button>
    </form>
  );
}
