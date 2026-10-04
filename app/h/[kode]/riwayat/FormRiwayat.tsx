"use client";

import { useState, useTransition } from "react";
import { KEGIATAN, LABEL_PERAN_RIWAYAT, PERAN_RIWAYAT, TAHUN_RIWAYAT, type PeranRiwayat } from "@/lib/orang/riwayat-template";
import { simpanRiwayatAction } from "./actions";

type Entri = { tahun: number; kegiatan: string; peran: string; status: string };
const kunci = (t: number, k: string) => `${t}|${k}`;

/**
 * Isian riwayat 2022–2025: per tahun, centang kegiatan yang pernah diikuti
 * dan pilih perannya. Yang sudah diverifikasi terkunci (tidak bisa diubah dari
 * sini); sisanya bisa diperbarui kapan saja dan kembali menunggu verifikasi.
 */
export function FormRiwayat({ kode, awal }: { kode: string; awal: Entri[] }) {
  const terkunci = new Map(awal.filter((e) => e.status !== "menunggu").map((e) => [kunci(e.tahun, e.kegiatan), e]));
  const [pilih, setPilih] = useState<Record<string, PeranRiwayat>>(() =>
    Object.fromEntries(awal.filter((e) => e.status === "menunggu").map((e) => [kunci(e.tahun, e.kegiatan), e.peran as PeranRiwayat])),
  );
  const [lain, setLain] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (const e of awal) if (e.kegiatan.startsWith("lain:") && e.status === "menunggu") out[e.tahun] = e.kegiatan.slice(5);
    return out;
  });
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [sibuk, mulai] = useTransition();

  function simpan() {
    const entri = Object.entries(pilih).map(([k, peran]) => {
      const [t, keg] = k.split("|");
      return { tahun: Number(t), kegiatan: keg, peran };
    });
    for (const [t, v] of Object.entries(lain)) if (v.trim().length >= 2) entri.push({ tahun: Number(t), kegiatan: `lain:${v.trim().slice(0, 80)}`, peran: "peserta" });
    mulai(async () => {
      const h = await simpanRiwayatAction(kode, entri);
      setPesan({ ok: h.ok, teks: h.pesan });
    });
  }

  return (
    <div className="space-y-4">
      {TAHUN_RIWAYAT.map((t) => (
        <section key={t} className="rounded-2xl border border-neutral-300 bg-card p-4 dark:border-neutral-800">
          <h2 className="text-16 font-semibold">{t}</h2>
          <ul className="mt-2 divide-y divide-border">
            {KEGIATAN.map((k) => {
              const id = kunci(t, k.kode);
              const kunciEntri = terkunci.get(id);
              const on = !!pilih[id];
              return (
                <li key={k.kode} className="flex flex-wrap items-center gap-2 py-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2.5 text-14">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--primary)]"
                      checked={on || !!kunciEntri}
                      disabled={!!kunciEntri}
                      onChange={(e) =>
                        setPilih((s) => {
                          const n = { ...s };
                          if (e.target.checked) n[id] = "peserta";
                          else delete n[id];
                          return n;
                        })
                      }
                    />
                    <span>
                      {k.nama}
                      {kunciEntri && (
                        <span className="ml-2 text-11 text-ink-muted">
                          {kunciEntri.status === "terverifikasi" ? "✓ terverifikasi" : "ditolak"}
                        </span>
                      )}
                    </span>
                  </label>
                  {on && (
                    <select
                      value={pilih[id]}
                      onChange={(e) => setPilih((s) => ({ ...s, [id]: e.target.value as PeranRiwayat }))}
                      className="h-9 rounded-lg border border-border bg-card px-2 text-13"
                      aria-label={`Peran di ${k.nama} ${t}`}
                    >
                      {PERAN_RIWAYAT.map((p) => (
                        <option key={p} value={p}>
                          {LABEL_PERAN_RIWAYAT[p]}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
          <input
            value={lain[t] ?? ""}
            onChange={(e) => setLain((s) => ({ ...s, [t]: e.target.value }))}
            maxLength={80}
            placeholder="Kegiatan lain (opsional)"
            className="mt-2 h-10 w-full rounded-[10px] border border-border bg-card px-3 text-14"
          />
        </section>
      ))}
      {pesan && (
        <p role="status" className={`rounded-lg px-3 py-2 text-13 ${pesan.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700"}`}>
          {pesan.teks}
        </p>
      )}
      <button type="button" onClick={simpan} disabled={sibuk} className="h-12 w-full rounded-xl bg-primary text-14 font-semibold text-primary-foreground disabled:opacity-50">
        {sibuk ? "Menyimpan…" : "Simpan riwayat"}
      </button>
    </div>
  );
}
