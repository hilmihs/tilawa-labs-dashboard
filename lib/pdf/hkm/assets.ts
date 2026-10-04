/**
 * Fonts and images for the HKM letters.
 *
 * The reference letters were made in Canva with Calibri. Carlito is metric-
 * compatible with Calibri, so embedding it keeps every line breaking where the
 * original broke it — that is the whole fidelity argument. Swapping in any
 * other font silently shifts every wrap point.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont, PDFImage } from "pdf-lib";
import type { FontSet } from "../text";

/**
 * Deliberately NOT under public/: these are read off disk by the generator, so
 * being web-servable buys nothing and would put the signer's scanned signature
 * at a guessable, unauthenticated URL. Keep new letter assets here too.
 */
const ASSET_DIR = () => join(process.cwd(), "assets", "surat");

const FONT_FILES: Record<keyof FontSet, string> = {
  r: "Carlito-Regular.ttf",
  b: "Carlito-Bold.ttf",
  i: "Carlito-Italic.ttf",
  bi: "Carlito-BoldItalic.ttf",
};

// Raw bytes are cached for the life of the process; the *embedded* objects are
// per-PDFDocument and must never be cached (pdf-lib ties them to their doc).
const byteCache = new Map<string, Uint8Array>();

async function assetBytes(name: string): Promise<Uint8Array> {
  const cached = byteCache.get(name);
  if (cached) return cached;
  const bytes = new Uint8Array(await readFile(join(ASSET_DIR(), name)));
  byteCache.set(name, bytes);
  return bytes;
}

export type SuratAssets = {
  fonts: FontSet;
  /** Tilawa Labs mark for the green header band. Null if the file is missing. */
  logo: PDFImage | null;
  signature: PDFImage;
};

export async function loadSuratAssets(doc: PDFDocument): Promise<SuratAssets> {
  doc.registerFontkit(fontkit);

  const entries = await Promise.all(
    (Object.keys(FONT_FILES) as (keyof FontSet)[]).map(async (key) => {
      const bytes = await assetBytes(join("fonts", FONT_FILES[key]));
      // subset:false is not an oversight. @pdf-lib/fontkit@1.1.1's subsetter
      // silently drops glyphs from Carlito (letters vanish from the render
      // while the text layer still extracts fine), and it throws outright on a
      // pre-subsetted TTF. Full faces are ~2.7MB per document — the price of a
      // letter that actually has its letters.
      //
      // Ligatures off for the same class of reason: Carlito's "ti"/"tt"/"ft"
      // ligatures embed with a width pdf-lib and the viewer disagree about, so
      // "ketertiban" renders as "keterti ban". Calibri's own metrics are
      // unaffected — only the joined glyph is.
      const font = await doc.embedFont(bytes, {
        subset: false,
        features: { liga: false, clig: false, dlig: false, rlig: false },
      });
      return [key, font] as const;
    }),
  );
  const fonts = Object.fromEntries(entries) as Record<keyof FontSet, PDFFont> as FontSet;

  // The mark is decoration — a letter without it is still a valid letter.
  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedPng(await assetBytes("org-logo.png"));
  } catch {
    logo = null;
  }

  // The signature is not decoration. An unsigned official letter going out is
  // worse than no letter, so a missing file must fail loudly.
  const signature = await doc.embedJpg(await assetBytes("ttd-signer.jpg"));

  return { fonts, logo, signature };
}
