/**
 * The Maahir monthly workbook. Eight sheets, read in this order:
 *
 *   Ringkasan             — the three blocks of `rekap/laporan-maahir` as one
 *                           metric table, plus WHERE each sheet's numbers came
 *                           from, for WHICH WINDOW, and when they were fetched.
 *   Kehadiran per Kelas   — the 22 class grids collapsed to one row each, then
 *                           the members every block flagged as di bawah target.
 *   At-Tibyan             — KPI, ranking, trend, distribusi, daftar perhatian.
 *   SP                    — the CUMULATIVE list, printed next to the per-period
 *                           summary so the two windows can't be confused.
 *   Presensi Belum Diisi  — one row per class-and-date still empty.
 *   Matrix Guru           — the 14-indicator scorecard, as SNAPSHOTTED.
 *   Disiplin Pengajar     — the HITS discipline recap, over a CALENDAR month.
 *   Shakwa                — the ticket queue, over a WIB day range.
 *
 * Layout only: the numbers arrive already shaped from lib/reports/maahir-bulanan.ts,
 * and every visual primitive comes from lib/reports/xlsx-style.ts so this book
 * looks like the others (percentages stay sortable fractions, headers freeze and
 * repeat on print, "-" means "no source" while 0 means measured zero).
 *
 * Two rules this file must not lose:
 *
 *   1. A section with no cached row prints its REASON where the table would be.
 *      An empty Maahir sheet full of zeroes reads as "nobody attended", which is
 *      a different — and false — statement. Same for a scorecard: a blank
 *      indicator is "belum dinilai", and printing 0.00 there accuses a teacher.
 *   2. EVERY SHEET LABELS ITSELF FROM ITS OWN `meta`. Three definitions of
 *      "bulan" share this file — 28→27 for the Maahir reports, the full calendar
 *      month for `hits-disiplin`, a WIB day range for `shakwa`, plus a snapshot
 *      that is not a window at all and a cumulative SP count that has no period.
 *      `data.periode` is the Maahir report window ONLY and is never printed on
 *      the last three sheets; each takes `sumber(...).periode` and states its
 *      window in words underneath.
 */
import ExcelJS from "exceljs";
import {
  kosongSeluruhnya,
  sumber,
  type MaahirBulanan,
  type MaahirSumber,
  type MaahirTargetRow,
} from "./maahir-bulanan";
import type {
  MaahirDisiplinRanked,
  MaahirGender,
  MaahirMatrixSkor,
  MaahirSpSummary,
} from "@/lib/maahir/types";
import { JAKARTA_OFFSET_MS } from "@/lib/time/jakarta";
import {
  DASH,
  NUM_FMT,
  TITLE_FILL,
  WARN_FILL,
  autoFilter,
  autoWidth,
  box,
  freezeHeader,
  headerRow,
  noteRow,
  numCell,
  pctCell,
  printSetup,
  textCell,
} from "./xlsx-style";

const GENDER_LABEL: Record<MaahirGender, string> = { ikhwan: "Ikhwan", akhwat: "Akhwat" };

/** "2026-09-03 15:21 WIB" — the server may run in UTC, the reader never does. */
function waktuWib(d: Date | null): string {
  if (!d) return DASH;
  const s = new Date(d.getTime() + JAKARTA_OFFSET_MS).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} WIB`;
}

/** Same, for the ISO timestamps upstream sends inside a payload. Parsed, not
 *  sliced: those are real UTC instants and 00:46Z is the previous day in WIB. */
function waktuWibIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : waktuWib(new Date(t));
}

/** "2026-08-01" → "1 Agu 2026", without `new Date()` shifting the day westward. */
const TANGGAL_BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
function tanggalPanjang(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${Number(m[3])} ${TANGGAL_BULAN[idx]} ${m[1]}`;
}

/** Title band + subtitle lines. Returns the next free row. */
function titleBand(ws: ExcelJS.Worksheet, cols: number, title: string, subtitle: string[]): number {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 13 };
  t.alignment = { vertical: "middle", horizontal: "left" };
  t.fill = TITLE_FILL;
  ws.getRow(1).height = 22;
  let row = 2;
  for (const line of subtitle) {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value = line;
    c.font = { size: 10, color: { argb: "FF444444" } };
    c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    row++;
  }
  return row + 1; // one blank row before the first table
}

/** Bold merged caption for a block inside a sheet. Returns the next row. */
function blockTitle(ws: ExcelJS.Worksheet, row: number, cols: number, text: string): number {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 11 };
  c.alignment = { vertical: "middle", horizontal: "left" };
  return row + 1;
}

/**
 * What a section prints INSTEAD of a table when its route was never pulled.
 * Amber and merged so nobody mistakes the gap for "measured zero".
 */
function belumDitarik(ws: ExcelJS.Worksheet, row: number, cols: number, s: MaahirSumber): number {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = `DATA BELUM DITARIK — ${s.label} (${s.route})`;
  box(c, { bold: true, fill: WARN_FILL, align: "left" });
  return noteRow(ws, row + 1, cols, s.alasan ?? "Tidak ada baris tersimpan untuk periode ini.");
}

/** The provenance line every sheet carries under its title. */
function sumberSubtitle(s: MaahirSumber): string {
  if (s.status === "belum-ditarik") return `Sumber: ${s.route} — BELUM DITARIK.`;
  const cache =
    s.dariCache === true
      ? ` · dilayani dari cache upstream (umur ${s.umurDetik ?? 0} detik saat ditarik)`
      : "";
  return `Sumber: ${s.route} · periode ${s.periode ?? "kumulatif"} · terakhir ditarik ${waktuWib(s.fetchedAt)}${cache}`;
}

const PERIODE_NOTE =
  'Periode Maahir adalah 28→27, bukan kalender bulan, dan sesi "sakit" dikeluarkan dari penyebut kehadiran ' +
  "(aturan upstream, docs/API-PUBLIC.md §9). Semua label periode di berkas ini diambil dari respons API, " +
  "bukan diturunkan dari nama bulan.";

/**
 * Berkas ini memuat LIMA definisi "bulan" sekaligus. Kalimat ini dicetak di
 * sheet Ringkasan supaya pembaca tahu sebelum membandingkan dua angka.
 */
