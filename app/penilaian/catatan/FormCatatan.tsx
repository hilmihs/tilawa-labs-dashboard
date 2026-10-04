"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ASPEK } from "@/lib/penilaian/aspek";
import { simpanCatatanAction } from "./actions";

type Orang = { id: string; nama: string; gender: string };
type Acara = { id: string; nama: string; tanggal: string };

const KUNCI_DRAF = "catatan-cepat-draf";
const kunci = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();

/**
 * Catatan cepat (design p3), target 30 detik dari HP: pilih orang, kelebihan /
 * perlu dikembangkan, aspek, teks. Draf teks disimpan di perangkat supaya
 * tidak hilang bila layar terkunci di tengah acara.
 */
export function FormCatatan({
  orang,
  acara,
  acaraAwal,
  orangAwal = null,
}: {
  orang: Orang[];
  acara: Acara[];
  acaraAwal: string | null;
  orangAwal?: Orang | null;
}) {
  const [cari, setCari] = useState("");
  const [dipilih, setDipilih] = useState<Orang[]>(orangAwal ? [orangAwal] : []);
  const [jenis, setJenis] = useState<"kelebihan" | "kekurangan">("kelebihan");
  const [aspek, setAspek] = useState<string[]>([]);
  const [isi, setIsi] = useState("");
  const [acaraId, setAcaraId] = useState<string>(acaraAwal ?? "");
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [menyimpan, mulai] = useTransition();

  useEffect(() => {
    try {
      const d = localStorage.getItem(KUNCI_DRAF);
      if (d) setIsi(d);
    } catch {
      /* penyimpanan perangkat tidak tersedia — tanpa draf */
    }
  }, []);
  useEffect(() => {
    try {
      if (isi) localStorage.setItem(KUNCI_DRAF, isi);
      else localStorage.removeItem(KUNCI_DRAF);
    } catch {
      /* abaikan */
    }
  }, [isi]);

  const hasil = useMemo(() => {
    const q = kunci(cari);
    if (q.length < 2) return [];
    return orang.filter((o) => kunci(o.nama).includes(q) && !dipilih.some((d) => d.id === o.id)).slice(0, 8);
  }, [cari, orang, dipilih]);

  function simpan() {
    mulai(async () => {
      const h = await simpanCatatanAction({ orangIds: dipilih.map((d) => d.id), acaraId: acaraId || null, jenis, aspek, isi });
      setPesan({ ok: h.ok, teks: h.pesan });
      if (h.ok) {
        setIsi("");
        setAspek([]);
        setDipilih([]);
      }
    });
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-2 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-neutral-300 bg-card dark:border-neutral-700"}`;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Tentang</div>
        <div className="flex flex-wrap gap-1.5">
          {dipilih.map((o) => (
            <button key={o.id} type="button" onClick={() => setDipilih((s) => s.filter((x) => x.id !== o.id))} className={chip(true)}>
              {o.nama} ×
            </button>
          ))}
        </div>
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Ketik nama (min. 2 huruf)…"
          className="h-11 w-full rounded-xl border border-neutral-300 bg-card px-3 text-sm dark:border-neutral-700"
        />
        {hasil.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {hasil.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDipilih((s) => [...s, o]);
                    setCari("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  {o.nama}
                  <span className="text-xs text-neutral-400">{o.gender === "P" ? "Akhwat" : "Ikhwan"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          Kegiatan
          <select value={acaraId} onChange={(e) => setAcaraId(e.target.value)} className="h-9 flex-1 rounded-lg border border-border bg-card px-2 text-sm text-foreground">
            <option value="">(tanpa kegiatan)</option>
            {acara.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama} · {a.tanggal}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["kelebihan", "＋ Kelebihan", "bg-emerald-100 text-emerald-800 ring-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"],
            ["kekurangan", "△ Perlu dikembangkan", "bg-amber-100 text-amber-800 ring-amber-600 dark:bg-amber-950 dark:text-amber-300"],
          ] as const
        ).map(([k, label, on]) => (
          <button
            key={k}
            type="button"
            aria-pressed={jenis === k}
            onClick={() => setJenis(k)}
            className={`h-12 rounded-xl text-sm font-semibold ${jenis === k ? `${on} ring-2` : "border border-neutral-300 bg-card dark:border-neutral-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Aspek</div>
        <div className="flex flex-wrap gap-1.5">
          {ASPEK.map((a) => {
            const on = aspek.includes(a);
            return (
              <button key={a} type="button" aria-pressed={on} onClick={() => setAspek((s) => (on ? s.filter((x) => x !== a) : [...s, a]))} className={chip(on)}>
                {a}
              </button>
            );
          })}
        </div>
      </section>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Kejadian</span>
        <textarea
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Apa yang terjadi, singkat dan konkret. Contoh: mengambil alih meja registrasi saat petugas izin, antrean tetap lancar."
          className="w-full rounded-xl border border-neutral-300 bg-card px-3 py-2 text-sm dark:border-neutral-700"
        />
        <span className="text-[11px] text-neutral-400">Draf tersimpan otomatis di perangkat ini.</span>
      </label>

      {pesan && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${pesan.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
          {pesan.teks}
        </p>
      )}

      <button
        type="button"
        onClick={simpan}
        disabled={menyimpan || dipilih.length === 0 || isi.trim().length < 5}
        className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {menyimpan ? "Menyimpan…" : dipilih.length === 1 ? `Simpan ke CV ${dipilih[0].nama.split(" ")[0]}` : `Simpan ke CV ${dipilih.length || ""} orang`}
      </button>
    </div>
  );
}
