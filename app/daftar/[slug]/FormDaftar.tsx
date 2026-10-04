"use client";

import { useActionState } from "react";
import { PROGRAM_PILIHAN } from "@/lib/hadir/program";
import { kirimDaftar, type StatusDaftar } from "./actions";

const input = "w-full rounded border border-neutral-300 px-3 py-2 text-14 dark:border-neutral-700 dark:bg-neutral-900";

export function FormDaftar({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<StatusDaftar, FormData>(kirimDaftar.bind(null, slug), {});
  const v = state.nilai ?? {};
  return (
    <form action={action} className="mt-5 flex flex-col gap-4" noValidate>
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0"><label htmlFor="hp_website">Website</label><input id="hp_website" name="hp_website" tabIndex={-1} autoComplete="off" /></div>
      {state.error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-13 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{state.error}</p>}
      <label className="text-13">Nama lengkap<input name="nama" required defaultValue={v.nama} autoComplete="name" className={input} /></label>
      <fieldset className="text-13">
        <legend>Jenis kelamin</legend>
        <div className="mt-1 flex gap-4">
          <label className="flex items-center gap-1"><input type="radio" name="gender" value="L" defaultChecked={v.gender === "L"} required /> Laki-laki</label>
          <label className="flex items-center gap-1"><input type="radio" name="gender" value="P" defaultChecked={v.gender === "P"} /> Perempuan</label>
        </div>
      </fieldset>
      <label className="text-13">Nomor WhatsApp<input name="wa" required inputMode="tel" defaultValue={v.wa} placeholder="08xxxxxxxxxx" className={input} /></label>
      <label className="text-13">Mengajar dalam program
        <select name="program" required defaultValue={v.program ?? ""} className={input}>
          <option value="" disabled>Pilih…</option>
          {PROGRAM_PILIHAN.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <fieldset className="text-13">
        <legend>Konfirmasi kehadiran</legend>
        <div className="mt-1 flex flex-col gap-1">
          <label className="flex items-center gap-1"><input type="radio" name="konfirmasi" value="bisa" defaultChecked={(v.konfirmasi ?? "bisa") === "bisa"} /> InsyaAllah, bisa hadir</label>
          <label className="flex items-center gap-1"><input type="radio" name="konfirmasi" value="belum_bisa" defaultChecked={v.konfirmasi === "belum_bisa"} /> Belum bisa</label>
        </div>
      </fieldset>
      <label className="text-13">Alasan (bila belum bisa)<input name="alasan" defaultValue={v.alasan} maxLength={300} className={input} /></label>
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-4 py-2.5 text-14 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{pending ? "Menyimpan…" : "Daftar & ambil QR"}</button>
    </form>
  );
}
