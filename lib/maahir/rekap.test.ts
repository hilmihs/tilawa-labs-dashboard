/**
 * Checks the Maahir rekap types and pure helpers against the REAL responses
 * captured on 3 Sep 2026 (`lib/maahir/__fixtures__/*.json`). No network, no DB.
 *
 * The point is not to re-describe the fixtures — it is to make a claim in
 * `types.ts` fail loudly. Each shape test walks EVERY row of the fixture (not
 * just the first) and asserts that every field the type promises is actually
 * present with that runtime type. Extra keys are tolerated on purpose: the
 * payload is stored verbatim, so upstream may add fields without a migration.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matrixSnapshotState, periodLabel } from "./rekap";
import type {
  MaahirHitsDisiplinPayload,
  MaahirKehadiranPayload,
  MaahirLaporanPayload,
  MaahirMatrixPayload,
  MaahirRekapEnvelope,
  MaahirShakwaPayload,
  MaahirSpPayload,
  MaahirTibyanPayload,
} from "./types";
import {
  maahirRekapPulls,
  rekapParams,
  rekapParamsKey,
  rekapPeriode,
  bulanLaporan,
  rekapMonths,
  reportWindow,
  shiftMonth,
} from "@/lib/integrations/maahir/rekap-routes";

function fixture<T>(name: string): MaahirRekapEnvelope<T> {
  const path = join(__dirname, "__fixtures__", `${name}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as MaahirRekapEnvelope<T>;
}

// ── tiny structural assertions ──────────────────────────────────────────────

type Pred = (v: unknown) => boolean;

const str: Pred = (v) => typeof v === "string";
const num: Pred = (v) => typeof v === "number";
const bool: Pred = (v) => typeof v === "boolean";
const nullable =
  (p: Pred): Pred =>
  (v) =>
    v === null || p(v);
const arrOf =
  (p: Pred): Pred =>
  (v) =>
    Array.isArray(v) && v.every(p);
const obj: Pred = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const recordOf =
  (p: Pred): Pred =>
  (v) =>
    obj(v) && Object.values(v as object).every(p);
const oneOf =
  (...allowed: unknown[]): Pred =>
  (v) =>
    allowed.includes(v);

/** Collects every violation so a failure names the row and field, not just "false". */
function expectShape(rows: unknown[], spec: Record<string, Pred>, label: string) {
  const problems: string[] = [];
  rows.forEach((row, i) => {
    if (!obj(row)) {
      problems.push(`${label}[${i}] is not an object`);
      return;
    }
    const r = row as Record<string, unknown>;
    for (const [key, pred] of Object.entries(spec)) {
      if (!(key in r)) problems.push(`${label}[${i}].${key} missing`);
      else if (!pred(r[key])) problems.push(`${label}[${i}].${key} = ${JSON.stringify(r[key])?.slice(0, 60)}`);
    }
  });
  expect(problems.slice(0, 10)).toEqual([]);
  expect(rows.length).toBeGreaterThan(0);
}

const gender = oneOf("ikhwan", "akhwat");
const counts: Pred = (v) =>
  obj(v) && (["H", "I", "S", "A", "T"] as const).every((k) => num((v as Record<string, unknown>)[k]));

const anggotaKehadiranSpec: Record<string, Pred> = {
  anggotaId: str,
  name: str,
  kelasName: str,
  gender,
  counts,
  filled: num,
  terisi: num,
  tidakHadir: num,
  persen: num,
  keterangan: str,
  mulaiTanggal: nullable(str),
  online: num,
  diputihkan: nullable(arrOf(obj)),
};

const kelasGridSpec: Record<string, Pred> = {
  kelasId: str,
  kelasName: str,
  gender,
  jadwalHari: arrOf(str),
  pertemuan: arrOf(obj),
  anggota: arrOf(obj),
  sessions: arrOf(obj),
  belumDiisi: num,
};

const rankedSpec: Record<string, Pred> = {
  pengajarId: str,
  pengajarNama: str,
  gender,
  halaqahCount: num,
  halaqahIds: arrOf(str),
  kbbs: num,
  nonLibur: num,
  kmt: num,
  kbla: num,
  jkg: num,
  tidakLatihan: num,
  onTimeBaik: num,
  onTimeTotal: num,
  stabilBaik: num,
  stabilTotal: num,
  hutangSaldo: num,
  pctOnTime: nullable(num),
  pctStabil: nullable(num),
  pctKbbs: nullable(num),
  rank: nullable(num),
};

