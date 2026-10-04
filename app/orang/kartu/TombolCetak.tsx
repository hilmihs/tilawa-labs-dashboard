"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export type Sisi = "keduanya" | "depan" | "belakang";

const PILIHAN_SISI: { v: Sisi; label: string }[] = [
  { v: "keduanya", label: "Dua sisi" },
  { v: "depan", label: "Depan" },
  { v: "belakang", label: "Belakang" },
];

/**
 * Lembar kartu + bilah alat (tersembunyi di kertas). Pilihan sisi dan garis
 * potong hanya mengganti atribut data pada lembar — CSS di KartuKehadiran yang
 * menyembunyikan sisi/menggambar garis, jadi kartu tidak dirender ulang.
 */
export function LembarKartu({
  jumlah,
  awalSisi,
  awalGaris,
  pvc,
  hrefModeLain,
  children,
}: {
  jumlah: number;
  awalSisi: Sisi;
  awalGaris: boolean;
  pvc: boolean;
  hrefModeLain: string;
  children: ReactNode;
}) {
  const [sisi, setSisi] = useState<Sisi>(awalSisi);
  const [garis, setGaris] = useState(awalGaris);

  return (
    <div className="kk-lembar mx-auto max-w-[1200px] px-4 py-6 sm:px-8" data-sisi={sisi} data-garis={garis && !pvc ? "1" : "0"}>
      <div className="kk-toolbar mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-12 text-neutral-700">
        <Link href="/orang" className="text-12 text-neutral-500 hover:underline">
          ← Orang
        </Link>
        <span className="font-semibold text-neutral-900">
          {jumlah} kartu{sisi === "keduanya" && ` · ${jumlah * 2} sisi`}
        </span>
        <div role="radiogroup" aria-label="Sisi yang dicetak" className="flex overflow-hidden rounded-lg border border-neutral-300">
          {PILIHAN_SISI.map((p) => (
            <button
              key={p.v}
              type="button"
              role="radio"
              aria-checked={sisi === p.v}
              onClick={() => setSisi(p.v)}
              className={`px-3 py-1.5 text-12 font-medium ${sisi === p.v ? "bg-primary text-primary-foreground" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {!pvc && (
          <label className="flex cursor-pointer items-center gap-2 text-12">
            <input type="checkbox" checked={garis} onChange={(e) => setGaris(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Garis potong
          </label>
        )}
        <Link href={hrefModeLain} className="text-12 text-neutral-500 hover:underline">
          {pvc ? "Mode kertas A4 (3×3)" : "Mode printer kartu PVC"}
        </Link>
        <span className="ml-auto text-11 text-neutral-500">
          {pvc ? "Satu kartu per halaman 54 × 85,6 mm" : sisi === "keduanya" ? "A4 · 3 orang per lembar · skala 100%" : "A4 · 9 kartu per lembar · skala 100%"}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={jumlah === 0}
          className="h-9 rounded-[9px] bg-primary px-4 text-14 font-medium text-primary-foreground disabled:opacity-50"
        >
          Cetak
        </button>
      </div>
      {children}
    </div>
  );
}