const JENDELA_NOTE =
  'PERHATIAN — satu berkas, lima definisi "bulan": laporan/kehadiran/At-Tibyan memakai jendela Maahir 28→27; ' +
  "Disiplin Pengajar memakai kalender penuh (1 s.d. awal bulan berikutnya); Matrix Guru adalah snapshot rapor " +
  "satu bulan kalender (bukan jendela); SP kumulatif sejak awal program; Shakwa memotong hari menurut WIB. " +
  'Kolom "Jendela" di tabel Sumber data menyebutkan yang mana untuk tiap route. Angka dari dua jendela berbeda ' +
  "tidak boleh dijumlahkan atau diselisihkan.";

/** Judul-baris periode untuk sheet yang jendelanya BUKAN jendela Maahir 28→27:
 *  selalu dari meta route-nya sendiri, tidak pernah dari `data.periode`. */
function periodeSendiri(s: MaahirSumber, dibuatPada: string): string {
  return `Periode menurut ${s.route}: ${s.periode ?? "tidak tercatat di meta respons"} · dibuat ${dibuatPada}`;
}

/** Kalimat jendela per sheet. Dua sheet bisa mencetak label tanggal yang persis
 *  sama dan tetap berbeda maknanya; baris ini yang membedakannya. */
function jendelaNote(s: MaahirSumber): string {
  return (
    `JENDELA SHEET INI: ${s.jendela}. Label periode di atas diambil dari meta respons ${s.route} — ` +
    "bukan dari nama bulan, dan bukan dari periode sheet lain di berkas ini."
  );
}

// ── Sheet: Ringkasan ────────────────────────────────────────────────────────

function sheetRingkasan(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("Ringkasan");
  const cols = 6;
  const s = sumber(data, "rekap/laporan-maahir");

  let row = titleBand(ws, cols, "LAPORAN BULANAN MAAHIR", [
    `Periode ${data.periode ?? "belum diketahui (belum ada data yang ditarik)"} · dibuat ${data.dibuatPada}`,
    sumberSubtitle(s),
    PERIODE_NOTE,
    JENDELA_NOTE,
  ]);

  if (!data.ringkasan) {
    row = belumDitarik(ws, row, cols, s) + 1;
  } else {
    const headerAt = row;
    row = headerRow(ws, row, ["Metrik", "Takhassus", "Kelas Maahir", "At-Tibyan", "Catatan"]);
    for (const b of data.ringkasan.baris) {
      textCell(ws.getCell(row, 1), b.metrik, { bold: !b.metrik.startsWith("—") });
      const vals = [b.takhassus, b.maahir, b.atTibyan];
      vals.forEach((v, i) => {
        const cell = ws.getCell(row, 2 + i);
        if (b.satuan === "persen") pctCell(cell, v);
        else numCell(cell, v);
      });
      textCell(ws.getCell(row, 5), b.catatan);
      row++;
    }
    freezeHeader(ws, headerAt, { xSplit: 1 });
    row = noteRow(
      ws,
      row + 1,
      cols,
      `"${DASH}" berarti blok itu memang tidak melaporkan metrik tersebut — bukan nol. Daftar nama anggota di bawah target ada di sheet "Kehadiran per Kelas".`,
    );

    if (data.ringkasan.notes.length > 0) {
      row = blockTitle(ws, row + 1, cols, "Catatan koordinator");
      for (const n of data.ringkasan.notes) {
        row = noteRow(ws, row, cols, n.teks?.trim() ? n.teks : DASH);
      }
    }
    row += 1;
  }

  // Provenance for the WHOLE workbook: which routes answered, which did not.
  row = blockTitle(ws, row, cols, "Sumber data");
  row = headerRow(ws, row, [
    "Route", "Isi", "Status", "Periode (dari meta)", "Jendela (definisi bulan)", "Terakhir ditarik",
  ]);
  for (const src of data.sumber) {
    const fill = src.status === "belum-ditarik" ? WARN_FILL : undefined;
    textCell(ws.getCell(row, 1), src.route, fill ? { fill } : {});
    textCell(ws.getCell(row, 2), src.label, fill ? { fill } : {});
    textCell(ws.getCell(row, 3), src.status === "ada" ? "Tersedia" : "Belum ditarik", {
      align: "center",
      ...(fill ? { fill } : {}),
    });
    textCell(ws.getCell(row, 4), src.periode ?? (src.route === "rekap/sp" ? "kumulatif" : null), {
      align: "center",
      ...(fill ? { fill } : {}),
    });
    // The column that stops "28 Jul – 27 Agu" and "1 Agu – 1 Sep" being read as
    // two takes on the same month.
    textCell(ws.getCell(row, 5), src.jendela, fill ? { fill } : {});
    textCell(ws.getCell(row, 6), waktuWib(src.fetchedAt), { align: "center", ...(fill ? { fill } : {}) });
    row++;
  }

  noteRow(
    ws,
    row + 1,
    cols,
    "Angka disalin apa adanya dari lapisan rekap Maahir dan tidak dihitung ulang di sisi dashboard, supaya tidak menyimpang dari layar koordinator Maahir.",
  );

  printSetup(ws);
  autoWidth(ws, { min: 10, max: 60 });
  ws.getColumn(1).width = 32;
  ws.getColumn(5).width = 46;
  ws.getColumn(6).width = 22;
}

// ── Sheet: Kehadiran per Kelas ──────────────────────────────────────────────

const KELAS_HEADERS = [
  "Kelas", "Gender", "Program", "Jadwal", "Anggota", "Pertemuan", "Sesi", "Sesi terisi",
  "Belum diisi", "H", "I", "S", "A", "T", "% hadir rata-rata", "Anggota tanpa data",
];

