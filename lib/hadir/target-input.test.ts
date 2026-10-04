import { describe, expect, it } from "vitest";
import { bacaSeriDariForm, bacaTargetCentang, labelSeri, SERI_BARU } from "./target-input";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("bacaTargetCentang", () => {
  it("centang wajib dan diundang jadi dua sifat", () => {
    expect(bacaTargetCentang([A], [B])).toEqual([
      { klasifikasiId: A, sifat: "wajib" },
      { klasifikasiId: B, sifat: "diundang" },
    ]);
  });

  it("golongan yang dicentang di dua-duanya dihitung WAJIB saja", () => {
    // Unique (acara, klasifikasi) melarang dua baris; wajib yang lebih kuat.
    expect(bacaTargetCentang([A], [A])).toEqual([{ klasifikasiId: A, sifat: "wajib" }]);
  });

  it("id yang bukan uuid dibuang", () => {
    expect(bacaTargetCentang(["bukan-uuid", A], ["juga-bukan"])).toEqual([{ klasifikasiId: A, sifat: "wajib" }]);
  });

  it("tanpa centang berarti tanpa target", () => {
    expect(bacaTargetCentang([], [])).toEqual([]);
  });

  it("id dobel dalam satu daftar tidak melahirkan dua baris", () => {
    expect(bacaTargetCentang([A, A], [])).toEqual([{ klasifikasiId: A, sifat: "wajib" }]);
  });
});

describe("bacaSeriDariForm", () => {
  it("memakai seri yang dipilih dari daftar", () => {
    expect(bacaSeriDariForm("kajian-rumah-belajar", "")).toBe("kajian-rumah-belajar");
  });

  it("kosong berarti tanpa seri", () => {
    expect(bacaSeriDariForm("", "")).toBeNull();
  });

  it("seri baru dibuat dari nama yang ditulis koordinator, bukan slug", () => {
    // Koordinator menulis "Kajian Rumah Belajar", bukan "kajian-rumah-belajar".
    expect(bacaSeriDariForm(SERI_BARU, "Kajian Rumah Belajar")).toBe("kajian-rumah-belajar");
    expect(bacaSeriDariForm(SERI_BARU, "  Majelis Ta'zhim  ")).toBe("majelis-tazhim");
  });

  it("pilih seri baru tapi namanya kosong = tanpa seri, bukan galat", () => {
    expect(bacaSeriDariForm(SERI_BARU, "   ")).toBeNull();
  });

  it("pilihan sampah ditolak", () => {
    expect(bacaSeriDariForm("Bukan Slug!", "")).toBeNull();
  });
});

describe("labelSeri", () => {
  it("slug ditampilkan sebagai kata biasa", () => {
    expect(labelSeri("kajian-rumah-belajar")).toBe("Kajian Rumah Belajar");
    expect(labelSeri("uji-rekap")).toBe("Uji Rekap");
  });
});
