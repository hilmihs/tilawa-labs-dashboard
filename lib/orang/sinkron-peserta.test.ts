import { describe, expect, it } from "vitest";
import { genderKelompok, genderMaahir, genderTilawah, kelompokkanAnggota, petaPutusan, pilihWaPeserta, type AnggotaMaahir } from "./sinkron-peserta";
import { namaKunci } from "@/lib/hadir/nama";

describe("gender", () => {
  it("reads tilawah's 1/2 and falls back to the halaqah name", () => {
    expect(genderTilawah(1)).toBe("L");
    expect(genderTilawah(2, "HITS 021 IKHWAN")).toBe("P");
    expect(genderTilawah(null, "HITS 021 AKHWAT JUNI")).toBe("P");
    expect(genderTilawah(null, "Kadis Ikhwan 2")).toBe("L");
    expect(genderTilawah(0, "RBI Kelas 1")).toBeNull();
  });
  it("maps Maahir ikhwan/akhwat, anything else unknown", () => {
    expect(genderMaahir("ikhwan")).toBe("L");
    expect(genderMaahir(" Akhwat ")).toBe("P");
    expect(genderMaahir("campur")).toBeNull();
    expect(genderMaahir(null)).toBeNull();
  });
  it("needs one gender per person, not a clash", () => {
    expect(genderKelompok(["P", null, "P"])).toBe("P");
    expect(genderKelompok(["L", "P"])).toBeNull();
    expect(genderKelompok([null])).toBeNull();
  });
});

describe("kelompokkanAnggota", () => {
  const a = (id: string, nama: string, pesertaId: string | null, gender: "L" | "P" | null = "P"): AnggotaMaahir => ({ id, nama, pesertaId, gender });
  const ids = (g: AnggotaMaahir[][]) => g.map((x) => x.map((y) => y.id).sort().join(",")).sort();

  it("joins seats of one peserta_id, even under different spellings", () => {
    const h = kelompokkanAnggota([a("1", "Bilal Azhar Permata", "p1"), a("2", "Azka Wafa Wulandari", "p1"), a("3", "Salma", "p2")]);
    expect(ids(h.orang)).toEqual(["1,2", "3"]);
  });
  it("joins seats without peserta_id by name + class gender", () => {
    const h = kelompokkanAnggota([a("1", "Ustadzah Rafi Qonita Lestari", null), a("2", "rafi qonita lestari", null), a("3", "Rafi Qonita Lestari", null, "L")]);
    expect(ids(h.orang)).toEqual(["1,2", "3"]);
  });
  it("attaches a nameless-id seat to the one peserta_id carrying that name", () => {
    const h = kelompokkanAnggota([a("1", "Salma Kamila Saputra", "p1"), a("2", "Salma Kamila Saputra", null)]);
    expect(ids(h.orang)).toEqual(["1,2"]);
  });
  it("never merges two peserta_ids, and does not guess between them", () => {
    const h = kelompokkanAnggota([a("1", "Salma", "p1"), a("2", "Salma", "p2"), a("3", "Salma", null), a("4", "Salma", null)]);
    expect(ids(h.orang)).toEqual(["1", "2", "3,4"]);
    expect(h.ambigu).toEqual(["salma|P"]);
  });
  it("keeps seats without any name apart", () => {
    const h = kelompokkanAnggota([a("1", "", null), a("2", " ", null)]);
    expect(ids(h.orang)).toEqual(["1", "2"]);
  });
});

describe("pilihWaPeserta", () => {
  it("normalises and gives each person their own number", () => {
    const h = pilihWaPeserta([{ kunci: "1", hp: ["0812-3456-7890"] }, { kunci: "2", hp: [null, "85712345678"] }], new Set());
    expect(h.wa.get("1")).toBe("6281234567890");
    expect(h.wa.get("2")).toBe("6285712345678");
  });
  it("gives a shared family number to nobody", () => {
    const h = pilihWaPeserta(
      [{ kunci: "anak1", hp: ["081234567890"] }, { kunci: "anak2", hp: ["6281234567890"] }, { kunci: "3", hp: ["081299998888"] }],
      new Set(),
    );
    expect(h.wa.has("anak1")).toBe(false);
    expect(h.wa.has("anak2")).toBe(false);
    expect(h.wa.get("3")).toBe("6281299998888");
    expect([...h.dibagi]).toEqual(["6281234567890"]);
  });
  it("counts one person's repeated number (several programs) as theirs, not shared", () => {
    const h = pilihWaPeserta([{ kunci: "1", hp: ["081234567890", "081234567890"] }, { kunci: "1", hp: ["6281234567890"] }], new Set());
    expect(h.wa.get("1")).toBe("6281234567890");
    expect(h.dibagi.size).toBe(0);
  });
  it("skips numbers already held by another orang or a teacher account, and junk", () => {
    const h = pilihWaPeserta([{ kunci: "1", hp: ["081234567890", "081277776666"] }, { kunci: "2", hp: ["123"] }], new Set(["6281234567890"]));
    expect(h.wa.get("1")).toBe("6281277776666");
    expect(h.wa.has("2")).toBe(false);
  });
});

describe("petaPutusan", () => {
  const o = (id: string, nama: string) => ({ id, nama_kunci: namaKunci(nama) });

  it("points every spelling of a decided group at its one teacher row", () => {
    const p = petaPutusan([["Maryam Rahma Cahyani", "Maryam Latif Pratamah"]], [o("g1", "Maryam Rahma Cahyani")]);
    expect(p.get(namaKunci("Maryam Latif Pratamah"))).toBe("g1");
  });
  it("skips a group whose spellings still sit on two teacher rows", () => {
    const p = petaPutusan([["Azka Wafa Wulandari", "Bilal Azhar Permata"]], [o("g1", "Azka Wafa Wulandari"), o("g2", "Bilal Azhar Permata")]);
    expect(p.size).toBe(0);
  });
  it("never maps a one-word spelling to a teacher", () => {
    const p = petaPutusan([["Khaulah Achmad", "Khaulah"]], [o("g1", "Khaulah Achmad")]);
    expect(p.has(namaKunci("Khaulah"))).toBe(false);
  });
  it("skips a group with no teacher row at all", () => {
    expect(petaPutusan([["Nadia Zahira Handayani", "Nabilah Ulya Rizkiyah"]], []).size).toBe(0);
  });
});
