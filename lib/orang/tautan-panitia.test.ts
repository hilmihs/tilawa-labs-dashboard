import { describe, expect, it } from "vitest";
import { cocokkanPanitia, kandidatNama } from "./tautan-panitia";

const orang = [
  { id: "o1", namaKunci: "ilham kamila anggraini", gender: "L", wa: "6281902251409" },
  { id: "o2", namaKunci: "salma", gender: "P", wa: null },
  { id: "o3", namaKunci: "salma", gender: "P", wa: "628111" },
  { id: "o4", namaKunci: "jannah", gender: "P", wa: null },
  { id: "o5", namaKunci: "aditya tri anggoro", gender: "L", wa: null },
  { id: "o6", namaKunci: "zahra rahma utami", gender: "L", wa: null },
];

describe("cocokkanPanitia", () => {
  it("matches by WhatsApp first, whatever the spelling", () => {
    const h = cocokkanPanitia([{ id: "p1", nama: "Hilmi", gender: "L", wa: "081902251409" }], orang);
    expect(h.tautan).toEqual([{ panitiaId: "p1", orangId: "o1", cara: "wa" }]);
  });

  it("matches a unique exact name of the same gender", () => {
    const h = cocokkanPanitia([{ id: "p2", nama: "Jannah", gender: "P", wa: null }], orang);
    expect(h.tautan).toEqual([{ panitiaId: "p2", orangId: "o4", cara: "nama" }]);
  });

  it("does not guess between two people with the same name", () => {
    const h = cocokkanPanitia([{ id: "p3", nama: "Salma", gender: "P", wa: null }], orang);
    expect(h.tautan).toEqual([]);
    expect(h.tertinggal[0].alasan).toMatch(/2 orang/);
  });

  it("creates one new orang per unknown WhatsApp number", () => {
    const h = cocokkanPanitia(
      [
        { id: "p4", nama: "Amal", gender: "L", wa: "0812 555 000" },
        { id: "p5", nama: "Amal", gender: "L", wa: "62812555000" },
      ],
      orang,
    );
    expect(h.baru).toEqual([{ nama: "Amal", gender: "L", wa: "62812555000", panitiaIds: ["p4", "p5"] }]);
  });

  it("leaves unknown names without WhatsApp for a human", () => {
    const h = cocokkanPanitia([{ id: "p6", nama: "Rika", gender: "P", wa: null }], orang);
    expect(h.tertinggal[0].alasan).toMatch(/tanpa WA/);
  });

  it("auto-links a two-word name with a single word-prefix candidate", () => {
    const h = cocokkanPanitia([{ id: "p7", nama: "Aditya Tri", gender: "L", wa: null }], orang);
    expect(h.tautan).toEqual([{ panitiaId: "p7", orangId: "o5", cara: "nama_awal" }]);
  });

  it("never auto-links a one-word name, but offers it as a candidate", () => {
    const h = cocokkanPanitia([{ id: "p8", nama: "Zahra", gender: "L", wa: null }], orang);
    expect(h.tautan).toEqual([]);
    expect(kandidatNama("Zahra", "L", orang).map((o) => o.id)).toEqual(["o6"]);
    expect(kandidatNama("Zahra", "P", orang)).toEqual([]);
  });
});
