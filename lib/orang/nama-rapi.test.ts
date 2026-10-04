import { describe, expect, it } from "vitest";
import { pilihNamaTampil, rapikanNama } from "./nama-rapi";

describe("rapikanNama", () => {
  it("kapital per kata, spasi dirapatkan", () => {
    expect(rapikanNama("  muhammad hanif   alhafiz ")).toBe("Muhammad Hanif Alhafiz");
    expect(rapikanNama("HIDAYATI")).toBe("Hidayati");
  });
  it("tanda hubung dan apostrof", () => {
    expect(rapikanNama("sholehudin al-giffari")).toBe("Sholehudin Al-Giffari");
    expect(rapikanNama("hanan shofia permata")).toBe("Hanan Shofia Permata");
  });
  it("bin/binti/bint kecil kecuali di depan", () => {
    expect(rapikanNama("Amina Binti Muhammad")).toBe("Amina binti Muhammad");
    expect(rapikanNama("bin baz")).toBe("Bin Baz");
    expect(rapikanNama("Tamim Zahira Baswedan Bint Nazar Muharam")).toBe("Tamim Zahira Baswedan bint Nazar Muharam");
  });
  it("kata ganda berurutan dibuang", () => {
    expect(rapikanNama("Nadia Nadia")).toBe("Nadia");
  });
  it("inisial tetap huruf besar", () => {
    expect(rapikanNama("khadijah karim kurniawan")).toBe("Khadijah Karim Kurniawan");
  });
});

describe("pilihNamaTampil", () => {
  it("nama terlengkap menang", () => {
    expect(pilihNamaTampil(["Hafsah Aziz Nugroho", "Hafsah Aziz Nugroho Listiyo Pambudi"])).toBe("Hafsah Aziz Nugroho Listiyo Pambudi");
  });
  it("inisial dan kurung tidak menambah kelengkapan", () => {
    expect(pilihNamaTampil(["Hadi Hakim Maulana", "Daan Nurroyyan A"])).toBe("Hadi Hakim Maulana");
    expect(rapikanNama("aisyah (ahmad)")).toBe("Aisyah (Ahmad)");
  });
  it("seri → urutan masukan", () => {
    expect(pilihNamaTampil(["Ruqayyah Rahma Ramadhan", "Salma Hakim Baswedan"])).toBe("Ruqayyah Rahma Ramadhan");
  });
});
