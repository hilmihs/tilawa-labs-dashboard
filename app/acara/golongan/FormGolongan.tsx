"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buatGolongan, simpanGolongan, type GolonganState } from "./actions";

const input = "w-full rounded border border-neutral-300 px-2 py-1.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";
const btn = "rounded bg-neutral-900 px-3 py-1.5 text-12 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";

export function FormBuatGolongan() {
  const [state, action, pending] = useActionState<GolonganState, FormData>(buatGolongan, {});
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-4 dark:border-neutral-800">
      <h2 className="text-14 font-semibold sm:col-span-4">Golongan baru</h2>
      {state.error && <p className="text-12 text-red-600 sm:col-span-4">{state.error}</p>}
      <label className="text-12 sm:col-span-2">
        Nama
        <input name="nama" required className={input} placeholder="Peserta Dauroh Ta'shil" />
      </label>
      <label className="text-12">
        Keterangan
        <input name="keterangan" className={input} />
      </label>
      <label className="text-12">
        Urutan
        <input name="urutan" type="number" min={0} max={999} defaultValue={50} className={input} />
      </label>
      <div className="sm:col-span-4">
        <button type="submit" disabled={pending} className={btn}>{pending ? "Menyimpan…" : "Buat golongan"}</button>
      </div>
    </form>
  );
}

export type BarisGolonganProps = {
  id: string;
  slug: string;
  nama: string;
  keterangan: string | null;
  urutan: number;
  aktif: boolean;
  anggota: number;
};

export function BarisGolongan({ g }: { g: BarisGolonganProps }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pesan, setPesan] = useState<string | null>(null);
  return (
    <form
      className="grid items-end gap-2 border-t border-neutral-200 py-3 sm:grid-cols-[1fr_1fr_5rem_6rem_6rem_5rem] dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await simpanGolongan(g.id, fd);
          setPesan(r.error ?? "Tersimpan.");
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className="text-12">Nama<input name="nama" defaultValue={g.nama} className={input} /></label>
      <label className="text-12">Keterangan<input name="keterangan" defaultValue={g.keterangan ?? ""} className={input} /></label>
      <label className="text-12">Urutan<input name="urutan" type="number" defaultValue={g.urutan} className={input} /></label>
      <span className="text-12 tabular-nums text-muted-foreground">{g.anggota} orang</span>
      <label className="flex items-center gap-2 text-12"><input name="aktif" type="checkbox" defaultChecked={g.aktif} /> Aktif</label>
      <button type="submit" disabled={pending} className={btn}>Simpan</button>
      <p className="text-11 text-muted-foreground sm:col-span-6">
        slug <code>{g.slug}</code> — tetap, tidak bisa diubah: rekap sesi lampau mengenalinya lewat slug ini.
        {pesan && <span className="ml-2">{pesan}</span>}
      </p>
    </form>
  );
}
