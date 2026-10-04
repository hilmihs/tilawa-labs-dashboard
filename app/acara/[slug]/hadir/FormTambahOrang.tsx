"use client";

import { useState, useTransition } from "react";
import { PROGRAM_PILIHAN } from "@/lib/hadir/program";
import type { HasilTambah } from "./actions";

const input = "w-full rounded border border-neutral-300 px-2 py-1.5 text-13 text-black dark:border-neutral-700 dark:bg-neutral-900 dark:text-white";

/**
 * Formulir walk-in: orang yang belum ada di data langsung dibuat dan dihadirkan.
 * Dipakai di panel Hadir dan di pemindai (setelah Cari nama tidak menemukan).
 * Butuh koneksi — hasilnya baris orang baru di server.
 */
/**
 * Aksi tulis disuntikkan, bukan disusun di dalam: satu form melayani dua mode —
 * walk-in di kegiatan (tambahOrangHadir) dan walk-in di pemindai global
 * (tambahOrangLepas).
 */
export type AksiTambahOrang = (v: { nama: string; gender: string; programTeks: string; wa?: string | null }) => Promise<HasilTambah>;

export function FormTambahOrang({ aksi, namaAwal = "", gelap = false, onSelesai, onBatal }: { aksi: AksiTambahOrang; namaAwal?: string; gelap?: boolean; onSelesai: (h: Extract<HasilTambah, { ok: true }>) => void; onBatal?: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nama, setNama] = useState(namaAwal);
  const [gender, setGender] = useState<"L" | "P" | "">("");
  const [program, setProgram] = useState<string>("");
  const [wa, setWa] = useState("");
  const teks = gelap ? "text-white" : "";
  return (
    <form
      className={`grid gap-2 ${teks}`}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await aksi({ nama, gender, programTeks: program, wa: wa.trim() || null });
          if (r.ok) onSelesai(r);
          else setError(r.error);
        });
      }}
    >
      <div className="text-13 font-semibold">Tambah peserta baru & tandai hadir</div>
      {error && <p className="text-12 text-red-500">{error}</p>}
      <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama lengkap" required className={input} autoFocus />
      <div className="flex gap-2">
        <select value={gender} onChange={(e) => setGender(e.target.value as "L" | "P" | "")} required className={input}>
          <option value="" disabled>I / A</option>
          <option value="L">Ikhwan</option>
          <option value="P">Akhwat</option>
        </select>
        <select value={program} onChange={(e) => setProgram(e.target.value)} required className={input}>
          <option value="" disabled>Program</option>
          {PROGRAM_PILIHAN.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <input value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" placeholder="WA (opsional, 08…)" className={input} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded bg-green-600 px-3 py-1.5 text-13 text-white disabled:opacity-50">{pending ? "Menyimpan…" : "Tambah & hadir"}</button>
        {onBatal && <button type="button" onClick={onBatal} className={`rounded border px-3 py-1.5 text-13 ${gelap ? "border-white/30" : "border-neutral-300 dark:border-neutral-700"}`}>Batal</button>}
      </div>
    </form>
  );
}
