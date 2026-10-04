/**
 * Data for the Maahir monthly workbook — its own file, not a block inside the
 * KBA workbook, because Maahir counts a "month" as 28→27 and excludes `sakit`
 * from the denominator (docs/API-PUBLIC.md §9). Mixing the two windows in one
 * book is how a coordinator ends up comparing numbers that were never
 * comparable.
 *
 * Everything here comes from the cached `rekap/*` rows via lib/maahir/rekap.ts.
 * Nothing is recomputed from `maahir_sync`: the seven period rules belong to
 * upstream, and a second implementation of them would drift from the screen the
 * Maahir coordinator actually looks at.
 *
 * Two rules this module carries into the workbook:
 *
 *   1. A route that was never pulled yields `null`, never zeros. `MaahirSumber`
 *      travels next to every section so the sheet can say WHY it is empty and
 *      WHEN the numbers it does show were fetched. Writing 0 for "belum ditarik"
 *      would report "nobody attended".
 *   2. Period labels come from `meta` through `periodLabel()`. The month name is
 *      never used: `rekap/sp` has no period at all (cumulative to `meta.cutoff`),
 *      and the same `bulan=2026-08` means 28 Jul–27 Aug here.
 *
 * FOUR definitions of "bulan" now meet inside one file, which is the whole
 * reason `MaahirSumber.jendela` exists next to `MaahirSumber.periode`:
 *
 *   28→27 ...... `rekap/laporan-maahir`, `rekap/kehadiran`, `rekap/tibyan`
 *   kalender ... `rekap/hits-disiplin` with `mode=bulan` (1 Aug–1 Sep)
 *   snapshot ... `rekap/matrix-guru` (a `year_month` photograph, not a window)
 *   kumulatif .. `rekap/sp` (since the programme started, up to `meta.cutoff`)
 *   hari-WIB ... `rekap/shakwa` (a day range cut at UTC+7)
 *
 * Every sheet therefore labels itself from ITS OWN `meta`, never from
 * `MaahirBulanan.periode` — that field is the Maahir report window only.
 *
 * No ExcelJS in this file — lib/reports/maahir-bulanan-xlsx.ts lays it out.
 */
import {
  matrixSnapshotState,
  periodLabel,
  readHitsDisiplin,
  readKehadiran,
  readLaporanMaahir,
  readMatrixGuru,
  readShakwa,
  readSp,
  readTibyan,
  type MaahirRekapRead,
} from "@/lib/maahir/rekap";
import type { MaahirRekapRouteName } from "@/lib/integrations/maahir/rekap-routes";
import type {
  MaahirAnggotaKehadiran,
  MaahirCounts,
  MaahirDisiplinInsiden,
  MaahirDisiplinRanked,
  MaahirGender,
  MaahirHitsDisiplinPayload,
  MaahirKehadiranPayload,
  MaahirKelasKehadiran,
  MaahirLaporanNote,
  MaahirLaporanPayload,
  MaahirMatrixPayload,
  MaahirMatrixSkor,
  MaahirShakwaItem,
  MaahirShakwaPayload,
  MaahirSpPayload,
  MaahirSpRow,
  MaahirSpSummary,
  MaahirTibyanKpi,
  MaahirTibyanPayload,
} from "@/lib/maahir/types";
import { todayJakarta } from "@/lib/time/jakarta";

// ── Source status ───────────────────────────────────────────────────────────

/** Where one sheet's numbers came from, and whether they exist at all. */
export type MaahirSumber = {
  route: MaahirRekapRouteName;
  label: string;
  status: "ada" | "belum-ditarik";
  /** From `meta` only. null for `rekap/sp`, which has no period (see `cutoff`). */
  periode: string | null;
  /**
   * WHICH KIND of window `periode` is. Two sheets in this book can print the
   * same "28 Jul – 27 Agu 2026" and mean different things — and `hits-disiplin`
   * prints a different range for the very same requested month. The label alone
   * does not say that; this does.
   */
  jendela: string;
  fetchedAt: Date | null;
  /** Upstream served its own cached copy; `umurDetik` is how old that copy was. */
  dariCache: boolean | null;
  umurDetik: number | null;
  /**
   * The sentence a sheet prints INSTEAD of a table when there is no row. Always
   * says what is missing and what to do — an empty sheet with no reason gets
   * read as "zero".
   */
  alasan: string | null;
};

