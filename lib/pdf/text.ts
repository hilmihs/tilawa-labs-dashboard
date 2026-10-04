/**
 * Small rich-text layer for pdf-lib: word-wrap and draw runs that switch
 * between regular/bold/italic/bold-italic mid-sentence.
 *
 * This is a generalised version of the `paragraph()` closure inside
 * `surat-peringatan.ts`, with two deliberate differences:
 *   - it is a pure function of an explicit box (no closure over a mutating `y`),
 *     so a caller can lay a paragraph out, measure it, and only then decide
 *     where to draw it; and
 *   - coordinates are given as `yTop` (distance from the top of the page),
 *     because that is how the reference letters were measured.
 *
 * The legacy mabni letter keeps its own copy — its justification quirks are
 * load-bearing and it is the one generator running in production today.
 */
import { rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type Style = "r" | "b" | "i" | "bi";
export type FontSet = { r: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont };
/** `size` is honoured by the single-line helpers only; wrapped paragraphs are
 *  uniform-size by construction. */
export type Seg = { text: string; style?: Style; size?: number };

const BLACK = rgb(0, 0, 0);

/** A token that is only trailing punctuation is glued to the previous word so
 *  justification can't insert a space before the "," after a bold run. */
const TRAILING_PUNCT = /^[,.;:!?)”]+$/;

type Word = { w: string; s: Style };

function fontOf(fonts: FontSet, style: Style | undefined): PDFFont {
  return fonts[style ?? "r"];
}

function toWords(segs: Seg[]): Word[] {
  const words: Word[] = [];
  for (const seg of segs) {
    const s = seg.style ?? "r";
    for (const w of seg.text.split(/\s+/).filter(Boolean)) {
      const prev = words[words.length - 1];
      if (prev && TRAILING_PUNCT.test(w)) prev.w += w;
      else words.push({ w, s });
    }
  }
  return words;
}

function wordsWidth(words: Word[], fonts: FontSet, size: number): number {
  const spaceW = fonts.r.widthOfTextAtSize(" ", size);
  const inkW = words.reduce((sum, it) => sum + fontOf(fonts, it.s).widthOfTextAtSize(it.w, size), 0);
  return inkW + spaceW * Math.max(0, words.length - 1);
}

/** Width of a single-line run exactly as `drawRun` lays it out. */
export function widthOf(segs: Seg[], fonts: FontSet, size: number): number {
  let w = 0;
  for (const seg of segs) {
    const s = seg.size ?? size;
    w += fontOf(fonts, seg.style).widthOfTextAtSize(seg.text.trim(), s);
    if (/\s$/.test(seg.text)) w += fonts.r.widthOfTextAtSize(" ", s);
  }
  return w;
}

/** Greedy word-wrap honouring per-word style runs. One `Seg` per word. */
export function wrap(segs: Seg[], fonts: FontSet, size: number, maxWidth: number): Seg[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  for (const word of toWords(segs)) {
    const trial = [...line, word];
    if (line.length > 0 && wordsWidth(trial, fonts, size) > maxWidth) {
      lines.push(line);
      line = [word];
    } else {
      line = trial;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.map((ln) => ln.map((it) => ({ text: it.w, style: it.s })));
}

export type DrawLinesOpts = {
  x: number;
  yTop: number;
  size: number;
  leading: number;
  /** Wrap/justify width. Required for `align: "justify"`. */
  width: number;
  align?: "left" | "justify";
  /** Justify the final line too. Needed when a paragraph is drawn in pieces
   *  (e.g. an indented first line) and this batch is not the real last line. */
  justifyLast?: boolean;
  pageHeight: number;
};

/**
 * Draws already-wrapped lines. Returns the `yTop` of the line *after* the last
 * one drawn, so callers can keep flowing.
 *
 * `justify` never stretches the final line — a justified last line is the
 * classic giveaway that a letter was machine-made.
 */
export function drawLines(page: PDFPage, lines: Seg[][], fonts: FontSet, opts: DrawLinesOpts): number {
  const { x, size, leading, width, pageHeight } = opts;
  const align = opts.align ?? "left";
  const spaceW = fonts.r.widthOfTextAtSize(" ", size);
  let yTop = opts.yTop;

  lines.forEach((rawLine, idx) => {
    // Normalise to one segment per word: a caller may hand us a whole
    // transcribed line as a single segment, and justification needs the gaps.
    const line: Seg[] = toWords(rawLine).map((it) => ({ text: it.w, style: it.s }));
    const isLast = idx === lines.length - 1 && !opts.justifyLast;
    const gaps = line.length - 1;
    const inkW = line.reduce((s, seg) => s + fontOf(fonts, seg.style).widthOfTextAtSize(seg.text, size), 0);
    const extra =
      align === "justify" && !isLast && gaps > 0 ? (width - inkW - spaceW * gaps) / gaps : 0;

    let cursor = x;
    for (const seg of line) {
      const font = fontOf(fonts, seg.style);
      page.drawText(seg.text, { x: cursor, y: pageHeight - yTop, size, font, color: BLACK });
      cursor += font.widthOfTextAtSize(seg.text, size) + spaceW + extra;
    }
    yTop += leading;
  });

  return yTop;
}

/** Wrap + draw in one call. Returns the `yTop` after the last line. */
export function drawParagraph(page: PDFPage, segs: Seg[], fonts: FontSet, opts: DrawLinesOpts): number {
  return drawLines(page, wrap(segs, fonts, opts.size, opts.width), fonts, opts);
}

/** One line, no wrapping — for labelled rows and headings. */
export function drawRun(
  page: PDFPage,
  segs: Seg[],
  fonts: FontSet,
  opts: { x: number; yTop: number; size: number; pageHeight: number },
): void {
  const { x, yTop, size, pageHeight } = opts;
  let cursor = x;
  // Draw segment-by-segment (not word-by-word) so intentional leading/trailing
  // spaces inside a segment survive — "Saudara/i " + bold name must not collapse.
  for (const seg of segs) {
    const s = seg.size ?? size;
    const font = fontOf(fonts, seg.style);
    const text = seg.text.trim();
    page.drawText(text, { x: cursor, y: pageHeight - yTop, size: s, font, color: BLACK });
    cursor += font.widthOfTextAtSize(text, s);
    if (/\s$/.test(seg.text)) cursor += fonts.r.widthOfTextAtSize(" ", s);
  }
}

export function drawCentered(
  page: PDFPage,
  segs: Seg[],
  fonts: FontSet,
  opts: { centerX: number; yTop: number; size: number; pageHeight: number },
): void {
  const w = widthOf(segs, fonts, opts.size);
  drawRun(page, segs, fonts, { ...opts, x: opts.centerX - w / 2 });
}

export function drawRightAligned(
  page: PDFPage,
  segs: Seg[],
  fonts: FontSet,
  opts: { rightX: number; yTop: number; size: number; pageHeight: number },
): void {
  const w = widthOf(segs, fonts, opts.size);
  drawRun(page, segs, fonts, { ...opts, x: opts.rightX - w });
}
