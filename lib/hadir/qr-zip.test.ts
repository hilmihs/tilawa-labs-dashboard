import { describe, expect, it } from "vitest";
import { namaBerkasKartu } from "./qr-zip";

describe("namaBerkasKartu", () => {
  it("names files Nama - Program and keeps them unique", () => {
    const rows = [
      { nama: "Aisyah", programTeks: "Pengajar HITS", gender: "P", kodeQr: "ABCDEFGHJK" },
      { nama: "Aisyah", programTeks: "Pengajar HITS", gender: "P", kodeQr: "MNPQRSTVWX" },
      { nama: "A/b: c?", programTeks: null, gender: "L", kodeQr: "YZ23456789" },
    ];
    expect(namaBerkasKartu(rows)).toEqual([
      "Aisyah - Pengajar HITS.png",
      "Aisyah - Pengajar HITS (MNPQ).png",
      "Ab c - Tanpa program.png",
    ]);
  });
});
