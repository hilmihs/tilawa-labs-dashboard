"use client";

import { useState } from "react";
import { isian } from "@/components/lintas/brand";
import { SERI_BARU, labelSeri } from "@/lib/hadir/target-input";
import { cn } from "@/lib/utils";

/**
 * Dua kendali target & seri, dipakai form buat acara DAN form pengaturan acara —
 * satu komponen, bukan dua salinan, supaya aturan kedua jalur tulis tidak
 * saling menjauh (alasan yang sama dengan lib/acara/input.ts).
 *
 * Target: satu sakelar tiga posisi per golongan (Tidak / Diundang / Wajib),
 * bawaannya "Tidak" — dengan 9 golongan, koordinator cukup mengetuk yang
 * perlu saja. Nilai dikirim sebagai input tersembunyi `wajib` / `diundang`
 * (dibaca bacaTargetCentang), jadi server action tidak berubah.
 *
 * Keduanya tetap tak terkendali (state sendiri, diawali `awal`); `onChange`
 * opsional hanya memberi tahu induk — dipakai pratinjau di BuatAcaraForm.
 */
export type OpsiGolongan = { id: string; nama: string };
export type SifatTargetUi = "wajib" | "diundang";
export type TargetAwal = Record<string, SifatTargetUi>;

const OPSI: { v: SifatTargetUi | ""; label: string }[] = [
  { v: "", label: "Tidak" },
  { v: "diundang", label: "Diundang" },
  { v: "wajib", label: "Wajib" },
];

export function PilihTarget({
  golongan,
  awal = {},
  onChange,
}: {
  golongan: OpsiGolongan[];
  awal?: TargetAwal;
  onChange?: (t: TargetAwal) => void;
}) {
  const [target, setTarget] = useState<TargetAwal>(awal);
  const ubah = (t: TargetAwal) => {
    setTarget(t);
    onChange?.(t);
  };
  const setSatu = (id: string, v: SifatTargetUi | "") => {
    const t = { ...target };
    if (v) t[id] = v;
    else delete t[id];
    ubah(t);
  };
  const pengajar = golongan.filter((g) => /^pengajar\b/i.test(g.nama));

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-14 font-semibold">Siapa yang hadir?</div>
          <p className="mt-0.5 text-12 text-pretty text-ink-muted">
            <b className="text-foreground">Wajib</b> masuk hitungan mangkir. <b className="text-blue-700 dark:text-blue-300">Diundang</b> ikut
            rekap tapi tidak pernah mangkir. Biarkan kosong untuk kajian terbuka — orang yang datang tetap tercatat.
          </p>
        </div>
        {pengajar.length > 0 && (
          <button
            type="button"
            onClick={() => ubah({ ...target, ...Object.fromEntries(pengajar.map((g) => [g.id, "wajib" as const])) })}
            className="h-[30px] shrink-0 whitespace-nowrap rounded-lg border border-border-strong/60 bg-card px-2.5 text-12 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Semua pengajar wajib
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {golongan.map((g) => {
          const cur = target[g.id] ?? "";
          return (
            <div
              key={g.id}
              role="radiogroup"
              aria-label={g.nama}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border py-2 pl-3.5 pr-2 last:border-b-0",
                cur === "wajib" && "bg-neutral-50 dark:bg-neutral-800/40",
              )}
            >
              <span className={cn("min-w-0 flex-1 text-12 sm:text-14", cur ? "font-semibold" : "text-neutral-700 dark:text-neutral-300")}>{g.nama}</span>
              <div className="flex gap-0.5 rounded-[9px] bg-neutral-100 p-0.5 dark:bg-neutral-800">
                {OPSI.map((o) => {
                  const on = cur === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSatu(g.id, o.v)}
                      className={cn(
                        "h-7 rounded-[7px] px-2.5 text-12 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        !on && "text-ink-muted hover:text-foreground",
                        on && o.v === "" && "bg-card text-foreground shadow-sm",
                        on && o.v === "diundang" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
                        on && o.v === "wajib" && "bg-primary text-primary-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {cur && <input type="hidden" name={cur} value={g.id} />}
            </div>
          );
        })}
        {golongan.length === 0 && <p className="px-3.5 py-3 text-12 text-ink-muted">Belum ada golongan aktif.</p>}
      </div>
    </div>
  );
}

/**
 * Seri = pengelompok sesi yang sebanding, dan satu-satunya hal yang membuat
 * "dibandingkan per sesi" di rekap punya arti. Koordinator memilih dari daftar
 * atau menulis nama biasa; slug dibuat di server (bacaSeriDariForm).
 */
export function PilihSeri({
  seriAda,
  awal = "",
  onChange,
}: {
  seriAda: string[];
  awal?: string;
  onChange?: (v: { pilih: string; nama: string }) => void;
}) {
  const kenal = awal && seriAda.includes(awal);
  const [pilih, setPilih] = useState(kenal ? awal : awal ? SERI_BARU : "");
  const [nama, setNama] = useState(kenal ? "" : labelSeri(awal));
  const ubah = (p: string, n: string) => {
    setPilih(p);
    setNama(n);
    onChange?.({ pilih: p, nama: n });
  };
  const opsi = [
    { v: "", label: "Tidak rutin" },
    ...seriAda.map((s) => ({ v: s, label: labelSeri(s) })),
    { v: SERI_BARU, label: "+ Kajian rutin baru" },
  ];

  return (
    <div className="flex flex-col gap-2.5 sm:col-span-2">
      <div>
        <div className="text-14 font-semibold">Bagian dari kajian rutin apa?</div>
        <p className="mt-0.5 text-12 text-ink-muted">Dipakai rekap untuk membandingkan sesi ini dengan sesi sebelumnya.</p>
      </div>
      <input type="hidden" name="seri" value={pilih} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kajian rutin">
        {opsi.map((o) => {
          const on = pilih === o.v;
          return (
            <button
              key={o.v || "tidak"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => ubah(o.v, nama)}
              className={cn(
                "h-[34px] rounded-full border px-3.5 text-12 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-14",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : o.v === SERI_BARU
                    ? "border-border-strong/60 bg-card text-primary hover:border-border-strong"
                    : "border-border bg-card text-neutral-700 hover:border-border-strong dark:text-neutral-300",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {pilih === SERI_BARU && (
        <label className="flex max-w-md flex-col gap-1.5 text-12 font-medium text-neutral-700 dark:text-neutral-300">
          Nama kajian rutinnya
          <input
            name="seri_nama"
            value={nama}
            onChange={(e) => ubah(pilih, e.target.value)}
            className={isian}
            placeholder="Kajian Rumah Belajar"
            autoFocus
          />
        </label>
      )}
    </div>
  );
}
