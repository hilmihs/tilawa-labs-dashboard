/**
 * Kartu kehadiran PNG, kualitas cetak: A6 pada 300 dpi (1240×1748 px, 10,5×14,8 cm).
 * Dicetak sendiri oleh pengajar atau dibagikan lewat Drive/WA; harus terbaca
 * tanpa membuka halaman apa pun.
 *
 * pureimage (JS murni, tanpa binary native) + Carlito dari assets/surat/fonts
 * (sudah dipakai surat HKM di prod, jadi berkas & jalurnya pasti ada). QR digambar
 * langsung dari modul `qrcode.create`. Logo Tilawa Labs tidak dipakai: berkasnya
 * ber-latar hijau gelap dan bertulisan #Tilawah, tidak cocok di kartu putih.
 */
import { PassThrough } from "node:stream";
import { join } from "node:path";
import QRCode from "qrcode";
import * as PImage from "pureimage";

export const KARTU_LEBAR = 1240;
export const KARTU_TINGGI = 1748;
const TEPI = 60; // margin aman cetak
const QR_UKURAN = 920;
const HIJAU = "#166534";
const ABU = "#6b7280";
const GELAP = "#111827";

let fontSiap: Promise<void> | null = null;
function pastikanFont(): Promise<void> {
  if (!fontSiap) {
    const dir = join(process.cwd(), "assets", "surat", "fonts");
    fontSiap = Promise.all([
      PImage.registerFont(join(dir, "Carlito-Bold.ttf"), "KartuBold").load(),
      PImage.registerFont(join(dir, "Carlito-Regular.ttf"), "KartuReg").load(),
    ]).then(() => undefined);
  }
  return fontSiap;
}

type Ctx = ReturnType<ReturnType<typeof PImage.make>["getContext"]>;

function potongBaris(ctx: Ctx, teks: string, maks: number, maksBaris: number): string[] {
  const kata = teks.split(/\s+/).filter(Boolean);
  const baris: string[] = [];
  let cur = "";
  for (const k of kata) {
    const coba = cur ? `${cur} ${k}` : k;
    if (ctx.measureText(coba).width <= maks || !cur) cur = coba;
    else { baris.push(cur); cur = k; }
  }
  if (cur) baris.push(cur);
  if (baris.length > maksBaris) {
    const sisa = baris.slice(0, maksBaris);
    let akhir = sisa[maksBaris - 1];
    while (ctx.measureText(`${akhir}…`).width > maks && akhir.length > 1) akhir = akhir.slice(0, -1);
    sisa[maksBaris - 1] = `${akhir}…`;
    return sisa;
  }
  return baris;
}

function tengah(ctx: Ctx, teks: string, y: number) {
  const w = ctx.measureText(teks).width;
  ctx.fillText(teks, (KARTU_LEBAR - w) / 2, y);
}

export async function buatKartuPng(v: { nama: string; program: string | null; gender: string; kode: string; url: string }): Promise<Buffer> {
  await pastikanFont();
  const img = PImage.make(KARTU_LEBAR, KARTU_TINGGI);
  const ctx = img.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, KARTU_LEBAR, KARTU_TINGGI);

  // bingkai tipis + pita hijau atas
  ctx.fillStyle = HIJAU;
  ctx.fillRect(TEPI, TEPI, KARTU_LEBAR - TEPI * 2, 6);
  ctx.fillRect(TEPI, KARTU_TINGGI - TEPI - 6, KARTU_LEBAR - TEPI * 2, 6);
  ctx.fillRect(TEPI, TEPI, 6, KARTU_TINGGI - TEPI * 2);
  ctx.fillRect(KARTU_LEBAR - TEPI - 6, TEPI, 6, KARTU_TINGGI - TEPI * 2);

  // kepala
  ctx.fillStyle = HIJAU;
  ctx.font = "44pt KartuBold";
  tengah(ctx, "KARTU KEHADIRAN", TEPI + 110);
  ctx.fillStyle = ABU;
  ctx.font = "26pt KartuReg";
  tengah(ctx, "EDUCATION BOARD · TILAWA LABS", TEPI + 160);

  // QR
  const qr = QRCode.create(v.url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const sel = Math.floor(QR_UKURAN / n);
  const ukuran = sel * n;
  const x0 = Math.round((KARTU_LEBAR - ukuran) / 2);
  const y0 = TEPI + 210;
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) ctx.fillRect(x0 + c * sel, y0 + r * sel, sel, sel);

  // kode
  let y = y0 + ukuran + 64;
  ctx.fillStyle = "#374151";
  ctx.font = "30pt KartuReg";
  tengah(ctx, v.kode.split("").join(" "), y);

  // nama
  y += 96;
  ctx.fillStyle = GELAP;
  ctx.font = "60pt KartuBold";
  for (const b of potongBaris(ctx, v.nama, KARTU_LEBAR - TEPI * 2 - 60, 2)) { tengah(ctx, b, y); y += 78; }

  // program · gender
  ctx.fillStyle = "#374151";
  ctx.font = "38pt KartuReg";
  const sub = `${v.program ?? "—"} · ${v.gender === "P" ? "Akhwat" : "Ikhwan"}`;
  for (const b of potongBaris(ctx, sub, KARTU_LEBAR - TEPI * 2 - 60, 2)) { tengah(ctx, b, y + 8); y += 54; }

  // kaki
  ctx.fillStyle = ABU;
  // Tanpa tautan tertulis: kartu bukan undangan membuka halaman, QR-nya yang dipindai.
  ctx.font = "24pt KartuReg";
  tengah(ctx, "Berlaku untuk seluruh kajian. Tunjukkan saat registrasi ulang.", KARTU_TINGGI - TEPI - 70);

  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c: Buffer) => chunks.push(c));
  await PImage.encodePNGToStream(img, out);
  return Buffer.concat(chunks);
}
