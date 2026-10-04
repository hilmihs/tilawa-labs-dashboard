"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrangDirektori } from "@/lib/hadir/queries-golongan";
import { FATROH, QISM } from "@/lib/hadir/qism";
import { simpanOrang } from "./actions";
import { td, th } from "../[slug]/_ui";

const input = "w-full rounded border border-neutral-300 px-2 py-1 text-12 dark:border-neutral-700 dark:bg-neutral-900";

export function TabelOrang({ rows, golongan }: { rows: OrangDirektori[]; golongan: { id: string; nama: string }[] }) {
  const [buka, setBuka] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr>
            <th className={th}>Nama</th><th className={th}>I/A</th><th className={th}>Golongan</th>
            <th className={th}>Qism</th><th className={th}>Mustawa</th><th className={th}>WA</th><th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <Fragment key={o.id}>
              <tr className="border-t border-neutral-200 dark:border-neutral-800">
                <td className={td}>
                  {o.nama}
                  {o.perluReview && <span className="ml-1 text-11 text-amber-600">perlu review</span>}
                </td>
                <td className={td}>{o.gender === "P" ? "A" : "I"}</td>
                <td className={td}>{o.golongan.map((g) => g.nama).join(", ") || "—"}</td>
                <td className={td}>{o.qism ?? "—"}</td>
                <td className={td}>{o.mustawa ?? "—"}</td>
                <td className={td}>{o.wa4 ? `••••${o.wa4}` : "—"}</td>
                <td className={td}>
                  <button type="button" className="text-12 underline" onClick={() => setBuka(buka === o.id ? null : o.id)}>
                    {buka === o.id ? "Tutup" : "Sunting"}
                  </button>
                </td>
              </tr>
              {buka === o.id && (
                <tr>
                  <td colSpan={7} className="bg-neutral-50 px-3 py-3 dark:bg-neutral-900/40">
                    <FormSunting o={o} golongan={golongan} onSelesai={() => setBuka(null)} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormSunting({ o, golongan, onSelesai }: { o: OrangDirektori; golongan: { id: string; nama: string }[]; onSelesai: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pesan, setPesan] = useState<string | null>(null);
  const punya = new Set(o.golongan.map((g) => g.id));
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await simpanOrang(o.id, fd);
          setPesan(r.error ?? r.pesan ?? null);
          if (r.ok) { router.refresh(); onSelesai(); }
        });
      }}
    >
      <fieldset className="sm:col-span-3">
        <legend className="text-12 font-semibold">Golongan</legend>
        <div className="flex flex-wrap gap-3">
          {golongan.map((g) => (
            <label key={g.id} className="flex items-center gap-1 text-12">
              <input type="checkbox" name="golongan" value={g.id} defaultChecked={punya.has(g.id)} /> {g.nama}
            </label>
          ))}
        </div>
        <p className="mt-1 text-11 text-muted-foreground">Golongan yang dipasang sinkron pengajar otomatis tidak ikut dicabut di sini.</p>
      </fieldset>
      <label className="text-12">
        Qism
        <select name="qism" defaultValue={o.qism ?? ""} className={input}>
          <option value="">—</option>
          {QISM.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
      <label className="text-12">Mustawa<input name="mustawa" defaultValue={o.mustawa ?? ""} className={input} placeholder="5 / khirij" /></label>
      <label className="text-12">
        Fatroh
        <select name="fatroh" defaultValue={o.fatroh ?? ""} className={input}>
          <option value="">—</option>
          {FATROH.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <label className="text-12 sm:col-span-2">Asal sekolah / pondok<input name="asal_sekolah" defaultValue={o.asalSekolah ?? ""} className={input} /></label>
      <label className="text-12">Program Education Board<input name="program_mp" defaultValue={o.programMp ?? ""} className={input} placeholder="Dauroh Ta'shil" /></label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-1.5 text-12 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">Simpan</button>
        {pesan && <span className="text-12 text-muted-foreground">{pesan}</span>}
      </div>
    </form>
  );
}
