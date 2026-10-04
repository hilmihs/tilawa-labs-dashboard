"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { jamWibDari, labelKonfirmasi, terlambat, type Konfirmasi, type MetodeHadir } from "@/lib/hadir/view-model";
import { batalkanHadir, tambahOrangHadir, tandaiHadirManual } from "./actions";
import { FormTambahOrang } from "./FormTambahOrang";

export type BarisHadir = {
  id: string;
  nama: string;
  gender: string;
  program: string | null;
  konfirmasi: Konfirmasi;
  alasan: string | null;
  hadirAt: string | null;
  metode: MetodeHadir | null;
  kode: string;
};

export type Filter = "semua" | "hadir" | "noshow" | "belum_bisa" | "belum_hadir" | "terlambat";

const LABEL_METODE: Record<MetodeHadir, string> = { qr: "QR", cari_nama: "cari nama", manual: "manual", nawa: "NAWA" };

export function DaftarHadir({
  slug,
  rows,
  acara,
  filterAwal = "semua",
}: {
  slug: string;
  rows: BarisHadir[];
  acara: { tanggal: string; jamMulai: string | null; toleransiMenit: number };
  /** Dari chip masalah di atas (?filter=…), supaya angka menuju barisnya. */
  filterAwal?: Filter;
}) {
  const [filter, setFilter] = useState<Filter>(filterAwal);
  const [q, setQ] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [tambah, setTambah] = useState(false);
  const [pending, start] = useTransition();

  const tampil = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter((o) => {
      if (filter === "hadir" && !o.hadirAt) return false;
      if (filter === "noshow" && !(o.konfirmasi === "bisa" && !o.hadirAt)) return false;
      if (filter === "belum_bisa" && o.konfirmasi !== "belum_bisa") return false;
      if (filter === "belum_hadir" && o.hadirAt) return false;
      if (filter === "terlambat" && !(o.hadirAt && terlambat(o.hadirAt, acara))) return false;
      if (k && !o.nama.toLowerCase().includes(k) && !(o.program ?? "").toLowerCase().includes(k)) return false;
      return true;
    });
  }, [rows, filter, q]);

  const jalankan = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setPesan(r.ok ? null : r.error);
    });

  const tab = (f: Filter, label: string) => (
    <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded px-2 py-1 text-12 ${filter === f ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>
      {label}
    </button>
  );

  return (
    <section id="daftar" className="mt-6 scroll-mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {tab("semua", `Semua (${rows.length})`)}
        {tab("hadir", `Hadir (${rows.filter((o) => o.hadirAt).length})`)}
        {tab("belum_hadir", "Belum hadir")}
        {tab("terlambat", "Terlambat")}
        {tab("noshow", "Bilang bisa, belum datang")}
        {tab("belum_bisa", "Belum bisa")}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / program" className="ml-auto rounded border border-neutral-300 px-2 py-1 text-12 dark:border-neutral-700 dark:bg-neutral-900" />
        <button type="button" onClick={() => setTambah((v) => !v)} className="rounded bg-neutral-900 px-2 py-1 text-12 text-white dark:bg-neutral-100 dark:text-neutral-900">+ Tambah orang</button>
      </div>
      {tambah && (
        <div className="mb-3 max-w-md rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <FormTambahOrang aksi={(v) => tambahOrangHadir(slug, v)} namaAwal={q} onSelesai={(h) => { setTambah(false); setPesan(h.sudahAda ? `${h.nama} sudah ada di data — ditandai hadir.` : null); }} onBatal={() => setTambah(false)} />
        </div>
      )}
      {pesan && <p className="mb-2 text-12 text-red-600">{pesan}</p>}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-12">
          <thead className="bg-neutral-50 text-11 uppercase text-muted-foreground dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nama</th>
              <th className="px-3 py-2 text-left font-medium">Program</th>
              <th className="px-3 py-2 text-left font-medium">Konfirmasi</th>
              <th className="px-3 py-2 text-left font-medium">Hadir</th>
              <th className="px-3 py-2 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {tampil.map((o) => {
              const telat = o.hadirAt ? terlambat(o.hadirAt, acara) : false;
              return (
                <tr key={o.id}>
                  <td className="px-3 py-1.5">
                    <Link href={`/h/${o.kode}`} className="hover:underline" target="_blank">{o.nama}</Link>
                    <span className="ml-1 text-11 text-muted-foreground">{o.gender === "P" ? "A" : "I"}</span>
                    <a href={`/h/${o.kode}/qr.png`} download className="ml-2 text-11 text-muted-foreground underline" title="Unduh kartu QR (PNG)">PNG</a>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{o.program ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {labelKonfirmasi(o.konfirmasi)}
                    {o.alasan && <span className="ml-1 text-11 text-muted-foreground">({o.alasan})</span>}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {o.hadirAt ? (
                      <span className={telat ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}>
                        {jamWibDari(o.hadirAt)} {telat && "· terlambat"} <span className="text-11 text-muted-foreground">· {o.metode ? LABEL_METODE[o.metode] : ""}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {o.hadirAt ? (
                      <button type="button" disabled={pending} onClick={() => jalankan(() => batalkanHadir(slug, o.id))} className="rounded border border-neutral-300 px-2 py-0.5 text-11 dark:border-neutral-700">
                        Batalkan
                      </button>
                    ) : (
                      <button type="button" disabled={pending} onClick={() => jalankan(() => tandaiHadirManual(slug, o.id))} className="rounded bg-neutral-900 px-2 py-0.5 text-11 text-white dark:bg-neutral-100 dark:text-neutral-900">
                        Tandai hadir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {tampil.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Tidak ada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
