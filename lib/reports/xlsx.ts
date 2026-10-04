import ExcelJS from "exceljs";
import type {
  ParticipantReport,
  TeacherReport,
  HitsMonthlyReport,
  HitsRow,
  ExitedParticipant,
} from "@/lib/reports/queries";
import {
  CHECKIN_ROWS,
  findCheckinSegment,
  segmentColumns,
  visibleStatusRows,
} from "@/lib/reports/participant-rows";
import { teacherPct } from "@/lib/reports/teacher-attendance";
import { genderLabel } from "@/lib/programs/config";
import {
  box,
  HEAD_FILL,
  TITLE_FILL,
  WARN_FILL,
  autoFilter,
  autoWidth,
  freezeHeader,
  headerRow,
  noteRow,
  numCell,
  pctCell,
  printSetup,
  textCell,
  zebra,
} from "@/lib/reports/xlsx-style";

// kba-xlsx.ts and hkm-bulanan-xlsx.ts stack their own layouts next to these
// reports and must not drift from the shared borders/fills, so the primitives
// stay reachable from here after the move into xlsx-style.
export { box, HEAD_FILL, TITLE_FILL };

export type MabniGuruAttendanceXlsxRow = {
  nama: string;
  hadir: number;
  telat: number;
  izin: number;
};

/** Zebra only pays off once the eye can lose its row. */
const ZEBRA_MIN_ROWS = 15;

/**
 * Repeat a whole title band on every printed page. `freezeHeader` repeats a
 * single row; the recap sheets carry programme + period across two rows and
 * page 2 is unreadable without both.
 */
function repeatRows(ws: ExcelJS.Worksheet, from: number, to: number) {
  ws.pageSetup = { ...(ws.pageSetup ?? {}), printTitlesRow: `${from}:${to}` };
}

/** Row index: a number, but centred — right-aligned it reads as a measurement. */
function idxCell(cell: ExcelJS.Cell, n: number) {
  cell.value = n;
  box(cell, { align: "center", wrap: false });
}

export function shortLevel(level: string | null): string {
  if (!level) return "-";
  if (/dasar/i.test(level)) return "Dasar";
  if (/lanjutan/i.test(level)) return "Lanjutan";
  return level.replace(/^HITS\s+/i, "");
}

export function tipeLabel(type: string | null): string {
  if (type === "offline") return "Offline";
  if (type === "online") return "Online";
  if (type === "hybrid") return "Hybrid";
  return "(tanpa tipe)";
}

const BUCKET_LABEL: Record<string, string> = {
  dikeluarkan: "Dikeluarkan",
  mengundurkan: "Mengundurkan diri / sakit / kerjaan",
  tidakAktif: "Tidak aktif",
  tidakAdaStatus: "Tidak ada status",
};

/**
 * "Peserta Keluar" sheet: one row per non-active participant with the reason
 * recorded upstream. Added to both participant workbooks so the counters in the
 * recap can be traced to actual people. Skipped when nobody has left.
 */