function sheetKehadiran(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("Kehadiran per Kelas");
  const cols = KELAS_HEADERS.length;
  const s = sumber(data, "rekap/kehadiran");

  let row = titleBand(ws, cols, "KEHADIRAN PER KELAS — MAAHIR", [
    `Periode ${data.periode ?? DASH} · dibuat ${data.dibuatPada}`,
    sumberSubtitle(s),
    '"% hadir rata-rata" = rata-rata persen tiap anggota kelas itu (penyebutnya sudah dipotong upstream untuk anggota yang bergabung di tengah periode). Kolomnya kosong bila belum ada satu pun anggota yang punya nilai — bukan 0%.',
    'Kolom "Belum diisi" dihitung upstream pada route kehadiran; sheet "Presensi Belum Diisi" berasal dari route laporan. Untuk periode ini kedua angka tidak selalu sama per kelas — masing-masing dipakai apa adanya dan tidak dijumlahkan.',
  ]);

  if (!data.kehadiran) {
    row = belumDitarik(ws, row, cols, s);
  } else {
    const headerAt = row;
    row = headerRow(ws, row, KELAS_HEADERS);
    for (const k of data.kehadiran) {
      textCell(ws.getCell(row, 1), k.kelasName, { bold: true });
      textCell(ws.getCell(row, 2), GENDER_LABEL[k.gender], { align: "center" });
      textCell(ws.getCell(row, 3), k.program);
      textCell(ws.getCell(row, 4), k.jadwalHari);
      numCell(ws.getCell(row, 5), k.anggota);
      numCell(ws.getCell(row, 6), k.pertemuan);
      numCell(ws.getCell(row, 7), k.sesi);
      numCell(ws.getCell(row, 8), k.sesiTerisi);
      // The one column a coordinator acts on — amber when there is work to do.
      numCell(ws.getCell(row, 9), k.belumDiisi, k.belumDiisi > 0 ? { fill: WARN_FILL } : {});
      numCell(ws.getCell(row, 10), k.counts.H);
      numCell(ws.getCell(row, 11), k.counts.I);
      numCell(ws.getCell(row, 12), k.counts.S);
      numCell(ws.getCell(row, 13), k.counts.A);
      numCell(ws.getCell(row, 14), k.counts.T);
      pctCell(ws.getCell(row, 15), k.persenRata);
      numCell(ws.getCell(row, 16), k.anggotaTanpaData);
      row++;
    }
    autoFilter(ws, headerAt, cols, row - 1);
    freezeHeader(ws, headerAt, { xSplit: 1 });
    row += 1;
  }

  row = blockTitle(ws, row, cols, "Anggota di bawah target");
  const target = sumber(data, "rekap/laporan-maahir");
  if (!data.ringkasan) {
    belumDitarik(ws, row, cols, target);
  } else {
    row = noteRow(ws, row, cols, sumberSubtitle(target));
    row = headerRow(ws, row, [
      "Blok", "Nama", "Kelas", "Gender", "% hadir", "H", "I", "S", "A", "T",
      "Sesi terisi", "Tidak hadir", "Bergabung",
    ]);
    if (data.ringkasan.dibawahTarget.length === 0) {
      noteRow(ws, row, cols, "Tidak ada anggota di bawah target pada periode ini.");
    } else {
      for (const a of data.ringkasan.dibawahTarget) {
        writeTargetRow(ws, row, a);
        row++;
      }
    }
  }

  printSetup(ws);
  autoWidth(ws, { min: 6, max: 36 });
  ws.getColumn(1).width = 30;
  ws.getColumn(3).width = 26;
}

function writeTargetRow(ws: ExcelJS.Worksheet, row: number, a: MaahirTargetRow) {
  textCell(ws.getCell(row, 1), a.blok, { align: "center" });
  textCell(ws.getCell(row, 2), a.name, { bold: true });
  textCell(ws.getCell(row, 3), a.kelasName);
  textCell(ws.getCell(row, 4), GENDER_LABEL[a.gender], { align: "center" });
  pctCell(ws.getCell(row, 5), a.persen);
  numCell(ws.getCell(row, 6), a.counts.H);
  numCell(ws.getCell(row, 7), a.counts.I);
  numCell(ws.getCell(row, 8), a.counts.S);
  numCell(ws.getCell(row, 9), a.counts.A);
  numCell(ws.getCell(row, 10), a.counts.T);
  numCell(ws.getCell(row, 11), a.terisi);
  numCell(ws.getCell(row, 12), a.tidakHadir);
  // Only present when they joined mid-period; "-" is the honest value otherwise.
  textCell(ws.getCell(row, 13), a.mulaiTanggal, { align: "center" });
}

// ── Sheet: At-Tibyan ────────────────────────────────────────────────────────

function sheetTibyan(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("At-Tibyan");
  const cols = 5;
  const s = sumber(data, "rekap/tibyan");

  let row = titleBand(ws, cols, "AT-TIBYAN", [
    `Periode ${data.periode ?? DASH} · dibuat ${data.dibuatPada}`,
    sumberSubtitle(s),
  ]);

  const t = data.tibyan;
  if (!t) {
    belumDitarik(ws, row, cols, s);
  } else {
    row = blockTitle(ws, row, cols, "KPI");
    const kpiAt = row;
    row = headerRow(ws, row, ["Metrik", "Nilai", "", "", ""]);
    const kpi: Array<[string, number | null, boolean]> = [
      ["Kehadiran keseluruhan", t.kpi.overallPersen, true],
      ["Total sesi", t.kpi.totalSesi, false],
      ["Total anggota", t.kpi.totalAnggota, false],
      ["Kelas di bawah target", t.kpi.kelasDiBawahTarget, false],
    ];
    for (const [label, value, isPct] of kpi) {
      textCell(ws.getCell(row, 1), label, { bold: true });
      if (isPct) pctCell(ws.getCell(row, 2), value);
      else numCell(ws.getCell(row, 2), value);
      row++;
    }
    freezeHeader(ws, kpiAt);
    row += 1;

    row = blockTitle(ws, row, cols, "Distribusi kehadiran");
    row = headerRow(ws, row, ["Hadir", "Izin", "Sakit", "Alpa", "Terlambat"]);
    (["H", "I", "S", "A", "T"] as const).forEach((k, i) => numCell(ws.getCell(row, 1 + i), t.distribusi[k]));
    row += 2;

    row = blockTitle(ws, row, cols, "Ranking kelas");
    row = headerRow(ws, row, ["Kelas", "Gender", "Anggota", "% hadir", ""]);
    for (const r of t.ranking) {
      textCell(ws.getCell(row, 1), r.kelasName);
      textCell(ws.getCell(row, 2), GENDER_LABEL[r.gender], { align: "center" });
      numCell(ws.getCell(row, 3), r.anggota);
      // null = kelas belum punya sesi yang terhitung; bukan 0%.
      pctCell(ws.getCell(row, 4), r.persen);
      row++;
    }
    row += 1;

    row = blockTitle(ws, row, cols, "Trend harian");
    row = headerRow(ws, row, ["Tanggal", "% hadir", "", "", ""]);
    for (const d of t.trend) {
      textCell(ws.getCell(row, 1), d.tanggal, { align: "center" });
      pctCell(ws.getCell(row, 2), d.persen);
      row++;
    }
    row += 1;

    row = blockTitle(ws, row, cols, "Perlu perhatian — anggota");
    row = headerRow(ws, row, ["Nama", "Kelas", "Gender", "% hadir", "Alpa beruntun"]);
    if (t.perhatianAnggota.length === 0) {
      row = noteRow(ws, row, cols, "Tidak ada anggota yang ditandai pada periode ini.");
    } else {
      for (const a of t.perhatianAnggota) {
        textCell(ws.getCell(row, 1), a.name, { bold: true });
        textCell(ws.getCell(row, 2), a.kelasName);
        textCell(ws.getCell(row, 3), GENDER_LABEL[a.gender], { align: "center" });
        pctCell(ws.getCell(row, 4), a.persen);
        numCell(ws.getCell(row, 5), a.alphaBeruntun, a.alphaBeruntun >= 3 ? { fill: WARN_FILL } : {});
        row++;
      }
    }
    row += 1;

    row = blockTitle(ws, row, cols, "Perlu perhatian — kelas");
    row = headerRow(ws, row, ["Kelas", "Gender", "% hadir", "", ""]);
    for (const k of t.perhatianKelas) {
      textCell(ws.getCell(row, 1), k.kelasName);
      textCell(ws.getCell(row, 2), GENDER_LABEL[k.gender], { align: "center" });
      pctCell(ws.getCell(row, 3), k.persen);
      row++;
    }
  }

  printSetup(ws, { landscape: false });
  autoWidth(ws, { min: 10, max: 40 });
  ws.getColumn(1).width = 34;
}

