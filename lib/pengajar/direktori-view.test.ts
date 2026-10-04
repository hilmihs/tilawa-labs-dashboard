import { describe, expect, it } from "vitest";
import {
  bacaSaringan,
  hitungBeban,
  kelasBeban,
  peranTambahan,
  type MaahirMasukan,
  type TautanOrang,
  rapikanBatch,
  susunDirektori,
  terapkanSaringan,
  type HalaqahMasukan,
} from "./direktori-view";

const h = (o: Partial<HalaqahMasukan>): HalaqahMasukan => ({
  sumber: "tilawah",
  guruId: 1,
  guruNama: "Aisyah",
  pengajar: null,
  guruGender: 2,
  guruHp: "0812345678",
  programSlug: "hits-regular",
  programNama: "HITS Reguler (Batch Juni 2026)",
  batch: "Juni 2026",
  halaqah: "HITS 001 AKHWAT JUNI",
  peserta: 20,
  ...o,
});

const susun = (halaqah: HalaqahMasukan[], extra: Partial<Parameters<typeof susunDirektori>[0]> = {}) =>
  susunDirektori({ halaqah, terdaftar: [], tautan: [], badal: new Map(), akunGanda: [], ...extra });

describe("rapikanBatch", () => {
  it("normalizes upstream batch names", () => {
    expect(rapikanBatch("April_2026")).toBe("April 2026");
    expect(rapikanBatch("Batch Januari 2026")).toBe("Januari 2026");
    expect(rapikanBatch("LAZ  #40")).toBe("LAZ #40");
    expect(rapikanBatch(null)).toBeNull();
  });
});