function addExitedSheet(
  wb: ExcelJS.Workbook,
  exited: ExitedParticipant[],
  showBatch: boolean,
  subtitle: string,
) {
  if (exited.length === 0) return;
  const ws = wb.addWorksheet("Peserta Keluar");
  const HEADERS = [
    "Nama",
    ...(showBatch ? ["Batch"] : []),
    "Halaqah",
    "Jenis",
    "Level",
    "Status",
    "Alasan",
    "Tanggal keluar",
    "Dalam periode laporan",
  ];
  const LAST = HEADERS.length;

  ws.mergeCells(1, 1, 1, LAST);
  ws.getCell(1, 1).value = `Peserta Keluar · ${subtitle}`;
  box(ws.getCell(1, 1), { bold: true, fill: TITLE_FILL });

  const first = headerRow(ws, 2, HEADERS);
  const reasonCol = HEADERS.indexOf("Alasan");
  exited.forEach((e, i) => {
    const r = first + i;
    textCell(ws.getCell(r, 1), e.name);
    let c = 2;
    if (showBatch) textCell(ws.getCell(r, c++), e.batchLabel, { align: "center" });
    textCell(ws.getCell(r, c++), e.halaqah);
    textCell(ws.getCell(r, c++), e.gender == null ? null : genderLabel(e.gender), { align: "center" });
    textCell(ws.getCell(r, c++), shortLevel(e.level), { align: "center" });
    textCell(ws.getCell(r, c++), BUCKET_LABEL[e.bucket] ?? e.bucket, { align: "center" });
    // Empty reason is a recorded fact upstream, not a missing source — it keeps
    // its own wording instead of collapsing into the "-" placeholder.
    textCell(ws.getCell(r, c++), e.reason?.trim() ? e.reason : "(tanpa alasan)");
    textCell(ws.getCell(r, c++), e.exitedAt, { align: "center" });
    textCell(ws.getCell(r, c), e.inPeriod ? "Ya" : "Tidak", { align: "center" });
  });

  const last = first + exited.length - 1;
  if (exited.length >= ZEBRA_MIN_ROWS) zebra(ws, first + 1, last, LAST);
  freezeHeader(ws, 2, { xSplit: 1 }); // the name column stays put when scrolling right
  autoFilter(ws, 2, LAST, last);
  printSetup(ws);
  repeatRows(ws, 1, 2);
  autoWidth(ws, { min: 9, max: 44 });
  // Reasons are free upstream text and routinely outrun the shared clamp; give
  // that one column extra room rather than widening every column to suit it.
  ws.getColumn(reasonCol + 1).width = 50;
  noteRow(
    ws,
    last + 2,
    LAST,
    'Sumber: status keanggotaan upstream. "Dalam periode laporan" = tanggal keluar jatuh di rentang laporan; ' +
      'peserta yang keluar sebelum periode tetap ditampilkan agar angka rekap bisa ditelusuri. "-" = data tidak tersedia.',
  );
}

function jenisLabel(jenis: string | null): string {
  if (jenis === "yaumi") return "Yaumi (harian)";
  if (jenis === "usbui") return "Usbu'iy (pekanan)";
  return "(tanpa jenis pertemuan)";
}

