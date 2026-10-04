/**
 * One entry point for every HKM letter. N recipients produce ONE PDF with one
 * A4 page per recipient — N=1 simply yields a one-page file, so there is a
 * single code path for "generate for this peserta" and "generate for the whole
 * halaqah".
 */
import { PDFDocument } from "pdf-lib";
import { loadSuratAssets } from "./assets";
import { PAGE_H, PAGE_W } from "./layout";
import { renderPenerimaanPage, type PenerimaanData } from "./surat-penerimaan";
import { renderPeringatanPage, type PeringatanData } from "./surat-peringatan";

export type { PenerimaanData } from "./surat-penerimaan";
export type { PeringatanData, PeringatanLevel } from "./surat-peringatan";

export type HkmLetterDoc =
  | ({ type: "penerimaan" } & PenerimaanData)
  | ({ type: "peringatan" } & PeringatanData);

export async function generateHkmLettersPdf(docs: HkmLetterDoc[]): Promise<Uint8Array> {
  if (docs.length === 0) throw new Error("Tidak ada penerima surat.");

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(docs[0].type === "penerimaan" ? "Surat Penerimaan HKM" : "Surat Peringatan HKM");
  pdfDoc.setAuthor("Tilawa Labs Tilawah");
  pdfDoc.setCreator("Dashboard Medu");
  pdfDoc.setProducer("Dashboard Medu");

  // Fonts and images are embedded once and shared by every page.
  const assets = await loadSuratAssets(pdfDoc);

  for (const doc of docs) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    if (doc.type === "penerimaan") renderPenerimaanPage(page, assets, doc);
    else renderPeringatanPage(page, assets, doc);
  }

  return pdfDoc.save();
}
