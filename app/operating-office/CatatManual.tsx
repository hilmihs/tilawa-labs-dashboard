"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { isian, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { cn } from "@/lib/utils";
import { catatManual } from "./actions";

const label = "flex flex-col gap-1 text-12 font-medium text-neutral-700 dark:text-neutral-300";

/** Kehadiran yang tak sempat ditekan syaikh — dicatat admin, ditandai "manual". */
export function CatatManual({
  masyaikh,
  hariIni,
}: {
  masyaikh: { id: string; namaLatin: string; jamMasuk: string }[];
  hariIni: string;
}) {
  const [buka, setBuka] = useState(false);
  const [pid, setPid] = useState(masyaikh[0]?.id ?? "");
  const [tanggal, setTanggal] = useState(hariIni);
  const [masuk, setMasuk] = useState(masyaikh[0]?.jamMasuk ?? "08:00");
  const [keluar, setKeluar] = useState("");
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  if (!buka)
    return (
      <button type="button" onClick={() => setBuka(true)} className={cn(tombolGaris, "h-8 rounded-[9px] text-12")}>
        <PenLine className="size-3.5" /> Catat manual
      </button>
    );

  async function simpan() {
    setSibuk(true);
    const h = await catatManual({ petugasId: pid, tanggal, masuk, keluar });
    setSibuk(false);
    setPesan(h.ok ? { teks: "Tercatat.", galat: false } : { teks: h.error, galat: true });
  }

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-[12px] border border-border bg-neutral-50 p-3 dark:bg-neutral-900/50">
      <p className="text-12 text-ink-muted">
        Untuk syaikh yang hadir tapi tak sempat menekan tombol. Menimpa catatan hari itu; titik diisi titik kantor.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className={label}>
          <label htmlFor="m-syaikh">Syaikh</label>
          <select
            id="m-syaikh"
            value={pid}
            onChange={(e) => {
              setPid(e.target.value);
              const p = masyaikh.find((x) => x.id === e.target.value);
              if (p) setMasuk(p.jamMasuk);
            }}
            className={cn(isian, "h-9")}
          >
            {masyaikh.map((p) => (
              <option key={p.id} value={p.id}>
                {p.namaLatin}
              </option>
            ))}
          </select>
        </div>
        <div className={label}>
          <label htmlFor="m-tanggal">Tanggal</label>
          <input id="m-tanggal" type="date" max={hariIni} value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={cn(isian, "h-9")} />
        </div>
        <div className={label}>
          <label htmlFor="m-masuk">Masuk</label>
          <input id="m-masuk" type="time" value={masuk} onChange={(e) => setMasuk(e.target.value)} className={cn(isian, "h-9 w-[130px]")} />
        </div>
        <div className={label}>
          <label htmlFor="m-keluar">Keluar</label>
          <input id="m-keluar" type="time" value={keluar} onChange={(e) => setKeluar(e.target.value)} className={cn(isian, "h-9 w-[130px]")} />
        </div>
        <button type="button" onClick={simpan} disabled={sibuk || !pid} className={cn(tombolUtama, "h-9 rounded-[10px] text-12")}>
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBuka(false);
            setPesan(null);
          }}
          className={cn(tombolGaris, "h-9 border-transparent bg-transparent text-12")}
        >
          Tutup
        </button>
      </div>
      {pesan && <p className={cn("text-sm", pesan.galat ? "text-danger" : "text-ok")}>{pesan.teks}</p>}
    </div>
  );
}
