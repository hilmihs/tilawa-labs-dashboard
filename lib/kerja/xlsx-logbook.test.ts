import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { hariDalamBulan, susunLogbook } from "./logbook";
import { bangunLogbookXlsx, labelBulan, namaBerkasLogbook } from "./xlsx-logbook";

// 1 Sep 2026: Aldi datang pagi 07.45 (QR) dan sore 16.00 (manual, lupa kartu); Salma pagi 08.05.
const lb = susunLogbook(
  [
    { orangId: "a", nama: "Aldi", gender: "L" },
    { orangId: "b", nama: "Salma", gender: "P" },
  ],
  [
    { orangId: "a", tanggal: "2026-09-01", sesi: "pagi", waktu: new Date("2026-09-01T00:45:00Z"), sumber: "qr" },
    { orangId: "a", tanggal: "2026-09-01", sesi: "sore", waktu: new Date("2026-09-01T09:00:00Z"), sumber: "manual", catatan: "lupa kartu" },
    { orangId: "b", tanggal: "2026-09-01", sesi: "pagi", waktu: new Date("2026-09-01T01:05:00Z"), sumber: "nfc" },
  ],
  hariDalamBulan("2026-09"),
);

describe("xlsx logbook", () => {
  const wb = bangunLogbookXlsx(lb, { bulan: "2026-09", hariIni: "2026-09-10" });

  it("names the file and the month the way the paper sheet does", () => {
    expect(namaBerkasLogbook("2026-09")).toBe("Logbook-Kehadiran-Pengurus_2026-09.xlsx");
    expect(labelBulan("2026-09")).toBe("September 2026");
  });

  it("has Logbook, Rekap and Data sheets", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Logbook", "Rekap", "Data"]);
  });

  it("lays out the logbook: title, month, IKHWAN block with merged date headers, HH.MM text", () => {
    const ws = wb.getWorksheet("Logbook")!;
    expect(ws.getCell("A1").value).toBe("LOGBOOK KEHADIRAN PENGURUS PENDIDIKAN");
    expect(ws.getCell("A2").value).toBe("Bulan/Tahun: September 2026");
    expect(ws.getCell("A4").value).toBe("IKHWAN");
    // Kepala: baris 5 "Tgl 1" digabung C5:E5, baris 6 P | Si | Sr.
    expect(ws.getCell("C5").value).toBe("Tgl 1");
    expect(ws.getCell("E5").master.address).toBe("C5");
    expect(ws.getCell("F5").value).toBe("Tgl 2");
    expect([ws.getCell("C6").value, ws.getCell("D6").value, ws.getCell("E6").value]).toEqual(["P", "Si", "Sr"]);
    expect(ws.getCell("A6").master.address).toBe("A5");
    // Baris data Aldi: jam sebagai teks, manual diberi bintang dan komentar.
    expect(ws.getCell("B7").value).toBe("Aldi");
    expect(ws.getCell("C7").value).toBe("07.45");
    expect(ws.getCell("E7").value).toBe("16.00*");
    expect(String(ws.getCell("E7").note)).toContain("lupa kartu");
    // Blok AKHWAT menyusul setelah satu baris kosong.
    expect(ws.getCell("A9").value).toBe("AKHWAT");
    expect(ws.getCell("B12").value).toBe("Salma");
    expect(ws.getCell("C12").value).toBe("08.05");
    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 6 });
  });

  it("recaps per person against elapsed days only", () => {
    const ws = wb.getWorksheet("Rekap")!;
    expect(ws.getRow(1).values).toEqual([undefined, "No", "Nama", "Gender", "P", "Si", "Sr", "Total", "% Kehadiran"]);
    expect(ws.getCell("B2").value).toBe("Aldi");
    expect(ws.getCell("G2").value).toBe(2);
    // 2 sesi ÷ (10 hari × 3) — 20 hari sisanya belum tiba.
    expect(ws.getCell("H2").value).toBeCloseTo(2 / 30, 5);
    expect(ws.getCell("C3").value).toBe("Akhwat");
  });

  it("flattens every filled cell into the Data sheet", () => {
    const ws = wb.getWorksheet("Data")!;
    expect(ws.rowCount).toBe(4);
    expect(ws.getRow(3).values).toEqual([undefined, new Date(Date.UTC(2026, 8, 1)), "Aldi", "Ikhwan", "Sore", "16.00", "Manual", "lupa kartu"]);
  });

  it("serialises and loads back", async () => {
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    expect(back.getWorksheet("Logbook")!.getCell("E7").value).toBe("16.00*");
  });

  it("shows '-' instead of 0% for a month that has not started", () => {
    const w = bangunLogbookXlsx(lb, { bulan: "2026-09", hariIni: "2026-08-31" });
    expect(w.getWorksheet("Rekap")!.getCell("H2").value).toBe("-");
  });
});