// ── Sheet: SP ───────────────────────────────────────────────────────────────

const SP_HEADERS = [
  "Nama", "Kelas", "Gender", "Hadir", "Terlambat", "Izin", "Sakit", "Alpa",
  "SP (bersih)", "SP kotor", "Penetapan", "Diputihkan", "Rincian pemutihan",
];

function sheetSp(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("SP");
  const cols = SP_HEADERS.length;
  const s = sumber(data, "rekap/sp");
  const sp = data.sp;

  // The heading states the window before any number is shown. `rekap/sp` is
  // cumulative since the program started, while the SP block on the dashboard
  // covers ONE 28→27 period — same members, different totals, and the pair gets
  // "reconciled" by hand every time the difference is not spelled out.
  const judul = sp
    ? `SP — KUMULATIF SEJAK ${sp.mulai} S.D. ${sp.cutoff}`
    : "SP — KUMULATIF SEJAK AWAL PROGRAM";

  let row = titleBand(ws, cols, judul, [
    sumberSubtitle(s),
    sp
      ? `ANGKA DI SHEET INI KUMULATIF sejak awal program (${sp.mulai}) sampai cutoff ${sp.cutoff}. ` +
        `JANGAN diadu dengan blok SP di dashboard/laporan bulanan, yang hanya menghitung satu periode` +
        (sp.perPeriode?.periode ? ` (${sp.perPeriode.periode})` : "") +
        ". Keduanya benar untuk jendelanya masing-masing."
      : "Angka SP selalu kumulatif sejak awal program, berbeda jendela dari blok SP per periode di dashboard.",
    'Pemutihan membuat persen kehadiran anggota dianggap 100 untuk bulan itu, jadi "SP (bersih)" bisa lebih kecil dari "SP kotor".',
  ]);

  if (!sp) {
    belumDitarik(ws, row, cols, s);
  } else {
    row = blockTitle(ws, row, cols, "Perbandingan jendela — bukan selisih yang perlu didamaikan");
    row = headerRow(ws, row, [
      "Cakupan", "Jendela", "Total anggota ber-SP", "SP 1", "SP 2", "SP 3", "Diputihkan",
      "", "", "", "", "", "",
    ]);
    row = writeSpSummary(ws, row, "Kumulatif (sheet ini)", `${sp.mulai} s.d. ${sp.cutoff}`, sp.summary);
    if (sp.perPeriode) {
      row = writeSpSummary(
        ws,
        row,
        "Per periode (dashboard)",
        sp.perPeriode.periode ?? DASH,
        sp.perPeriode.summary,
      );
    } else {
      // laporan-maahir was never pulled: say so instead of leaving one row of
      // the comparison silently missing.
      row = noteRow(
        ws,
        row,
        cols,
        `Baris pembanding per periode tidak tersedia: ${sumber(data, "rekap/laporan-maahir").alasan ?? ""}`,
      );
    }
    row += 1;

    const headerAt = row;
    row = headerRow(ws, row, SP_HEADERS);
    for (const r of sp.rows) {
      textCell(ws.getCell(row, 1), r.name, { bold: true });
      textCell(ws.getCell(row, 2), r.kelasName);
      textCell(ws.getCell(row, 3), GENDER_LABEL[r.gender], { align: "center" });
      numCell(ws.getCell(row, 4), r.hadir);
      numCell(ws.getCell(row, 5), r.terlambat);
      numCell(ws.getCell(row, 6), r.izin);
      numCell(ws.getCell(row, 7), r.sakit);
      numCell(ws.getCell(row, 8), r.alpa);
      numCell(ws.getCell(row, 9), r.sp, r.sp >= 3 ? { fill: WARN_FILL, bold: true } : {});
      numCell(ws.getCell(row, 10), r.spKotor);
      textCell(ws.getCell(row, 11), r.penetapan.map((p) => `SP${p.level} ${p.tanggal} (${p.pemicu})`).join(" · "));
      numCell(ws.getCell(row, 12), r.diputihkan.length);
      textCell(ws.getCell(row, 13), r.diputihkan.map((d) => `${d.month}: ${d.alasan} — ${d.oleh}`).join(" · "));
      row++;
    }
    autoFilter(ws, headerAt, cols, row - 1);
    freezeHeader(ws, headerAt, { xSplit: 1 });
  }

  printSetup(ws);
  autoWidth(ws, { min: 7, max: 44 });
  ws.getColumn(1).width = 28;
  ws.getColumn(11).width = 44;
  ws.getColumn(13).width = 44;
}

function writeSpSummary(
  ws: ExcelJS.Worksheet,
  row: number,
  cakupan: string,
  jendela: string,
  s: MaahirSpSummary,
): number {
  textCell(ws.getCell(row, 1), cakupan, { bold: true });
  textCell(ws.getCell(row, 2), jendela, { align: "center" });
  numCell(ws.getCell(row, 3), s.total);
  numCell(ws.getCell(row, 4), s.sp1);
  numCell(ws.getCell(row, 5), s.sp2);
  numCell(ws.getCell(row, 6), s.sp3);
  numCell(ws.getCell(row, 7), s.diputihkan);
  return row + 1;
}

// ── Sheet: Presensi Belum Diisi ─────────────────────────────────────────────