const ROUTE_LABEL: Record<string, string> = {
  "rekap/laporan-maahir": "Laporan bulanan Maahir",
  "rekap/kehadiran": "Kehadiran per kelas",
  "rekap/tibyan": "At-Tibyan",
  "rekap/sp": "SP (kumulatif)",
  "rekap/matrix-guru": "Matrix skill pengajar (snapshot)",
  "rekap/hits-disiplin": "Disiplin pengajar HITS",
  "rekap/shakwa": "Shakwa — aduan & izin",
};

/**
 * The window each route actually covers, in words. Straight from
 * docs/API-PUBLIC.md §9 — this is the difference a reader cannot see by
 * comparing two date labels, and the reason the workbook prints it in the
 * "Sumber data" table and again on every sheet.
 */
const ROUTE_JENDELA: Record<string, string> = {
  "rekap/laporan-maahir": "Bulan Maahir 28→27 (bukan kalender)",
  "rekap/kehadiran": "Bulan Maahir 28→27 (bukan kalender)",
  "rekap/tibyan": "Bulan Maahir 28→27 (bukan kalender)",
  "rekap/sp": "Kumulatif sejak awal program s.d. cutoff",
  "rekap/matrix-guru": "Snapshot rapor bulan kalender (year_month), bukan jendela",
  "rekap/hits-disiplin": "Kalender penuh 1→akhir bulan (mode=bulan)",
  "rekap/shakwa": "Rentang hari, dipotong menurut WIB (UTC+7)",
};

function sumberOf(
  route: MaahirRekapRouteName,
  read: MaahirRekapRead<unknown> | null,
  bulan: string,
): MaahirSumber {
  const label = ROUTE_LABEL[route] ?? route;
  const jendela = ROUTE_JENDELA[route] ?? "Jendela tidak didokumentasikan";
  if (!read) {
    return {
      route,
      label,
      status: "belum-ditarik",
      periode: null,
      jendela,
      fetchedAt: null,
      dariCache: null,
      umurDetik: null,
      alasan:
        `Belum ditarik: tidak ada baris ${route} untuk periode ${bulan} di maahir_rekap. ` +
        `Jalankan sinkronisasi Maahir lebih dulu — angka di sheet ini sengaja dikosongkan, bukan nol.`,
    };
  }
  return {
    route,
    label,
    status: "ada",
    periode: periodLabel(read.meta),
    jendela,
    fetchedAt: read.fetchedAt,
    dariCache: read.meta.dari_cache ?? null,
    umurDetik: read.meta.umur_detik ?? null,
    alasan: null,
  };
}

// ── Sheet: Ringkasan ────────────────────────────────────────────────────────

/**
 * One line of the recap, across the three blocks of `rekap/laporan-maahir`.
 * `null` = the block does not report that metric (At-Tibyan has no setoran and
 * no teacher attendance here) — the writer prints the "-" placeholder, not 0.
 */
export type MaahirRingkasanBaris = {
  metrik: string;
  satuan: "persen" | "angka";
  takhassus: number | null;
  maahir: number | null;
  atTibyan: number | null;
  catatan: string | null;
};

/** A member on a "di bawah target" list, tagged with the block that flagged them. */
export type MaahirTargetRow = {
  blok: string;
  name: string;
  kelasName: string;
  gender: MaahirGender;
  persen: number;
  counts: MaahirCounts;
  terisi: number;
  tidakHadir: number;
  /** Joined mid-period → the denominator started here, not at the window start. */
  mulaiTanggal: string | null;
};

