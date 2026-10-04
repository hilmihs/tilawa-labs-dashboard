/**
 * Parsers for the Mabni semester roster workbook.
 *
 *   app/docs/20260721_MABNI_Data Pengajar & Peserta_Data Semester 2 Tahun Ajaran 2026.xlsx
 *
 * These live in `lib/` rather than next to the importer scripts so vitest can
 * cover them: every trap in this integration is in the parsing, and `scripts/`
 * has no test coverage at all.
 *
 * Four sheets, three parsed:
 *   "Data Anak, Usia, Orang Tua"  → parseSantri   (76 santri + parents + DOB)
 *   "Remaja"                      → NOT PARSED. Verified on 8 Sep 2026 to be a
 *                                   100% conflict-free subset of the santri
 *                                   sheet — 48 rows, every field identical.
 *                                   Nothing is lost by skipping it.
 *   "Data Wali Santri "           → parseWali     (53 families, 75 child slots)
 *   "Data Pengajar"               → parsePengajar (16 teachers + class pairing)
 */
import * as XLSX from "xlsx";
import { parseKelasKategori, type KelasKategori } from "@/lib/mabni/kelas-kategori";

export const SOURCE_FILE =
  "20260721_MABNI_Data Pengajar & Peserta_Data Semester 2 Tahun Ajaran 2026.xlsx";

export const SHEET_SANTRI = "Data Anak, Usia, Orang Tua";
/** The trailing space is real — it is part of the sheet name in the workbook. */
export const SHEET_WALI = "Data Wali Santri ";
export const SHEET_PENGAJAR = "Data Pengajar";

/**
 * Same normalization the existing roster import uses (scripts/import-roster.ts):
 * the workbook flags some names with a trailing "*" that upstream names lack.
 */
export function norm(s: unknown): string {
  return String(s ?? "")
    .replace(/\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * The three santri whose workbook spelling differs from the name upstream
 * holds. Everything else in the sheet matches exactly once normalized; these
 * are listed explicitly rather than reached by fuzzy matching so that a wrong
 * pairing is a visible line of code, not a similarity threshold.
 *
 *   workbook                        → upstream (students.full_name)
 */
export const NAME_ALIASES: Record<string, string> = {
  [norm("Arwa Syakiroh")]: norm("Arwa binti Aditya"),
  [norm("Elaf Abdullah Abdo Mohammed")]: norm("Ilaf Abdullah"),
  [norm("Lathifah Binti Rifany")]: norm("Lathifah"),
};

/** Normalized lookup key for a workbook name, after alias resolution. */
export function resolveName(raw: unknown): string {
  const key = norm(raw);
  return NAME_ALIASES[key] ?? key;
}

/**
 * Excel serial → ISO date.
 *
 * The workbook MUST be read WITHOUT `{ cellDates: true }`. Serial 44341 shows
 * as 5/25/21 in Excel, but cellDates hands back 2021-05-24T16:59:48.000Z:
 * SheetJS converts serials through the local timezone, and Asia/Jakarta's
 * offset at the 1899 epoch is +07:00:12, so `.toISOString().slice(0, 10)`
 * loses a day on EVERY date in the file. `scripts/import-late-incidents.ts`
 * carries that bug latent; do not copy it.
 *
 * SSF.parse_date_code reads the serial as the calendar date Excel means, with
 * no timezone in the path at all.
 */
export function excelSerialToISO(v: unknown): string | null {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d || !d.y) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  return null;
}

/** Open the workbook the way these parsers require. */
export function readWorkbook(filePath: string): XLSX.WorkBook {
  // No cellDates — see excelSerialToISO.
  return XLSX.readFile(filePath);
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) {
    throw new Error(
      `Sheet "${name}" not found. Sheets present: ${wb.SheetNames.map((s) => JSON.stringify(s)).join(", ")}`,
    );
  }
  // blankrows: true so array index i maps to sheet row i+1. Compacting the
  // blanks away would make every `row` in a dry-run report point at the wrong
  // line of the workbook, which is worse than carrying ~880 empty arrays.
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: true });
}

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ── Sheet 1: Data Anak, Usia, Orang Tua ──────────────────────────────────

export type SantriRow = {
  no: number | null;
  /** "M1 IKHWAN YAUMI" etc. A label — never a placement; see kelas-kategori.ts. */
  kategori: string | null;
  kategoriParsed: KelasKategori | null;
  jenisKelamin: string | null;
  nama: string;
  namaBapak: string | null;
  namaIbu: string | null;
  /** ISO 'YYYY-MM-DD'. */
  tanggalLahir: string | null;
  /** 1-indexed sheet row, for dry-run reports. */
  row: number;
};

/**
 * Column A of this sheet is a blank spacer, so `!ref` starts at B and the
 * positional indices below are one to the left of the spreadsheet letters:
 * [0] No · [1] Kategori Kelas · [2] Jenis Kelamin · [3] Nama Anak ·
 * [4] Nama Bapak · [5] Nama Ibu · [6] Tanggal Lahir · [7] Usia · [8] status
 *
 * Index 7 ("Usia (2026)") is deliberately never read: it is a string that was
 * already stale when the file was saved. Age is derived from tanggalLahir at
 * read time — see lib/directory/usia.ts.
 */
