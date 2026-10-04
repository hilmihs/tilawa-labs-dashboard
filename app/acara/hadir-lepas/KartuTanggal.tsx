"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hapusBaris, tautkan } from "./actions";
import { td, th } from "../[slug]/_ui";

const input = "rounded border border-neutral-300 px-2 py-1.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";

export type BarisKartu = { id: string; nama: string; gender: string; kodeQr: string; programTeks: string | null; jam: string };

export function KartuTanggal({
  tanggal,
  label,
  baris,
  sebaran,
  acaraPilihan,
  jamAwal,
  jamAkhir,
}: {
  tanggal: string;
  label: string;
  baris: BarisKartu[];
  sebaran: { jam: string; jumlah: number }[];
  acaraPilihan: { id: string; nama: string }[];
  jamAwal: string;
  jamAkhir: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pesan, setPesan] = useState<string | null>(null);
  const [buka, setBuka] = useState(false);

  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-14 font-semibold">{label}</h2>
        <span className="text-12 text-muted-foreground">{baris.length} orang</span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-12">
        {sebaran.map((s) => (
          <li key={s.jam} className="tabular-nums">
            {s.jam} <span className="text-muted-foreground">· {s.jumlah}</span>
          </li>
        ))}
      </ul>

      {acaraPilihan.length === 0 ? (
        <p className="mt-3 text-12 text-muted-foreground">
          Belum ada kegiatan bertanggal ini. Buat dulu di <a href="/acara" className="underline">/acara</a>, lalu kembali ke sini untuk menautkan.
        </p>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await tautkan(String(fd.get("acara_id") ?? ""), tanggal, String(fd.get("dari") ?? ""), String(fd.get("sampai") ?? ""));
              if (!r.ok) { setPesan(r.error); return; }
              // Pesan diangkat ke tingkat halaman: begitu tanggal ini habis,
              // kartunya hilang — dan bersamanya hilang pula angka "sudah
              // tercatat lewat pemindai kegiatan" yang justru perlu dibaca.
              router.replace(`/acara/hadir-lepas?pesan=${encodeURIComponent(r.pesan)}`);
              router.refresh();
            });
          }}
        >
          <label className="text-12">
            Tautkan ke kegiatan
            <select name="acara_id" required className={`${input} block`}>
              <option value="">Pilih kegiatan</option>
              {acaraPilihan.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}
            </select>
          </label>
          <label className="text-12">
            Dari jam
            <input name="dari" type="time" defaultValue={jamAwal} className={`${input} block`} />
          </label>
          <label className="text-12">
            Sampai jam
            <input name="sampai" type="time" defaultValue={jamAkhir} className={`${input} block`} />
          </label>
          <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-1.5 text-12 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
            {pending ? "Menautkan…" : "Tautkan"}
          </button>
          {pesan && <span className="text-12">{pesan}</span>}
        </form>
      )}

      <button type="button" onClick={() => setBuka(!buka)} className="mt-3 text-12 underline">
        {buka ? "Sembunyikan daftar" : `Lihat ${baris.length} nama`}
      </button>
      {buka && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead><tr><th className={th}>Jam</th><th className={th}>Nama</th><th className={th}>I/A</th><th className={th}>Program</th><th className={th}>Kode</th><th className={th}></th></tr></thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className={td}>{b.jam}</td>
                  <td className={td}>{b.nama}</td>
                  <td className={td}>{b.gender === "P" ? "A" : "I"}</td>
                  <td className={td}>{b.programTeks ?? "—"}</td>
                  <td className={td}><code>{b.kodeQr}</code></td>
                  <td className={td}>
                    <button
                      type="button"
                      className="text-12 text-red-600 underline"
                      onClick={() => start(async () => {
                        const r = await hapusBaris(b.id);
                        if (!r.ok) { setPesan(r.error); return; }
                        router.replace(`/acara/hadir-lepas?pesan=${encodeURIComponent(r.pesan)}`);
                        router.refresh();
                      })}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