export type MaahirRingkasan = {
  baris: MaahirRingkasanBaris[];
  dibawahTarget: MaahirTargetRow[];
  notes: MaahirLaporanNote[];
};

const BLOK_LABEL = {
  takhassus: "Takhassus",
  maahir: "Kelas Maahir",
  atTibyan: "At-Tibyan",
} as const;

function targetRows(blok: string, list: MaahirAnggotaKehadiran[]): MaahirTargetRow[] {
  // `keterangan` is deliberately dropped: it is free-text sick/permission notes
  // (docs §7), and this workbook is circulated.
  return list.map((a) => ({
    blok,
    name: a.name,
    kelasName: a.kelasName,
    gender: a.gender,
    persen: a.persen,
    counts: a.counts,
    terisi: a.terisi,
    tidakHadir: a.tidakHadir,
    mulaiTanggal: a.mulaiTanggal,
  }));
}

// ── Sheet: Kehadiran per Kelas ──────────────────────────────────────────────

export type MaahirKelasRingkas = {
  kelasName: string;
  gender: MaahirGender;
  /** "Senin, Kamis" — empty upstream for classes without a fixed schedule. */
  jadwalHari: string;
  /** "Kelas Maahir + At-Tibyan": most classes run both programs in one grid. */
  program: string;
  anggota: number;
  pertemuan: number;
  sesi: number;
  sesiTerisi: number;
  belumDiisi: number;
  counts: MaahirCounts;
  /** Mean of the members' own `persenHadir`. null when NO member has one — an
   *  unscored class is not a class with 0% attendance. */
  persenRata: number | null;
  /** Members whose `persenHadir` is null: nothing counted toward a denominator. */
  anggotaTanpaData: number;
};

const KOSONG_COUNTS: MaahirCounts = { H: 0, I: 0, S: 0, A: 0, T: 0 };

function sumCounts(rows: MaahirCounts[]): MaahirCounts {
  return rows.reduce<MaahirCounts>(
    (acc, c) => ({ H: acc.H + c.H, I: acc.I + c.I, S: acc.S + c.S, A: acc.A + c.A, T: acc.T + c.T }),
    { ...KOSONG_COUNTS },
  );
}

function kelasRingkas(k: MaahirKelasKehadiran): MaahirKelasRingkas {
  const nilai = k.anggota.map((a) => a.persenHadir).filter((p): p is number => p != null);
  const programs = [...new Set(k.sessions.map((s) => s.programLabel))].sort();
  return {
    kelasName: k.kelasName,
    gender: k.gender,
    jadwalHari: k.jadwalHari.join(", "),
    program: programs.join(" + "),
    anggota: k.anggota.length,
    pertemuan: k.pertemuan.length,
    sesi: k.sessions.length,
    sesiTerisi: k.sessions.filter((s) => s.filled).length,
    belumDiisi: k.belumDiisi,
    counts: sumCounts(k.anggota.map((a) => a.totals)),
    persenRata: nilai.length ? nilai.reduce((a, b) => a + b, 0) / nilai.length : null,
    anggotaTanpaData: k.anggota.length - nilai.length,
  };
}

const urutKelas = (a: MaahirKelasRingkas, b: MaahirKelasRingkas) =>
  a.gender.localeCompare(b.gender) || a.kelasName.localeCompare(b.kelasName, "id");

// ── Sheet: At-Tibyan ────────────────────────────────────────────────────────

/** Passed through from `rekap/tibyan` — already aggregated upstream. */
export type MaahirTibyanSheet = {
  kpi: MaahirTibyanKpi;
  distribusi: MaahirCounts;
  ranking: MaahirTibyanPayload["ranking"];
  trend: MaahirTibyanPayload["trend"];
  perhatianAnggota: MaahirTibyanPayload["perhatian"]["anggota"];
  perhatianKelas: MaahirTibyanPayload["perhatian"]["kelas"];
};