// ── payload shapes ──────────────────────────────────────────────────────────

describe("rekap/laporan-maahir payload", () => {
  const { data } = fixture<MaahirLaporanPayload>("laporan-maahir");

  it("has the three blocks plus the two actionable lists", () => {
    expect(data.month).toBe("2026-08");
    expect(Object.keys(data).sort()).toEqual(
      ["atTibyan", "maahir", "month", "notes", "presensiTakTerisi", "sp", "takhassus"].sort(),
    );
    expect(Array.isArray(data.notes)).toBe(true);
  });

  it("types the takhassus block, setoran included", () => {
    expectShape([data.takhassus.setoran], {
      benchmark: num,
      aktual: num,
      persen: num,
      adaTarget: bool,
      peserta: arrOf(obj),
    }, "takhassus.setoran");
    expectShape(data.takhassus.setoran.peserta, {
      anggotaId: str,
      name: str,
      gender,
      kelasName: str,
      halaman: num,
      pertemuanSetor: num,
      rincian: str,
      sesiTarget: num,
      target: num,
      persen: num,
    }, "takhassus.setoran.peserta");
    expectShape([data.takhassus], {
      kehadiranPengajar: num,
      pengajarDibawahTarget: num,
      catatan: nullable(str),
    }, "takhassus");
  });

  it("counts kehadiran per gender against a benchmark in all three blocks", () => {
    const spec = { avgIkhwan: num, avgAkhwat: num, aktual: num, benchmark: num };
    expectShape(
      [data.takhassus.kehadiran, data.maahir.kehadiran, data.atTibyan.kehadiran],
      spec,
      "kehadiran",
    );
  });

  it("splits dibawahTarget differently for at-Tibyan than for the other two", () => {
    expectShape([data.takhassus.dibawahTarget, data.maahir.dibawahTarget], {
      jumlah: num,
      list: arrOf(obj),
    }, "dibawahTarget");
    // At-Tibyan reports ikhwan/akhwat/total and has NO `jumlah`; a page that
    // assumes one shape for all three blocks renders undefined.
    expectShape([data.atTibyan.dibawahTarget], {
      ikhwan: num,
      akhwat: num,
      total: num,
      list: arrOf(obj),
    }, "atTibyan.dibawahTarget");
    expect("jumlah" in data.atTibyan.dibawahTarget).toBe(false);
  });

  it("types every member row of every dibawahTarget list", () => {
    expectShape(
      [
        ...data.takhassus.dibawahTarget.list,
        ...data.maahir.dibawahTarget.list,
        ...data.atTibyan.dibawahTarget.list,
      ],
      anggotaKehadiranSpec,
      "dibawahTarget.list",
    );
  });

  it("lists unfilled presensi per class with its dates", () => {
    expectShape(data.presensiTakTerisi, {
      kelasName: str,
      gender,
      jumlah: num,
      tanggal: arrOf(str),
    }, "presensiTakTerisi");
  });

  it("carries a per-period SP block (perBulan = true)", () => {
    expect(data.sp.perBulan).toBe(true);
    expect(data.sp.mulai).toBe("2026-07-28");
    expect(data.sp.cutoff).toBe("2026-08-27");
    expectShape([data.sp.summary], {
      total: num,
      sp1: num,
      sp2: num,
      sp3: num,
      diputihkan: num,
    }, "sp.summary");
  });
});

describe("rekap/sp payload", () => {
  const { data, meta } = fixture<MaahirSpPayload>("sp");

  it("is cumulative since program start, not the report month", () => {
    // Docs §9 + spec: the two SP numbers must never be compared. The fixture
    // proves they differ — same list shape, different window and totals.
    expect(data.perBulan).toBe(false);
    expect(data.mulai).toBe("2026-01-01");
    expect(data.cutoff).toBe("2026-09-03");
    expect(meta.cutoff).toBe("2026-09-03");
    expect(data.summary.total).toBeGreaterThan(
      fixture<MaahirLaporanPayload>("laporan-maahir").data.sp.summary.total,
    );
  });

  it("types every SP row, penetapan and pemutihan included", () => {
    expectShape(data.list, {
      anggotaId: str,
      name: str,
      kelasName: str,
      gender,
      hadir: num,
      terlambat: num,
      izin: num,
      sakit: num,
      alpa: num,
      sp: num,
      spKotor: num,
      penetapan: arrOf(obj),
      diputihkan: arrOf(obj),
    }, "sp.list");

    expectShape(data.list.flatMap((r) => r.penetapan), {
      level: num,
      tanggal: str,
      pemicu: str,
    }, "penetapan");

    expectShape(data.list.flatMap((r) => r.diputihkan), {
      id: str,
      anggotaId: str,
      tanggal: nullable(str),
      month: str,
      alasan: str,
      oleh: str,
      pada: str,
    }, "diputihkan");
  });
});