describe("susunDirektori", () => {
  it("groups one teacher across programs and batches into one row", () => {
    const rows = susun([
      h({}),
      h({ halaqah: "HITS 002 AKHWAT JUNI" }),
      h({ programSlug: "hits-regular-apr", programNama: "HITS Reguler (Batch April 2026)", batch: "April 2026", halaqah: "HITS 5 AKHWAT APRIL" }),
      h({ programSlug: "hkm", programNama: "HKM — Presensi", batch: "2026", halaqah: "HKM 1 AKHWAT" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].beban).toBe(4);
    expect(rows[0].gender).toBe("P");
    expect(rows[0].penugasan.map((p) => `${p.program}|${p.batch}|${p.halaqah.length}`)).toEqual([
      "HITS Reguler|Juni 2026|2",
      "HITS Reguler|April 2026|1",
      "HKM — Presensi|2026|1",
    ]);
  });

  it("keeps tilawah and mabni ids in separate namespaces", () => {
    const rows = susun([h({ guruId: 22, guruNama: "Lalu" }), h({ sumber: "mabni", guruId: 22, guruNama: "Sidqi", programSlug: "mabni" })]);
    expect(rows.map((r) => r.nama).sort()).toEqual(["Lalu", "Sidqi"]);
  });

  it("folds verified duplicate accounts into the canonical one", () => {
    const rows = susun(
      [h({ guruId: 2103, guruNama: "anas azhar wulandari" }), h({ guruId: 2816, guruNama: "Aisyah", halaqah: "HITS 36 AKHWAT APRIL" })],
      { akunGanda: [[2103, 2816]], badal: new Map([["tilawah:2103", 3]]) },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nama).toBe("anas azhar wulandari");
    expect(rows[0].beban).toBe(2);
    expect(rows[0].badal).toBe(3);
  });

  it("lists registered teachers without a halaqah as beban 0, once per program·batch", () => {
    const rows = susun([h({})], {
      terdaftar: [
        { sumber: "tilawah", guruId: 1, nama: "Aisyah", gender: 2, hp: null, programSlug: "x", programNama: "HITS Reguler (Batch Juni 2026)", batch: "Juni 2026" },
        { sumber: "tilawah", guruId: 9, nama: "Redy", gender: 1, hp: null, programSlug: "x", programNama: "HITS Reguler (Batch Juni 2026)", batch: "Juni 2026" },
        { sumber: "tilawah", guruId: 9, nama: "Redy", gender: 1, hp: null, programSlug: "x", programNama: "HITS Reguler (Batch Juni 2026)", batch: "Juni 2026" },
      ],
    });
    const redy = rows.find((r) => r.nama === "Redy")!;
    expect(redy.beban).toBe(0);
    expect(redy.terdaftar).toEqual([{ program: "HITS Reguler", batch: "Juni 2026" }]);
    expect(rows.find((r) => r.nama === "Aisyah")!.terdaftar).toEqual([]);
  });

  it("counts a mabni co-teacher once and marks the class as pendamping", () => {
    const rows = susun([
      h({ sumber: "mabni", guruId: 18, guruNama: "Bintang", programSlug: "mabni", halaqah: "MA Ikhwan" }),
      h({ sumber: "mabni", guruId: 37, guruNama: "Atalika", programSlug: "mabni", halaqah: "MA Ikhwan", pendamping: true }),
      h({ sumber: "mabni", guruId: 37, guruNama: "Atalika", programSlug: "mabni", halaqah: "MA Ikhwan", pendamping: true }),
    ]);
    const atalika = rows.find((r) => r.nama === "Atalika")!;
    expect(atalika.beban).toBe(1);
    expect(atalika.penugasan[0].halaqah[0].pendamping).toBe(true);
  });

  const t = (o: Partial<TautanOrang>): TautanOrang => ({
    sumber: "tilawah", peran: "pengajar", idUpstream: "1", orangId: "o1", nama: "Anas Azhar Wulandari",
    kodeQr: "ABCDEFGHJK", gender: "P", wa: "62811", qism: null, mustawa: null, ...o,
  });

  it("falls back to the linked orang for gender, phone and CV code", () => {
    const rows = susun([h({ guruGender: null, guruHp: null })], { tautan: [t({})] });
    expect(rows[0]).toMatchObject({ gender: "P", hp: "62811", kodeQr: "ABCDEFGHJK", orangId: "o1", nama: "Anas Azhar Wulandari" });
  });

  it("merges tilawah and mabni accounts of one orang into a single row", () => {
    const rows = susun(
      [h({ guruId: 5, guruNama: "Sidqi H" }), h({ sumber: "mabni", guruId: 22, guruNama: "Sidqi Hilman", programSlug: "mabni", programNama: "Madrasah Nusantara", halaqah: "M1" })],
      {
        tautan: [t({ idUpstream: "5", orangId: "s", nama: "Sidqi Hilman Fahrezi" }), t({ sumber: "mabni", idUpstream: "22", orangId: "s", nama: "Sidqi Hilman Fahrezi" })],
        badal: new Map([["tilawah:5", 2], ["mabni:22", 1]]),
        kajianHadir: new Map([["s", 4]]),
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nama: "Sidqi Hilman Fahrezi", beban: 2, badal: 3, kajianHadir: 4, kunci: "orang:s" });
    expect(rows[0].penugasan.map((p) => p.program).sort()).toEqual(["HITS Reguler", "Madrasah Nusantara"]);
  });

  it("hides names decided as not-a-teacher unless they are linked to an orang", () => {
    const rows = susun([h({ guruId: 6, guruNama: "Zaky Riko V" }), h({ guruId: 7, guruNama: "Aisyah" })], {
      kecuali: ["zaky riko v"],
    });
    expect(rows.map((r) => r.nama)).toEqual(["Aisyah"]);
  });

  it("adds Maahir roles: syaikh teaches, roster HITS gives kelompok + matrix, musyrif alone is hidden", () => {
    const maahir: MaahirMasukan = {
      syaikh: [{ id: "sy1", nama: "Aisyah Shofia Safitri", gender: "L", aktif: true }],
      rosterHits: [
        { id: "r1", nama: "Aisyah", gender: "P", aktif: true, kelompok: "Ar-Rahman", ketua: true, matrix: { bulan: "2026-09", skor: 88.5, ranking: 3, dari: 160 } },
        { id: "r2", nama: "Baru Roster", gender: "L", aktif: true, kelompok: null, ketua: false, matrix: null },
      ],
      musyrif: [{ id: "m1", nama: "Musyrif Saja", aktif: true, kelas: ["Alif"] }],
    };
    const rows = susun([h({})], {
      maahir,
      tautan: [t({}), t({ sumber: "maahir", peran: "pengajar_hits", idUpstream: "r1" })],
    });
    const aisyah = rows.find((r) => r.orangId === "o1")!;
    expect(aisyah.rosterHits).toEqual({ kelompok: "Ar-Rahman", ketua: true });
    expect(aisyah.matrix?.ranking).toBe(3);
    expect(peranTambahan(aisyah)).toEqual(["Kelompok Ar-Rahman · ketua"]);
    const syaikh = rows.find((r) => r.nama === "Aisyah Shofia Safitri")!;
    expect(syaikh).toMatchObject({ mengajar: true, beban: 0, syaikhMaahir: true });
    expect(kelasBeban(syaikh)).toBeNull();
    const roster = rows.find((r) => r.nama === "Baru Roster")!;
    expect(roster).toMatchObject({ mengajar: false, terdaftar: [{ program: "HITS Reguler", batch: "roster Maahir" }] });
    expect(rows.some((r) => r.nama === "Musyrif Saja")).toBe(false);
  });
});

describe("saringan", () => {
  const rows = susun([
    h({ guruId: 1, guruNama: "Aisyah" }),
    h({ guruId: 2, guruNama: "Budi", guruGender: 1, guruHp: "081902251409" }),
    h({ guruId: 2, guruNama: "Budi", guruGender: 1, halaqah: "B", guruHp: "081902251409" }),
    h({ guruId: 3, guruNama: "Citra", programSlug: "hkm", programNama: "HKM", halaqah: "C" }),
  ]);

  it("parses only valid params", () => {
    expect(bacaSaringan({ g: "X", beban: "9", urut: "acak", q: "  a " })).toEqual({ q: "a", program: undefined, g: undefined, beban: undefined, urut: undefined });
    expect(bacaSaringan({ g: "L", beban: "3", urut: "beban" })).toMatchObject({ g: "L", beban: "3", urut: "beban" });
  });

  it("filters by gender, program, beban and phone fragment", () => {
    expect(terapkanSaringan(rows, { g: "L" }).map((r) => r.nama)).toEqual(["Budi"]);
    expect(terapkanSaringan(rows, { program: "HKM" }).map((r) => r.nama)).toEqual(["Citra"]);
    expect(terapkanSaringan(rows, { beban: "2" }).map((r) => r.nama)).toEqual(["Budi"]);
    expect(terapkanSaringan(rows, { q: "6281902" }).map((r) => r.nama)).toEqual(["Budi"]);
    expect(terapkanSaringan(rows, { urut: "beban" }).map((r) => r.nama)).toEqual(["Aisyah", "Citra", "Budi"]);
  });

  it("buckets beban as 0/1/2/3+", () => {
    expect(hitungBeban(rows)).toEqual({ "0": 0, "1": 2, "2": 1, "3": 0 });
  });
});