// ── Sheet: SP ───────────────────────────────────────────────────────────────

/**
 * The cumulative SP list — and, next to it, the per-period SP summary that the
 * dashboard shows. The two are different windows over the same members (docs
 * §9), so the sheet prints both side by side WITH their windows rather than
 * letting a reader assume the dashboard is wrong.
 */
export type MaahirSpSheet = {
  /** Program start; from the payload, which is what the count actually used. */
  mulai: string;
  cutoff: string;
  summary: MaahirSpSummary;
  rows: MaahirSpRow[];
  /** The `laporan-maahir` SP block: same members, one period only. */
  perPeriode: { periode: string | null; summary: MaahirSpSummary } | null;
};

// ── Sheet: Presensi Belum Diisi ─────────────────────────────────────────────

export type MaahirBelumDiisiRow = {
  kelasName: string;
  gender: MaahirGender;
  /** "2026-08-04" — split out of upstream's combined string, see `pisahTanggal`. */
  tanggal: string;
  /** "Kelas Maahir" | "At-Tibyan" — which program's session is missing. */
  program: string;
  /** How many sessions of that class are still empty in the whole window. */
  jumlahKelas: number;
};

/**
 * `presensiTakTerisi[].tanggal` is NOT a bare date: the captured responses put
 * the programme after it ("2026-08-04 Kelas Maahir"), because one class runs
 * both Kelas Maahir and At-Tibyan sessions and the date alone would be
 * ambiguous. Split it so the date stays sortable and the programme stays
 * visible; an unexpected shape is passed through as the date rather than
 * dropped.
 */
function pisahTanggal(raw: string): { tanggal: string; program: string | null } {
  const m = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(raw.trim());
  if (!m) return { tanggal: raw, program: null };
  return { tanggal: m[1], program: m[2].trim() || null };
}

// ── Sheet: Matrix Guru ──────────────────────────────────────────────────────

/**
 * One teacher's scorecard row, passed through untouched.
 *
 * `skor` is upstream's snapshot row or `null` when that teacher has none at all.
 * NOTHING here is derived: the four `rata_rata_*` fields are upstream's own
 * averages and `ranking` is upstream's own position across the whole of HITS
 * (docs §9 — the API will not recompute the snapshot, and neither will we). In
 * the 3 Sep capture 42% of the 14 indicator cells are null; every one of them is
 * "belum dinilai", never a zero.
 */
export type MaahirMatrixBaris = {
  nama: string;
  kelompok: string;
  gender: MaahirGender;
  /** false = deactivated in Maahir but still present in the snapshot. */
  active: boolean;
  skor: MaahirMatrixSkor | null;
};

export type MaahirMatrixSheet = {
  /**
   * From `matrixSnapshotState()`. Anything other than `"siap"` MUST be stated on
   * the sheet: `"basi"` means the snapshot predates the end of the requested
   * month, `"belum-dihitung"` means it was never computed and upstream still
   * answered 200 with a full teacher list and `matrix: null` on every row.
   */
  keadaan: "siap" | "basi" | "belum-dihitung";
  /** ISO timestamp of upstream's last recompute, from `meta`. */
  snapshotTerakhir: string | null;
  rows: MaahirMatrixBaris[];
  /** Row counts of this sheet — not a re-derivation of any delivered figure. */
  dinilai: number;
  belumDinilai: number;
};

// ── Sheet: Disiplin Pengajar ────────────────────────────────────────────────

/** A tabayyun case with the teacher it belongs to resolved from the ranked lists
 *  (`insidenByPengajar` is keyed by id only). */
export type MaahirDisiplinInsidenBaris = MaahirDisiplinInsiden & {
  pengajarNama: string | null;
  gender: MaahirGender | null;
};

/**
 * `rekap/hits-disiplin`, `mode=bulan` — the FULL calendar month, a different
 * window from every Maahir sheet in this book (docs §9). `start`/`end` come from
 * the payload, `periodeLabel` is upstream's own "2026-08".
 */