describe("rekap/kehadiran payload", () => {
  const { data } = fixture<MaahirKehadiranPayload>("kehadiran");

  it("is an array of class grids", () => {
    expect(Array.isArray(data)).toBe(true);
    expectShape(data, kelasGridSpec, "kehadiran");
  });

  it("types meetings, sessions and members", () => {
    expectShape(data.flatMap((k) => k.pertemuan), {
      id: str,
      program: oneOf("kelas_maahir", "at_tibyan", "muallim_najih"),
      programLabel: str,
      tanggal: str,
    }, "pertemuan");

    expectShape(data.flatMap((k) => k.sessions), {
      tanggal: str,
      program: oneOf("kelas_maahir", "at_tibyan", "muallim_najih"),
      programLabel: str,
      mingguan: bool,
      filled: bool,
    }, "sessions");

    expectShape(data.flatMap((k) => k.anggota), {
      anggotaId: str,
      name: str,
      isKetua: bool,
      isWakil: bool,
      perPertemuan: recordOf(oneOf("H", "I", "S", "A", "T", "-")),
      catatanPerPertemuan: recordOf(str),
      keterangan: str,
      totals: counts,
      // null when nothing counts toward the denominator — NOT zero attendance.
      persenHadir: nullable(num),
    }, "anggota");
  });

  it("keys perPertemuan by pertemuan id", () => {
    const kelas = data.find((k) => k.anggota.some((a) => Object.keys(a.perPertemuan).length > 0))!;
    const ids = new Set(kelas.pertemuan.map((p) => p.id));
    const stray = kelas.anggota.flatMap((a) => Object.keys(a.perPertemuan)).filter((id) => !ids.has(id));
    expect(stray).toEqual([]);
  });
});

describe("rekap/tibyan payload", () => {
  const { data } = fixture<MaahirTibyanPayload>("tibyan");

  it("reuses the class grid and adds kpi / ranking / trend / distribusi / perhatian", () => {
    expectShape(data.perKelas, kelasGridSpec, "tibyan.perKelas");
    expectShape([data.kpi], {
      overallPersen: num,
      totalSesi: num,
      totalAnggota: num,
      kelasDiBawahTarget: num,
    }, "tibyan.kpi");
    expectShape(data.ranking, {
      kelasId: str,
      kelasName: str,
      gender,
      persen: nullable(num),
      anggota: num,
    }, "tibyan.ranking");
    expectShape(data.trend, { tanggal: str, persen: num }, "tibyan.trend");
    expect(counts(data.distribusi)).toBe(true);
  });

  it("flags members with a run of alpha and classes below target", () => {
    expectShape(data.perhatian.anggota, {
      anggotaId: str,
      name: str,
      kelasName: str,
      gender,
      persen: num,
      alphaBeruntun: num,
    }, "perhatian.anggota");
    expectShape(data.perhatian.kelas, {
      kelasName: str,
      gender,
      persen: num,
    }, "perhatian.kelas");
  });
});

