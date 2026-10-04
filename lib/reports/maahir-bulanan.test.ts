/**
 * The Maahir monthly workbook's data layer, checked against the REAL responses
 * captured on 3 Sep 2026 (`lib/maahir/__fixtures__/*.json`). No DB, no network.
 *
 * The tests are aimed at the five ways this report can lie:
 *   1. rendering "belum ditarik" as 0;
 *   2. labelling a 28→27 window with a calendar month name;
 *   3. letting the cumulative SP total be read as the period's SP total;
 *   4. presenting a stale (or never computed) matrix snapshot as current;
 *   5. letting two sheets with DIFFERENT windows claim the same period —
 *      `hits-disiplin` answers for 1 Aug–1 Sep on the very same `bulan=2026-08`
 *      that means 28 Jul–27 Aug everywhere else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bentukMaahirBulanan, kosongSeluruhnya, sumber, type MaahirBulananReads } from "./maahir-bulanan";
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

const KOSONG: MaahirBulananReads = {
  laporan: null,
  kehadiran: null,
  tibyan: null,
  sp: null,
  matrix: null,
  disiplin: null,
  shakwa: null,
};

const build = (over: Partial<MaahirBulananReads> = {}) =>
  bentukMaahirBulanan("2026-08", reads(over), { generatedAt: "2026-09-03" });

describe("periode label", () => {
  it("comes from meta, not from the month name", () => {
    const d = build();
    expect(d.bulan).toBe("2026-08");
    expect(d.periode).toBe("28 Jul – 27 Agu 2026");
    expect(d.periode).not.toContain("Agustus");
  });

  it("falls back to another route's meta when laporan is missing", () => {
    expect(build({ laporan: null }).periode).toBe("28 Jul – 27 Agu 2026");
  });

  it("has no period at all when nothing was pulled", () => {
    const d = bentukMaahirBulanan("2026-08", KOSONG, { generatedAt: "2026-09-03" });
    expect(d.periode).toBeNull();
    expect(kosongSeluruhnya(d)).toBe(true);
  });

  it("gives every route its OWN period, from its own meta", () => {
    const d = build();
    // The same requested month, three different answers upstream. If any of
    // these were derived from "2026-08" they would all read the same.
    expect(sumber(d, "rekap/laporan-maahir").periode).toBe("28 Jul – 27 Agu 2026");
    expect(sumber(d, "rekap/hits-disiplin").periode).toBe("1 Agu – 1 Sep 2026");
    expect(sumber(d, "rekap/shakwa").periode).toBe("28 Jul – 27 Agu 2026");
    // matrix-guru carries no window at all: it is a snapshot OF a calendar
    // month, and `meta.bulan` is all there is to label it with.
    expect(sumber(d, "rekap/matrix-guru").periode).toBe("Agustus 2026");
    expect(sumber(d, "rekap/sp").periode).toBeNull();

    // `data.periode` stays the Maahir report window and is NOT influenced by
    // the three routes that measure something else.
    expect(d.periode).toBe("28 Jul – 27 Agu 2026");
  });

  it("names the kind of window each route uses, not just its dates", () => {
    const d = build();
    // shakwa and laporan print the SAME date label this month; only `jendela`
    // says that one is a 28→27 report window and the other a WIB day cut.
    expect(sumber(d, "rekap/shakwa").periode).toBe(sumber(d, "rekap/laporan-maahir").periode);
    expect(sumber(d, "rekap/shakwa").jendela).not.toBe(sumber(d, "rekap/laporan-maahir").jendela);
    expect(sumber(d, "rekap/hits-disiplin").jendela).toMatch(/kalender/i);
    expect(sumber(d, "rekap/sp").jendela).toMatch(/kumulatif/i);
    // A route that was never pulled still declares its window: the reason the
    // sheet is empty must not also lose what it would have covered.
    const kosong = bentukMaahirBulanan("2026-08", KOSONG, { generatedAt: "2026-09-03" });
    expect(sumber(kosong, "rekap/matrix-guru").jendela).toMatch(/snapshot/i);
  });
});

describe("belum ditarik is never a zero", () => {
  it("leaves a section null and states the reason", () => {
    const d = build({ kehadiran: null, tibyan: null });
    expect(d.kehadiran).toBeNull();
    expect(d.tibyan).toBeNull();
    const s = sumber(d, "rekap/kehadiran");
    expect(s.status).toBe("belum-ditarik");
    expect(s.fetchedAt).toBeNull();
    expect(s.alasan).toMatch(/belum ditarik/i);
    // The row that DID answer keeps its provenance.
    expect(sumber(d, "rekap/laporan-maahir").status).toBe("ada");
  });

  it("keeps a class with no scored member as null, not 0%", () => {
    const kehadiran = read<never>("kehadiran");
    const payload = JSON.parse(JSON.stringify(kehadiran.payload)) as Array<{
      anggota: Array<{ persenHadir: number | null }>;
    }>;
    payload[0].anggota.forEach((a) => {
      a.persenHadir = null;
    });
    const d = build({ kehadiran: { ...kehadiran, payload } as never });
    // Rows are re-sorted, so find the class we blanked by its member count.
    const blanked = d.kehadiran!.find((k) => k.anggota > 0 && k.anggotaTanpaData === k.anggota)!;
    expect(blanked.persenRata).toBeNull();
    // Every other class still has a real average — the blanking was local.
    expect(d.kehadiran!.filter((k) => k.persenRata != null).length).toBe(d.kehadiran!.length - 1);
  });
});

describe("ringkasan", () => {
  it("carries the three blocks with At-Tibyan's gender split kept separate", () => {
    const d = build();
    const row = (metrik: string) => d.ringkasan!.baris.find((b) => b.metrik === metrik)!;
    expect(row("Kehadiran aktual")).toMatchObject({ takhassus: 84, maahir: 76, atTibyan: 69 });
    // At-Tibyan reports no teacher attendance — null, which the sheet prints as
    // "-", not as 0%.
    expect(row("Kehadiran pengajar").atTibyan).toBeNull();
    expect(row("— ikhwan")).toMatchObject({ takhassus: null, maahir: null, atTibyan: 29 });
    expect(row("Selisih terhadap benchmark").atTibyan).toBe(69 - 100);
  });

  it("lists every flagged member, worst first, without the free-text keterangan", () => {
    const list = build().ringkasan!.dibawahTarget;
    expect(list.length).toBe(3 + 60 + 75);
    expect(list[0].persen).toBeLessThanOrEqual(list.at(-1)!.persen);
    expect(Object.keys(list[0])).not.toContain("keterangan");
  });
});

describe("SP", () => {
  it("keeps the cumulative list and the per-period summary apart", () => {
    const sp = build().sp!;
    expect(sp.mulai).toBe("2026-01-01"); // program start, not the report window
    expect(sp.cutoff).toBe("2026-09-03");
    expect(sp.summary.total).toBe(79);
    expect(sp.perPeriode).toMatchObject({ periode: "28 Jul – 27 Agu 2026" });
    // Same members, different window: the two totals differ, and the sheet must
    // print both windows rather than let a reader "reconcile" them.
    expect(sp.perPeriode!.summary.total).toBe(66);
    expect(sp.summary.total).not.toBe(sp.perPeriode!.summary.total);
  });

  it("drops the comparison row rather than inventing one when laporan is missing", () => {
    expect(build({ laporan: null }).sp!.perPeriode).toBeNull();
  });
});

describe("presensi belum diisi", () => {
  it("flattens class × tanggal and stays sorted by date", () => {
    const rows = build().belumDiisi!;
    expect(rows.length).toBe(46);
    expect(new Set(rows.map((r) => r.kelasName)).size).toBe(13);
    expect([...rows].sort((a, b) => a.tanggal.localeCompare(b.tanggal))[0].tanggal).toBe(rows[0].tanggal);
  });

  it("splits the programme out of upstream's combined date string", () => {
    // Upstream sends "2026-08-04 Kelas Maahir", not a bare date; leaving it
    // joined makes the column unsortable and the programme invisible.
    const rows = build().belumDiisi!;
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.tanggal))).toBe(true);
    expect(new Set(rows.map((r) => r.program))).toEqual(new Set(["Kelas Maahir", "At-Tibyan"]));
  });
});

describe("matrix guru", () => {
  it("passes the snapshot through: no re-ranking, no re-averaging, no filling", () => {
    const m = build().matrix!;
    expect(m.keadaan).toBe("siap");
    expect(m.snapshotTerakhir).toBe("2026-09-01T13:30:41.935Z");
    expect(m.rows.length).toBe(178);
    // One pengajar has no snapshot row at all — that is not a score of zero.
    expect(m.rows.filter((r) => r.skor == null).length).toBe(1);
    expect(m.dinilai + m.belumDinilai).toBe(m.rows.length);
    expect(m.dinilai).toBe(172);

    const hakim = m.rows.find((r) => r.nama === "Adiba Abdul Anggraini")!;
    // Delivered verbatim, including the nulls: hafalan is null for all 177
    // scored teachers and bacaan for 159 of them.
    expect(hakim.skor!.skor_hafalan).toBeNull();
    expect(hakim.skor!.skor_bacaan).toBeNull();
    expect(hakim.skor!.skor_kehadiran_maahir).toBe(3);
    // Upstream's own averages, NOT a mean of the visible components: the mean
    // of (3, 2) is 2.5 here only by coincidence of this row, and the pedagogis
    // average (4) is not the mean of (null, 4, 3, 4) = 3.67.
    expect(hakim.skor!.rata_rata_pedagogis).toBe(4);
    expect(hakim.skor!.rata_rata_keseluruhan).toBe(3.32);
    expect(hakim.skor!.ranking).toBe(25);
  });

  it("orders by upstream's ranking and puts the unranked last", () => {
    const rows = build().matrix!.rows;
    const ranked = rows.map((r) => r.skor?.ranking ?? null);
    const firstNull = ranked.indexOf(null);
    // Everything before the first null is ascending; everything after is null.
    expect(ranked.slice(0, firstNull)).toEqual([...ranked.slice(0, firstNull)].sort((a, b) => a! - b!));
    expect(ranked.slice(firstNull).every((r) => r == null)).toBe(true);
    expect(rows[0].skor!.ranking).toBe(1);
  });

  it("reports a stale snapshot instead of serving it as current", () => {
    const matrix = read<never>("matrix-guru");
    const d = build({ matrix: { ...matrix, meta: { ...matrix.meta, basi: true } } as never });
    expect(d.matrix!.keadaan).toBe("basi");
    // The rows are still delivered — a basi snapshot is old, not absent.
    expect(d.matrix!.rows.length).toBe(178);
  });

  it("calls a month upstream never computed 'belum-dihitung', not zero", () => {
    const matrix = read<never>("matrix-guru");
    const payload = JSON.parse(JSON.stringify(matrix.payload)) as { pengajar: { matrix: unknown }[] };
    payload.pengajar.forEach((p) => {
      p.matrix = null;
    });
    const d = build({ matrix: { ...matrix, payload } as never });
    expect(d.matrix!.keadaan).toBe("belum-dihitung");
    expect(d.matrix!.dinilai).toBe(0);
    // Upstream still answers with the full roster; the emptiness is in the scores.
    expect(d.matrix!.rows.length).toBe(178);
    expect(d.matrix!.rows.every((r) => r.skor == null)).toBe(true);
  });
});

describe("disiplin pengajar", () => {
  it("keeps the CALENDAR month upstream sent, not the Maahir 28→27 window", () => {
    const d = build().disiplin!;
    expect(d.mode).toBe("bulan");
    expect(d.start).toBe("2026-08-01");
    expect(d.end).toBe("2026-09-01");
    expect(d.periodeLabel).toBe("2026-08");
    // The other sheets of the same workbook start on 28 July.
    expect(build().periode).toBe("28 Jul – 27 Agu 2026");
  });

  it("copies upstream's counters and its ranking order", () => {
    const d = build().disiplin!;
    expect(d.counts).toEqual({ total: 148, bermasalah: 57, obsBelum: 96, obsLengkap: 52 });
    expect(d.ranked.length).toBe(134);
    expect(d.ranked[0].rank).toBe(1);
    // Teachers with nothing to score stay OUT of the ranking, with null percents
    // rather than 0% — no denominator is not a bad score.
    expect(d.noData.length).toBe(14);
    expect(d.noData.every((r) => r.rank == null && r.pctKbbs == null)).toBe(true);
  });

  it("joins every tabayyun case back to a name and puts them in date order", () => {
    const insiden = build().disiplin!.insiden;
    expect(insiden.length).toBe(101);
    expect(insiden.every((i) => i.pengajarNama != null)).toBe(true);
    expect(insiden.map((i) => i.tanggal)).toEqual([...insiden.map((i) => i.tanggal)].sort());
  });
});

describe("shakwa", () => {
  it("takes the headline counters from upstream, never from the item list", () => {
    const k = build().shakwa!;
    expect(k.total).toBe(21);
    expect(k.belumDitangani).toBe(12);
    expect(k.items.length).toBe(21);
    // All four statuses arrive, zeros included — here 0 IS a measured zero.
    expect(k.perStatus.map((s) => s.status)).toEqual([
      "submitted", "in_review", "resolved", "closed",
    ]);
    expect(k.perStatus.find((s) => s.status === "in_review")!.jumlah).toBe(0);
    // Only the kategori that occurred are sent; the list is not padded with the
    // other four as zero rows.
    expect(k.perKategori.length).toBe(4);
  });

  it("carries its own day window and the fields the API does emit", () => {
    const k = build().shakwa!;
    expect(k.mulai).toBe("2026-07-28");
    expect(k.sampai).toBe("2026-08-27");
    expect(k.items.map((i) => i.createdAt)).toEqual(
      [...k.items.map((i) => i.createdAt)].sort().reverse(),
    );
    // Attachments are a count only, and no field anywhere carries a WA number.
    expect(k.items.every((i) => typeof i.jumlahLampiran === "number")).toBe(true);
    expect(JSON.stringify(k.items)).not.toMatch(/whatsapp|_wa\b/i);
  });
});
