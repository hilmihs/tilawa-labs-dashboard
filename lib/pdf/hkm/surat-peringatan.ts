/**
 * Surat Peringatan 1/2/3 — escalating warning letter for an HKM peserta.
 *
 * The ordinal word ("Pertama"/"Kedua"/"Ketiga") is derived here from `level`
 * and exists nowhere else — not in the form, not in the DB. The Canva
 * reference has a page whose title says "SURAT PERINGATAN 2" while its body
 * says "Pertama"; deriving it makes that class of mistake unrepresentable.
 *
 * Layout note: the closing salam and the signature block sit at fixed
 * baselines. The body between "Dengan hormat," and the salam flows, so a long
 * pelanggaran list eats into the gap. `renderPeringatanPage` tightens the
 * paragraph gaps once and then refuses rather than overprinting the salam.
 */
import type { PDFPage } from "pdf-lib";
import { drawLines, drawRun, wrap, type Seg } from "../text";
import type { SuratAssets } from "./assets";
import { drawChrome } from "./chrome";
import { PAGE_H, PERINGATAN as L, SIZE, TITLE_SIZE, TITLE_X } from "./layout";

export type PeringatanLevel = 1 | 2 | 3;

export type PeringatanData = {
  nama: string;
  /** e.g. "HKM 12 - Ikhwan". */
  kelas: string;
  level: PeringatanLevel;
  /** One line per bullet, e.g. "Empat kali (4×) alpa.". */
  pelanggaran: string[];
  /** Already formatted, e.g. "26 Agustus 2025". */
  tanggalSurat: string;
  signerName: string;
};

const ORDINAL: Record<PeringatanLevel, string> = { 1: "Pertama", 2: "Kedua", 3: "Ketiga" };

/** Canva's leading space on the first line of some paragraphs, in points. */
const INDENT = 3.2;

const PARA_PEMBUKA: Seg[][] = [
  [{ text: "Berdasarkan catatan kehadiran dan ketertiban peserta dalam Household Recitation Programme, kami" }],
  [{ text: "mencatat bahwa Saudara/i telah:" }],
];

function paraSanksi(level: PeringatanLevel): Seg[][] {
  return [
    [{ text: "Sesuai dengan Tata Tertib HKM poin 12 tentang Pemberian Surat Peringatan, maka dengan ini kami" }],
    [
      { text: "memberikan " },
      { text: `Surat Peringatan ${ORDINAL[level]}`, style: "b" },
      { text: " kepada Saudara/i." },
    ],
  ];
}

const PARA_HARAPAN: Seg[][] = [
  [{ text: "Diharapkan Saudara/i dapat memperbaiki kedisiplinan kehadiran serta mengikuti halaqah dengan lebih" }],
  [{ text: "sungguh-sungguh." }],
];

const PARA_ESKALASI: Seg[][] = [
  [{ text: "Apabila pelanggaran serupa terulang kembali, maka surat peringatan selanjutnya akan dikeluarkan," }],
  [{ text: "dan jika mencapai tiga kali peringatan, maka panitia berhak mengambil tindakan lebih lanjut sesuai" }],
  [{ text: "ketentuan yang berlaku." }],
];

const PARA_PENUTUP: Seg[][] = [
  [{ text: "Demikian surat ini kami sampaikan. Semoga menjadi perhatian." }],
];

type Block = { lines: Seg[][]; indent?: boolean; bullets?: boolean };

function blockHeight(block: Block): number {
  return block.lines.length * L.leading;
}

