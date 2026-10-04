"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PROGRAM_PILIHAN } from "@/lib/hadir/program";
import { ubahOrang } from "./actions";
import { labelKonfirmasi, type Konfirmasi } from "@/lib/hadir/view-model";
import { waLink } from "@/lib/wa";

type Baris = { id: string; nama: string; gender: string; program: string | null; konfirmasi: Konfirmasi; alasan: string | null; kode: string; punyaWa: boolean; wa: string | null };

export function TabelPendaftar({ slug, base, rows }: { slug: string; base: string; rows: Baris[] }) {
  const [q, setQ] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ubah = (id: string, v: { programTeks?: string; gender?: string }) =>
    start(async () => {
      const r = await ubahOrang(slug, id, v);
      setPesan(r.ok ? null : r.error);
      if (r.ok) router.refresh();
    });
  const sel = "rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";
  const tampil = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? rows.filter((r) => r.nama.toLowerCase().includes(k) || (r.program ?? "").toLowerCase().includes(k)) : rows;
  }, [rows, q]);
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-14 font-semibold">Pendaftar ({rows.length})</h2>
        <a href={`/api/hadir/${slug}/qr-zip`} className="rounded border border-neutral-300 px-3 py-1 text-12 dark:border-neutral-700">Ekspor QR (zip PNG)</a>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari" className="ml-auto rounded border border-neutral-300 px-2 py-1 text-12 dark:border-neutral-700 dark:bg-neutral-900" />
      </div>
      {pesan && <p className="mb-2 text-12 text-red-600">{pesan}</p>}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-12">
          <thead className="bg-neutral-50 text-11 uppercase text-muted-foreground dark:bg-neutral-900">
            <tr><th className="px-3 py-2 text-left font-medium">Nama</th><th className="px-3 py-2 text-left font-medium">Program</th><th className="px-3 py-2 text-left font-medium">Konfirmasi</th><th className="px-3 py-2 text-left font-medium">HP</th><th className="px-3 py-2 text-left font-medium">QR</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {tampil.map((r) => {
              const pesan = `Assalamu'alaikum ${r.nama}, ini kartu QR kehadiran kajian Anda: ${base}/h/${r.kode} — tunjukkan saat registrasi ulang.`;
              const wl = waLink(r.wa, pesan);
              return (
                <tr key={r.id}>
                  <td className="px-3 py-1.5">
                    {r.nama}{" "}
                    <select aria-label="Gender" disabled={pending} value={r.gender === "P" ? "P" : "L"} onChange={(e) => ubah(r.id, { gender: e.target.value })} className={`${sel} ml-1`}>
                      <option value="L">I</option>
                      <option value="P">A</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    <select aria-label="Program" disabled={pending} value={(PROGRAM_PILIHAN as readonly string[]).includes(r.program ?? "") ? (r.program as string) : ""} onChange={(e) => ubah(r.id, { programTeks: e.target.value })} className={sel}>
                      {!(PROGRAM_PILIHAN as readonly string[]).includes(r.program ?? "") && <option value="">{r.program ?? "—"}</option>}
                      {PROGRAM_PILIHAN.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">{labelKonfirmasi(r.konfirmasi)}{r.alasan && <span className="ml-1 text-11 text-muted-foreground">({r.alasan})</span>}</td>
                  <td className="px-3 py-1.5">{r.punyaWa ? "ada" : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/h/${r.kode}`} target="_blank" className="font-mono hover:underline">{r.kode}</Link>
                    <a href={`/h/${r.kode}/qr.png`} download className="ml-2 text-11 underline" title="Unduh kartu QR (PNG)">PNG</a>
                    {wl && <a href={wl} target="_blank" rel="noreferrer" className="ml-2 text-11 underline">kirim WA</a>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
