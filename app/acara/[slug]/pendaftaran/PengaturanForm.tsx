"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { simpanPresensi } from "./actions";
import { PilihSeri, PilihTarget, type OpsiGolongan, type TargetAwal } from "../../PilihTarget";

const input = "w-full rounded border border-neutral-300 px-2 py-1.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";

export function PengaturanForm({ slug, awal, golongan, targetAwal, seriAda }: { slug: string; awal: { jamMulai: string; toleransiMenit: number; scanBuka: string; scanTutup: string; terimaPendaftaran: boolean; pemateri: string; lokasi: string; tema: string; seri: string }; golongan: OpsiGolongan[]; targetAwal: TargetAwal; seriAda: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pesan, setPesan] = useState<string | null>(null);
  return (
    <form
      className="grid content-start gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await simpanPresensi(slug, fd);
          setPesan(r.ok ? "Tersimpan." : r.error);
          if (r.ok) router.refresh();
        });
      }}
    >
      <h2 className="text-14 font-semibold sm:col-span-2">Pengaturan acara & presensi</h2>
      <label className="text-12">Pemateri / ustadz<input name="pemateri" defaultValue={awal.pemateri} className={input} placeholder="Ustadz Muhammad Nuzul Dzikri" /></label>
      <label className="text-12">Lokasi<input name="lokasi" defaultValue={awal.lokasi} className={input} /></label>
      <label className="text-12">Jam mulai (WIB)<input name="jam_mulai" type="time" defaultValue={awal.jamMulai} className={input} /></label>
      <label className="text-12">Toleransi terlambat (menit)<input name="toleransi_menit" type="number" min={0} max={240} defaultValue={awal.toleransiMenit} className={input} /></label>
      <label className="text-12">Scan dibuka (WIB)<input name="scan_buka" type="datetime-local" defaultValue={awal.scanBuka} className={input} /></label>
      <label className="text-12">Scan ditutup (WIB)<input name="scan_tutup" type="datetime-local" defaultValue={awal.scanTutup} className={input} /></label>
      <label className="text-12">Tema / kitab<input name="tema" defaultValue={awal.tema} className={input} placeholder="Kitab Tauhid bab 3" /></label>
      <PilihSeri seriAda={seriAda} awal={awal.seri} />
      <PilihTarget golongan={golongan} awal={targetAwal} />
      <label className="flex items-center gap-2 text-12 sm:col-span-2">
        <input name="terima_pendaftaran" type="checkbox" defaultChecked={awal.terimaPendaftaran} /> Buka halaman daftar publik (/daftar/{slug})
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-1.5 text-12 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">Simpan</button>
        {pesan && <span className="text-12 text-muted-foreground">{pesan}</span>}
      </div>
    </form>
  );
}
