"use client";

import { useActionState } from "react";
import { golongkanBorongan, type OrangState } from "./actions";

const input = "rounded border border-neutral-300 px-2 py-1.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";

/**
 * Aksi borongan dipisah jadi komponen klien supaya hitungan hasilnya ("N
 * keanggotaan baru dari M orang") bisa ditampilkan — itu satu-satunya cara
 * panitia tahu saringannya kena orang yang benar sebelum menambah lagi.
 */
export function BorongForm({
  golongan,
  saringan,
  jumlahTampil,
}: {
  golongan: { id: string; nama: string }[];
  saringan: { q: string; golongan: string; qism: string; gender: string };
  jumlahTampil: number;
}) {
  const [state, action, pending] = useActionState<OrangState, FormData>(golongkanBorongan, {});
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <input type="hidden" name="q" value={saringan.q} />
      <input type="hidden" name="filter_golongan" value={saringan.golongan} />
      <input type="hidden" name="filter_qism" value={saringan.qism} />
      <input type="hidden" name="filter_gender" value={saringan.gender} />
      <label className="text-12">
        Tandai SELURUH hasil saringan ini ke golongan
        <select name="klasifikasi_id" required className={`${input} block`}>
          <option value="">Pilih golongan</option>
          {golongan.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded bg-amber-700 px-3 py-1.5 text-12 text-white disabled:opacity-50">
        {pending ? "Menandai…" : "Golongkan borongan"}
      </button>
      {(state.pesan || state.error) && <span className="text-12">{state.error ?? state.pesan}</span>}
      <p className="w-full text-11 text-muted-foreground">Berlaku untuk seluruh hasil saringan, bukan hanya {jumlahTampil} baris yang tampil.</p>
    </form>
  );
}