describe("rekap/matrix-guru payload", () => {
  const { data, meta } = fixture<MaahirMatrixPayload>("matrix-guru");

  it("types the teacher rows and their nullable snapshot", () => {
    expectShape(data.pengajar, {
      pengajar_id: str,
      nama: str,
      kelompok: str,
      gender,
      active: bool,
      matrix: nullable(obj),
    }, "matrix.pengajar");
  });

  it("types every score as nullable — an unscored component is not a zero", () => {
    const matrices = data.pengajar.map((p) => p.matrix).filter((m): m is NonNullable<typeof m> => m != null);
    expectShape(matrices, {
      id: str,
      pengajar_id: str,
      year_month: str,
      skor_bacaan: nullable(num),
      skor_hafalan: nullable(num),
      skor_tajwid: nullable(num),
      skor_kehadiran_maahir: nullable(num),
      skor_kehadiran_tibyan: nullable(num),
      skor_kehadiran_muallim: nullable(num),
      rata_rata_hard_skill: nullable(num),
      skor_metode_pengajaran: nullable(num),
      skor_kepatuhan_silabus: nullable(num),
      skor_manajemen_halaqah: nullable(num),
      skor_evaluasi_penguasaan: nullable(num),
      rata_rata_pedagogis: nullable(num),
      skor_kedisiplinan_waktu: nullable(num),
      skor_komitmen_jadwal: nullable(num),
      skor_tanggung_jawab: nullable(num),
      skor_kepatuhan_sop: nullable(num),
      rata_rata_soft_skill: nullable(num),
      rata_rata_keseluruhan: nullable(num),
      ranking: nullable(num),
      total_teguran_bulan: num,
      total_teguran_kumulatif: num,
      finalized_at: nullable(str),
      updated_at: str,
      created_at: str,
    }, "matrix");
    expect(matrices.every((m) => m.year_month === meta.bulan)).toBe(true);
  });
});

describe("rekap/hits-disiplin payload", () => {
  const { data } = fixture<MaahirHitsDisiplinPayload>("hits-disiplin");

  it("keeps ranked and noData apart, both with the same row shape", () => {
    expect(data.mode).toBe("bulan");
    expect(data.periodeLabel).toBe("2026-08");
    expect(data.genderLabel).toBe("Ikhwan & Akhwat");
    expectShape(data.ranked, rankedSpec, "ranked");
    expectShape(data.noData, rankedSpec, "noData");
    // Teachers with nothing to score have no rank — they must not sort last.
    expect(data.noData.every((r) => r.rank === null && r.pctKbbs === null)).toBe(true);
    expect(data.ranked.every((r) => r.rank !== null)).toBe(true);
    expectShape([data.counts], {
      total: num,
      bermasalah: num,
      obsBelum: num,
      obsLengkap: num,
    }, "counts");
  });

  it("types tabayyun incidents keyed by teacher", () => {
    const insiden = Object.values(data.insidenByPengajar).flat();
    expectShape(insiden, {
      keteranganId: str,
      tabayyunId: str,
      halaqahId: str,
      halaqahName: str,
      tanggal: str,
      pertemuanNo: num,
      pelanggaran: arrOf(obj),
      catatanKetua: nullable(str),
      status: oneOf("pending", "nunggu_alasan", "diputus"),
      alasanPengajar: nullable(str),
      dariIzin: bool,
      isUdzurSyari: nullable(bool),
      keputusanCatatan: nullable(str),
      decidedAt: nullable(str),
    }, "insiden");
    expectShape(insiden.flatMap((i) => i.pelanggaran), {
      jenis: oneOf("KMT", "KBLA", "JKG", "TIDAK_LATIHAN", "BADAL"),
      detail: str,
    }, "pelanggaran");
  });

  it("types cakupan and hutang, both keyed by teacher", () => {
    const cakupan = Object.values(data.cakupanByPengajar);
    expectShape(cakupan, {
      pengajarId: str,
      pertemuan: arrOf(obj),
      sudah: num,
      belum: num,
      total: num,
      persen: nullable(num),
    }, "cakupan");
    expectShape(cakupan.flatMap((c) => c.pertemuan), {
      tanggal: str,
      halaqahId: str,
      halaqahName: str,
      pertemuanNo: num,
      status: oneOf("sudah", "belum", "pragenerate"),
      libur: bool,
    }, "cakupan.pertemuan");
    expectShape(Object.values(data.hutangByPengajar).flat(), {
      keterangan_id: str,
      tanggal: str,
      jenis: oneOf("KMT", "KBLA", "JKG", "TIDAK_LATIHAN", "BADAL"),
      debit: num,
      terbayar: num,
      sisa: num,
      status: oneOf("belum", "sebagian", "lunas"),
      halaqahId: str,
      halaqahName: str,
    }, "hutang");
  });
});