function sheetBelumDiisi(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("Presensi Belum Diisi");
  const cols = 5;
  const s = sumber(data, "rekap/laporan-maahir");

  let row = titleBand(ws, cols, "PRESENSI BELUM DIISI", [
    `Periode ${data.periode ?? DASH} · dibuat ${data.dibuatPada}`,
    sumberSubtitle(s),
    "Satu baris = satu pertemuan yang presensinya belum diisi sama sekali. Selama baris ini ada, angka kehadiran periode ini masih bisa berubah.",
    'Daftar ini datang dari route laporan; kolom "Belum diisi" di sheet "Kehadiran per Kelas" datang dari route kehadiran dan angkanya bisa berbeda. Bandingkan per kelas, jangan dijumlahkan.',
  ]);

  if (!data.belumDiisi) {
    belumDitarik(ws, row, cols, s);
  } else if (data.belumDiisi.length === 0) {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value = "Tidak ada presensi yang belum diisi pada periode ini.";
    box(c, { bold: true, align: "left" });
  } else {
    const headerAt = row;
    row = headerRow(ws, row, ["Tanggal", "Program", "Kelas", "Gender", "Total sesi kosong di kelas ini"]);
    for (const b of data.belumDiisi) {
      textCell(ws.getCell(row, 1), b.tanggal, { align: "center" });
      textCell(ws.getCell(row, 2), b.program, { align: "center" });
      textCell(ws.getCell(row, 3), b.kelasName, { bold: true });
      textCell(ws.getCell(row, 4), GENDER_LABEL[b.gender], { align: "center" });
      numCell(ws.getCell(row, 5), b.jumlahKelas, { fill: WARN_FILL });
      row++;
    }
    autoFilter(ws, headerAt, cols, row - 1);
    freezeHeader(ws, headerAt, { xSplit: 3 });
    noteRow(
      ws,
      row + 1,
      cols,
      `${data.belumDiisi.length} pertemuan pada ${new Set(data.belumDiisi.map((b) => b.kelasName)).size} kelas.`,
    );
  }

  printSetup(ws, { landscape: false });
  autoWidth(ws, { min: 10, max: 40 });
  ws.getColumn(3).width = 34;
}

// ── Sheet: Matrix Guru ──────────────────────────────────────────────────────

/**
 * The 14 indicators, in upstream's own grouping, each followed by upstream's own
 * category average. Names and order mirror the payload fields; the three that
 * were null for everyone in the capture (hafalan, kehadiran muallim, metode
 * pengajaran) still get a column — a missing column would hide that Maahir has
 * never filled them, which is itself the finding.
 */
const MATRIX_KOMPONEN: Array<{ judul: string; rata: keyof MaahirMatrixSkor; komponen: Array<{ key: keyof MaahirMatrixSkor; label: string }> }> = [
  {
    judul: "Hard skill",
    rata: "rata_rata_hard_skill",
    komponen: [
      { key: "skor_bacaan", label: "Bacaan" },
      { key: "skor_hafalan", label: "Hafalan" },
      { key: "skor_tajwid", label: "Tajwid" },
      { key: "skor_kehadiran_maahir", label: "Kehadiran Maahir" },
      { key: "skor_kehadiran_tibyan", label: "Kehadiran At-Tibyan" },
      { key: "skor_kehadiran_muallim", label: "Kehadiran Muallim" },
    ],
  },
  {
    judul: "Pedagogis",
    rata: "rata_rata_pedagogis",
    komponen: [
      { key: "skor_metode_pengajaran", label: "Metode pengajaran" },
      { key: "skor_kepatuhan_silabus", label: "Kepatuhan silabus" },
      { key: "skor_manajemen_halaqah", label: "Manajemen halaqah" },
      { key: "skor_evaluasi_penguasaan", label: "Evaluasi penguasaan" },
    ],
  },
  {
    judul: "Soft skill",
    rata: "rata_rata_soft_skill",
    komponen: [
      { key: "skor_kedisiplinan_waktu", label: "Kedisiplinan waktu" },
      { key: "skor_komitmen_jadwal", label: "Komitmen jadwal" },
      { key: "skor_tanggung_jawab", label: "Tanggung jawab" },
      { key: "skor_kepatuhan_sop", label: "Kepatuhan SOP" },
    ],
  },
];

const MATRIX_HEADERS = [
  "Pengajar", "Kelompok", "Gender", "Aktif",
  ...MATRIX_KOMPONEN.flatMap((k) => [...k.komponen.map((c) => c.label), `Rata-rata ${k.judul.toLowerCase()}`]),
  "Rata-rata keseluruhan", "Ranking se-HITS", "Teguran bulan ini", "Teguran kumulatif",
];

/**
 * One score. `null` is "belum dinilai" and MUST NOT become 0 — 42% of the
 * indicator cells in the 3 Sep capture are null, and a column of zeroes would be
 * read as a cohort that failed. `numCell` writes the "-" placeholder, which this
 * workbook already defines as "no value here", never as a measured zero.
 */
function skorCell(cell: ExcelJS.Cell, skor: MaahirMatrixSkor | null, key: keyof MaahirMatrixSkor, fmt: string) {
  const v = skor?.[key];
  numCell(cell, typeof v === "number" && Number.isFinite(v) ? v : null, { fmt });
}

