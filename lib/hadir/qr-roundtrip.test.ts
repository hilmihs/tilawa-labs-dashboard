import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { ekstrakKode, urlQr } from "./kode";

/**
 * Isi QR yang dicetak (URL /h/<kode>) harus terbaca kembali oleh dekoder
 * yang dipakai pemindai (jsQR) dan diekstrak jadi kode yang sama. Menjaga
 * dua hal sekaligus: level koreksi/margin yang dipilih, dan ekstrakKode.
 */
describe("QR bolak-balik", () => {
  it("qrcode → piksel → jsQR → ekstrakKode", () => {
    const kode = "K7X9M2QDAB";
    const url = urlQr("https://dashboard.edu.example.org", kode);
    const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const skala = 4, margin = 4 * skala, w = n * skala + margin * 2;
    const data = new Uint8ClampedArray(w * w * 4).fill(255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < skala; dy++) for (let dx = 0; dx < skala; dx++) {
        const i = ((y * skala + dy + margin) * w + (x * skala + dx + margin)) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
    const hasil = jsQR(data, w, w);
    expect(hasil?.data).toBe(url);
    expect(ekstrakKode(hasil!.data)).toBe(kode);
  });
});
