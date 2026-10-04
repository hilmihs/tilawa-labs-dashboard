"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, ListChecks, Package, Users } from "lucide-react";
import {
  BARANG_KRITERIA,
  BARANG_PERUNTUKAN,
  BARANG_SUMBER,
  LABEL_APPROVAL,
  LABEL_KRITERIA,
  LABEL_PERUNTUKAN,
  LABEL_PRIORITAS,
  LABEL_SUMBER,
  TUGAS_PRIORITAS,
  labelStatusTugas,
  type BarangApproval,
} from "@/lib/acara/types";
import { ajukanBarang, jadikanTugas, tambahTugas, tandaiTugas, type AksiResult } from "./actions";

/**
 * Tampilan papan divisi. Semua nilai datang dari server; komponen ini tidak
 * membaca jam atau env. Susunan design a5 (rekomendasi 28 Sep 2026): header
 * dengan hitung mundur besar + progres tugas, isi per tab (Tugas · Barang ·
 * Jobdesk · Divisi lain) dengan tab bawah tetap, supaya jobdesk dan barang
 * tidak lagi bertumpuk panjang di bawah daftar tugas.
 *
 * Menandai selesai = satu ketukan. Tidak ada dialog.
 */

export type PapanData = {
  token: string;
  bolehTulis: boolean;
  acara: { nama: string; tanggal: string; hMinus: number };
  divisi: { id: string; nama: string; sisi: string };
  divisiLain: Array<{ id: string; nama: string; sisi: string }>;
  divisiSaya: { id: string; nama: string };
  pic: string | null;
  anggota: string[];
  tugas: Array<{
    id: string; judul: string; tenggat: string | null; status: string;
    prioritas: string; terlambat: boolean; beres: boolean;
    /** Keputusan koordinator (disetujui/ditahan): tidak ada tombol dari papan divisi. */
    terkunci: boolean;
  }>;
  jobdesk: Array<{ id: string; isi: string; sudahJadiTugas: boolean }>;
  barang: Array<{
    id: string; nama: string; jumlah: string | null; satuan: string | null;
    total: number | null; sumberLabel: string | null; statusApproval: string; alasanTolak: string | null;
  }>;
};