function sheetMatrix(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("Matrix Guru");
  const cols = MATRIX_HEADERS.length;
  const s = sumber(data, "rekap/matrix-guru");
  const m = data.matrix;

  let row = titleBand(ws, cols, "MATRIX SKILL PENGAJAR — SNAPSHOT MAAHIR", [
    periodeSendiri(s, data.dibuatPada),
    sumberSubtitle(s),
    jendelaNote(s),
    "Rapor ini adalah SNAPSHOT: Maahir menghitungnya sekali lalu menyimpannya, dan API tidak pernah memicu hitung ulang (docs/API-PUBLIC.md §9). Angkanya disalin apa adanya — rata-rata per kategori, rata-rata keseluruhan, dan ranking semuanya milik upstream.",
    'Sel kosong (tanda "-") berarti BELUM DINILAI, bukan nilai nol. Ranking adalah peringkat lintas SELURUH HITS, bukan peringkat di dalam satu batch atau di dalam daftar ini.',
  ]);

  if (!m) {
    belumDitarik(ws, row, cols, s);
    printSetup(ws);
    autoWidth(ws, { min: 6, max: 26 });
    ws.getColumn(1).width = 28;
    return;
  }

  // Rule 3: a snapshot that is not `siap` says so ABOVE the numbers. Presenting
  // a stale or never-computed snapshot silently is the failure mode this banner
  // exists for.
  if (m.keadaan !== "siap") {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value =
      m.keadaan === "basi"
        ? `SNAPSHOT BASI — angka di bawah BELUM FINAL untuk periode ini. Snapshot terakhir Maahir: ${tanggalPanjang(m.snapshotTerakhir) ?? "tidak tercatat"}, lebih tua dari akhir bulan yang diminta.`
        : "SNAPSHOT BELUM DIHITUNG — Maahir belum pernah me-recompute matrix untuk bulan ini. " +
          `Daftar pengajar tetap dikirim upstream, tapi seluruh nilainya kosong${m.snapshotTerakhir ? ` (snapshot terakhir: ${tanggalPanjang(m.snapshotTerakhir)})` : ""}. Kosong di sini BUKAN nilai nol.`;
    box(c, { bold: true, fill: WARN_FILL, align: "left" });
    ws.getRow(row).height = 28;
    row += 2;
  }

  row = noteRow(
    ws,
    row,
    cols,
    `${m.rows.length} pengajar di snapshot · ${m.dinilai} punya nilai keseluruhan · ${m.belumDinilai} belum dinilai` +
      (m.snapshotTerakhir ? ` · snapshot terakhir ${tanggalPanjang(m.snapshotTerakhir)}` : "") +
      ". Cakupan snapshot ini adalah seluruh pengajar HITS, bukan satu batch program.",
  );

  const headerAt = row;
  row = headerRow(ws, row, MATRIX_HEADERS);
  for (const p of m.rows) {
    let col = 1;
    textCell(ws.getCell(row, col++), p.nama, { bold: true });
    textCell(ws.getCell(row, col++), p.kelompok);
    textCell(ws.getCell(row, col++), GENDER_LABEL[p.gender], { align: "center" });
    textCell(ws.getCell(row, col++), p.active ? "Ya" : "Nonaktif", { align: "center" });
    for (const k of MATRIX_KOMPONEN) {
      for (const c of k.komponen) skorCell(ws.getCell(row, col++), p.skor, c.key, NUM_FMT.dec1);
      skorCell(ws.getCell(row, col++), p.skor, k.rata, NUM_FMT.dec2);
    }
    skorCell(ws.getCell(row, col++), p.skor, "rata_rata_keseluruhan", NUM_FMT.dec2);
    skorCell(ws.getCell(row, col++), p.skor, "ranking", NUM_FMT.int);
    // Teguran is a COUNT, not a score: 0 really does mean zero teguran. Only a
    // pengajar with no snapshot row at all has none to report.
    numCell(ws.getCell(row, col++), p.skor ? p.skor.total_teguran_bulan : null);
    numCell(ws.getCell(row, col++), p.skor ? p.skor.total_teguran_kumulatif : null, {
      fill: (p.skor?.total_teguran_kumulatif ?? 0) > 0 ? WARN_FILL : undefined,
    });
    row++;
  }
  autoFilter(ws, headerAt, cols, row - 1);
  freezeHeader(ws, headerAt, { xSplit: 1 });

  noteRow(
    ws,
    row + 1,
    cols,
    'Skala Maahir 0–4. Kolom "Rata-rata …" datang jadi dari upstream dan sengaja TIDAK dihitung ulang dari komponen di kirinya — komponen yang kosong tidak ikut menurunkan rata-rata, dan menghitung sendiri akan berbeda dari layar koordinator.',
  );

  printSetup(ws);
  autoWidth(ws, { min: 6, max: 26 });
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 24;
}

// ── Sheet: Disiplin Pengajar ────────────────────────────────────────────────

const DISIPLIN_HEADERS = [
  "Peringkat", "Pengajar", "Gender", "Halaqah", "KBBS", "Pertemuan non-libur", "% KBBS",
  "KMT", "KBLA", "JKG", "Tidak latihan", "On-time baik", "On-time total", "% on-time",
  "Stabil baik", "Stabil total", "% stabil", "Hutang saldo",
];

const INSIDEN_STATUS: Record<string, string> = {
  pending: "Menunggu tabayyun",
  nunggu_alasan: "Menunggu alasan pengajar",
  diputus: "Sudah diputus",
};

function writeDisiplinRow(ws: ExcelJS.Worksheet, row: number, r: MaahirDisiplinRanked) {
  numCell(ws.getCell(row, 1), r.rank);
  textCell(ws.getCell(row, 2), r.pengajarNama, { bold: true });
  textCell(ws.getCell(row, 3), GENDER_LABEL[r.gender], { align: "center" });
  numCell(ws.getCell(row, 4), r.halaqahCount);
  numCell(ws.getCell(row, 5), r.kbbs);
  numCell(ws.getCell(row, 6), r.nonLibur);
  pctCell(ws.getCell(row, 7), r.pctKbbs);
  // KMT/KBLA/JKG/tidak latihan are counts of violations: 0 is a real zero.
  numCell(ws.getCell(row, 8), r.kmt, r.kmt > 0 ? { fill: WARN_FILL } : {});
  numCell(ws.getCell(row, 9), r.kbla, r.kbla > 0 ? { fill: WARN_FILL } : {});
  numCell(ws.getCell(row, 10), r.jkg, r.jkg > 0 ? { fill: WARN_FILL } : {});
  numCell(ws.getCell(row, 11), r.tidakLatihan, r.tidakLatihan > 0 ? { fill: WARN_FILL } : {});
  numCell(ws.getCell(row, 12), r.onTimeBaik);
  numCell(ws.getCell(row, 13), r.onTimeTotal);
  pctCell(ws.getCell(row, 14), r.pctOnTime);
  numCell(ws.getCell(row, 15), r.stabilBaik);
  numCell(ws.getCell(row, 16), r.stabilTotal);
  pctCell(ws.getCell(row, 17), r.pctStabil);
  numCell(ws.getCell(row, 18), r.hutangSaldo, r.hutangSaldo > 0 ? { fill: WARN_FILL } : {});
}

