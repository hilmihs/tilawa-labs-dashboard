/**
 * Potongan tampilan bersama untuk layar Div. Kaderisasi (Pengajar, Daftar
 * Individu, CV, Acara, Operating Office) — desain "Overhaul Pengajar Orang
 * Acara Office", diterjemahkan ke palet Tilawa Labs (lihat app/globals.css):
 * biru desain → forest/slate, ungu → tint emas, pink Akhwat → mulberry.
 * Server component — tanpa 'use client', aman diimpor dari halaman server.
 */
import type * as React from "react";
import { cn } from "@/lib/utils";

/** Kartu putih di atas kanvas kertas — tepi neutral-300 seperti <Card>. */
export const kartu = "rounded-[14px] border border-neutral-300 bg-card dark:border-neutral-800";

/** Label mikro huruf kapital (label KPI, kepala tabel). */
export const labelMikro = "cap text-11 font-bold text-ink-muted";

/** Tombol garis (sekunder) dan tombol utama forest — tinggi 36px seperti desain. */
export const tombolGaris =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-border-strong/60 bg-card px-3 text-12 font-medium text-foreground transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const tombolUtama =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-primary px-4 text-14 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Isian teks/pilihan — tepi kontrol 3:1, fokus cincin perunggu. */
export const isian =
  "h-10 w-full rounded-[10px] border border-border-strong/70 bg-card px-3 text-14 text-foreground outline-none transition-shadow placeholder:text-ink-faint focus:border-brand-bronze focus:ring-[3px] focus:ring-brand-gold/30 dark:focus:border-brand-gold";

/** Warna avatar/chip per gender: Ikhwan slate, Akhwat mulberry (pengganti biru/pink desain). */
export function nadaGender(g: string | null | undefined): string {
  if (g === "P") return "bg-[#eee3ec] text-[#6a3d63] dark:bg-[#2a1827] dark:text-[#d7b3d0]";
  if (g === "L") return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
}

/** "Syaikh Ahmad Fathi" → "AF"; hanya kata berhuruf kapital, maks. dua. */
export function inisial(nama: string): string {
  const kata = nama
    .replace(/^(syaikh|ustadz(ah)?)\s+/i, "")
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w));
  const ambil = (kata.length ? kata : nama.split(/\s+/)).slice(0, 2);
  return ambil.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function Inisial({
  nama,
  gender,
  className,
  children,
}: {
  nama: string;
  gender?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-full text-12 font-semibold",
        nadaGender(gender),
        className,
      )}
    >
      {inisial(nama)}
      {children}
    </span>
  );
}

/** Kepala halaman: judul besar + keterangan, aksi di kanan. */
export function KepalaHalaman({
  judul,
  children,
  aksi,
}: {
  judul: React.ReactNode;
  children?: React.ReactNode;
  aksi?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{judul}</h1>
        {children && <p className="mt-1 max-w-2xl text-14 text-pretty text-ink-muted">{children}</p>}
      </div>
      {aksi && <div className="flex flex-wrap gap-2">{aksi}</div>}
    </header>
  );
}

/** Kartu angka: label mikro di atas, angka tebal di bawah, slot tambahan (bar, catatan). */
export function KartuAngka({
  label,
  nilai,
  catatan,
  nada,
  className,
  children,
}: {
  label: React.ReactNode;
  nilai?: React.ReactNode;
  catatan?: React.ReactNode;
  /** Kelas warna untuk angka, mis. "text-warn". */
  nada?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(kartu, "min-w-0 px-[18px] py-4", className)}>
      <div className={labelMikro}>{label}</div>
      {nilai != null && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn("text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums", nada)}>{nilai}</span>
          {catatan && <span className="text-12 text-ink-muted">{catatan}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