export function parseSantri(wb: XLSX.WorkBook): SantriRow[] {
  const rows = sheetRows(wb, SHEET_SANTRI);
  const out: SantriRow[] = [];

  rows.forEach((r, i) => {
    const nama = str(r[3]);
    if (!nama) return; // header row and the ~880 trailing blanks
    if (norm(nama) === norm("Nama Anak")) return;

    const kategori = str(r[1]);
    out.push({
      no: num(r[0]),
      kategori,
      kategoriParsed: parseKelasKategori(kategori)[0] ?? null,
      jenisKelamin: str(r[2]),
      nama,
      namaBapak: str(r[4]),
      namaIbu: str(r[5]),
      tanggalLahir: excelSerialToISO(r[6]),
      row: i + 1,
    });
  });

  return out;
}

// ── Sheet 3: Data Wali Santri ────────────────────────────────────────────

export type WaliChildSlot = {
  /** 1..3 — which "Nama Anak N" column. An empty slot does not renumber later ones. */
  ordinal: number;
  nama: string;
};

export type WaliRow = {
  no: number | null;
  namaAyah: string | null;
  namaIbu: string | null;
  /** "Jumlah Anak" verbatim; one family disagrees with its own listed slots. */
  jumlahAnak: number | null;
  anak: WaliChildSlot[];
  row: number;
};

/**
 * [0] No · [1] Nama Ayah · [2] Nama Ibu · [3] Jumlah Anak · [4..6] Nama Anak 1..3
 *
 * Nothing past index 6 is read: column J of this sheet is a leftover helper
 * column of unrelated mother names that would otherwise look like a fourth child.
 */
export function parseWali(wb: XLSX.WorkBook): WaliRow[] {
  const rows = sheetRows(wb, SHEET_WALI);
  const out: WaliRow[] = [];

  rows.forEach((r, i) => {
    const namaAyah = str(r[1]);
    const namaIbu = str(r[2]);
    if (!namaAyah && !namaIbu) return; // blank spacer rows
    if (norm(namaAyah) === norm("Nama Ayah")) return; // header

    const anak: WaliChildSlot[] = [];
    for (let slot = 0; slot < 3; slot++) {
      const nama = str(r[4 + slot]);
      if (nama) anak.push({ ordinal: slot + 1, nama });
    }

    out.push({ no: num(r[0]), namaAyah, namaIbu, jumlahAnak: num(r[3]), anak, row: i + 1 });
  });

  return out;
}

// ── Sheet 4: Data Pengajar (two tables stacked in one sheet) ─────────────

export type PengajarPairing = {
  /** The class-name text this pairing came from, verbatim. */
  categoryRaw: string;
  kategori: KelasKategori;
  namaPengajar: string;
  /**
   * Which teacher-team within the category. The sheet continues a category on
   * the next row with a blank "No"/"Kategori Kelas" when a second team holds a
   * second halaqah of the same category; those rows are team 2.
   */
  groupOrdinal: number;
  row: number;
};

export type PengajarRow = {
  no: number | null;
  nama: string;
  /** "Tanggal Masuk" — column is empty in this revision of the workbook. */
  tanggalMasuk: string | null;
  /** "Status" — likewise empty. */
  status: string | null;
  row: number;
};

export type PengajarSheet = {
  pairings: PengajarPairing[];
  teachers: PengajarRow[];
  /** Category cells that could not be read. Reported by the caller, never guessed. */
  unmappedCategories: { raw: string; row: number }[];
};

/**
 * The sheet holds a class↔teacher table, then a second header row, then a flat
 * teacher roster.
 *
 * The split is found by looking for that second header rather than hard-coding
 * its row number, so inserting a class at the top does not silently truncate
 * the roster below it.
 */
export function parsePengajar(wb: XLSX.WorkBook): PengajarSheet {
  const rows = sheetRows(wb, SHEET_PENGAJAR);

  const splitAt = rows.findIndex(
    (r) => norm(r[1]) === norm("Nama Pengajar") && norm(r[2]) === norm("Tanggal Masuk"),
  );
  if (splitAt === -1) {
    throw new Error(
      `Second header row ("Nama Pengajar" / "Tanggal Masuk") not found in "${SHEET_PENGAJAR}".`,
    );
  }

  const pairings: PengajarPairing[] = [];
  const unmappedCategories: { raw: string; row: number }[] = [];

  // Table A. A blank category cell continues the category above it.
  let current: KelasKategori[] = [];
  let groupOrdinal = 0;

  rows.slice(0, splitAt).forEach((r, i) => {
    const row = i + 1;
    const categoryCell = str(r[1]);
    const teacherCell = str(r[2]);

    if (categoryCell) {
      if (norm(categoryCell) === norm("Kategori Kelas")) return; // header
      current = parseKelasKategori(categoryCell);
      groupOrdinal = 0;
      if (current.length === 0) unmappedCategories.push({ raw: categoryCell, row });
    }

    // A category row with no teacher (the sheet has one) contributes no team;
    // the teacher arriving on the next continuation row becomes team 1.
    if (!teacherCell || current.length === 0) return;

    groupOrdinal += 1;
    for (const nama of teacherCell.split(/\s*&\s*/)) {
      const trimmed = nama.trim();
      if (!trimmed) continue;
      for (const kategori of current) {
        pairings.push({
          categoryRaw: kategori.raw,
          kategori,
          namaPengajar: trimmed,
          groupOrdinal,
          row,
        });
      }
    }
  });

  // Table B — the flat roster.
  const teachers: PengajarRow[] = [];
  rows.slice(splitAt + 1).forEach((r, i) => {
    const nama = str(r[1]);
    if (!nama) return;
    teachers.push({
      no: num(r[0]),
      nama,
      tanggalMasuk: excelSerialToISO(r[2]) ?? str(r[2]),
      status: str(r[3]),
      row: splitAt + i + 2,
    });
  });

  return { pairings, teachers, unmappedCategories };
}
