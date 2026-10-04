"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RencanaOrang } from "@/lib/hadir/impor";
import { pratinjauImpor, tulisImpor, type HasilTulis, type Pratinjau } from "./actions";

const LABEL: Record<RencanaOrang["status"], string> = { cocok_wa: "cocok (WA)", cocok_nama: "cocok (nama)", baru: "baru", ragu: "ragu" };

/** Unggah → pratinjau → tulis. Tidak pernah menulis langsung dari unggahan. */
export function ImporForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pra, setPra] = useState<Pratinjau | null>(null);
  const [hasil, setHasil] = useState<HasilTulis | null>(null);
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-14 font-semibold">Impor respons form (xlsx)</h2>
      <p className="mt-1 text-12 text-muted-foreground">Kolom: Nama Lengkap, Jenis Kelamin, Mengajar dalam program, Konfirmasi kehadiran, Alasan. HP dilengkapi otomatis dari data guru bila nama cocok.</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setHasil(null);
          start(async () => setPra(await pratinjauImpor(slug, fd)));
        }}
      >
        <label className="text-12">Berkas<br /><input name="berkas" type="file" accept=".xlsx,.xls,.csv" required className="text-12" /></label>
        <label className="text-12">Sheet (opsional)<br /><input name="sheet" className="rounded border border-neutral-300 px-2 py-1 text-12 dark:border-neutral-700 dark:bg-neutral-900" placeholder="Form Responses 1" /></label>
        <button type="submit" disabled={pending} className="rounded border border-neutral-300 px-3 py-1.5 text-12 dark:border-neutral-700">{pending ? "Membaca…" : "Pratinjau"}</button>
      </form>

      {pra && !pra.ok && <p className="mt-3 text-12 text-red-600">{pra.error}</p>}
      {pra && pra.ok && (
        <div className="mt-3">
          <p className="text-12">
            Sheet <b>{pra.sheet}</b> · {pra.rencana.length} orang unik · cocok WA {pra.ringkas.cocok_wa} · cocok nama {pra.ringkas.cocok_nama} · baru {pra.ringkas.baru} · ragu {pra.ringkas.ragu} · ber-HP {pra.ringkas.berHp}
            {pra.ditolak.length > 0 && <span className="text-red-600"> · {pra.ditolak.length} baris ditolak (baris {pra.ditolak.map((d) => d.no).join(", ")})</span>}
          </p>
          <div className="mt-2 max-h-64 overflow-auto rounded border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-11">
              <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900"><tr><th className="px-2 py-1 text-left">Nama</th><th className="px-2 py-1 text-left">Program</th><th className="px-2 py-1 text-left">Konfirmasi</th><th className="px-2 py-1 text-left">HP</th><th className="px-2 py-1 text-left">Status</th></tr></thead>
              <tbody>
                {pra.rencana.map((r) => (
                  <tr key={r.input.namaKunci} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-2 py-0.5">{r.input.nama} <span className="text-muted-foreground">({r.input.gender})</span></td>
                    <td className="px-2 py-0.5">{r.input.programTeks ?? "—"}</td>
                    <td className="px-2 py-0.5">{r.input.konfirmasi ?? "—"}</td>
                    <td className="px-2 py-0.5">{r.input.wa ? "ada" : "—"}</td>
                    <td className={`px-2 py-0.5 ${r.status === "ragu" ? "text-amber-700" : r.status === "baru" ? "text-blue-700" : "text-muted-foreground"}`}>{LABEL[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { const h = await tulisImpor(slug, pra.rencana); setHasil(h); if (h.ok) { setPra(null); router.refresh(); } })}
            className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-12 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "Menulis…" : "Tulis ke database"}
          </button>
        </div>
      )}
      {hasil && (hasil.ok ? <p className="mt-2 text-12 text-green-700">Selesai: {hasil.orangBaru} orang baru, {hasil.pendaftaran} pendaftaran, {hasil.hpDilengkapi} HP dilengkapi.</p> : <p className="mt-2 text-12 text-red-600">{hasil.error}</p>)}
    </div>
  );
}
