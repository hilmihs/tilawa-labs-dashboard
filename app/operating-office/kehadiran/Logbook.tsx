"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { isian, kartu, labelMikro, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import type { BarisLogbook, Sel } from "@/lib/kerja/logbook";
import { LABEL_SESI, SESI, SINGKAT_SESI, type BatasSesi, type Sesi } from "@/lib/kerja/types";
import { cn } from "@/lib/utils";
import { ubahSel } from "./actions";

const HARI = ["Ahad", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const hariDari = (iso: string) => HARI[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const tglPanjang = (iso: string) => `${hariDari(iso)}, ${Number(iso.slice(8, 10))} ${BULAN[Number(iso.slice(5, 7)) - 1]}`;

const LABEL_SUMBER: Record<string, string> = { qr: "kartu QR", nfc: "kartu NFC", ketik: "kode diketik", manual: "diisi manual" };

type Sasaran = { orangId: string; nama: string; tanggal: string; sesi: Sesi; sel: Sel };

/**
 * Logbook layar: dua tabel (Ikhwan, Akhwat) serupa lembar kertas — No, Nama,
 * lalu Tgl × P/Si/Sr berisi jam datang "HH.MM". Klik sel untuk mengisi,
 * mengoreksi, atau mengosongkan (lupa kartu, salah tap).
 */
export function Logbook({
  hari,
  ikhwan,
  akhwat,
  hariIni,
  totalBulan,
  batas,
}: {
  hari: string[];
  ikhwan: BarisLogbook[];
  akhwat: BarisLogbook[];
  hariIni: string;
  totalBulan: Record<string, { sesi: number; hari: number; lengkap: number }>;
  batas: BatasSesi;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sasaran, setSasaran] = useState<Sasaran | null>(null);
  const [jam, setJam] = useState("");
  const [catatan, setCatatan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  function buka(s: Sasaran) {
    setSasaran(s);
    setJam(s.sel ? s.sel.jam.replace(".", ":") : "");
    setCatatan(s.sel?.catatan ?? "");
    setGalat(null);
  }

  // Buka setelah isinya ter-render, supaya fokus jatuh ke isian jam.
  useEffect(() => {
    const d = dialog.current;
    if (sasaran && d && !d.open) d.showModal();
  }, [sasaran]);

  function tutup() {
    dialog.current?.close();
  }

  function kirim(kosongkan: boolean) {
    if (!sasaran) return;
    if (!kosongkan && !jam) {
      setGalat("Isi jam datang dulu, atau tekan Kosongkan.");
      return;
    }
    mulai(async () => {
      const h = await ubahSel({
        orangId: sasaran.orangId,
        tanggal: sasaran.tanggal,
        sesi: sasaran.sesi,
        jam: kosongkan ? null : jam,
        catatan: kosongkan ? null : catatan,
      });
      if (h.ok) tutup();
      else setGalat(h.error);
    });
  }

  // Rentang jam yang sah untuk sesi yang sedang diedit (petunjuk di bawah isian).
  const rentangSesi = (s: Sesi) =>
    s === "pagi" ? [batas.pagiMulai, batas.siangMulai] : s === "siang" ? [batas.siangMulai, batas.soreMulai] : [batas.soreMulai, batas.selesai];

  return (
    <>
      <Tabel judul="Ikhwan" baris={ikhwan} hari={hari} hariIni={hariIni} totalBulan={totalBulan} onPilih={buka} />
      <Tabel judul="Akhwat" baris={akhwat} hari={hari} hariIni={hariIni} totalBulan={totalBulan} onPilih={buka} />

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-11 text-ink-muted">
        <span className="tabular-nums">
          <b className="font-semibold text-foreground">07.45</b> = tap kartu
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <i className="text-foreground">07.45</i>
          <span aria-hidden className="size-1.5 rounded-full bg-brand-bronze" /> = diisi manual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-brand-gold-tint ring-1 ring-brand-gold/60 dark:bg-brand-gold/15" /> hari ini
        </span>
        <span>Klik sel untuk mengisi atau mengoreksi.</span>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setSasaran(null)}
        className="m-auto w-[calc(100%-32px)] max-w-sm rounded-[14px] border border-neutral-300 bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40 dark:border-neutral-800"
      >
        {sasaran && (
          <form
            method="dialog"
            className="flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              kirim(false);
            }}
          >
            <div>
              <div className={labelMikro}>
                {tglPanjang(sasaran.tanggal)} · {LABEL_SESI[sasaran.sesi]}
              </div>
              <h2 className="mt-1 text-16 font-semibold">{sasaran.nama}</h2>
              {sasaran.sel && (
                <p className="mt-0.5 text-12 text-ink-muted">
                  Sekarang {sasaran.sel.jam} · {LABEL_SUMBER[sasaran.sel.sumber] ?? sasaran.sel.sumber}
                </p>
              )}
            </div>
            <label className="flex flex-col gap-1 text-12 font-medium text-neutral-700 dark:text-neutral-300">
              Jam datang
              <input
                type="time"
                value={jam}
                onChange={(e) => setJam(e.target.value)}
                className={cn(isian, "tabular-nums")}
                autoFocus
              />
              <span className="font-normal text-ink-muted">
                Sesi {LABEL_SESI[sasaran.sesi]}: {rentangSesi(sasaran.sesi)[0]}–{rentangSesi(sasaran.sesi)[1]} WIB
              </span>
            </label>
            <label className="flex flex-col gap-1 text-12 font-medium text-neutral-700 dark:text-neutral-300">
              Catatan <span className="font-normal text-ink-muted">(opsional, mis. &ldquo;lupa bawa kartu&rdquo;)</span>
              <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={300} className={isian} />
            </label>
            {galat && <p className="text-sm text-danger">{galat}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" disabled={sibuk} className={tombolUtama}>
                {sibuk ? "Menyimpan…" : "Simpan"}
              </button>
              {sasaran.sel && (
                <button type="button" disabled={sibuk} onClick={() => kirim(true)} className={cn(tombolGaris, "text-danger")}>
                  Kosongkan
                </button>
              )}
              <button type="button" onClick={tutup} className={cn(tombolGaris, "ml-auto border-transparent bg-transparent")}>
                Batal
              </button>
            </div>
            <p className="text-11 text-ink-muted">Isian admin ditandai &ldquo;manual&rdquo; dan menggantikan jam dari kartu.</p>
          </form>
        )}
      </dialog>
    </>
  );
}

function Tabel({
  judul,
  baris,
  hari,
  hariIni,
  totalBulan,
  onPilih,
}: {
  judul: string;
  baris: BarisLogbook[];
  hari: string[];
  hariIni: string;
  totalBulan: Record<string, { sesi: number; hari: number; lengkap: number }>;
  onPilih: (s: Sasaran) => void;
}) {
  const kini = (t: string) => t === hariIni;
  const tintKini = "bg-brand-gold-tint/70 dark:bg-brand-gold/10";
  // Pemisah antar tanggal: garis lebih tegas di kolom P.
  const batasTgl = (s: Sesi) => (s === "pagi" ? "border-l border-l-neutral-300 dark:border-l-neutral-700" : "");
  const jumlahKolom = (t: string, s: Sesi) => baris.filter((b) => b.sel[t]?.[s]).length;

  return (
    <section className={cn(kartu, "min-w-0 overflow-hidden")}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="cap text-14 font-bold tracking-[0.06em]">{judul}</h2>
        <span className="text-12 text-ink-muted">{baris.length} orang</span>
      </div>
      {baris.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-muted">Belum ada pengurus {judul.toLowerCase()} di logbook.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-12 tabular-nums">
            <thead>
              <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/50">
                <th rowSpan={2} className={cn(labelMikro, "w-8 px-2 py-2 text-center")}>
                  No
                </th>
                <th rowSpan={2} className={cn(labelMikro, "min-w-[120px] px-2 py-2 text-left")}>
                  Nama
                </th>
                {hari.map((t) => (
                  <th
                    key={t}
                    colSpan={3}
                    className={cn(
                      "border-l border-l-neutral-300 px-1 pt-2 pb-0.5 text-center text-11 font-semibold whitespace-nowrap dark:border-l-neutral-700",
                      kini(t) ? cn(tintKini, "text-foreground") : "text-ink-muted",
                    )}
                  >
                    {hariDari(t)} <span className="text-12 text-foreground">{Number(t.slice(8, 10))}</span>
                  </th>
                ))}
                <th rowSpan={2} className={cn(labelMikro, "border-l border-l-neutral-300 px-2 py-2 text-right whitespace-nowrap dark:border-l-neutral-700")}>
                  Pekan
                </th>
                <th rowSpan={2} className={cn(labelMikro, "px-2 py-2 text-right whitespace-nowrap")}>
                  Bulan
                </th>
              </tr>
              <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/50">
                {hari.flatMap((t) =>
                  SESI.map((s) => (
                    <th
                      key={`${t}-${s}`}
                      title={LABEL_SESI[s]}
                      className={cn("px-1 pb-1.5 text-center text-11 font-bold text-ink-muted", batasTgl(s), kini(t) && tintKini)}
                    >
                      {SINGKAT_SESI[s]}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => {
                const bln = totalBulan[b.orangId];
                return (
                  <tr key={b.orangId} className="border-b border-border/60 last:border-b-0">
                    <td className="px-2 py-1 text-center text-ink-muted">{b.no}</td>
                    <td className="max-w-[160px] truncate px-2 py-1 text-12 font-medium sm:text-14" title={b.nama}>
                      {b.nama}
                    </td>
                    {hari.flatMap((t) =>
                      SESI.map((s) => {
                        const sel = b.sel[t]?.[s] ?? null;
                        const nanti = t > hariIni;
                        const manual = sel?.sumber === "manual";
                        const label = `${b.nama}, ${tglPanjang(t)}, ${LABEL_SESI[s]}: ${sel ? sel.jam : "kosong"}`;
                        return (
                          <td key={`${t}-${s}`} className={cn("p-0 text-center", batasTgl(s), kini(t) && tintKini, nanti && "bg-neutral-50/70 dark:bg-neutral-900/40")}>
                            {nanti ? (
                              <span aria-hidden className="block h-8 min-w-[44px]" />
                            ) : (
                              <button
                                type="button"
                                onClick={() => onPilih({ orangId: b.orangId, nama: b.nama, tanggal: t, sesi: s, sel })}
                                aria-label={label}
                                title={sel ? `${LABEL_SUMBER[sel.sumber] ?? sel.sumber}${sel.catatan ? ` · ${sel.catatan}` : ""}` : "Isi jam datang"}
                                className="group relative flex h-8 w-full min-w-[44px] items-center justify-center px-1 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                              >
                                {sel ? (
                                  <span className={cn(manual ? "italic text-neutral-700 dark:text-neutral-300" : "font-semibold")}>{sel.jam}</span>
                                ) : (
                                  <span aria-hidden className="text-ink-faint opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                                    +
                                  </span>
                                )}
                                {manual && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-brand-bronze" />}
                              </button>
                            )}
                          </td>
                        );
                      }),
                    )}
                    <td className="border-l border-l-neutral-300 px-2 py-1 text-right font-semibold dark:border-l-neutral-700">{b.jumlah.total}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <span className="font-semibold">{bln?.sesi ?? 0}</span>
                      <span className="text-11 text-ink-muted" title="Hari dengan 3 tap (Pagi, Siang, Sore)"> · {bln?.lengkap ?? 0} hr lengkap</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-neutral-50 text-11 text-ink-muted dark:bg-neutral-900/50">
                <td />
                <td className="px-2 py-1.5 font-semibold">Jumlah hadir</td>
                {hari.flatMap((t) =>
                  SESI.map((s) => (
                    <td key={`${t}-${s}`} className={cn("py-1.5 text-center", batasTgl(s), kini(t) && tintKini)}>
                      {t > hariIni ? "" : jumlahKolom(t, s)}
                    </td>
                  )),
                )}
                <td className="border-l border-l-neutral-300 px-2 py-1.5 text-right font-semibold dark:border-l-neutral-700">
                  {baris.reduce((n, b) => n + b.jumlah.total, 0)}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">{baris.reduce((n, b) => n + (totalBulan[b.orangId]?.sesi ?? 0), 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