function sheetDisiplin(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("Disiplin Pengajar");
  const cols = DISIPLIN_HEADERS.length;
  const s = sumber(data, "rekap/hits-disiplin");
  const d = data.disiplin;

  let row = titleBand(ws, cols, "DISIPLIN PENGAJAR — HITS", [
    periodeSendiri(s, data.dibuatPada),
    sumberSubtitle(s),
    jendelaNote(s),
    d
      ? `Rentang menurut payload: ${tanggalPanjang(d.start)} s.d. ${tanggalPanjang(d.end)} (mode=${d.mode}, periode upstream "${d.periodeLabel}", ${d.genderLabel}). ` +
        "INI KALENDER PENUH — sheet Ringkasan, Kehadiran per Kelas, dan At-Tibyan memakai jendela 28→27 yang berbeda, jadi angka di sini tidak bisa disandingkan begitu saja dengan angka di sana."
      : "Route ini memakai kalender bulan penuh, berbeda dari jendela 28→27 milik sheet Maahir lainnya.",
    "Cakupannya seluruh HITS, bukan satu batch program: Maahir menjumlahkan skor per PENGAJAR, bukan per batch.",
  ]);

  if (!d) {
    belumDitarik(ws, row, cols, s);
    printSetup(ws);
    autoWidth(ws, { min: 7, max: 32 });
    ws.getColumn(2).width = 28;
    return;
  }

  row = blockTitle(ws, row, cols, "Ringkasan (angka upstream)");
  row = headerRow(ws, row, ["Halaqah terpantau", "Punya pelanggaran", "Laporan belum lengkap", "Laporan lengkap"]);
  numCell(ws.getCell(row, 1), d.counts.total);
  numCell(ws.getCell(row, 2), d.counts.bermasalah, d.counts.bermasalah > 0 ? { fill: WARN_FILL } : {});
  numCell(ws.getCell(row, 3), d.counts.obsBelum, d.counts.obsBelum > 0 ? { fill: WARN_FILL } : {});
  numCell(ws.getCell(row, 4), d.counts.obsLengkap);
  row += 2;

  row = blockTitle(ws, row, cols, `Peringkat pengajar (${d.ranked.length})`);
  const headerAt = row;
  row = headerRow(ws, row, DISIPLIN_HEADERS);
  for (const r of d.ranked) {
    writeDisiplinRow(ws, row, r);
    row++;
  }
  autoFilter(ws, headerAt, cols, row - 1);
  freezeHeader(ws, headerAt, { xSplit: 2 });
  row += 1;

  row = blockTitle(ws, row, cols, `Tanpa data untuk dinilai (${d.noData.length})`);
  row = noteRow(
    ws,
    row,
    cols,
    'Pengajar/halaqah tanpa satu pun pertemuan yang bisa dinilai pada rentang ini. Upstream memisahkan mereka supaya tidak terbaca sebagai peringkat terbawah — kolom persennya "-" karena tidak ada penyebut, bukan karena 0%. Nama "-" berarti halaqah itu memang belum punya pengajar.',
  );
  if (d.noData.length === 0) {
    row = noteRow(ws, row, cols, "Tidak ada.");
  } else {
    row = headerRow(ws, row, DISIPLIN_HEADERS);
    for (const r of d.noData) {
      writeDisiplinRow(ws, row, r);
      row++;
    }
  }
  row += 1;

  row = blockTitle(ws, row, cols, `Insiden tabayyun (${d.insiden.length})`);
  row = noteRow(
    ws,
    row,
    cols,
    "Catatan ketua, alasan pengajar, dan catatan keputusan adalah teks bebas milik upstream, disalin apa adanya. Isinya bisa menyangkut urusan pribadi — perlakukan berkas ini sebagai dokumen internal koordinator.",
  );
  if (d.insiden.length === 0) {
    noteRow(ws, row, cols, "Tidak ada insiden pada rentang ini.");
  } else {
    const insidenAt = row;
    row = headerRow(ws, row, [
      "Tanggal", "Pengajar", "Gender", "Halaqah", "Pertemuan ke", "Pelanggaran", "Status",
      "Dari izin", "Udzur syar'i", "Diputus pada", "Catatan ketua", "Alasan pengajar", "Catatan keputusan",
    ]);
    for (const i of d.insiden) {
      textCell(ws.getCell(row, 1), i.tanggal, { align: "center" });
      textCell(ws.getCell(row, 2), i.pengajarNama, { bold: true });
      textCell(ws.getCell(row, 3), i.gender ? GENDER_LABEL[i.gender] : null, { align: "center" });
      textCell(ws.getCell(row, 4), i.halaqahName);
      numCell(ws.getCell(row, 5), i.pertemuanNo);
      // Kode dipakai persis seperti upstream; kepanjangannya tidak dikarang.
      textCell(ws.getCell(row, 6), i.pelanggaran.map((p) => `${p.jenis}${p.detail ? `: ${p.detail}` : ""}`).join(" · "));
      textCell(ws.getCell(row, 7), INSIDEN_STATUS[i.status] ?? i.status, {
        align: "center",
        ...(i.status === "diputus" ? {} : { fill: WARN_FILL }),
      });
      textCell(ws.getCell(row, 8), i.dariIzin ? "Ya" : "Tidak", { align: "center" });
      // Belum diputus → belum ada jawabannya; "Tidak" akan jadi vonis yang belum dibuat.
      textCell(ws.getCell(row, 9), i.isUdzurSyari == null ? null : i.isUdzurSyari ? "Ya" : "Tidak", {
        align: "center",
      });
      textCell(ws.getCell(row, 10), waktuWibIso(i.decidedAt), { align: "center" });
      textCell(ws.getCell(row, 11), i.catatanKetua);
      textCell(ws.getCell(row, 12), i.alasanPengajar);
      textCell(ws.getCell(row, 13), i.keputusanCatatan);
      row++;
    }
    freezeHeader(ws, insidenAt, { xSplit: 2 });
  }

  printSetup(ws);
  autoWidth(ws, { min: 7, max: 40 });
  ws.getColumn(2).width = 28;
  ws.getColumn(4).width = 26;
}

// ── Sheet: Shakwa ───────────────────────────────────────────────────────────

const SHAKWA_HEADERS = [
  "Nomor tiket", "Dibuat (WIB)", "Pelapor", "Nama", "Gender", "Halaqah", "Pengajar terkait",
  "Kategori", "Status", "Ditangani (WIB)", "Lampiran", "Izin diminta", "Jawaban formulir", "Isi laporan",
];

