import { describe, expect, it } from "vitest";
import { kelompokkanPeserta, namaCocok, namaCocokSalinan, type AkunPeserta } from "./identitas";

const a = (o: Partial<AkunPeserta>): AkunPeserta => ({ kunci: "t:1", sumber: "cermin", programSlug: "hits-regular", nama: "X", hp: null, ...o });
const jumlahOrang = (akun: AkunPeserta[]) => new Set(kelompokkanPeserta(akun).orangDari.values()).size;

describe("namaCocok", () => {
  it("accepts equal names and a shorter name contained in a longer one", () => {
    expect(namaCocok("Hera Yulianawati", "HERA YULIANAWATI")).toBe(true);
    expect(namaCocok("Zaky", "Zaky Riko V")).toBe(true);
    expect(namaCocok("Suwaidin", "Al Kartubin")).toBe(false);
    expect(namaCocok("A. Untung T Mustafa", "Ade Mustafa")).toBe(false);
  });
});

describe("namaCocokSalinan", () => {
  it("tolerates case, doubled letters, M. and word order, never one word", () => {
    expect(namaCocokSalinan("M. YASSER VITO ANUGRA", "Muhammad Yasser Vito Anugra")).toBe(true);
    expect(namaCocokSalinan("IKHYA ULUMUDIN", "Ikhya Ulumuddin")).toBe(true);
    expect(namaCocokSalinan("RAHADIAN RAGIEL", "Ragiel Rahadian")).toBe(true);
    expect(namaCocokSalinan("LARASDYA ANJANI (LARAS)", "Larasdya Anjani")).toBe(true);
    expect(namaCocokSalinan("YURRA YUDHISTIRA H", "Yurra Yudhistira Hermanto")).toBe(true);
    expect(namaCocokSalinan("GALIH", "Galih Pambudi Basuki")).toBe(false);
  });
});

describe("kelompokkanPeserta", () => {
  it("folds one Maahir person listed in two classes", () => {
    expect(
      jumlahOrang([
        a({ kunci: "maahir:1", sumber: "maahir", programSlug: "maahir", nama: "Ilham Nabila Pratama" }),
        a({ kunci: "maahir:2", sumber: "maahir", programSlug: "maahir", nama: "Ilham Nabila Pratama" }),
        a({ kunci: "maahir:3", sumber: "maahir", programSlug: "maahir", nama: "Khaulah" }),
      ]),
    ).toBe(2);
  });

  it("joins accounts with the same phone (any prefix shape) and a matching name only", () => {
    expect(
      jumlahOrang([
        a({ kunci: "t:795", nama: "Hera Yulianawati", hp: "626281234567890" }),
        a({ kunci: "t:4539", nama: "Hera Yulianawati", hp: "081234567890" }),
        a({ kunci: "t:3364", nama: "Suwaidin", hp: "081111222333" }),
        a({ kunci: "t:4525", nama: "Al Kartubin", hp: "6281111222333" }),
      ]),
    ).toBe(3);
  });

  it("joins HKM→RBI copies only when the pair is unique and not the same account", () => {
    const akun = [
      a({ kunci: "t:2199", programSlug: "hkm-presensi", nama: "IKHYA ULUMUDIN", hp: "6281300000011" }),
      a({ kunci: "t:4448", programSlug: "rbi", nama: "Ikhya Ulumuddin", hp: "6281300090011" }),
      a({ kunci: "t:2141", programSlug: "hkm-presensi", nama: "Budi Santoso" }),
      a({ kunci: "t:2141", programSlug: "rbi", nama: "Budi Santoso" }),
      a({ kunci: "t:10", programSlug: "hits-regular", nama: "Ikhya Ulumuddin" }),
    ];
    const { orangDari, gabungan } = kelompokkanPeserta(akun);
    expect(orangDari.get("t:4448")).toBe(orangDari.get("t:2199"));
    expect(orangDari.get("t:10")).not.toBe(orangDari.get("t:2199"));
    expect(gabungan).toHaveLength(1);
  });
});
