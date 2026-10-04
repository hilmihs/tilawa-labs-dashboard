"use client";

import { useRef, useState, useTransition } from "react";
import type { Kpi } from "@/lib/penilaian/queries";
import type { BarisImpor, PetaKolom, StatusBaris } from "@/lib/penilaian/impor";
import { bacaImporAction, tulisImporAction, type HasilBaca } from "./actions";

const LABEL: Record<StatusBaris, string> = { baru: "Baru", berubah: "Berubah", sama: "Sama", ditolak: "Ditolak" };
const WARNA: Record<StatusBaris, string> = {
  baru: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  berubah: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  sama: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  ditolak: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

/**
 * Impor penilaian (design p4): unggah → cocokkan kolom → pratinjau → tulis.
 * Berkas disimpan di state supaya pratinjau bisa diulang setelah peta kolom
 * diubah, tanpa mengunggah lagi.
 */
export function ImporNilai({ slug, kpi }: { slug: string; kpi: Kpi[] }) {
  const [berkas, setBerkas] = useState<File | null>(null);
  const [sheet, setSheet] = useState("");
  const [hasil, setHasil] = useState<HasilBaca | null>(null);
  const [peta, setPeta] = useState<PetaKolom | null>(null);
  const [tab, setTab] = useState<StatusBaris | "semua">("semua");
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [sibuk, mulai] = useTransition();
  // Berkas juga dibaca langsung dari input: sebagian cara mengisi input (drag,
  // autofill peramban) tidak memicu onChange.
  const inputRef = useRef<HTMLInputElement>(null);

  function baca(petaDipakai: PetaKolom | null, pertahankanPesan = false) {
    const f = berkas ?? inputRef.current?.files?.[0] ?? null;
    if (!f) return;
    if (!berkas) setBerkas(f);
    const fd = new FormData();
    fd.set("berkas", f);
    if (sheet) fd.set("sheet", sheet);
    if (petaDipakai) fd.set("peta", JSON.stringify(petaDipakai));
    if (!pertahankanPesan) setPesan(null);
    mulai(async () => {
      const h = await bacaImporAction(slug, fd);
      setHasil(h);
      if (h.ok) {
        setPeta(h.peta);
        setSheet(h.sheet);
      }
    });
  }

  const ditulis = hasil?.ok ? hasil.baris.filter((b) => (b.status === "baru" || b.status === "berubah") && b.cocok) : [];
  function tulis() {
    mulai(async () => {
      const h = await tulisImporAction(
        slug,
        ditulis.map((b) => ({ orangId: b.cocok!.orangId, panitiaId: b.cocok!.panitiaId, nilai: b.nilai, evidence: b.evidence })),
      );
      setPesan({ ok: h.ok, teks: h.pesan });
      if (h.ok) baca(peta, true);
    });
  }

  const langkah = !hasil?.ok ? 1 : !hasil.peta.nama ? 2 : 3;
  const kolom = hasil?.ok ? hasil.headers : [];
  const pilih = (value: string | null, onChange: (v: string | null) => void) => (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs">
      <option value="">(tidak dipakai)</option>
      {kolom.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  );
  const tampil = hasil?.ok ? hasil.baris.filter((b) => tab === "semua" || b.status === tab) : [];

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-4 text-xs">
        {["Unggah", "Cocokkan kolom", "Pratinjau", "Tulis"].map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${i + 1 < langkah ? "bg-emerald-600 text-white" : i + 1 === langkah ? "bg-primary text-primary-foreground" : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800"}`}
            >
              {i + 1}
            </span>
            <span className={i + 1 === langkah ? "font-semibold" : "text-neutral-500"}>{t}</span>
          </li>
        ))}
      </ol>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Berkas (xlsx / csv, termasuk ekspor Google Form)
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              setBerkas(e.target.files?.[0] ?? null);
              setHasil(null);
              setPeta(null);
              setSheet("");
            }}
            className="text-xs"
          />
        </label>
        {hasil?.ok && hasil.sheets.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Sheet
            <select value={sheet} onChange={(e) => setSheet(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs">
              {hasil.sheets.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" disabled={sibuk} onClick={() => baca(null)} className="h-8 rounded-lg border border-border px-3 text-xs hover:border-neutral-400 disabled:opacity-40">
          {sibuk ? "Membaca…" : "Baca berkas"}
        </button>
      </section>

      {hasil && !hasil.ok && <p className="text-sm text-red-600">{hasil.error}</p>}

      {hasil?.ok && peta && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Cocokkan kolom</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Ditebak dari judul kolom. Nilai boleh huruf B–E atau angka 1–4 (4 = B … 1 = E).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs">
              <span className="font-medium">Nama (wajib)</span>
              {pilih(peta.nama, (v) => setPeta({ ...peta, nama: v }))}
            </label>
            {kpi.map((k) => (
              <label key={k.id} className="space-y-1 text-xs">
                <span className="font-medium">{k.nama}</span>
                {pilih(peta.kpi[k.id] ?? null, (v) => setPeta({ ...peta, kpi: { ...peta.kpi, [k.id]: v } }))}
              </label>
            ))}
            <label className="space-y-1 text-xs">
              <span className="font-medium">Contoh kejadian (opsional)</span>
              {pilih(peta.evidence, (v) => setPeta({ ...peta, evidence: v }))}
            </label>
          </div>
          <button type="button" disabled={sibuk || !peta.nama} onClick={() => baca(peta)} className="mt-3 h-8 rounded-lg border border-border px-3 text-xs hover:border-neutral-400 disabled:opacity-40">
            Pratinjau dengan pencocokan ini
          </button>
        </section>
      )}

      {hasil?.ok && hasil.baris.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(["semua", "baru", "berubah", "ditolak", "sama"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full border px-3 py-1 text-xs ${tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
              >
                {t === "semua" ? "Semua" : LABEL[t]}{" "}
                <span className="font-mono">{t === "semua" ? hasil.baris.length : hasil.ringkas[t]}</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2">Baris</th>
                  <th className="px-3 py-2">Nama di file</th>
                  <th className="px-3 py-2">Dicocokkan ke</th>
                  {kpi.map((k) => (
                    <th key={k.id} className="px-2 py-2 text-center">{k.nama}</th>
                  ))}
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((b: BarisImpor) => (
                  <tr key={b.no} className="border-t border-border align-top">
                    <td className="px-3 py-1.5 font-mono text-neutral-500">{b.no}</td>
                    <td className="px-3 py-1.5">{b.namaFile || "—"}</td>
                    <td className="px-3 py-1.5 font-medium">{b.cocok?.label ?? "?"}</td>
                    {kpi.map((k) => (
                      <td key={k.id} className="px-2 py-1.5 text-center font-mono">
                        {b.nilai[k.id] ?? "—"}
                        {b.nilaiLama[k.id] && b.nilaiLama[k.id] !== b.nilai[k.id] && (
                          <span className="block text-[10px] text-neutral-400">dulu {b.nilaiLama[k.id]}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${WARNA[b.status]}`}>{LABEL[b.status]}</span>{" "}
                      <span className="text-neutral-500">{b.alasan}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-neutral-500">
              Tidak ada yang ditulis sebelum konfirmasi. Baris ditolak bisa diperbaiki di berkas lalu dibaca ulang — idempoten.
            </span>
            <button
              type="button"
              disabled={sibuk || ditulis.length === 0}
              onClick={tulis}
              className="ml-auto h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {sibuk ? "Menulis…" : `Tulis ${ditulis.length} orang`}
            </button>
          </div>
        </section>
      )}
      {pesan && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${pesan.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700"}`}>
          {pesan.teks}
        </p>
      )}
    </div>
  );
}
