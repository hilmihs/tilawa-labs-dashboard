/**
 * The Maahir monthly workbook as it is actually written, built from the REAL
 * responses captured on 3 Sep 2026 (`lib/maahir/__fixtures__/*.json`). No DB, no
 * network — ExcelJS in memory only.
 *
 * These tests guard what a reader of the FILE can be misled by, which is not the
 * same set of things the data layer guards:
 *
 *   1. a sheet quietly missing, so a route nobody looks at stays invisible;
 *   2. a null score rendered as 0 — 42% of the matrix indicator cells are null,
 *      and a column of zeroes reads as a cohort that failed;
 *   3. a stale or never-computed snapshot presented as current numbers;
 *   4. two sheets printing the same period label while covering different
 *      windows, because one of them borrowed the other's.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { bentukMaahirBulanan, type MaahirBulananReads } from "./maahir-bulanan";
import { buildMaahirBulananWorkbook } from "./maahir-bulanan-xlsx";
import type { MaahirRekapEnvelope } from "@/lib/maahir/types";

const FIXTURES = join(__dirname, "..", "maahir", "__fixtures__");

function read<T>(name: string, fetchedAt = new Date("2026-09-03T08:21:00Z")) {
  const env = JSON.parse(
    readFileSync(join(FIXTURES, `${name}.json`), "utf8"),
  ) as MaahirRekapEnvelope<T>;
  return { payload: env.data, meta: env.meta, fetchedAt };
}

function reads(over: Partial<MaahirBulananReads> = {}): MaahirBulananReads {
  return {
    laporan: read("laporan-maahir"),
    kehadiran: read("kehadiran"),
    tibyan: read("tibyan"),
    sp: read("sp"),
    matrix: read("matrix-guru"),
    disiplin: read("hits-disiplin"),
    shakwa: read("shakwa"),
    ...over,
  } as MaahirBulananReads;
}

const wbOf = (over: Partial<MaahirBulananReads> = {}) =>
  buildMaahirBulananWorkbook(
    bentukMaahirBulanan("2026-08", reads(over), { generatedAt: "2026-09-03" }),
  );

const KOSONG: MaahirBulananReads = {
  laporan: null,
  kehadiran: null,
  tibyan: null,
  sp: null,
  matrix: null,
  disiplin: null,
  shakwa: null,
};

/** Every string the sheet actually prints, joined — what a reader would see. */
function teks(ws: ExcelJS.Worksheet): string {
  const out: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "string") out.push(cell.value);
    });
  });
  return out.join("\n");
}

/** First row whose column 1 holds `value` — the data row for one named person. */
function rowOf(ws: ExcelJS.Worksheet, value: string): number {
  let found = 0;
  ws.eachRow({ includeEmpty: false }, (row, i) => {
    if (!found && row.getCell(1).value === value) found = i;
  });
  if (!found) throw new Error(`Baris "${value}" tidak ada di sheet ${ws.name}`);
  return found;
}

/** The header row that carries `label`, and the column it sits in. */
function kolom(ws: ExcelJS.Worksheet, label: string): number {
  let col = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (!col && cell.value === label) col = c;
    });
  });
  if (!col) throw new Error(`Kolom "${label}" tidak ada di sheet ${ws.name}`);
  return col;
}

describe("sheets", () => {
  it("has all eight sheets, in reading order", () => {
    expect(wbOf().worksheets.map((ws) => ws.name)).toEqual([
      "Ringkasan",
      "Kehadiran per Kelas",
      "At-Tibyan",
      "SP",
      "Presensi Belum Diisi",
      "Matrix Guru",
      "Disiplin Pengajar",
      "Shakwa",
    ]);
  });

  it("still produces all eight when not one route was ever pulled", () => {
    const wb = buildMaahirBulananWorkbook(
      bentukMaahirBulanan("2026-08", KOSONG, { generatedAt: "2026-09-03" }),
    );
    expect(wb.worksheets).toHaveLength(8);
    // Each of the three new sheets says WHY it is empty instead of printing zeroes.
    for (const name of ["Matrix Guru", "Disiplin Pengajar", "Shakwa"]) {
      expect(teks(wb.getWorksheet(name)!)).toMatch(/DATA BELUM DITARIK/);
    }
  });

  it("fills the three new sheets with real rows", () => {
    const wb = wbOf();
    // 178 pengajar + 134 ranked + 14 noData + 101 insiden + 21 tiket, each on a
    // sheet that also carries its own titles and notes.
    expect(rowOf(wb.getWorksheet("Matrix Guru")!, "Adiba Abdul Anggraini")).toBeGreaterThan(0);
    expect(teks(wb.getWorksheet("Disiplin Pengajar")!)).toContain("Peringkat pengajar (134)");
    expect(teks(wb.getWorksheet("Disiplin Pengajar")!)).toContain("Insiden tabayyun (101)");
    expect(teks(wb.getWorksheet("Shakwa")!)).toContain("Daftar tiket (21)");
  });
});