/** Participant recap — status buckets × (gender × level), matching the HITS format. */
export function buildParticipantWorkbook(
  rep: ParticipantReport,
  exited: ExitedParticipant[] = [],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Laporan Peserta");

  // Mabni runs yaumi and usbu'iy halaqah under the same level names, so the
  // recap gets one table per cadence instead of one merged table. Every other
  // program has a single cadence (byJenis empty) and keeps the old single table.
  const groups: { jenis: string | null; segs: ParticipantReport["segments"] }[] =
    rep.byJenis.length > 1
      ? rep.byJenis.map((j) => ({
          jenis: j.jenis,
          segs: rep.segments.filter((s) => s.jenis === j.jenis),
        }))
      : [{ jenis: null, segs: rep.segments }];

  // Column order = the order the report handed the segments over, which is the
  // order the screen renders them in. It used to be re-sorted here (gender
  // descending, so Akhwat first) and the export read backwards against the page.
  const colsOf = segmentColumns;

  // Sheet width = the widest table, so full-width banners span every group.
  const nCols = 2 + Math.max(...groups.map((g) => colsOf(g.segs).cols.length));
  const lastColL = ws.getColumn(nCols).letter;

  // Title
  ws.mergeCells(`A1:${lastColL}1`);
  const t = ws.getCell("A1");
  t.value = `Laporan Bulanan Peserta — ${rep.programName}`;
  box(t, { bold: true, fill: TITLE_FILL });
  ws.mergeCells(`A2:${lastColL}2`);
  const p = ws.getCell("A2");
  p.value = `Periode ${rep.start} s/d ${rep.end}`;
  box(p, {});

  /** One bordered status table; returns the row after it. */
  function writeGroup(
    group: { jenis: string | null; segs: ParticipantReport["segments"] },
    startRow: number,
    labelled: boolean,
  ): number {
    const { genders, cols } = colsOf(group.segs);
    const seg = (g: number | null, lv: string | null) =>
      group.segs.find((s) => s.gender === g && s.level === lv);
    let r = startRow;

    if (labelled) {
      ws.mergeCells(`A${r}:${lastColL}${r}`);
      ws.getCell(r, 1).value = jenisLabel(group.jenis).toUpperCase();
      box(ws.getCell(r, 1), { bold: true, fill: TITLE_FILL });
      r++;
    }

    // Header: first row = No | Status Peserta | gender groups (merged);
    // second row = level labels.
    ws.mergeCells(`A${r}:A${r + 1}`);
    box(ws.getCell(r, 1), { bold: true, fill: HEAD_FILL });
    ws.getCell(r, 1).value = "No";
    ws.mergeCells(`B${r}:B${r + 1}`);
    box(ws.getCell(r, 2), { bold: true, fill: HEAD_FILL });
    ws.getCell(r, 2).value = "Status Peserta";

    let c = 3;
    for (const g of genders) {
      const gc = cols.filter((x) => x.gender === g).length;
      const startCol = ws.getColumn(c).letter;
      const endCol = ws.getColumn(c + gc - 1).letter;
      ws.mergeCells(`${startCol}${r}:${endCol}${r}`);
      const gcell = ws.getCell(`${startCol}${r}`);
      gcell.value = genderLabel(g).toUpperCase();
      box(gcell, { bold: true, fill: HEAD_FILL });
      c += gc;
    }
    cols.forEach((col, i) => {
      const cell = ws.getCell(r + 1, 3 + i);
      cell.value = shortLevel(col.level);
      box(cell, { bold: true, fill: HEAD_FILL });
    });
    r += 2;

    // A status bucket that is zero in every column of THIS table is dropped, the
    // rule ParticipantStatusTable applies on screen. The "No" column then counts
    // the rows that actually print: it is a row index (see idxCell), not a code
    // for the bucket — the label is what identifies a line — and a sheet numbered
    // 1,2,3,8,9,10 with four gaps reads as a damaged file, not as a stable form.
    const rows = visibleStatusRows(group.segs);
    let no = 0;
    for (const row of rows) {
      no += 1;
      idxCell(ws.getCell(r, 1), no);
      textCell(ws.getCell(r, 2), row.label);
      cols.forEach((col, i) => {
        const cell = ws.getCell(r, 3 + i);
        const v = row.get(seg(col.gender, col.level));
        if (row.pct) pctCell(cell, v);
        else numCell(cell, v);
      });
      r++;
    }
    // Teacher check-in (mabni only), in guru-days — see GuruCheckinBlock.
    // Resolved from the COLUMN's own segment, exactly as the screen does: the
    // group's jenis is null for every single-cadence report (queries.ts empties
    // `byJenis` then) while the segments still carry "yaumi"/"usbui", and the old
    // `x.jenis === group.jenis` match blanked all three rows.
    if (rep.guruCheckin) {
      for (const [label, get] of CHECKIN_ROWS) {
        no += 1;
        idxCell(ws.getCell(r, 1), no);
        textCell(ws.getCell(r, 2), label);
        cols.forEach((col, i) => {
          const cs = findCheckinSegment(rep.guruCheckin, seg(col.gender, col.level));
          numCell(ws.getCell(r, 3 + i), cs ? get(cs) : null);
        });
        r++;
      }
    }
    // Total row (participant counts)
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(r, 1).value = "Total";
    box(ws.getCell(r, 1), { bold: true, fill: HEAD_FILL });
    cols.forEach((col, i) => {
      const s = seg(col.gender, col.level);
      numCell(ws.getCell(r, 3 + i), s?.total ?? 0, { bold: true, fill: HEAD_FILL });
    });
    return r + 1;
  }

  const labelled = groups.length > 1;
  let r = 3;
  groups.forEach((group, i) => {
    if (i > 0) r += 1; // blank row between cadence tables
    r = writeGroup(group, r, labelled);
  });
  r += 1;

  // Observed totals
  ws.mergeCells(`A${r}:${lastColL}${r}`);
  ws.getCell(r, 1).value = "TOTAL";
  box(ws.getCell(r, 1), { bold: true, fill: TITLE_FILL });
  r++;
  const obs: [string, number | null, boolean][] = [
    ["Keaktifan peserta (rata² kehadiran periode)", rep.total.keaktifanPct, true],
    ["Peserta Aktif", rep.total.aktif, false],
    ["Total Peserta Terdaftar", rep.total.total, false],
  ];
  for (const [k, v, isPct] of obs) {
    ws.getCell(r, 1).value = k;
    ws.mergeCells(`A${r}:B${r}`);
    box(ws.getCell(r, 1), { align: "left" });
    if (nCols > 3) ws.mergeCells(r, 3, r, nCols); // (top,left,bottom,right)
    if (isPct) pctCell(ws.getCell(r, 3), v, { bold: true });
    else numCell(ws.getCell(r, 3), v, { bold: true });
    r++;
  }

  /**
   * A banner + "label | kehadiran | aktif | total" block, closed by a bold
   * Gabungan line. Label spans A:B (the status-label column pair), values C/D/E.
   */
  function writeSplitBlock(
    banner: string,
    labelHead: string,
    lines: [string, number | null, number, number][],
    startRow: number,
    valueHeads: string[] = ["Rata² kehadiran", "Peserta aktif", "Total peserta"],
  ): number {
    let r2 = startRow + 1;
    ws.mergeCells(`A${r2}:${lastColL}${r2}`);
    ws.getCell(r2, 1).value = banner;
    box(ws.getCell(r2, 1), { bold: true, fill: TITLE_FILL });
    r2++;
    ws.mergeCells(`A${r2}:B${r2}`);
    ws.getCell(r2, 1).value = labelHead;
    box(ws.getCell(r2, 1), { bold: true, fill: HEAD_FILL, align: "left" });
    headerRow(ws, r2, valueHeads, { startCol: 3 });
    r2++;
    const all: [string, number | null, number, number][] = [
      ...lines,
      ["Gabungan", rep.total.keaktifanPct, rep.total.aktif, rep.total.total],
    ];
    all.forEach(([label, pct, aktif, total], i) => {
      const last = i === all.length - 1; // Gabungan
      ws.mergeCells(`A${r2}:B${r2}`);
      ws.getCell(r2, 1).value = label;
      box(ws.getCell(r2, 1), { align: "left", bold: last });
      pctCell(ws.getCell(r2, 3), pct, { bold: last, ...(last ? { fill: HEAD_FILL } : {}) });
      numCell(ws.getCell(r2, 4), aktif, { bold: last, ...(last ? { fill: HEAD_FILL } : {}) });
      numCell(ws.getCell(r2, 5), total, { bold: last, ...(last ? { fill: HEAD_FILL } : {}) });
      r2++;
    });
    return r2;
  }

  // Split by meeting cadence — yaumi, usbu'iy, then combined (mabni only).
  if (rep.byJenis.length > 1) {
    r = writeSplitBlock(
      "RATA² KEHADIRAN PER JENIS PERTEMUAN",
      "Jenis pertemuan",
      rep.byJenis.map(
        (j) => [jenisLabel(j.jenis), j.kehadiranPct, j.aktif, j.total] as [string, number | null, number, number],
      ),
      r,
    );
  }

  // Split by halaqah type — offline, online, then combined. Only for programs
  // that actually mix types (byType is empty otherwise).
  if (rep.byType.length > 1) {
    r = writeSplitBlock(
      "RATA² KEHADIRAN PER TIPE HALAQAH",
      "Tipe halaqah",
      rep.byType.map(
        (t) => [tipeLabel(t.type), t.kehadiranPct, t.aktif, t.total] as [string, number | null, number, number],
      ),
      r,
    );
  }

  // Combined scope: each batch's own totals, so the merged figure stays readable.
  if (rep.perBatch.length > 0) {
    r = writeSplitBlock(
      "RINCIAN PER BATCH",
      "Batch",
      rep.perBatch.map(
        (b) =>
          [b.label, b.figures.keaktifanPct, b.figures.aktif, b.figures.total] as [
            string,
            number | null,
            number,
            number,
          ],
      ),
      r,
      // Same figures as the blocks above, but the per-batch block has always
      // headed its last column "Total terdaftar" — coordinators read that word.
      ["Rata² kehadiran", "Peserta aktif", "Total terdaftar"],
    );
  }

  noteRow(
    ws,
    r + 1,
    nCols,
    'Kehadiran peserta = hadir ÷ pertemuan efektif dalam periode. ' +
      'Kehadiran pengajar = pertemuan diajar ÷ terjadwal, dipotong sampai hari ini. ' +
      'Baris check-in (hari efektif/terlambat/alpa) dalam satuan hari-guru dan hanya menghitung hari yang terekam upstream. ' +
      'Keaktifan peserta = rata² kehadiran ' +
      'seluruh peserta pada periode. Baris status yang nol di semua kolom tabel tidak dicetak (sama dengan tampilan layar), ' +
      'jadi nomor pada kolom No mengikuti baris yang tercetak dan bisa berbeda antar tabel. ' +
      'Kolom persen berisi angka (format 0,00%) agar bisa diurutkan dan dipivot; ' +
      '"-" berarti tidak ada data sumber — berbeda dari 0.',
  );

  freezeHeader(ws, 2);
  printSetup(ws);
  repeatRows(ws, 1, 2);
  // Recap block layout: no autofilter (it would slice the stacked tables), and
  // no zebra (the merged banners already break the sheet into readable bands).
  autoWidth(ws, { min: 5, max: 38 });
  addExitedSheet(wb, exited, rep.perBatch.length > 0, `${rep.programName} · ${rep.start} s/d ${rep.end}`);
  return wb;
}

