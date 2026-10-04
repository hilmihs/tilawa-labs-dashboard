import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { formatIndonesianDate } from "./date-id";

export type WarningLetterData = {
  letterNumber: string; // e.g. "EKT/MPN-MBN/VII/2026/16"
  studentName: string;
  parentName: string | null;
  /** Halaqah teacher(s) — display string as stored in tilawah (may be "A & B"). */
  pengajar: string | null;
  /** Marhalah / level phrase, e.g. "Al Marhalah al-Ula Yaumi Akhwat". */
  marhalah: string | null;
  incidentDate: string; // ISO date (YYYY-MM-DD) of the triggering lateness
  generatedAt: string; // ISO datetime
};

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 64;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

// The built-in Times-Roman uses WinAnsi encoding, which can't encode chars like
// "U"/"a" with macrons (Arabic transliteration). NFKD-decompose then keep only
// chars pdf-lib's WinAnsi can render: latin-1 (<=0xFF) plus smart quotes/dashes.
// This degrades macron vowels to plain latin instead of throwing.
const KEEP = new Set([0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014]);
function enc(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0300 && cp <= 0x036f) continue; // combining diacritics
    if (cp <= 0xff || KEEP.has(cp)) out += ch;
  }
  return out;
}

export async function generateWarningLetterPdf(data: WarningLetterData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  // Logo (mabni) top-right — extracted from the official template.
  try {
    const logoBytes = await readFile(join(process.cwd(), "public", "mabni-logo.png"));
    const logo = await pdfDoc.embedPng(logoBytes);
    const logoW = 92;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, {
      x: PAGE.width - MARGIN - logoW,
      y: PAGE.height - MARGIN - logoH + 8,
      width: logoW,
      height: logoH,
    });
  } catch {
    // Logo optional — letter still renders without it.
  }

  const SIZE = 11.5;
  const LEADING = 16.5;
  let y = PAGE.height - MARGIN;

  const draw = (text: string, opts: { font?: PDFFont; x?: number; size?: number } = {}) => {
    page.drawText(enc(text), {
      x: opts.x ?? MARGIN,
      y,
      size: opts.size ?? SIZE,
      font: opts.font ?? font,
      color: rgb(0, 0, 0),
    });
  };

  const gap = (h = LEADING) => {
    y -= h;
  };

  // Justified paragraph with simple greedy word-wrap. Segments let us bold a few
  // words mid-sentence (e.g. "Madrasah Rabbaniyyah") without a full rich-text engine.
  const paragraph = (
    segments: { text: string; font?: PDFFont }[],
    size = SIZE,
    lineGap = LEADING,
  ) => {
    // Flatten into words carrying their font. A token that is just trailing
    // punctuation (e.g. the "," after a bold "Rabbaniyyah") is glued to the
    // previous word so justification doesn't insert a space before it.
    const words: { w: string; f: PDFFont }[] = [];
    for (const seg of segments) {
      const f = seg.font ?? font;
      for (const w of enc(seg.text).split(/\s+/).filter(Boolean)) {
        const prev = words[words.length - 1];
        if (prev && /^[,.;:!?)]+$/.test(w)) prev.w += w;
        else words.push({ w, f });
      }
    }
    let line: { w: string; f: PDFFont }[] = [];
    const flush = (justify: boolean) => {
      if (line.length === 0) return;
      const spaceW = font.widthOfTextAtSize(" ", size);
      const textW = line.reduce((s, it) => s + it.f.widthOfTextAtSize(it.w, size), 0);
      const gaps = line.length - 1;
      const extra = justify && gaps > 0 ? (CONTENT_WIDTH - textW - spaceW * gaps) / gaps : 0;
      let x = MARGIN;
      for (const it of line) {
        page.drawText(it.w, { x, y, size, font: it.f, color: rgb(0, 0, 0) });
        x += it.f.widthOfTextAtSize(it.w, size) + spaceW + extra;
      }
      y -= lineGap;
      line = [];
    };
    for (const item of words) {
      const trial = [...line, item];
      const trialW =
        trial.reduce((s, it) => s + it.f.widthOfTextAtSize(it.w, size), 0) +
        font.widthOfTextAtSize(" ", size) * (trial.length - 1);
      if (trialW > CONTENT_WIDTH && line.length > 0) flush(true);
      line.push(item);
    }
    flush(false); // last line left-aligned (not justified)
  };

  // ── Header ──────────────────────────────────────────────────────────────
  draw("Bismillahirrahmanirrahim", { font: italic });
  gap(LEADING * 1.6);

  draw(`Nomor: ${data.letterNumber}`);
  gap();
  draw("Hal: Surat Peringatan");
  gap(LEADING * 1.6);

  draw("Kepada Yth.");
  gap();
  draw("Bapak/Ibu/Wali dari");
  gap();
  draw(data.studentName, { font: bold });
  gap();
  draw("di tempat");
  gap(LEADING * 1.6);

  draw("Assalamu’alaikum warahmatullahi wabarakatuh,");
  gap(LEADING * 1.4);

  // ── Body ────────────────────────────────────────────────────────────────
  draw("Dengan hormat,");
  gap();
  const firstName = data.studentName.split(/\s+/)[0] || data.studentName;
  paragraph([
    { text: "Berdasarkan catatan kehadiran di " },
    { text: "Madrasah Rabbaniyyah", font: bold },
    {
      text: `, diketahui bahwa Ananda ${firstName} datang terlambat tanpa memberikan izin sebelum Kegiatan Belajar Mengajar (KBM) pada ${formatIndonesianDate(data.incidentDate)}.`,
    },
  ]);
  gap(LEADING * 0.6);

  paragraph([
    {
      text:
        "Sehubungan dengan hal tersebut, kami menghimbau Bapak/Ibu beserta Ananda untuk dapat lebih memperhatikan tata tertib yang berlaku dan menyampaikan izin kepada kami. Insyaa Allah kami, selaku pengajar juga akan memberikan pendampingan dan mengajak Ananda berdiskusi agar kejadian serupa tidak terulang kembali.",
    },
  ]);
  gap(LEADING * 0.6);

  paragraph([
    {
      text: `Semoga Allah memberikan taufik Bapak/Ibu dan pihak Madrasah untuk bekerja sama dengan baik dalam upaya mendidik dan membentuk karakter Ananda ${firstName}.`,
    },
  ]);
  gap(LEADING * 0.2);
  paragraph([{ text: "Atas perhatian dan kerja samanya kami ucapkan terima kasih." }]);
  gap(LEADING * 0.8);

  draw("Wassalamu’alaikum warahmatullahi wabarakatuh.");
  gap(LEADING * 1.8);

  // ── Signature ───────────────────────────────────────────────────────────
  draw("Hormat kami,");
  gap(LEADING * 1.8);
  draw(data.pengajar ?? "Pengajar", { font: bold });
  gap();
  draw(`Pengajar${data.marhalah ? ` ${data.marhalah}` : ""}`);

  return pdfDoc.save();
}