export function renderPeringatanPage(page: PDFPage, assets: SuratAssets, data: PeringatanData): void {
  const { fonts } = assets;

  drawChrome(page, assets, { tanggalSurat: data.tanggalSurat, signerName: data.signerName });

  drawRun(page, [{ text: `SURAT PERINGATAN ${data.level}`, style: "b" }], fonts, {
    x: TITLE_X,
    yTop: L.titleY,
    size: TITLE_SIZE,
    pageHeight: PAGE_H,
  });

  drawRun(page, [{ text: "Kepada Yth," }], fonts, {
    x: L.x,
    yTop: L.kepadaY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
  drawRun(page, [{ text: "Nama Peserta: " }, { text: data.nama, style: "bi" }], fonts, {
    x: L.x,
    yTop: L.namaY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
  drawRun(page, [{ text: `Kelas: ${data.kelas}` }], fonts, {
    x: L.x,
    yTop: L.kelasY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
  drawRun(page, [{ text: "Assalamu’alaikum warahmatullahi wabarakatuh", style: "i" }], fonts, {
    x: L.x,
    yTop: L.salamY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
  drawRun(page, [{ text: "Dengan hormat," }], fonts, {
    x: L.x,
    yTop: L.hormatY,
    size: SIZE,
    pageHeight: PAGE_H,
  });

  // Bullets are the only variable-length part; wrap them at the bullet indent.
  const bulletWidth = L.width - (L.bulletTextX - L.x);
  const bulletLines = data.pelanggaran
    .map((t) => t.trim())
    .filter(Boolean)
    .flatMap((t) => wrap([{ text: t }], fonts, SIZE, bulletWidth));

  const blocks: Block[] = [
    { lines: PARA_PEMBUKA, indent: true },
    { lines: bulletLines, bullets: true },
    { lines: paraSanksi(data.level) },
    { lines: PARA_HARAPAN },
    { lines: PARA_ESKALASI, indent: true },
    { lines: PARA_PENUTUP },
  ];

  // In the reference the bullets hang directly off "…Saudara/i telah:" and
  // "Diharapkan…" follows "…kepada Saudara/i." with no blank line; every other
  // join gets one. `extra` is on top of the normal leading.
  const TIGHT_JOINS = new Set([1, 3]);

  const flow = (extraGap: number) => {
    let y = L.bodyY;
    const placed: { block: Block; yTop: number }[] = [];
    blocks.forEach((block, idx) => {
      if (idx > 0 && !TIGHT_JOINS.has(idx)) y += extraGap;
      placed.push({ block, yTop: y });
      y += blockHeight(block);
    });
    // `y` is now one leading past the last baseline drawn.
    return { placed, endY: y - L.leading };
  };

  let laid = flow(L.paraGap - L.leading);
  if (laid.endY > L.bodyLimitY) laid = flow(0);
  if (laid.endY > L.bodyLimitY) {
    throw new Error(
      `Surat peringatan untuk ${data.nama} tidak muat dalam satu halaman — ` +
        `persingkat butir pelanggaran (${data.pelanggaran.length} butir).`,
    );
  }

  for (const { block, yTop } of laid.placed) {
    if (block.bullets) {
      block.lines.forEach((line, idx) => {
        const y = yTop + idx * L.leading;
        drawRun(page, [{ text: "•" }], fonts, {
          x: L.bulletDotX,
          yTop: y,
          size: SIZE,
          pageHeight: PAGE_H,
        });
        drawLines(page, [line], fonts, {
          x: L.bulletTextX,
          yTop: y,
          size: SIZE,
          leading: 0,
          width: bulletWidth,
          align: "left",
          pageHeight: PAGE_H,
        });
      });
      continue;
    }

    const indent = block.indent ? INDENT : 0;
    if (indent > 0 && block.lines.length > 0) {
      // The indented first line is still justified, just to a shorter measure.
      drawLines(page, [block.lines[0]], fonts, {
        x: L.x + indent,
        yTop,
        size: SIZE,
        leading: L.leading,
        width: L.width - indent,
        align: block.lines.length > 1 ? "justify" : "left",
        justifyLast: block.lines.length > 1,
        pageHeight: PAGE_H,
      });
      drawLines(page, block.lines.slice(1), fonts, {
        x: L.x,
        yTop: yTop + L.leading,
        size: SIZE,
        leading: L.leading,
        width: L.width,
        align: "justify",
        pageHeight: PAGE_H,
      });
      continue;
    }

    drawLines(page, block.lines, fonts, {
      x: L.x,
      yTop,
      size: SIZE,
      leading: L.leading,
      width: L.width,
      align: "justify",
      pageHeight: PAGE_H,
    });
  }

  drawRun(page, [{ text: "Wassalamu’alaikum warahmatullahi wabarakatuh", style: "i" }], fonts, {
    x: L.x,
    yTop: L.wassalamY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
}