/**
 * HITS coordinator recap — one bordered table per (halaqah type × level) with
 * Ikhwan/Akhwat rows and a Total, then a KESELURUHAN table for the program.
 * Mirrors the sheet the coordinators already circulate.
 */
export function buildHitsMonthlyWorkbook(
  rep: HitsMonthlyReport,
  exited: ExitedParticipant[] = [],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Laporan Bulanan");
  const HEADERS = [
    "No",
    "Peserta",
    "Peserta aktif",
    "Kehadiran Peserta",
    "Peserta Keluar",
    "Keberlangsungan Kelas",
    "Kehadiran Pengajar",
    "Absensi pengajar Di bawah Target",
  ];
  const LAST = HEADERS.length; // 8
  const lastColL = ws.getColumn(LAST).letter;

  ws.mergeCells(`A1:${lastColL}1`);
  ws.getCell("A1").value = rep.programName.toUpperCase();
  box(ws.getCell("A1"), { bold: true, fill: TITLE_FILL });
  ws.mergeCells(`A2:${lastColL}2`);
  ws.getCell("A2").value = `Periode ${rep.start} s/d ${rep.end} · ambang pengajar ${rep.thresholdPct}%`;
  box(ws.getCell("A2"), {});

  let r = 4;
  /**
   * One bordered block. `rowLabel` names the second column — gender by default,
   * overridden by the per-batch block where each row is a batch, not a gender.
   */
  const writeTable = (
    title: string,
    rows: HitsRow[],
    total: HitsRow,
    opts: { rowLabel?: (row: HitsRow, i: number) => string; totalLabel?: string } = {},
  ) => {
    ws.mergeCells(`A${r}:${lastColL}${r}`);
    ws.getCell(r, 1).value = title;
    box(ws.getCell(r, 1), { bold: true, fill: TITLE_FILL, align: "left" });
    r++;
    r = headerRow(ws, r, HEADERS);
    /** Body/total line — the two share every column but their emphasis. */
    const writeLine = (label: string, row: HitsRow, no: number | null, emph: boolean) => {
      const fill = emph ? HEAD_FILL : undefined;
      if (no == null) box(ws.getCell(r, 1), { fill: HEAD_FILL });
      else idxCell(ws.getCell(r, 1), no);
      textCell(ws.getCell(r, 2), label, { bold: emph, fill });
      numCell(ws.getCell(r, 3), row.aktif, { bold: emph, fill });
      pctCell(ws.getCell(r, 4), row.kehadiranPct, { bold: emph, fill });
      numCell(ws.getCell(r, 5), row.keluar, { bold: emph, fill });
      pctCell(ws.getCell(r, 6), row.keberlangsunganPct, { bold: emph, fill });
      pctCell(ws.getCell(r, 7), teacherPct(row.teacherReal, row.teacherIdeal), { bold: emph, fill });
      // Amber only when there is something to chase; a filled total row keeps
      // its own fill so the warning never hides the row banding.
      numCell(ws.getCell(r, 8), row.pengajarDiBawahTarget, {
        bold: emph,
        fill: row.pengajarDiBawahTarget > 0 && !emph ? WARN_FILL : fill,
      });
      r++;
    };
    rows.forEach((row, i) => {
      // gender is null for halaqah with no enrolled peserta to read it from
      const label = opts.rowLabel
        ? opts.rowLabel(row, i)
        : row.gender == null
          ? "(tanpa peserta terdaftar)"
          : genderLabel(row.gender);
      writeLine(label, row, i + 1, false);
    });
    writeLine(opts.totalLabel ?? "Total", total, null, true);
    r += 1; // one blank row before the next block
  };

  for (const b of rep.blocks) {
    writeTable(`${tipeLabel(b.type)} · ${shortLevel(b.level)}`, b.rows, b.total);
  }
  // No gender rows on the closing block — it is the program-wide figure itself.
  writeTable("KESELURUHAN", [], rep.overall);

  // Combined scope: each batch's KESELURUHAN, reusing the same column layout so
  // the sheet reads as one table stack. Rows are batches here, not genders.
  if (rep.perBatch.length > 0) {
    writeTable(
      "RINCIAN PER BATCH",
      rep.perBatch.map((b) => b.figures),
      rep.overall,
      { rowLabel: (_row, i) => rep.perBatch[i].label, totalLabel: "Gabungan" },
    );
  }

  noteRow(
    ws,
    r,
    LAST,
    `Peserta aktif dihitung pada akhir periode. Kehadiran Peserta = hadir ÷ pertemuan efektif. ` +
      `Keberlangsungan = pertemuan terlaksana ÷ terjadwal. ` +
      `Kehadiran Pengajar = pertemuan diajar ÷ terjadwal, dipotong sampai hari ini. ` +
      `Kolom "Absensi pengajar Di bawah Target" mencacah pengajar (bukan pertemuan) dengan rasio mengajar di bawah ${rep.thresholdPct}%, ` +
      `masing-masing sekali — Total bisa lebih kecil dari jumlah barisnya; sel bertanda kuning = ada pengajar di bawah ambang. ` +
      `Kolom persen berisi angka (format 0,00%); "-" berarti tidak ada data sumber — berbeda dari 0.`,
  );

  freezeHeader(ws, 2);
  printSetup(ws);
  repeatRows(ws, 1, 2);
  // Stacked recap tables: an autofilter would only see the first block, so none.
  autoWidth(ws, { min: 6, max: 24 });
  addExitedSheet(wb, exited, rep.perBatch.length > 0, `${rep.programName} · ${rep.start} s/d ${rep.end}`);
  return wb;
}