export type MaahirDisiplinSheet = {
  mode: "bulan" | "minggu";
  start: string;
  end: string;
  periodeLabel: string;
  genderLabel: string;
  counts: MaahirHitsDisiplinPayload["counts"];
  /** Delivered order kept: upstream already ranked these. */
  ranked: MaahirDisiplinRanked[];
  /** Teachers with nothing to score. Kept apart so they never rank last. */
  noData: MaahirDisiplinRanked[];
  insiden: MaahirDisiplinInsidenBaris[];
};

// ── Sheet: Shakwa ───────────────────────────────────────────────────────────

/**
 * Ticket queue for the window. Every headline number is upstream's; the sheet
 * never counts `items` itself (docs §9).
 *
 * What is deliberately absent: the reporter's WhatsApp number, which the API
 * never emits (docs §6/§7), and the attachments themselves — only
 * `jumlahLampiran` exists (docs §9). No column here asks for either.
 */
export type MaahirShakwaSheet = {
  mulai: string;
  sampai: string;
  total: number;
  belumDitangani: number;
  perKategori: MaahirShakwaPayload["perKategori"];
  perStatus: MaahirShakwaPayload["perStatus"];
  items: MaahirShakwaItem[];
};

// ── The workbook's data ─────────────────────────────────────────────────────

export type MaahirBulanan = {
  /** The month we ASKED for ("2026-08"). Never used as a label — see `periode`. */
  bulan: string;
  /** The 28→27 window as upstream reported it, or null when nothing was pulled. */
  periode: string | null;
  dibuatPada: string; // YYYY-MM-DD WIB
  sumber: MaahirSumber[];
  /** null = `rekap/laporan-maahir` was never pulled for this month. */
  ringkasan: MaahirRingkasan | null;
  kehadiran: MaahirKelasRingkas[] | null;
  tibyan: MaahirTibyanSheet | null;
  sp: MaahirSpSheet | null;
  belumDiisi: MaahirBelumDiisiRow[] | null;
  matrix: MaahirMatrixSheet | null;
  disiplin: MaahirDisiplinSheet | null;
  shakwa: MaahirShakwaSheet | null;
};

export function sumber(data: MaahirBulanan, route: MaahirRekapRouteName): MaahirSumber {
  const found = data.sumber.find((s) => s.route === route);
  if (!found) throw new Error(`Sumber ${route} tidak ada di data laporan bulanan Maahir`);
  return found;
}

/** True when not a single route had a cached row — the workbook is all reasons. */
export function kosongSeluruhnya(data: MaahirBulanan): boolean {
  return data.sumber.every((s) => s.status === "belum-ditarik");
}

/** The seven cached rows the workbook is built from; `null` = never pulled. */
export type MaahirBulananReads = {
  laporan: MaahirRekapRead<MaahirLaporanPayload> | null;
  kehadiran: MaahirRekapRead<MaahirKehadiranPayload> | null;
  tibyan: MaahirRekapRead<MaahirTibyanPayload> | null;
  sp: MaahirRekapRead<MaahirSpPayload> | null;
  matrix: MaahirRekapRead<MaahirMatrixPayload> | null;
  disiplin: MaahirRekapRead<MaahirHitsDisiplinPayload> | null;
  shakwa: MaahirRekapRead<MaahirShakwaPayload> | null;
};

/**
 * Assemble the workbook's data for one month.
 *
 * `bulan` is "YYYY-MM" and is only ever sent to the read layer; every label the
 * sheets print comes back from `meta`. Each route is read independently, so a
 * month where only `rekap/sp` exists still produces a usable book with seven
 * explained empty sheets.
 *
 * The same `bulan` string resolves to three different windows upstream — 28→27
 * for the Maahir reports, the full calendar month for `hits-disiplin`, a day
 * range for `shakwa` — which is exactly why it is passed on rather than turned
 * into a label here.
 */
