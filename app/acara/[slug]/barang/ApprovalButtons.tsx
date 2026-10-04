"use client";

import { useState, useTransition } from "react";
import { tandaiKembali, ubahApprovalBarang, type AksiResult } from "./actions";

/** Penyegaran lewat revalidatePath di action; tidak ada router.refresh() di sini (konvensi halaman staff). */
export function ApprovalButtons({ slug, id, status, harusKembali, sudahKembali }: { slug: string; id: string; status: string; harusKembali: boolean; sudahKembali: boolean }) {
  const [pending, start] = useTransition();
  const [tolak, setTolak] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const run = (aksi: () => Promise<AksiResult>) => {
    setGalat(null);
    start(async () => { const r = await aksi(); if (!r.ok) setGalat(r.error); else setTolak(false); });
  };
  const b = "rounded border px-2 py-0.5 text-12 disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {status !== "disetujui" && <button type="button" disabled={pending} className={`${b} border-green-600 text-green-700 dark:text-green-300`} onClick={() => run(() => ubahApprovalBarang(slug, id, "disetujui", null))}>Setujui</button>}
      {status !== "ditolak" && !tolak && <button type="button" disabled={pending} className={`${b} border-red-600 text-red-700 dark:text-red-300`} onClick={() => setTolak(true)}>Tolak</button>}
      {status !== "diajukan" && <button type="button" disabled={pending} className={`${b} border-neutral-400`} onClick={() => run(() => ubahApprovalBarang(slug, id, "diajukan", null))}>Batalkan</button>}
      {harusKembali && <button type="button" disabled={pending} className={`${b} border-neutral-400`} onClick={() => run(() => tandaiKembali(slug, id, !sudahKembali))}>{sudahKembali ? "Belum kembali" : "Sudah kembali"}</button>}
      {tolak && (
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => ubahApprovalBarang(slug, id, "ditolak", f.get("alasan"))); }}>
          <input name="alasan" required placeholder="Alasan penolakan" className="rounded border px-2 py-0.5 text-12 dark:bg-neutral-900" />
          <button type="submit" disabled={pending} className={`${b} border-red-600`}>Kirim</button>
        </form>
      )}
      {galat && <span className="text-12 text-red-700 dark:text-red-300">{galat}</span>}
    </div>
  );
}