function sheetShakwa(wb: ExcelJS.Workbook, data: MaahirBulanan) {
  const ws = wb.addWorksheet("Shakwa");
  const cols = SHAKWA_HEADERS.length;
  const s = sumber(data, "rekap/shakwa");
  const k = data.shakwa;

  let row = titleBand(ws, cols, "SHAKWA — ADUAN, MASUKAN & IZIN", [
    periodeSendiri(s, data.dibuatPada),
    sumberSubtitle(s),
    jendelaNote(s),
    k
      ? `Rentang menurut payload: ${tanggalPanjang(k.mulai)} s.d. ${tanggalPanjang(k.sampai)}. Batas harinya dipotong menurut WIB (UTC+7), bukan UTC — laporan pukul 06.00 WIB tetap masuk hari itu (docs/API-PUBLIC.md §9).`
      : "Jendela shakwa adalah rentang hari yang dipotong menurut WIB (UTC+7), bukan UTC.",
    "Tiket tidak membawa penanda batch, jadi daftar ini lintas seluruh HITS; kolom Halaqah adalah label apa adanya dari tiket.",
    "Nomor WhatsApp pelapor tidak pernah keluar dari API dan karena itu tidak ada kolomnya. Lampiran hanya dihitung — berkasnya hanya bisa dibuka koordinator lewat dashboard Maahir.",
  ]);

  if (!k) {
    belumDitarik(ws, row, cols, s);
    printSetup(ws);
    autoWidth(ws, { min: 8, max: 40 });
    ws.getColumn(14).width = 60;
    return;
  }

  row = blockTitle(ws, row, cols, "Ringkasan (angka upstream)");
  row = headerRow(ws, row, ["Total tiket", "Belum ditangani"]);
  numCell(ws.getCell(row, 1), k.total);
  numCell(ws.getCell(row, 2), k.belumDitangani, k.belumDitangani > 0 ? { fill: WARN_FILL, bold: true } : {});
  row += 2;

  row = blockTitle(ws, row, cols, "Per kategori");
  row = noteRow(
    ws,
    row,
    cols,
    "Upstream hanya mengirim kategori yang benar-benar muncul pada rentang ini; kategori yang tidak tercantum berarti tidak ada tiketnya, dan sengaja tidak ditambahkan sebagai baris nol.",
  );
  row = headerRow(ws, row, ["Kategori", "Jumlah"]);
  for (const c of k.perKategori) {
    textCell(ws.getCell(row, 1), c.label);
    numCell(ws.getCell(row, 2), c.jumlah);
    row++;
  }
  row += 1;

  row = blockTitle(ws, row, cols, "Per status");
  row = headerRow(ws, row, ["Status", "Jumlah"]);
  for (const st of k.perStatus) {
    textCell(ws.getCell(row, 1), st.label);
    // Upstream always sends all four statuses, zeros included: here 0 IS a
    // measured zero, not a missing bucket.
    numCell(ws.getCell(row, 2), st.jumlah, st.status === "submitted" && st.jumlah > 0 ? { fill: WARN_FILL } : {});
    row++;
  }
  row += 1;

  row = blockTitle(ws, row, cols, `Daftar tiket (${k.items.length})`);
  if (k.items.length === 0) {
    noteRow(ws, row, cols, "Tidak ada tiket pada rentang ini.");
  } else {
    const headerAt = row;
    row = headerRow(ws, row, SHAKWA_HEADERS);
    for (const it of k.items) {
      textCell(ws.getCell(row, 1), it.nomorTiket, { align: "center" });
      textCell(ws.getCell(row, 2), waktuWibIso(it.createdAt), { align: "center" });
      textCell(ws.getCell(row, 3), it.pelaporType === "pengajar" ? "Pengajar" : "Peserta", { align: "center" });
      textCell(ws.getCell(row, 4), it.nama, { bold: true });
      textCell(ws.getCell(row, 5), GENDER_LABEL[it.gender], { align: "center" });
      textCell(ws.getCell(row, 6), it.halaqahLabel);
      textCell(ws.getCell(row, 7), it.pengajarNama);
      textCell(ws.getCell(row, 8), it.kategoriLabel, { align: "center" });
      textCell(ws.getCell(row, 9), it.statusLabel, {
        align: "center",
        ...(it.status === "submitted" || it.status === "in_review" ? { fill: WARN_FILL } : {}),
      });
      textCell(ws.getCell(row, 10), waktuWibIso(it.ditanganiAt), { align: "center" });
      numCell(ws.getCell(row, 11), it.jumlahLampiran);
      textCell(
        ws.getCell(row, 12),
        it.izin
          .map((z) => `${z.jenis} ${z.tanggal} → ganti ${z.jadwalGanti} (${z.halaqahName}${z.sudahTerpakai ? ", sudah terpakai" : ""})`)
          .join(" · "),
      );
      // Keys vary per kategori, so they are humanised rather than enumerated: a
      // new key upstream adds shows up here instead of vanishing.
      textCell(
        ws.getCell(row, 13),
        Object.entries(it.jawaban ?? {})
          .filter(([, v]) => v != null && String(v).trim() !== "")
          .map(([key, v]) => `${key.replace(/[_-]+/g, " ")}: ${v}`)
          .join(" · "),
      );
      // Free text, often a personal circumstance. Kept whole — truncating a
      // complaint changes what it says — but last, plain, and unhighlighted.
      textCell(ws.getCell(row, 14), it.isi);
      row++;
    }
    autoFilter(ws, headerAt, cols, row - 1);
    freezeHeader(ws, headerAt, { xSplit: 1 });
    noteRow(
      ws,
      row + 1,
      cols,
      'Kolom "Isi laporan" dan "Jawaban formulir" adalah tulisan pelapor apa adanya dan kerap memuat urusan pribadi. Berkas ini dokumen internal koordinator; jangan disebar di luar itu.',
    );
  }

  printSetup(ws);
  autoWidth(ws, { min: 8, max: 40 });
  ws.getColumn(14).width = 60;
}

// ── Workbook ────────────────────────────────────────────────────────────────

export function buildMaahirBulananWorkbook(data: MaahirBulanan): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dashboard M-Edu";
  wb.created = new Date(`${data.dibuatPada}T00:00:00Z`);
  // Even when nothing was pulled the book is still produced: eight sheets of
  // stated reasons is a usable answer, a failed export is not.
  if (kosongSeluruhnya(data)) {
    wb.description = `Tidak ada satu pun rekap Maahir tersimpan untuk ${data.bulan}.`;
  }
  sheetRingkasan(wb, data);
  sheetKehadiran(wb, data);
  sheetTibyan(wb, data);
  sheetSp(wb, data);
  sheetBelumDiisi(wb, data);
  // The three routes below cover DIFFERENT windows from the five above; they sit
  // last so the Maahir 28→27 sheets stay together, and each states its own.
  sheetMatrix(wb, data);
  sheetDisiplin(wb, data);
  sheetShakwa(wb, data);
  return wb;
}