const rupiah = (n: number | null) => (n === null ? "—" : `Rp ${n.toLocaleString("id-ID")}`);
const tglPendek = (iso: string | null) => {
  if (!iso) return "tanpa tenggat";
  const [y, m, d] = iso.split("-");
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${Number(d)} ${bulan[Number(m) - 1]} ${y}`;
};

function hitungMundur(h: number): string {
  if (h > 0) return `H-${h}`;
  if (h === 0) return "Hari-H";
  return `H+${-h}`;
}

export function PapanDivisi({ data }: { data: PapanData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<"tugas" | "barang" | "jobdesk" | "divisi">("tugas");
  const [bukaFormTugas, setBukaFormTugas] = useState(false);
  const [bukaFormBarang, setBukaFormBarang] = useState(false);

  // Formulir ditutup hanya sesudah sukses (onOk): kalau gagal, isian tetap
  // terlihat bersama pesan galatnya, tidak hilang ditelan layar.
  function jalankan(aksi: () => Promise<AksiResult>, onOk?: () => void) {
    setGalat(null);
    start(async () => {
      const r = await aksi();
      if (!r.ok) {
        setGalat(r.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  const terbuka = data.tugas.filter((t) => !t.beres);
  const beres = data.tugas.filter((t) => t.beres);
  const nTerlambat = data.tugas.filter((t) => t.terlambat).length;
  const pct = data.tugas.length ? Math.round((100 * beres.length) / data.tugas.length) : 0;
  const TABS = [
    { k: "tugas" as const, t: "Tugas", n: terbuka.length, Ikon: ListChecks },
    { k: "barang" as const, t: "Barang", n: data.barang.length, Ikon: Package },
    { k: "jobdesk" as const, t: "Jobdesk", n: data.jobdesk.length, Ikon: ClipboardList },
    { k: "divisi" as const, t: "Divisi lain", n: data.divisiLain.length, Ikon: Users },
  ];

  return (
    <div className="pb-24 text-sm">
      {/* Header (design a5): identitas divisi, hitung mundur besar, progres tugas. */}
      <header className="-mx-4 -mt-5 space-y-2 border-b border-neutral-200 bg-card px-4 pb-3.5 pt-4 dark:border-neutral-800">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {data.acara.nama} · {tglPendek(data.acara.tanggal)}
        </p>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-6">{data.divisi.nama}</h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              {data.divisi.sisi}
              {data.pic ? ` · PIC ${data.pic}` : ""} · {data.anggota.length} anggota
            </p>
          </div>
          <span className="shrink-0 rounded-[10px] bg-primary px-2.5 py-1 font-mono text-2xl font-bold text-primary-foreground">
            {hitungMundur(data.acara.hMinus)}
          </span>
        </div>
        {data.tugas.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="block h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-800">
              <span className="block h-1.5 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
            </span>
            <span className="font-mono text-xs">
              {beres.length}/{data.tugas.length} tugas
            </span>
          </div>
        )}
        {!data.bolehTulis && (
          <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Papan divisi lain — baca saja.{" "}
            <a href={`/acara/d/${data.token}`} className="underline">
              Kembali ke papan {data.divisiSaya.nama}
            </a>
          </p>
        )}
        {data.bolehTulis && data.acara.hMinus <= 0 && (
          <a
            href={`/acara/d/${data.token}/nilai`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium dark:border-neutral-800"
          >
            Nilai anggota divisi (±2 menit) <span aria-hidden>›</span>
          </a>
        )}
      </header>

      {galat && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {galat}
        </div>
      )}

      <div className="mt-4">
        {tab === "tugas" && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">
                Tugas terbuka {nTerlambat > 0 && <span className="ml-1 rounded bg-red-600 px-1.5 text-xs text-white">{nTerlambat} terlambat</span>}
              </h2>
              {data.bolehTulis && (
                <button type="button" className="text-xs font-medium text-primary" onClick={() => setBukaFormTugas((v) => !v)}>
                  + Tugas
                </button>
              )}
            </div>
        {bukaFormTugas && data.bolehTulis && (
          <form
            className="mb-3 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              jalankan(
                () =>
                  tambahTugas(data.token, {
                    judul: f.get("judul"), tenggat: f.get("tenggat") || null, prioritas: f.get("prioritas"),
                  }),
                () => setBukaFormTugas(false),
              );
            }}
          >
            <input name="judul" required placeholder="Judul tugas" className="w-full rounded border px-2 py-2 dark:bg-neutral-900" />
            <div className="flex gap-2">
              <input name="tenggat" type="date" className="flex-1 rounded border px-2 py-2 dark:bg-neutral-900" />
              <select name="prioritas" defaultValue="sedang" className="rounded border px-2 py-2 dark:bg-neutral-900">
                {TUGAS_PRIORITAS.map((p) => <option key={p} value={p}>{LABEL_PRIORITAS[p]}</option>)}
              </select>
            </div>
            <button type="submit" disabled={pending} className="w-full rounded bg-neutral-900 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900">
              Simpan
            </button>
          </form>
        )}

        {terbuka.length === 0 && <p className="text-neutral-500">Tidak ada tugas terbuka.</p>}
        <ul className="space-y-2">
          {terbuka.map((t) => (
            <li
              key={t.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                t.terlambat ? "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {data.bolehTulis && !t.terkunci ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label="Tandai selesai"
                  disabled={pending}
                  onClick={() => jalankan(() => tandaiTugas(data.token, t.id, true))}
                  className="mt-0.5 h-8 w-8 shrink-0 rounded border-2 border-neutral-400 active:bg-green-500"
                />
              ) : (
                <span className="mt-0.5 h-8 w-8 shrink-0 rounded border-2 border-neutral-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.judul}</p>
                <p className={`text-xs ${t.terlambat ? "font-semibold text-red-700 dark:text-red-300" : "text-neutral-500"}`}>
                  {t.terlambat ? "Terlambat · " : ""}
                  {tglPendek(t.tenggat)} · {labelStatusTugas(t.status)}
                  {t.prioritas === "tinggi" ? " · prioritas tinggi" : ""}
                  {t.terkunci ? " · dikunci koordinator" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {beres.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-neutral-500">Selesai ({beres.length})</summary>
            <ul className="mt-2 space-y-1">
              {beres.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-neutral-500 line-through">
                  {data.bolehTulis && !t.terkunci && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={true}
                      aria-label="Buka kembali"
                      disabled={pending}
                      onClick={() => jalankan(() => tandaiTugas(data.token, t.id, false))}
                      className="h-6 w-6 shrink-0 rounded border-2 border-green-600 bg-green-500"
                    />
                  )}
                  <span>{t.judul}</span>
                  {t.terkunci && <span className="text-xs no-underline">· dikunci koordinator</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
          </section>
        )}

        {tab === "barang" && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Barang</h2>
              {data.bolehTulis && (
                <button type="button" className="text-xs font-medium text-primary" onClick={() => setBukaFormBarang((v) => !v)}>
                  + Ajukan barang
                </button>
              )}
            </div>
        {bukaFormBarang && data.bolehTulis && (
          <form
            className="mb-3 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              jalankan(
                () =>
                  ajukanBarang(data.token, {
                    nama: f.get("nama"), jumlah: f.get("jumlah"), satuan: f.get("satuan"),
                    hargaSatuan: f.get("hargaSatuan"), kriteria: f.get("kriteria"), sumber: f.get("sumber"),
                    peruntukan: f.get("peruntukan"), pertanyaan: f.get("pertanyaan"),
                  }),
                () => setBukaFormBarang(false),
              );
            }}
          >
            <input name="nama" required placeholder="Nama barang" className="w-full rounded border px-2 py-2 dark:bg-neutral-900" />
            <div className="flex gap-2">
              <input name="jumlah" inputMode="decimal" placeholder="Jumlah" className="w-1/3 rounded border px-2 py-2 dark:bg-neutral-900" />
              <input name="satuan" placeholder="pcs" className="w-1/3 rounded border px-2 py-2 dark:bg-neutral-900" />
              <input name="hargaSatuan" inputMode="numeric" placeholder="Harga satuan" className="w-1/3 rounded border px-2 py-2 dark:bg-neutral-900" />
            </div>
            <div className="flex gap-2">
              <select name="sumber" defaultValue="beli" className="flex-1 rounded border px-2 py-2 dark:bg-neutral-900">
                {BARANG_SUMBER.map((v) => <option key={v} value={v}>{LABEL_SUMBER[v]}</option>)}
              </select>
              <select name="kriteria" defaultValue="boleh_habis" className="flex-1 rounded border px-2 py-2 dark:bg-neutral-900">
                {BARANG_KRITERIA.map((v) => <option key={v} value={v}>{LABEL_KRITERIA[v]}</option>)}
              </select>
            </div>
            <select name="peruntukan" defaultValue="divisi" className="w-full rounded border px-2 py-2 dark:bg-neutral-900">
              {BARANG_PERUNTUKAN.map((v) => <option key={v} value={v}>{LABEL_PERUNTUKAN[v]}</option>)}
            </select>
            <input name="pertanyaan" placeholder="Pertanyaan / catatan (opsional)" className="w-full rounded border px-2 py-2 dark:bg-neutral-900" />
            <button type="submit" disabled={pending} className="w-full rounded bg-neutral-900 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900">
              Ajukan
            </button>
          </form>
        )}

        {data.barang.length === 0 && <p className="text-neutral-500">Belum ada barang diajukan.</p>}
        <ul className="space-y-2">
          {data.barang.map((b) => (
            <li key={b.id} className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{b.nama}</p>
                <span
                  className={`shrink-0 rounded px-1.5 text-xs ${
                    b.statusApproval === "disetujui"
                      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                      : b.statusApproval === "ditolak"
                        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {LABEL_APPROVAL[b.statusApproval as BarangApproval] ?? b.statusApproval}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                {b.jumlah ?? "?"} {b.satuan ?? ""} · {rupiah(b.total)} · {b.sumberLabel ?? "sumber?"}
              </p>
              {b.statusApproval === "ditolak" && b.alasanTolak && (
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">Alasan: {b.alasanTolak}</p>
              )}
            </li>
          ))}
        </ul>
          </section>
        )}

        {tab === "jobdesk" && (
          <section>
            <h2 className="mb-1 font-semibold">Jobdesk</h2>
          <ol className="list-decimal space-y-2 pl-5">
            {data.jobdesk.length === 0 && <p className="text-neutral-500">Belum ada jobdesk untuk divisi ini.</p>}
            {data.jobdesk.map((j) => (
              <li key={j.id}>
                <span>{j.isi}</span>
                {data.bolehTulis && !j.sudahJadiTugas && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => jalankan(() => jadikanTugas(data.token, j.id))}
                    className="ml-2 text-xs underline"
                  >
                    jadikan tugas
                  </button>
                )}
                {j.sudahJadiTugas && <span className="ml-2 text-xs text-neutral-500">✓ sudah jadi tugas</span>}
              </li>
            ))}
          </ol>
          </section>
        )}

        {tab === "divisi" && (
          <section>
            <h2 className="mb-1 font-semibold">Papan divisi lain</h2>
            <p className="mb-2 text-xs text-neutral-500">Baca saja — supaya PIC ikhwan dan akhwat saling tahu progres.</p>
            {data.divisiLain.length === 0 ? (
              <p className="text-neutral-500">Tidak ada divisi lain.</p>
            ) : (
              <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {data.divisiLain.map((d) => (
                  <li key={d.id}>
                    <a href={`/acara/d/${data.token}?lihat=${d.id}`} className="flex items-center justify-between px-3 py-2.5">
                      <span className={d.id === data.divisi.id ? "font-semibold" : ""}>
                        {d.nama} <span className="text-neutral-500">({d.sisi})</span>
                      </span>
                      <span aria-hidden className="text-neutral-400">›</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {data.anggota.length > 0 && <p className="mt-3 text-xs text-neutral-500">Anggota divisi ini: {data.anggota.join(", ")}</p>}
          </section>
        )}
      </div>

      {/* Tab bawah (design a5) — tetap di dasar layar, jempol-sentris. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-card pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 dark:border-neutral-800">
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {TABS.map(({ k, t, n, Ikon }) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-current={tab === k ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${tab === k ? "font-semibold text-primary" : "text-neutral-500"}`}
            >
              <Ikon className="size-5" aria-hidden />
              <span>
                {t}
                {n > 0 && <span className="ml-0.5 font-mono">·{n}</span>}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