export async function loadMaahirBulanan(
  bulan: string,
  opts: { generatedAt?: string } = {},
): Promise<MaahirBulanan> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) {
    throw new Error(`Bulan harus YYYY-MM, dapat: ${bulan}`);
  }

  const [laporan, kehadiran, tibyan, sp, matrix, disiplin, shakwa] = await Promise.all([
    readLaporanMaahir(bulan),
    readKehadiran(bulan),
    readTibyan(bulan),
    readSp(),
    readMatrixGuru(bulan),
    readHitsDisiplin(bulan),
    readShakwa(bulan),
  ]);

  return bentukMaahirBulanan(
    bulan,
    { laporan, kehadiran, tibyan, sp, matrix, disiplin, shakwa },
    opts,
  );
}

/**
 * The shaping itself — pure, so it can be tested against the captured fixtures
 * with no database (spec: "Fungsi murni, mengikuti pola teacher-attendance").
 */
export function bentukMaahirBulanan(
  bulan: string,
  { laporan, kehadiran, tibyan, sp, matrix, disiplin, shakwa }: MaahirBulananReads,
  opts: { generatedAt?: string } = {},
): MaahirBulanan {
  const sumberList: MaahirSumber[] = [
    sumberOf("rekap/laporan-maahir", laporan, bulan),
    sumberOf("rekap/kehadiran", kehadiran, bulan),
    sumberOf("rekap/tibyan", tibyan, bulan),
    sumberOf("rekap/sp", sp, bulan),
    sumberOf("rekap/matrix-guru", matrix, bulan),
    sumberOf("rekap/hits-disiplin", disiplin, bulan),
    sumberOf("rekap/shakwa", shakwa, bulan),
  ];

  const l = laporan?.payload ?? null;
  const ringkasan: MaahirRingkasan | null = l
    ? {
        baris: ringkasanBaris(l),
        dibawahTarget: [
          ...targetRows(BLOK_LABEL.takhassus, l.takhassus.dibawahTarget.list),
          ...targetRows(BLOK_LABEL.maahir, l.maahir.dibawahTarget.list),
          ...targetRows(BLOK_LABEL.atTibyan, l.atTibyan.dibawahTarget.list),
        ].sort((a, b) => a.persen - b.persen || a.name.localeCompare(b.name, "id")),
        notes: l.notes,
      }
    : null;

  const t = tibyan?.payload ?? null;

  return {
    bulan,
    // The Maahir window, taken from whichever report route answered. `sp` is
    // excluded on purpose: it is cumulative and carries no window.
    periode: periodLabel(laporan?.meta) ?? periodLabel(kehadiran?.meta) ?? periodLabel(tibyan?.meta),
    dibuatPada: opts.generatedAt ?? todayJakarta(),
    sumber: sumberList,
    ringkasan,
    kehadiran: kehadiran ? kehadiran.payload.map(kelasRingkas).sort(urutKelas) : null,
    tibyan: t
      ? {
          kpi: t.kpi,
          distribusi: t.distribusi,
          ranking: [...t.ranking].sort(
            // Unscored classes last: a null persen is "belum dinilai", and
            // sorting it as 0 would put it at the bottom for the wrong reason.
            (a, b) => (a.persen == null ? 1 : b.persen == null ? -1 : b.persen - a.persen),
          ),
          trend: [...t.trend].sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
          perhatianAnggota: [...t.perhatian.anggota].sort(
            (a, b) => b.alphaBeruntun - a.alphaBeruntun || a.persen - b.persen,
          ),
          perhatianKelas: [...t.perhatian.kelas].sort((a, b) => a.persen - b.persen),
        }
      : null,
    sp: sp
      ? {
          mulai: sp.payload.mulai,
          cutoff: sp.payload.cutoff,
          summary: sp.payload.summary,
          rows: [...sp.payload.list].sort(
            (a, b) => b.sp - a.sp || b.spKotor - a.spKotor || a.name.localeCompare(b.name, "id"),
          ),
          perPeriode: l ? { periode: periodLabel(laporan?.meta), summary: l.sp.summary } : null,
        }
      : null,
    belumDiisi: l
      ? l.presensiTakTerisi
          .flatMap((k) =>
            k.tanggal.map((raw) => {
              const { tanggal, program } = pisahTanggal(raw);
              return {
                kelasName: k.kelasName,
                gender: k.gender,
                tanggal,
                program: program ?? "",
                jumlahKelas: k.jumlah,
              };
            }),
          )
          .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.kelasName.localeCompare(b.kelasName, "id"))
      : null,
    matrix: matrix ? matrixSheet(matrix) : null,
    disiplin: disiplin ? disiplinSheet(disiplin.payload) : null,
    shakwa: shakwa ? shakwaSheet(shakwa.payload) : null,
  };
}