describe("a missing score is not a zero", () => {
  it("writes the placeholder for a null indicator and the number for a real one", () => {
    const ws = wbOf().getWorksheet("Matrix Guru")!;
    const row = rowOf(ws, "Adiba Abdul Anggraini");

    // Hafalan is null for every scored pengajar in the capture; bacaan for 159
    // of 177. Neither may print as 0 / 0.0 / 0.00.
    for (const label of ["Hafalan", "Bacaan", "Kehadiran Muallim", "Metode pengajaran"]) {
      const cell = ws.getCell(row, kolom(ws, label));
      expect(cell.value).not.toBe(0);
      expect(typeof cell.value).not.toBe("number");
      expect(cell.value).toBe("-");
      // No number format either: a percent/decimal mask on a placeholder is how
      // "-" becomes "0.00" the moment someone retypes the cell.
      expect(cell.numFmt).toBeUndefined();
    }

    // The scores that DO exist are written as numbers, so the column stays
    // sortable and averageable.
    expect(ws.getCell(row, kolom(ws, "Kehadiran Maahir")).value).toBe(3);
    expect(ws.getCell(row, kolom(ws, "Kehadiran At-Tibyan")).value).toBe(2);
    // Upstream's own averages, written through untouched.
    expect(ws.getCell(row, kolom(ws, "Rata-rata pedagogis")).value).toBe(4);
    expect(ws.getCell(row, kolom(ws, "Rata-rata keseluruhan")).value).toBe(3.32);
    expect(ws.getCell(row, kolom(ws, "Ranking se-HITS")).value).toBe(25);
    // Teguran is a COUNT: 0 here really is zero, and must stay a number.
    expect(ws.getCell(row, kolom(ws, "Teguran kumulatif")).value).toBe(0);
  });

  it("keeps a pengajar with no snapshot row entirely blank, not all-zero", () => {
    const matrix = read<never>("matrix-guru");
    const payload = JSON.parse(JSON.stringify(matrix.payload)) as {
      pengajar: { nama: string; matrix: unknown }[];
    };
    const tanpaBaris = payload.pengajar.find((p) => p.matrix == null)!;
    const ws = wbOf().getWorksheet("Matrix Guru")!;
    const row = rowOf(ws, tanpaBaris.nama);
    for (const label of ["Bacaan", "Rata-rata keseluruhan", "Ranking se-HITS", "Teguran kumulatif"]) {
      expect(ws.getCell(row, kolom(ws, label)).value).toBe("-");
    }
  });

  it("leaves a percent with no denominator blank on the disiplin sheet", () => {
    // `noData` teachers have pctKbbs/pctOnTime null: nothing to score, which is
    // not the same as scoring 0%.
    const ws = wbOf().getWorksheet("Disiplin Pengajar")!;
    const teksSheet = teks(ws);
    expect(teksSheet).toContain("Tanpa data untuk dinilai (14)");
    expect(teksSheet).toMatch(/bukan karena 0%/);
  });
});

describe("stale snapshot", () => {
  it("says so above the numbers when meta.basi is set", () => {
    const matrix = read<never>("matrix-guru");
    const wb = wbOf({ matrix: { ...matrix, meta: { ...matrix.meta, basi: true } } as never });
    const t = teks(wb.getWorksheet("Matrix Guru")!);
    expect(t).toMatch(/SNAPSHOT BASI/);
    expect(t).toMatch(/BELUM FINAL/);
    expect(t).toContain("1 Sep 2026"); // meta.snapshot_terakhir, spelled out
    // The rows are still there — basi means old, not absent.
    expect(rowOf(wb.getWorksheet("Matrix Guru")!, "Adiba Abdul Anggraini")).toBeGreaterThan(0);
  });

  it("says so when the month was never computed at all", () => {
    const matrix = read<never>("matrix-guru");
    const payload = JSON.parse(JSON.stringify(matrix.payload)) as { pengajar: { matrix: unknown }[] };
    payload.pengajar.forEach((p) => {
      p.matrix = null;
    });
    const t = teks(wbOf({ matrix: { ...matrix, payload } as never }).getWorksheet("Matrix Guru")!);
    expect(t).toMatch(/SNAPSHOT BELUM DIHITUNG/);
    expect(t).toMatch(/BUKAN nilai nol/);
  });

  it("prints no notice at all when the snapshot is siap", () => {
    const t = teks(wbOf().getWorksheet("Matrix Guru")!);
    expect(t).not.toMatch(/SNAPSHOT BASI|SNAPSHOT BELUM DIHITUNG/);
  });
});

