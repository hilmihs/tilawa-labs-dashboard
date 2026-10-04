/**
 * Surat Penerimaan — "you're in" letter for a new HKM peserta.
 *
 * The body copy is fixed, so its line breaks are transcribed from the Canva
 * reference rather than re-derived by the wrapper. That is deliberate: Canva
 * lays each paragraph out in its own text box and breaks the first line short
 * of the measure, which a uniform-width greedy wrapper cannot reproduce.
 * Transcribing gives an exact match; the wrapper is kept as the fallback for
 * the one line that carries variable text (the start date).
 */
import type { PDFPage } from "pdf-lib";
import { drawCentered, drawLines, drawRun, widthOf, wrap, type Seg } from "../text";
import type { SuratAssets } from "./assets";
import { drawChrome } from "./chrome";
import { PAGE_H, PENERIMAAN as L, SIZE, SUBTITLE_CENTER_X, TITLE_SIZE, TITLE_X } from "./layout";

export type PenerimaanData = {
  nama: string;
  hari: string;
  pukul: string;
  tempat: string;
  pengajar: string;
  halaqah: string;
  /** Already formatted, e.g. "30 Juli 2025". */
  tanggalMulai: string;
  /** Already formatted, e.g. "3 November 2025". */
  tanggalSurat: string;
  signerName: string;
};

/** A transcribed line. `justify` marks the lines Canva stretched to the full
 *  measure — not every line in a paragraph is stretched, so it is per line. */
type Line = { segs: Seg[]; justify?: boolean };

const PARA_A: Line[] = [
  {
    segs: [
      { text: "Alhamdulillahilladzi bi nimatihi tatimmush sholihat, ", style: "i" },
      { text: "Tilawa Labs Tilawah ingin" },
    ],
  },
  { segs: [{ text: "menyampaikan kabar gembira atas terpilih Saudara/i menjadi salah satu peserta pada program" }] },
  { segs: [{ text: "Household Recitation Programme." }] },
];

const PARA_B: Line[] = [
  { segs: [{ text: "Suatu kenikmatan yang besar dari Allah Subhanahu wa Ta’ala atas terpilihnya Saudara/i" }] },
  {
    segs: [{ text: "menjadi peserta HKM agar menjadi wasilah dan tercatat sebagai insan yang senantiasa berusaha" }],
    justify: true,
  },
  {
    segs: [
      { text: "belajar dan mengamalkan Al Quran. Sebagaimana yang tertulis dalam sebuah hadits berikut, " },
      { text: "Utsman", style: "b" },
    ],
    justify: true,
  },
  {
    segs: [
      { text: "bin ’Affan ", style: "b" },
      { text: "radhiyallahu ’anhu ", style: "bi" },
      { text: "berkata bahwa Rasulullah ", style: "b" },
      { text: "shallallahu ’alaihi wa sallam ", style: "bi" },
      { text: "bersabda,", style: "b" },
    ],
    justify: true,
  },
  {
    segs: [
      {
        text: "”Sebaik-baik orang di antara kalian adalah yang belajar Al-Qu’ran dan mengajarkannya.” (HR.",
        style: "b",
      },
    ],
  },
  { segs: [{ text: "Bukhari).", style: "b" }] },
];

function paraC(tanggalMulai: string): Line[] {
  return [
    { segs: [{ text: `Saudara/i insyaAllah akan memulai kegiatan belajar pada tanggal ${tanggalMulai}. Semoga` }] },
    {
      segs: [
        { text: "kesempatan yang Allah berikan ini dapat dimanfaatkan sebaik-baiknya dan menjadi bekal pahala kita" },
      ],
      justify: true,
    },
    { segs: [{ text: "semua di hari akhir kelak. Selamat belajar dan semangat dalam meraih kebaikan." }] },
  ];
}

/**
 * Draws transcribed lines. Canva puts 16.5pt between a paragraph's first and
 * second line and 15pt between the rest; reproducing that quirk is what keeps
 * the baselines lining up with the reference.
 */
function drawFixedLines(page: PDFPage, lines: Line[], assets: SuratAssets, yTop: number): void {
  let y = yTop;
  lines.forEach((line, idx) => {
    drawLines(page, [line.segs], assets.fonts, {
      x: L.x,
      yTop: y,
      size: SIZE,
      leading: 0,
      width: L.width,
      align: line.justify ? "justify" : "left",
      justifyLast: line.justify,
      pageHeight: PAGE_H,
    });
    y += idx === 0 ? L.firstLeading : L.leading;
  });
}

/** Re-wraps a transcribed paragraph if substituted text overflowed a line. */
function fitLines(lines: Line[], assets: SuratAssets): Line[] {
  const overflows = lines.some((line) => widthOf(line.segs, assets.fonts, SIZE) > L.width);
  if (!overflows) return lines;
  return wrap(
    lines.flatMap((line) => line.segs),
    assets.fonts,
    SIZE,
    L.width,
  ).map((segs) => ({ segs }));
}

export function renderPenerimaanPage(page: PDFPage, assets: SuratAssets, data: PenerimaanData): void {
  const { fonts } = assets;
  const centerX = SUBTITLE_CENTER_X;

  drawChrome(page, assets, { tanggalSurat: data.tanggalSurat, signerName: data.signerName });

  drawRun(page, [{ text: "SURAT PENERIMAAN", style: "b" }], fonts, {
    x: TITLE_X,
    yTop: L.titleY,
    size: TITLE_SIZE,
    pageHeight: PAGE_H,
  });
  drawCentered(page, [{ text: "TENTANG" }], fonts, {
    centerX,
    yTop: L.tentangY,
    size: TITLE_SIZE,
    pageHeight: PAGE_H,
  });
  drawCentered(page, [{ text: "Household Recitation participant", style: "b" }], fonts, {
    centerX,
    yTop: L.perihalY,
    size: TITLE_SIZE,
    pageHeight: PAGE_H,
  });

  drawRun(page, [{ text: "Assalamu’alaikum warahmatullahi wabarakatuh", style: "i" }], fonts, {
    x: L.x,
    yTop: L.salamY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
  drawRun(page, [{ text: "Saudara/i " }, { text: data.nama, style: "bi" }], fonts, {
    x: L.x,
    yTop: L.saudaraY,
    size: SIZE,
    pageHeight: PAGE_H,
  });

  drawFixedLines(page, PARA_A, assets, L.paraAY);

  drawRun(page, [{ text: "Saudara/i insyaAllah akan bergabung pada halaqah berikut :" }], fonts, {
    x: L.x,
    yTop: L.pengantarY,
    size: SIZE,
    pageHeight: PAGE_H,
  });

  const fields: [string, string][] = [
    ["Hari", data.hari],
    ["Pukul", data.pukul],
    ["Tempat", data.tempat],
    ["Nama Pengajar", data.pengajar],
    ["Halaqah", data.halaqah],
  ];
  fields.forEach(([label, value], idx) => {
    const yTop = L.fieldY + idx * L.fieldLeading;
    drawRun(page, [{ text: label }], fonts, { x: L.x, yTop, size: SIZE, pageHeight: PAGE_H });
    drawRun(page, [{ text: ":" }], fonts, { x: L.fieldColonX, yTop, size: SIZE, pageHeight: PAGE_H });
    drawRun(page, [{ text: value }], fonts, { x: L.fieldValueX, yTop, size: SIZE, pageHeight: PAGE_H });
  });

  drawFixedLines(page, PARA_B, assets, L.paraBY);
  drawFixedLines(page, fitLines(paraC(data.tanggalMulai), assets), assets, L.paraCY);
}
