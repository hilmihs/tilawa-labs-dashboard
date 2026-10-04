/**
 * Kartu Kehadiran (design "Kartu Kehadiran" 1a depan / 1e belakang): CR80
 * potret 54 × 85,6 mm. Semua ukuran ditulis dalam unit desain `--u` (1 px di
 * mockup 324 × 514): di layar --u = 1px, di kertas --u = 54mm/324, jadi kartu
 * cetak berukuran fisik persis tanpa menulis dua set angka.
 *
 * Presentasional murni (tanpa hook) — datanya dari lib/kerja/kartu-data.ts.
 */
import type { CSSProperties } from "react";
import type { StaticImageData } from "next/image";
// Impor statis, bukan string "/brand/…": berkasnya ikut /_next/static, jadi
// tetap muncul walau public/ tidak ikut ke build standalone dashboard.edu.
import lockupPendidikanForest from "@/public/brand/lockup-pendidikan-forest.png";
import lockupPendidikanGold from "@/public/brand/lockup-pendidikan-gold.png";
import lockupTilawahForest from "@/public/brand/lockup-tilawah-forest.png";
import lockupTilawahGold from "@/public/brand/lockup-tilawah-gold.png";
import markForest from "@/public/brand/mark-forest.png";
import markGold from "@/public/brand/mark-gold.png";
import type { DataKartu } from "@/lib/kerja/kartu-data";
import { fmtKode, fmtUid, kodeDuaBaris, LABEL_PERAN_KARTU, PALET, type Nada, type Rumpun } from "@/lib/kerja/kartu-view";

const LOCKUP: Record<Rumpun, Record<Nada, StaticImageData>> = {
  pendidikan: { gold: lockupPendidikanGold, forest: lockupPendidikanForest },
  tilawah: { gold: lockupTilawahGold, forest: lockupTilawahForest },
};
const MARK: Record<Nada, StaticImageData> = { gold: markGold, forest: markForest };
const ALT_LOCKUP: Record<Rumpun, string> = { pendidikan: "Tilawa Labs", tilawah: "Tilawa Labs" };

/** Warna peran sebagai variabel CSS pada elemen kartu. */
function gayaPeran(k: DataKartu): CSSProperties {
  const p = PALET[k.peran];
  return {
    "--kk-bg": p.bg,
    "--kk-ink": p.ink,
    "--kk-muted": p.muted,
    "--kk-line": p.line,
    "--kk-pill-bg": p.pillBg,
    "--kk-pill-ink": p.pillInk,
  } as CSSProperties;
}

/* eslint-disable @next/next/no-img-element -- <img> biasa, bukan next/image: next/image
   memuat malas, dan kartu di luar layar belum termuat saat dialog cetak dibuka. */

export function KartuDepan({ k }: { k: DataKartu }) {
  const p = PALET[k.peran];
  return (
    <div className="kk-kartu" style={gayaPeran(k)} aria-label={`Kartu ${k.nama}, sisi depan`}>
      {/* Bayang-bayang gunung: kecil dan samar, di belakang teks; ubin QR tetap putih di atasnya. */}
      <img src={MARK[p.mark].src} alt="" aria-hidden className="kk-tanda kk-tanda-depan" style={{ opacity: p.markDepan }} />
      <div className="kk-atas">
        <img src={LOCKUP[k.rumpun][p.logo].src} alt={ALT_LOCKUP[k.rumpun]} className="kk-logo" />
        <span className="kk-pil">{LABEL_PERAN_KARTU[k.peran]}</span>
      </div>
      <div className="kk-qr" dangerouslySetInnerHTML={{ __html: k.qrSvg }} />
      <div className="kk-bawah">
        <p className="kk-nama">{k.nama}</p>
        {k.program && (
          <p className="kk-prog">
            <b>{k.program}</b>
            {k.halaqah && <span className="kk-muted"> · {k.halaqah}</span>}
          </p>
        )}
        <div className="kk-garis" />
        <p className="kk-kode">{fmtKode(k.kodeQr)}</p>
      </div>
    </div>
  );
}