describe("every sheet labels itself from its own meta", () => {
  it("does not let the Maahir window leak onto the three new sheets", () => {
    const wb = wbOf();
    const maahir = "28 Jul – 27 Agu 2026";

    // hits-disiplin answers 1 Aug–1 Sep for the SAME requested month.
    const disiplin = teks(wb.getWorksheet("Disiplin Pengajar")!);
    expect(disiplin).toContain("1 Agu – 1 Sep 2026");
    expect(disiplin).toContain("1 Agu 2026 s.d. 1 Sep 2026");
    expect(disiplin).not.toContain(maahir);

    // matrix-guru is a snapshot OF a calendar month, with no window in meta.
    const matrix = teks(wb.getWorksheet("Matrix Guru")!);
    expect(matrix).toContain("Agustus 2026");
    expect(matrix).not.toContain(maahir);

    // The Maahir sheets keep theirs.
    expect(teks(wb.getWorksheet("Ringkasan")!)).toContain(maahir);
  });

  it("follows shakwa's own window when it differs from the report window", () => {
    // Same fixture, a narrower day range: the Shakwa sheet must move with its
    // meta while every other sheet stays on 28→27.
    const shakwa = read<never>("shakwa");
    const wb = wbOf({
      shakwa: {
        ...shakwa,
        meta: { ...shakwa.meta, mulai: "2026-08-10", sampai: "2026-08-20" },
      } as never,
    });
    expect(teks(wb.getWorksheet("Shakwa")!)).toContain("10 Agu – 20 Agu 2026");
    expect(teks(wb.getWorksheet("Shakwa")!)).not.toContain("28 Jul – 27 Agu 2026");
    expect(teks(wb.getWorksheet("Ringkasan")!)).toContain("28 Jul – 27 Agu 2026");
  });

  it("states the KIND of window on each new sheet, not just the dates", () => {
    const wb = wbOf();
    expect(teks(wb.getWorksheet("Disiplin Pengajar")!)).toMatch(/JENDELA SHEET INI: Kalender penuh/);
    expect(teks(wb.getWorksheet("Matrix Guru")!)).toMatch(/JENDELA SHEET INI: Snapshot/);
    expect(teks(wb.getWorksheet("Shakwa")!)).toMatch(/JENDELA SHEET INI: Rentang hari/);
    // And the Ringkasan lists all seven windows side by side, so the collision
    // is visible in one place.
    const ringkasan = teks(wb.getWorksheet("Ringkasan")!);
    expect(ringkasan).toContain("Jendela (definisi bulan)");
    expect(ringkasan).toContain("rekap/hits-disiplin");
    expect(ringkasan).toContain("rekap/matrix-guru");
    expect(ringkasan).toContain("rekap/shakwa");
  });
});

describe("data the API withholds is never asked for", () => {
  it("has no WA column on the shakwa sheet and counts attachments only", () => {
    const ws = wbOf().getWorksheet("Shakwa")!;
    const t = teks(ws);
    // No column asks for a number the API refuses to send (docs §6/§7).
    expect(() => kolom(ws, "WhatsApp")).toThrow();
    expect(() => kolom(ws, "No. HP")).toThrow();

    // The capture DOES contain one phone number — a reporter typed their own
    // into the body of ticket SKW-20260816-001. It is the reporter's sentence,
    // not an API field, and editing a complaint to remove it would change what
    // the complaint says. What must hold is that it stays inside the free-text
    // column and never becomes a structured one.
    const isiCol = kolom(ws, "Isi laporan");
    const bocor: number[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (typeof cell.value === "string" && /(?:\+62|\b08)\d{7,}/.test(cell.value)) bocor.push(c);
      });
    });
    expect([...new Set(bocor)]).toEqual([isiCol]);

    expect(kolom(ws, "Lampiran")).toBeGreaterThan(0);
    expect(t).toMatch(/Lampiran hanya dihitung/);
    // The reporter's own words are kept whole but sit last, unhighlighted.
    expect(kolom(ws, "Isi laporan")).toBe(14);
  });
});
