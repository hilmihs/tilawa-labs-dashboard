import { describe, expect, it } from "vitest";
import { PROGRAM_PILIHAN } from "./program";
import { golonganDariProgramTeks, rencanaSinkronGolongan, slugGolongan, SLUG_MAJELIS_TAZHIM } from "./golongan";

describe("slugGolongan", () => {
  it("membuat slug dari nama", () => {
    expect(slugGolongan("Pengajar HITS")).toBe("pengajar-hits");
    expect(slugGolongan("Majelis Ta'zhim / Rumah Belajar")).toBe("majelis-tazhim-rumah-belajar");
    expect(slugGolongan("  Pengurus   Majelis Pendidikan ")).toBe("pengurus-majelis-pendidikan");
  });

  it("slug golongan Majelis Ta'zhim cocok dengan konstanta yang dipakai impor", () => {
    expect(slugGolongan("Majelis Ta'zhim / Rumah Belajar")).toBe(SLUG_MAJELIS_TAZHIM);
  });
});

describe("golonganDariProgramTeks", () => {
  it("memetakan seluruh PROGRAM_PILIHAN", () => {
    for (const p of PROGRAM_PILIHAN) expect(golonganDariProgramTeks(p)).toBe(slugGolongan(p));
  });

  it("teks di luar daftar tidak dipetakan", () => {
    expect(golonganDariProgramTeks("Pengajar Sesuatu")).toBeNull();
    expect(golonganDariProgramTeks(null)).toBeNull();
  });
});

describe("rencanaSinkronGolongan", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const HITS = "22222222-2222-2222-2222-222222222222";
  const TAZHIM = "33333333-3333-3333-3333-333333333333";

  it("menambah keanggotaan yang belum ada", () => {
    const r = rencanaSinkronGolongan([], [{ orangId: A, klasifikasiId: HITS }]);
    expect(r.tambah).toEqual([{ orangId: A, klasifikasiId: HITS }]);
    expect(r.cabut).toEqual([]);
  });

  it("mencabut baris 'tautan' yang sudah tidak berlaku", () => {
    const r = rencanaSinkronGolongan([{ orangId: A, klasifikasiId: HITS, sumber: "tautan" }], []);
    expect(r.cabut).toEqual([{ orangId: A, klasifikasiId: HITS }]);
    expect(r.tambah).toEqual([]);
  });

  it("TIDAK PERNAH mencabut baris manual — koreksi manusia menang", () => {
    const r = rencanaSinkronGolongan(
      [
        { orangId: A, klasifikasiId: TAZHIM, sumber: "manual" },
        { orangId: A, klasifikasiId: HITS, sumber: "impor_xlsx" },
      ],
      [],
    );
    expect(r.cabut).toEqual([]);
  });

  it("tidak menambah ulang keanggotaan yang sudah ada dengan sumber lain", () => {
    const r = rencanaSinkronGolongan(
      [{ orangId: A, klasifikasiId: HITS, sumber: "manual" }],
      [{ orangId: A, klasifikasiId: HITS }],
    );
    expect(r.tambah).toEqual([]);
    expect(r.cabut).toEqual([]);
  });
});
