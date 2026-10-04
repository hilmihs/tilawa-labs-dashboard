/**
 * The parts every HKM letter shares: the green header band with the
 * Tilawa Labs mark, the signature block, and the "1 dari 1" footer.
 */
import type { PDFPage } from "pdf-lib";
import { drawRightAligned, drawRun } from "../text";
import type { SuratAssets } from "./assets";
import { BAND_COLOR, BAND_H, FOOTER, LOGO, PAGE_H, PAGE_W, SIGN, SIZE } from "./layout";

export type ChromeData = {
  /** Already formatted, e.g. "3 November 2025". */
  tanggalSurat: string;
  signerName: string;
};

export function drawChrome(page: PDFPage, assets: SuratAssets, data: ChromeData): void {
  const { fonts, logo, signature } = assets;

  // Header band. The reference ships this as a 2522x388 image, but it is a flat
  // fill — a rectangle matches it exactly and skips the alpha-mask compositing.
  page.drawRectangle({
    x: 0,
    y: PAGE_H - BAND_H,
    width: PAGE_W,
    height: BAND_H,
    color: BAND_COLOR,
  });

  if (logo) {
    page.drawImage(logo, {
      x: LOGO.x,
      y: PAGE_H - LOGO.yTop - LOGO.h,
      width: LOGO.w,
      height: LOGO.h,
    });
  }

  drawRun(page, [{ text: `Jakarta, ${data.tanggalSurat}` }], fonts, {
    x: SIGN.colX,
    yTop: SIGN.tanggalY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
  drawRun(page, [{ text: "Penanggungjawab", style: "b" }], fonts, {
    x: SIGN.colX,
    yTop: SIGN.penanggungjawabY,
    size: SIZE,
    pageHeight: PAGE_H,
  });
  drawRun(page, [{ text: "Tilawa Labs Tilawah", style: "b" }], fonts, {
    x: SIGN.colX,
    yTop: SIGN.lembagaY,
    size: SIZE,
    pageHeight: PAGE_H,
  });

  // Height-fit and centre, so a re-scanned signature with a different aspect
  // still lands in the same band instead of overrunning the name below it.
  const sigW = SIGN.img.h * (signature.width / signature.height);
  page.drawImage(signature, {
    x: SIGN.img.centerX - sigW / 2,
    y: PAGE_H - SIGN.img.yTop - SIGN.img.h,
    width: sigW,
    height: SIGN.img.h,
  });

  drawRun(page, [{ text: data.signerName, style: "b" }], fonts, {
    x: SIGN.colX,
    yTop: SIGN.namaY,
    size: SIZE,
    pageHeight: PAGE_H,
  });

  // "1 dari 1" — every letter is its own single page, even inside a batch.
  drawRightAligned(
    page,
    [
      { text: "1 ", style: "b", size: FOOTER.size },
      { text: "dari ", size: SIZE },
      { text: "1", style: "b", size: FOOTER.size },
    ],
    fonts,
    { rightX: FOOTER.rightX, yTop: FOOTER.yTop, size: SIZE, pageHeight: PAGE_H },
  );
}