export function KartuBelakang({ k }: { k: DataKartu }) {
  const p = PALET[k.peran];
  const [a, b] = kodeDuaBaris(k.kodeQr);
  return (
    <div className="kk-kartu" style={gayaPeran(k)} aria-label={`Kartu ${k.nama}, sisi belakang`}>
      <img src={MARK[p.mark].src} alt="" aria-hidden className="kk-tanda kk-tanda-belakang" style={{ opacity: p.markBelakang }} />
      <div className="kk-bawah">
        <p className="kk-label">Kode kehadiran</p>
        <p className="kk-kode-besar">
          {a}
          <br />
          {b}
        </p>
        {/* Tanpa chip: baris NFC tidak dicetak — "NFC —" akan salah begitu chip dipasang belakangan. */}
        {k.uid && (
          <>
            <div className="kk-garis" />
            <div className="kk-nfc">
              <span className="kk-label">NFC</span>
              <span className="kk-uid">{fmtUid(k.uid)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* eslint-enable @next/next/no-img-element */

/**
 * CSS kartu + lembar. `pvc` = satu kartu per halaman 54 × 85,6 mm untuk printer
 * kartu PVC (tanpa sudut membulat: kartunya sudah terpotong, warna dibuat
 * sampai tepi); selain itu A4 3 × 3 dengan garis potong opsional.
 */
export function gayaKartu(mode: "a4" | "pvc"): string {
  const u = (n: number) => `calc(${n} * var(--u))`;
  return `
.kk-lembar { --u: 1px; }
.kk-kartu {
  position: relative; overflow: hidden; box-sizing: border-box;
  width: ${u(324)}; height: ${u(513.6)};
  border-radius: ${u(19)}; padding: ${u(20)};
  display: flex; flex-direction: column;
  background: var(--kk-bg); color: var(--kk-ink);
  font-family: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.kk-kartu p { margin: 0; }
.kk-tanda { position: absolute; z-index: 0; pointer-events: none; max-width: none; height: auto; }
.kk-tanda-belakang { width: ${u(420)}; left: ${u(-40)}; top: ${u(-30)}; }
.kk-tanda-depan { width: ${u(230)}; right: ${u(-52)}; bottom: ${u(-30)}; }
.kk-atas { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: ${u(12)}; }
.kk-logo { display: block; height: ${u(46)}; width: auto; }
.kk-pil {
  font-size: ${u(11)}; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; line-height: 1.2;
  padding: ${u(5)} ${u(10)} ${u(4)}; border-radius: 999px;
  background: var(--kk-pill-bg); color: var(--kk-pill-ink);
}
.kk-qr {
  position: relative; z-index: 1; align-self: center; margin-top: ${u(22)};
  background: #fff; border-radius: ${u(14)}; padding: ${u(12)}; line-height: 0;
}
.kk-qr svg { display: block; width: ${u(176)}; height: ${u(176)}; }
.kk-bawah { position: relative; z-index: 1; margin-top: auto; }
.kk-nama { font-size: ${u(21)}; font-weight: 800; line-height: 1.15; text-wrap: balance; }
.kk-prog { margin-top: ${u(6)} !important; font-size: ${u(12.5)}; line-height: 1.35; }
.kk-prog b { font-weight: 700; }
.kk-muted { color: var(--kk-muted); }
.kk-garis { height: max(1px, ${u(1)}); background: var(--kk-line); margin: ${u(12)} 0 ${u(10)}; }
.kk-kode, .kk-kode-besar, .kk-uid { font-family: var(--font-geist-mono), ui-monospace, monospace; font-weight: 600; }
.kk-kode { font-size: ${u(13)}; letter-spacing: .06em; }
.kk-label { font-size: ${u(11)}; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--kk-muted); }
.kk-kode-besar { margin-top: ${u(8)} !important; font-size: ${u(30)}; letter-spacing: .08em; line-height: 1.15; }
.kk-nfc { display: flex; align-items: baseline; justify-content: space-between; gap: ${u(12)}; }
.kk-uid { font-size: ${u(12.5)}; font-weight: 500; letter-spacing: .02em; }

.kk-daftar { display: flex; flex-wrap: wrap; gap: 28px; }
.kk-pasang { display: flex; flex-wrap: wrap; gap: 12px; }
@media screen and (max-width: 359px) { .kk-lembar { --u: calc((100vw - 32px) / 324); } }
.kk-slot { line-height: 0; }
.kk-lembar[data-sisi="depan"] .kk-sisi-belakang,
.kk-lembar[data-sisi="belakang"] .kk-sisi-depan { display: none; }
.kk-lembar[data-garis="1"] .kk-slot { outline: 1px dashed #9ca3af; outline-offset: 0; }

${
  mode === "pvc"
    ? `@page { size: 54mm 85.6mm; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .kk-lembar { --u: calc(54mm / 324); padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .kk-toolbar { display: none !important; }
  .kk-daftar { display: block; }
  .kk-pasang { display: contents; }
  .kk-slot { break-after: page; outline: none !important; }
  .kk-kartu { width: 54mm; height: 85.6mm; border-radius: 0; }
}`
    : `@page { size: A4; margin: 8mm; }
@media print {
  html, body { background: #fff !important; }
  .kk-lembar { --u: calc(54mm / 324); padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .kk-toolbar { display: none !important; }
  .kk-daftar { display: grid; grid-template-columns: repeat(3, 54mm); gap: 4mm; justify-content: center; }
  /* Dua sisi: satu orang per baris (depan | belakang) supaya pasangan tidak terbelah. */
  .kk-lembar[data-sisi="keduanya"] .kk-daftar { grid-template-columns: repeat(2, 54mm); }
  /* Belakang saja untuk cetak bolak-balik: kolom dicerminkan supaya tiap belakang
     jatuh tepat di balik depannya saat kertas dibalik pada sisi panjang. */
  .kk-lembar[data-sisi="belakang"] .kk-daftar { direction: rtl; }
  .kk-lembar[data-sisi="belakang"] .kk-kartu { direction: ltr; }
  .kk-pasang { display: contents; }
  .kk-slot { break-inside: avoid; }
  .kk-lembar[data-garis="1"] .kk-slot { outline: 0.2mm dashed #9ca3af; }
}`
}`;
}
