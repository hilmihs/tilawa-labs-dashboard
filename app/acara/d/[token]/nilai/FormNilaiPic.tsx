"use client";

import { useState, useTransition } from "react";
import { toneBadgeClass } from "@/lib/ui/status";
import { NILAI, TONE, butuhEvidence, type Nilai } from "@/lib/penilaian/skala";
import type { AnggotaPic } from "@/lib/penilaian/pic";
import type { Kpi } from "@/lib/penilaian/queries";
import { simpanNilaiPicAction } from "./actions";

/**
 * Form penilaian PIC (design p2): satu anggota per layar, tombol B/C/D/E
 * sebesar jempol, contoh kejadian opsional (wajib untuk D/E), lalu "Simpan &
 * lanjut". Saran ketepatan waktu dari presensi sudah terpilih bila ada.
 */
export function FormNilaiPic({ token, kpi, anggota }: { token: string; kpi: Kpi[]; anggota: AnggotaPic[] }) {
  const awal = (a: AnggotaPic) => {
    const n: Record<string, Nilai | ""> = {};
    for (const k of kpi) n[k.id] = a.nilai[k.id] ?? a.saran[k.id] ?? "";
    return n;
  };
  const [i, setI] = useState(() => Math.max(0, anggota.findIndex((a) => a.tertaut && Object.keys(a.nilai).length === 0)));
  const [isian, setIsian] = useState<Record<string, Record<string, Nilai | "">>>(() =>
    Object.fromEntries(anggota.map((a) => [a.panitiaId, awal(a)])),
  );
  const [ev, setEv] = useState<Record<string, string>>(() => Object.fromEntries(anggota.map((a) => [a.panitiaId, a.evidence])));
  const [selesai, setSelesai] = useState<Set<string>>(
    () => new Set(anggota.filter((a) => Object.keys(a.nilai).length > 0).map((a) => a.panitiaId)),
  );
  const [pesan, setPesan] = useState<string | null>(null);
  const [menyimpan, mulai] = useTransition();

  if (anggota.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-4 text-sm text-neutral-600">Tidak ada anggota divisi yang dinilai lewat tautan ini.</p>;
  }
  const a = anggota[i];
  const n = isian[a.panitiaId];
  const perluEv = butuhEvidence(Object.values(n)) && !(ev[a.panitiaId] ?? "").trim();
  const berikut = anggota[i + 1];

  function simpan() {
    mulai(async () => {
      const h = await simpanNilaiPicAction(token, a.panitiaId, n, ev[a.panitiaId] ?? "");
      setPesan(h.ok ? null : h.pesan);
      if (!h.ok) return;
      setSelesai((s) => new Set(s).add(a.panitiaId));
      if (berikut) setI(i + 1);
      else setPesan("Semua anggota sudah dinilai. Jazakumullahu khairan — boleh ditutup.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1" aria-label={`${selesai.size} dari ${anggota.length} dinilai`}>
        {anggota.map((x, j) => (
          <button
            key={x.panitiaId}
            type="button"
            onClick={() => setI(j)}
            aria-label={x.nama}
            className={`h-1.5 flex-1 rounded-full ${j === i ? "bg-primary" : selesai.has(x.panitiaId) ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-800"}`}
          />
        ))}
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
            {a.nama.replace(/^(Ustadz|Ustadzah|Mas|Mba|Mbak)\s+/i, "").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold">{a.nama}</div>
            <div className="text-xs text-neutral-500">
              {a.peran} · {a.hadir ? "hadir (scan QR)" : "belum ada scan hadir"}
              {a.tugasTotal > 0 && ` · ${a.tugasSelesai}/${a.tugasTotal} tugas selesai`}
            </div>
          </div>
          <span className="text-xs text-neutral-500">
            {i + 1} / {anggota.length}
          </span>
        </div>

        {!a.tertaut ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Anggota ini belum terdaftar di Daftar Individu. Tim kaderisasi akan menautkannya — lewati dulu.
          </p>
        ) : (
          kpi.map((k) => (
            <div key={k.id} className="space-y-1.5">
              <div className="text-sm font-medium">{k.nama}</div>
              {k.deskripsi?.catatan && <div className="text-[11px] text-neutral-500">{k.deskripsi.catatan}</div>}
              {a.saran[k.id] && <div className="text-[11px] text-emerald-700 dark:text-emerald-400">Saran dari presensi: {a.saran[k.id]}</div>}
              <div className="grid grid-cols-4 gap-1.5">
                {NILAI.map((g) => {
                  const on = n[k.id] === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setIsian((s) => ({ ...s, [a.panitiaId]: { ...s[a.panitiaId], [k.id]: on ? "" : g } }))}
                      className={`h-11 rounded-xl text-base font-semibold ${on ? `${toneBadgeClass[TONE[g]]} ring-2 ring-current` : "border border-neutral-300 bg-card dark:border-neutral-700"}`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {a.tertaut && (
          <label className="block space-y-1">
            <span className="text-xs text-neutral-500">Contoh kejadian {perluEv ? "(wajib untuk D/E)" : "(opsional)"}</span>
            <textarea
              value={ev[a.panitiaId] ?? ""}
              onChange={(e) => setEv((s) => ({ ...s, [a.panitiaId]: e.target.value }))}
              rows={2}
              maxLength={1000}
              className={`w-full rounded-xl border bg-card px-3 py-2 text-sm ${perluEv ? "border-amber-500" : "border-neutral-300 dark:border-neutral-700"}`}
            />
          </label>
        )}
      </div>

      {pesan && <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">{pesan}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={i === 0 || menyimpan}
          onClick={() => setI(i - 1)}
          className="h-12 rounded-xl border border-neutral-300 px-4 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          ‹
        </button>
        {a.tertaut ? (
          <button
            type="button"
            disabled={menyimpan || perluEv}
            onClick={simpan}
            className="h-12 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {menyimpan ? "Menyimpan…" : berikut ? `Simpan & lanjut: ${berikut.nama.split(" ")[0]} ›` : "Simpan"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!berikut}
            onClick={() => setI(i + 1)}
            className="h-12 flex-1 rounded-xl border border-neutral-300 text-sm disabled:opacity-40 dark:border-neutral-700"
          >
            Lewati ›
          </button>
        )}
      </div>
      {a.tertaut && berikut && (
        <p className="text-center text-xs text-neutral-500">
          Tidak cukup mengamati orang ini?{" "}
          <button type="button" onClick={() => setI(i + 1)} className="text-primary underline">
            Lewati
          </button>
        </p>
      )}
    </div>
  );
}
