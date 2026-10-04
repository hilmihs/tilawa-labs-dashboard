"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FASE_TUGAS } from "@/lib/acara/input";
import { LABEL_STATUS_TUGAS, TUGAS_PRIORITAS, TUGAS_STATUS, type TugasStatus } from "@/lib/acara/types";
import { btn, input, td, th, tglPendek } from "../_ui";
import { tambahTugasStaff, ubahStatusTugasStaff, type AksiResult } from "./actions";

export type BarisTugas = {
  id: string; judul: string; divisiNama: string | null; fase: number; prioritas: string;
  status: string; tenggat: string | null; ditugaskanKe: string | null; terlambat: boolean; beres: boolean;
};

/** Jeda sebelum pilihan status dikirim: Firefox/keyboard memicu `change` tiap langkah panah pada select tertutup. */
const JEDA_SIMPAN_MS = 400;

/**
 * Select status per baris: nilai lokal ditampilkan optimistis (tidak melompat
 * balik), baru dikirim setelah jeda tanpa perubahan lagi. Gagal → kembali ke
 * status tersimpan. Bila status dari server berubah (revalidate), nilai lokal
 * mengikuti.
 */
function StatusSelect({ status, sibuk, onUbah }: {
  status: string;
  sibuk: boolean;
  onUbah: (baru: string, batal: () => void) => void;
}) {
  const [val, setVal] = useState(status);
  const [sebelumnya, setSebelumnya] = useState(status);
  if (status !== sebelumnya) {
    setSebelumnya(status);
    setVal(status);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <select
      value={val}
      disabled={sibuk}
      onChange={(e) => {
        const baru = e.target.value;
        setVal(baru);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          if (baru !== status) onUbah(baru, () => setVal(status));
        }, JEDA_SIMPAN_MS);
      }}
      className={input}
    >
      {TUGAS_STATUS.map((s) => <option key={s} value={s}>{LABEL_STATUS_TUGAS[s as TugasStatus]}</option>)}
    </select>
  );
}

export function TugasTable({ slug, rows, divisi }: { slug: string; rows: BarisTugas[]; divisi: Array<{ id: string; nama: string; sisi: string }> }) {
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [buka, setBuka] = useState(false);

  // Penyegaran sesudah sukses datang dari revalidatePath di action, bukan router.refresh().
  function jalankan(aksi: () => Promise<AksiResult>, onOk?: () => void, onGagal?: () => void) {
    setGalat(null);
    start(async () => {
      const r = await aksi();
      if (!r.ok) { setGalat(r.error); onGagal?.(); }
      else onOk?.();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-12 text-muted-foreground">{rows.length} tugas</p>
        <button type="button" className={btn} onClick={() => setBuka((v) => !v)}>+ Tugas</button>
      </div>
      {galat && <p className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-12 text-red-700 dark:bg-red-950 dark:text-red-300">{galat}</p>}

      {buka && (
        <form
          className="mb-4 grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-3 dark:border-neutral-800"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            jalankan(
              () => tambahTugasStaff(slug, {
                judul: f.get("judul"), divisiId: f.get("divisiId"), fase: f.get("fase"), prioritas: f.get("prioritas"),
                tenggat: f.get("tenggat") || null, ditugaskanKe: f.get("ditugaskanKe"), deskripsi: f.get("deskripsi"),
              }),
              () => setBuka(false),
            );
          }}
        >
          <input name="judul" required placeholder="Judul tugas" className={`${input} sm:col-span-3`} />
          <select name="divisiId" defaultValue="" className={input}>
            <option value="">Lintas divisi</option>
            {divisi.map((d) => <option key={d.id} value={d.id}>{d.nama} ({d.sisi})</option>)}
          </select>
          <select name="fase" defaultValue="1" className={input}>{FASE_TUGAS.map((n) => <option key={n} value={n}>Fase {n}</option>)}</select>
          <select name="prioritas" defaultValue="sedang" className={input}>{TUGAS_PRIORITAS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <input name="tenggat" type="date" className={input} />
          <input name="ditugaskanKe" placeholder="Ditugaskan ke (nama bebas)" className={input} />
          <input name="deskripsi" placeholder="Deskripsi (opsional)" className={input} />
          <button type="submit" disabled={pending} className={`${btn} sm:col-span-3`}>Simpan</button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr><th className={th}>Tugas</th><th className={th}>Divisi</th><th className={th}>Fase</th><th className={th}>Prioritas</th><th className={th}>Tenggat</th><th className={th}>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={`border-t border-neutral-200 dark:border-neutral-800 ${t.terlambat ? "bg-red-50 dark:bg-red-950/40" : ""}`}>
                <td className={td}>
                  <span className={t.beres ? "text-muted-foreground line-through" : ""}>{t.judul}</span>
                  {t.ditugaskanKe && <span className="ml-1 text-12 text-muted-foreground">→ {t.ditugaskanKe}</span>}
                </td>
                <td className={td}>{t.divisiNama ?? <i className="text-muted-foreground">lintas</i>}</td>
                <td className={td}>{t.fase}</td>
                <td className={td}>{t.prioritas}</td>
                <td className={`${td} ${t.terlambat ? "font-semibold text-red-700 dark:text-red-300" : ""}`}>{tglPendek(t.tenggat)}{t.terlambat ? " · terlambat" : ""}</td>
                <td className={td}>
                  <StatusSelect
                    status={t.status}
                    sibuk={savingId === t.id}
                    onUbah={(baru, batal) => {
                      setSavingId(t.id);
                      jalankan(
                        () => ubahStatusTugasStaff(slug, t.id, baru),
                        () => setSavingId(null),
                        () => { batal(); setSavingId(null); },
                      );
                    }}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={td} colSpan={6}>Tidak ada tugas untuk saringan ini.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