/** Program display name → cluster label for the honor recap. */
function klaster(program: string): string {
  const p = program.toLowerCase();
  if (p.includes("nurul iman")) return "NURIM";
  if (p.includes("dpq")) return "DPQ";
  if (p.includes("rabbaniyah") || p.includes("mabni")) return "MABNI";
  if (p.includes("hits")) return "HITS";
  return program;
}

/**
 * Teacher honor recap — one row per (pengajar × halaqah), sorted by name:
 * NAMA PEMILIK REKENING · PROGRAM · KLASTER PROGRAM · JUMLAH PERTEMUAN, where
 * jumlah = jumlah mengajar (system-recorded + all teacher claims).
 */
export function buildTeacherWorkbook(
  rep: TeacherReport,
  mabniAttendance: MabniGuruAttendanceXlsxRow[] = [],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Honor Pengajar");
  const HEADERS = ["NAMA PEMILIK REKENING", "PROGRAM", "KLASTER PROGRAM", "JUMLAH PERTEMUAN"];
  const LAST_COL = HEADERS.length; // 4

  ws.mergeCells(1, 1, 1, LAST_COL);
  box(ws.getCell("A1"), { bold: true, fill: TITLE_FILL });
  ws.getCell("A1").value = `Rekap Jumlah Pertemuan Pengajar · Periode ${rep.start} s/d ${rep.end} · Jumlah = mengajar (terekam + klaim)`;

  const first = headerRow(ws, 2, HEADERS);

  const rows: { nama: string; program: string; klaster: string; jumlah: number }[] = [];
  for (const t of rep.teachers) {
    for (const h of t.halaqah) {
      rows.push({
        nama: t.pengajar,
        program: h.program,
        klaster: klaster(h.program),
        jumlah: h.real + h.confirmedTaught + h.taughtNotInput,
      });
    }
  }
  rows.sort(
    (a, b) => a.nama.localeCompare(b.nama, "id") || a.program.localeCompare(b.program, "id"),
  );

  rows.forEach((row, i) => {
    const r = first + i;
    textCell(ws.getCell(r, 1), row.nama);
    textCell(ws.getCell(r, 2), row.program);
    textCell(ws.getCell(r, 3), row.klaster);
    numCell(ws.getCell(r, 4), row.jumlah);
  });

  const last = first + rows.length - 1;
  if (rows.length >= ZEBRA_MIN_ROWS) zebra(ws, first + 1, last, LAST_COL);
  freezeHeader(ws, 2, { xSplit: 1 }); // pay-out lists get read name-first
  autoFilter(ws, 2, LAST_COL, last);
  printSetup(ws, { landscape: false }); // four columns — portrait wastes no width
  repeatRows(ws, 1, 2);
  autoWidth(ws, { min: 10, max: 40 });
  noteRow(
    ws,
    last + 2,
    LAST_COL,
    "Satu baris per pengajar × halaqah — seorang pengajar yang memegang dua halaqah muncul dua kali. " +
      "Jumlah pertemuan = pertemuan terekam sistem + klaim pengajar; badal dihitung ke pengajar pengganti, bukan pemilik halaqah.",
  );

  if (mabniAttendance.length) {
    const aws = wb.addWorksheet("Kehadiran Boarding Teacher");
    const AH = ["NAMA PENGAJAR", "HADIR", "TELAT", "IZIN"];
    aws.mergeCells(1, 1, 1, AH.length);
    box(aws.getCell("A1"), { bold: true, fill: TITLE_FILL });
    aws.getCell("A1").value = `Kehadiran Pengajar Madrasah Nusantara · Periode ${rep.start} s/d ${rep.end} · sumber presensi guru (check-in harian)`;
    const aFirst = headerRow(aws, 2, AH);
    const sorted = [...mabniAttendance].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    sorted.forEach((row, i) => {
      const r = aFirst + i;
      textCell(aws.getCell(r, 1), row.nama);
      numCell(aws.getCell(r, 2), row.hadir);
      numCell(aws.getCell(r, 3), row.telat);
      numCell(aws.getCell(r, 4), row.izin);
    });
    const aLast = aFirst + sorted.length - 1;
    if (sorted.length >= ZEBRA_MIN_ROWS) zebra(aws, aFirst + 1, aLast, AH.length);
    freezeHeader(aws, 2, { xSplit: 1 });
    autoFilter(aws, 2, AH.length, aLast);
    printSetup(aws, { landscape: false });
    repeatRows(aws, 1, 2);
    autoWidth(aws, { min: 9, max: 40 });
    noteRow(
      aws,
      aLast + 2,
      AH.length,
      "Hadir / telat / izin = jumlah hari check-in presensi guru pada periode, bukan jumlah pertemuan halaqah. " +
        "Pengajar tanpa satu pun check-in tidak muncul di daftar ini.",
    );
  }

  return wb;
}
