/**
 * Geometry of the HKM letters, measured off the Canva reference
 * (`2024_HKM_Farah Febriani.pdf.pdf`) with `pdftotext -bbox-layout` and a
 * 600 dpi render.
 *
 * Every `y` here is a BASELINE MEASURED FROM THE TOP OF THE PAGE. pdf-lib
 * counts from the bottom, so the draw helpers convert with `PAGE_H - yTop`.
 * Keeping the constants top-relative is what makes them checkable against
 * `pdftotext -bbox-layout` output without arithmetic.
 */
import { rgb } from "pdf-lib";

export const PAGE_W = 595.5;
export const PAGE_H = 842.25;

/** Body type. The reference really is 11.04/14.04 pt — Canva's own rounding. */
export const SIZE = 11.04;
export const TITLE_SIZE = 14.04;

/**
 * The letter titles are LEFT-anchored here, not centred: "SURAT PENERIMAAN"
 * and the wider "SURAT PERINGATAN 2" both start at exactly this x in the
 * reference. The two sub-headings below the penerimaan title are genuinely
 * centred, but on 299.79 rather than the page centre.
 */
export const TITLE_X = 236.42;
export const SUBTITLE_CENTER_X = 299.79;

/** Dark green header band. Sampled from the reference: #304C44. */
export const BAND_H = 84.0;
export const BAND_COLOR = rgb(48 / 255, 76 / 255, 68 / 255);

/** Tilawa Labs mark, cropped to its ink and placed back where it sat. */
export const LOGO = { x: 45.6, yTop: 15.24, w: 65.64, h: 61.8 };

/**
 * Signature block, shared by both letter types.
 *
 * `img` is the INK box, not the image box. The reference embeds a signature
 * scan with wide white margins, so matching its placement rectangle would draw
 * our tightly-cropped scan about 2.5x too large and straight through the name
 * below it. These numbers are the reference's actual ink: 44.64pt tall,
 * centred on x=444.96.
 */
export const SIGN = {
  colX: 396.22,
  tanggalY: 621.7,
  penanggungjawabY: 648.0,
  lembagaY: 663.7,
  namaY: 732.2,
  img: { centerX: 444.96, yTop: 671.28, h: 44.64 },
};

export const FOOTER = { yTop: 789.2, rightX: 523.9, size: 12.0 };

/** Surat penerimaan: narrower measure, ragged right. */
export const PENERIMAAN = {
  x: 72.05,
  width: 452.58,
  titleY: 136.1,
  tentangY: 172.9,
  perihalY: 193.9,
  salamY: 238.5,
  saudaraY: 253.5,
  paraAY: 284.7,
  pengantarY: 347.0,
  /** Label / colon / value columns of the Hari–Halaqah block. */
  fieldY: 362.5,
  fieldLeading: 15.0,
  fieldColonX: 180.09,
  fieldValueX: 185.54,
  paraBY: 454.6,
  paraCY: 562.8,
  /** First line of a Canva paragraph sits 1.5pt lower than the rest. */
  firstLeading: 16.5,
  leading: 15.0,
};

/** Surat peringatan: wider measure, justified. */
export const PERINGATAN = {
  x: 72.03,
  width: 463.14,
  titleY: 136.1,
  kepadaY: 149.7,
  namaY: 161.7,
  kelasY: 173.7,
  headerLeading: 12.0,
  salamY: 203.4,
  hormatY: 248.7,
  bodyY: 265.2,
  bulletY: 298.2,
  bulletTextX: 90.8,
  bulletDotX: 82.6,
  leading: 16.5,
  /** Gap between paragraphs, in the reference exactly two leadings. */
  paraGap: 33.0,
  /** Closing salam is an absolute anchor — see the note in the module docs. */
  wassalamY: 542.4,
  /** Body must not flow past this or it collides with the closing salam. */
  bodyLimitY: 530.0,
};