describe("rekap/shakwa payload", () => {
  const { data } = fixture<MaahirShakwaPayload>("shakwa");

  it("buckets tickets by category and status", () => {
    expectShape(data.perKategori, { kategori: str, label: str, jumlah: num }, "perKategori");
    expectShape(data.perStatus, {
      status: oneOf("submitted", "in_review", "resolved", "closed"),
      label: str,
      jumlah: num,
    }, "perStatus");
    // All four statuses always come back, zeroes included — safe to render as a
    // fixed row of buckets.
    expect(data.perStatus.map((s) => s.status)).toEqual([
      "submitted",
      "in_review",
      "resolved",
      "closed",
    ]);
    expect(data.total).toBe(data.items.length);
  });

  it("types the tickets and never exposes a reporter phone number", () => {
    expectShape(data.items, {
      id: str,
      nomorTiket: str,
      pelaporType: oneOf("pengajar", "peserta"),
      kategori: str,
      kategoriLabel: str,
      gender,
      nama: str,
      halaqahLabel: str,
      pengajarNama: nullable(str),
      isi: str,
      jawaban: recordOf(str),
      status: oneOf("submitted", "in_review", "resolved", "closed"),
      statusLabel: str,
      catatanKoordinator: nullable(str),
      ditanganiAt: nullable(str),
      jumlahLampiran: num,
      izin: arrOf(obj),
      createdAt: str,
    }, "shakwa.items");
    const keys = new Set(data.items.flatMap((i) => Object.keys(i)));
    expect([...keys].filter((k) => /whatsapp|phone|telepon|(^|_)(wa|hp)($|_)/i.test(k))).toEqual([]);
    expectShape(data.items.flatMap((i) => i.izin), {
      tanggal: str,
      jenis: str,
      jenisLabel: str,
      menit: nullable(num),
      jadwalGanti: str,
      halaqahName: str,
      sudahTerpakai: bool,
    }, "shakwa.izin");
  });
});

// ── periodLabel: the window comes from meta, never from the month name ───────

describe("periodLabel", () => {
  const laporan = fixture<MaahirLaporanPayload>("laporan-maahir").meta;
  const disiplin = fixture<MaahirHitsDisiplinPayload>("hits-disiplin").meta;

  it("uses meta.mulai/meta.sampai for the Maahir 28→27 window", () => {
    expect(laporan.bulan).toBe("2026-08");
    expect(periodLabel(laporan)).toBe("28 Jul – 27 Agu 2026");
  });

  it("uses meta.mulai/meta.sampai for the hits-disiplin calendar month", () => {
    expect(disiplin.periode).toBe("2026-08");
    expect(periodLabel(disiplin)).toBe("1 Agu – 1 Sep 2026");
  });

  it("keeps the two apart even though both are 'bulan 2026-08'", () => {
    // The whole reason the label may not be derived from the month name.
    expect(periodLabel(laporan)).not.toBe(periodLabel(disiplin));
  });

  it("falls back to meta.bulan only when there is no window", () => {
    expect(periodLabel({ bulan: "2026-08" })).toBe("Agustus 2026");
    expect(periodLabel({ bulan: "2026-08", mulai: "2026-07-28", sampai: "2026-08-27" })).toBe(
      "28 Jul – 27 Agu 2026",
    );
  });

  it("keeps both years when the window crosses a year boundary", () => {
    expect(periodLabel({ mulai: "2025-12-28", sampai: "2026-01-27" })).toBe(
      "28 Des 2025 – 27 Jan 2026",
    );
  });

  it("returns null for a period-less response such as rekap/sp", () => {
    expect(periodLabel(fixture<MaahirSpPayload>("sp").meta)).toBeNull();
    expect(periodLabel({})).toBeNull();
    expect(periodLabel(null)).toBeNull();
  });
});

// ── matrixSnapshotState: never a zero ───────────────────────────────────────

describe("matrixSnapshotState", () => {
  const { data, meta } = fixture<MaahirMatrixPayload>("matrix-guru");

  it("is 'siap' for the captured snapshot", () => {
    expect(meta.basi).toBe(false);
    expect(matrixSnapshotState(meta, data)).toBe("siap");
  });

  it("is 'basi' when meta.basi is true", () => {
    expect(matrixSnapshotState({ ...meta, basi: true }, data)).toBe("basi");
  });

  it("is 'belum-dihitung' when the payload has no matrix at all", () => {
    // A month that was never recomputed still answers 200 with the full teacher
    // list and matrix: null — this must never be rendered as 0.
    const kosong: MaahirMatrixPayload = {
      pengajar: data.pengajar.map((p) => ({ ...p, matrix: null })),
    };
    expect(matrixSnapshotState(meta, kosong)).toBe("belum-dihitung");
    expect(matrixSnapshotState({ basi: true }, kosong)).toBe("belum-dihitung");
    expect(matrixSnapshotState(meta, { pengajar: [] })).toBe("belum-dihitung");
    expect(matrixSnapshotState(meta, null)).toBe("belum-dihitung");
  });
});