/**
 * `rekap/matrix-guru` → the scorecard sheet.
 *
 * The only transformation is ORDER, and the sort key is upstream's own
 * `ranking` — a teacher with no rank (11 of 177 in the capture) sorts last by
 * name rather than being treated as rank 0. No score is touched, no average is
 * recomputed, no blank is filled.
 */
function matrixSheet(read: MaahirRekapRead<MaahirMatrixPayload>): MaahirMatrixSheet {
  const rows: MaahirMatrixBaris[] = [...(read.payload.pengajar ?? [])]
    .map((p) => ({
      nama: p.nama,
      kelompok: p.kelompok,
      gender: p.gender,
      active: p.active,
      skor: p.matrix,
    }))
    .sort((a, b) => {
      const ra = a.skor?.ranking ?? null;
      const rb = b.skor?.ranking ?? null;
      if (ra !== rb) {
        if (ra == null) return 1;
        if (rb == null) return -1;
        return ra - rb;
      }
      return a.nama.localeCompare(b.nama, "id");
    });

  const dinilai = rows.filter((r) => r.skor?.rata_rata_keseluruhan != null).length;
  return {
    keadaan: matrixSnapshotState(read.meta, read.payload),
    snapshotTerakhir: read.meta.snapshot_terakhir ?? null,
    rows,
    dinilai,
    belumDinilai: rows.length - dinilai,
  };
}

/**
 * `rekap/hits-disiplin` → the discipline sheet.
 *
 * `ranked` and `noData` keep the delivered order — upstream ranked them, and
 * re-sorting a rank column is how a "peringkat" ends up disagreeing with the
 * screen. Only `insidenByPengajar` is reshaped: it arrives keyed by id, so each
 * case is joined back to the name in the ranked lists and the whole lot is put
 * in date order. A case whose teacher is in neither list keeps a null name
 * rather than being dropped.
 */
function disiplinSheet(p: MaahirHitsDisiplinPayload): MaahirDisiplinSheet {
  const ranked = [...(p.ranked ?? [])];
  const noData = [...(p.noData ?? [])];
  const nama = new Map<string, MaahirDisiplinRanked>(
    [...ranked, ...noData].map((r) => [r.pengajarId, r]),
  );

  const insiden = Object.entries(p.insidenByPengajar ?? {})
    .flatMap(([pengajarId, list]) =>
      (list ?? []).map((i) => ({
        ...i,
        pengajarNama: nama.get(pengajarId)?.pengajarNama ?? null,
        gender: nama.get(pengajarId)?.gender ?? null,
      })),
    )
    .sort(
      (a, b) =>
        a.tanggal.localeCompare(b.tanggal) ||
        (a.pengajarNama ?? "").localeCompare(b.pengajarNama ?? "", "id") ||
        a.halaqahName.localeCompare(b.halaqahName, "id"),
    );

  return {
    mode: p.mode,
    start: p.start,
    end: p.end,
    periodeLabel: p.periodeLabel,
    genderLabel: p.genderLabel,
    counts: p.counts,
    ranked,
    noData,
    insiden,
  };
}