// ── route/period plumbing ───────────────────────────────────────────────────

describe("rekap route periods", () => {
  it("builds the 28→27 report window from a month", () => {
    expect(reportWindow("2026-08")).toEqual({ mulai: "2026-07-28", sampai: "2026-08-27" });
    expect(reportWindow("2026-01")).toEqual({ mulai: "2025-12-28", sampai: "2026-01-27" });
    expect(() => reportWindow("2026-13")).toThrow();
  });

  it("matches the window upstream actually reported", () => {
    const meta = fixture<MaahirLaporanPayload>("laporan-maahir").meta;
    expect(reportWindow(meta.bulan!)).toEqual({ mulai: meta.mulai, sampai: meta.sampai });
  });

  it("does NOT use that window for hits-disiplin, which is a calendar month", () => {
    const meta = fixture<MaahirHitsDisiplinPayload>("hits-disiplin").meta;
    expect(meta.mulai).toBe("2026-08-01");
    expect(rekapPeriode("rekap/hits-disiplin", "2026-08")).toBe("2026-08");
    expect(rekapParams("rekap/hits-disiplin", "2026-08")).toEqual({ mode: "bulan", bulan: "2026-08" });
  });

  it("keys shakwa by the explicit window and sp by nothing at all", () => {
    expect(rekapPeriode("rekap/shakwa", "2026-08")).toBe("2026-07-28..2026-08-27");
    expect(rekapParams("rekap/shakwa", "2026-08")).toEqual({
      dari: "2026-07-28",
      sampai: "2026-08-27",
    });
    expect(rekapPeriode("rekap/sp")).toBe("");
    expect(rekapParams("rekap/sp")).toEqual({});
    expect(() => rekapPeriode("rekap/laporan-maahir")).toThrow();
  });

  it("shifts months across a year boundary without a Date", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(rekapMonths(new Date(2026, 0, 15))).toEqual(["2026-01", "2025-12"]);
  });

  it("canonicalises params_key so the same filters always hit the same row", () => {
    expect(rekapParamsKey()).toBe("");
    expect(rekapParamsKey({ gender: null, program: null, kelasId: [] })).toBe("");
    expect(rekapParamsKey({ program: "at_tibyan", gender: "ikhwan" })).toBe(
      rekapParamsKey({ gender: "ikhwan", program: "at_tibyan" }),
    );
    expect(rekapParamsKey({ kelasId: ["b", "a", "b"] })).toBe("kelas_id=a,b");
  });

  it("plans 12 requests per run: 5 monthly routes x 2 months, plus sp and shakwa", () => {
    const pulls = maahirRekapPulls(new Date(2026, 8, 3));
    expect(pulls).toHaveLength(12);
    expect(pulls.filter((p) => p.bulan === "2026-09")).toHaveLength(6); // 5 monthly + shakwa
    expect(pulls.filter((p) => p.bulan === "2026-08")).toHaveLength(5);
    expect(pulls.find((p) => p.route === "rekap/sp")).toMatchObject({ periode: "", paramsKey: "" });
    // The current month is pulled before last month: an outage mid-run must not
    // leave the default screen stale.
    expect(pulls[0]).toMatchObject({ route: "rekap/laporan-maahir", periode: "2026-09" });
  });

  it("switches to next month's report period from the 28th", () => {
    expect(bulanLaporan("2026-09-27")).toBe("2026-09");
    expect(bulanLaporan("2026-09-28")).toBe("2026-10");
    expect(bulanLaporan("2026-12-31")).toBe("2027-01");
  });

  it("on the 28th pulls the open report period first, without a future calendar month", () => {
    const pulls = maahirRekapPulls(new Date(2026, 8, 28));
    expect(pulls[0]).toMatchObject({ route: "rekap/laporan-maahir", bulan: "2026-10" });
    const okt = pulls.filter((p) => p.bulan === "2026-10").map((p) => p.route);
    expect(okt).toContain("rekap/kehadiran");
    expect(okt).not.toContain("rekap/hits-disiplin");
    expect(okt).toContain("rekap/shakwa");
    // Calendar-month screens keep their rows: Sep and Aug are still pulled.
    expect(pulls.filter((p) => p.bulan === "2026-09")).toHaveLength(6);
    expect(pulls.filter((p) => p.bulan === "2026-08")).toHaveLength(5);
  });
});