/**
 * `rekap/shakwa` → the ticket sheet. Counters are copied, never re-summed from
 * `items`; only the ticket order is ours (newest first, by upstream's
 * `createdAt`).
 */
function shakwaSheet(p: MaahirShakwaPayload): MaahirShakwaSheet {
  return {
    mulai: p.mulai,
    sampai: p.sampai,
    total: p.total,
    belumDitangani: p.belumDitangani,
    perKategori: [...(p.perKategori ?? [])],
    perStatus: [...(p.perStatus ?? [])],
    items: [...(p.items ?? [])].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
      a.nomorTiket.localeCompare(b.nomorTiket),
    ),
  };
}

/** The recap table, one metric per row across the three blocks. */
function ringkasanBaris(l: MaahirLaporanPayload): MaahirRingkasanBaris[] {
  const tk = l.takhassus;
  const mh = l.maahir;
  const tb = l.atTibyan;
  const pct = (
    metrik: string,
    takhassus: number | null,
    maahir: number | null,
    atTibyan: number | null,
    catatan: string | null = null,
  ): MaahirRingkasanBaris => ({ metrik, satuan: "persen", takhassus, maahir, atTibyan, catatan });
  const num = (
    metrik: string,
    takhassus: number | null,
    maahir: number | null,
    atTibyan: number | null,
    catatan: string | null = null,
  ): MaahirRingkasanBaris => ({ metrik, satuan: "angka", takhassus, maahir, atTibyan, catatan });

  return [
    pct("Rata-rata kehadiran ikhwan", tk.kehadiran.avgIkhwan, mh.kehadiran.avgIkhwan, tb.kehadiran.avgIkhwan),
    pct("Rata-rata kehadiran akhwat", tk.kehadiran.avgAkhwat, mh.kehadiran.avgAkhwat, tb.kehadiran.avgAkhwat),
    pct("Kehadiran aktual", tk.kehadiran.aktual, mh.kehadiran.aktual, tb.kehadiran.aktual),
    pct("Benchmark kehadiran", tk.kehadiran.benchmark, mh.kehadiran.benchmark, tb.kehadiran.benchmark),
    pct(
      "Selisih terhadap benchmark",
      tk.kehadiran.aktual - tk.kehadiran.benchmark,
      mh.kehadiran.aktual - mh.kehadiran.benchmark,
      tb.kehadiran.aktual - tb.kehadiran.benchmark,
      "Negatif = di bawah benchmark.",
    ),
    num(
      "Anggota di bawah target",
      tk.dibawahTarget.jumlah,
      mh.dibawahTarget.jumlah,
      tb.dibawahTarget.total,
      "Daftar namanya ada di bawah tabel ini.",
    ),
    // At-Tibyan is the only block that splits this by gender; the other two
    // report one number, so their cells stay a placeholder rather than a 0.
    num("— ikhwan", null, null, tb.dibawahTarget.ikhwan, "Hanya At-Tibyan yang memecah per gender."),
    num("— akhwat", null, null, tb.dibawahTarget.akhwat, null),
    pct("Kehadiran pengajar", tk.kehadiranPengajar, mh.kehadiranPengajar, null, "At-Tibyan tidak melaporkan kehadiran pengajar."),
    num("Pengajar di bawah target", tk.pengajarDibawahTarget, mh.pengajarDibawahTarget, null),
    num(
      "Setoran — benchmark (halaman)",
      tk.setoran.adaTarget ? tk.setoran.benchmark : null,
      null,
      null,
      tk.setoran.adaTarget ? "Hanya blok Takhassus yang punya setoran." : "Target setoran belum ditetapkan untuk periode ini.",
    ),
    num("Setoran — aktual (halaman)", tk.setoran.aktual, null, null),
    pct("Setoran — capaian", tk.setoran.adaTarget ? tk.setoran.persen : null, null, null),
    num("Peserta setoran tercatat", tk.setoran.peserta.length, null, null),
  ];
}
