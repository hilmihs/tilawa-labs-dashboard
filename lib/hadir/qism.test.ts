import { describe, expect, it } from "vitest";
import { pecahQism } from "./qism";

describe("pecahQism", () => {
  it("menyamakan ejaan qism", () => {
    expect(pecahQism("Syari'ah").qism).toBe("Syariah");
    expect(pecahQism("Syariah").qism).toBe("Syariah");
    expect(pecahQism("syariah").qism).toBe("Syariah");
    expect(pecahQism("I'dad").qism).toBe("I'dad");
    expect(pecahQism("Idad").qism).toBe("I'dad");
    expect(pecahQism("Lughoh").qism).toBe("Lughoh");
    expect(pecahQism("Idary").qism).toBe("Idary");
  });

  it("memecah sel gabungan qism - fatroh", () => {
    expect(pecahQism("Syariah - Shobahi")).toEqual({ qism: "Syariah", mustawa: null, fatroh: "Shobahi" });
    expect(pecahQism("Syariah - Masa'i")).toEqual({ qism: "Syariah", mustawa: null, fatroh: "Masa'i" });
  });

  it("membaca khirij sebagai MUSTAWA, bukan prodi", () => {
    // 'Khirij - Syariah' = lulusan Syariah. Kalau khirij dianggap qism, rekap
    // prodi melahirkan kolom hantu bernama Khirij.
    expect(pecahQism("Khirij - Syariah")).toEqual({ qism: "Syariah", mustawa: "khirij", fatroh: null });
    expect(pecahQism("Khirij - Lughoh").qism).toBe("Lughoh");
    expect(pecahQism("khirij idad")).toEqual({ qism: "I'dad", mustawa: "khirij", fatroh: null });
    expect(pecahQism("Khirij i'dad banda aceh").mustawa).toBe("khirij");
  });

  it("menyamakan ejaan fatroh dari kolom terpisah", () => {
    expect(pecahQism("Syari'ah", { fatroh: "Sobahi" }).fatroh).toBe("Shobahi");
    expect(pecahQism("Syari'ah", { fatroh: "Masaiy" }).fatroh).toBe("Masa'i");
  });

  it("membaca mustawa dari kolom terpisah", () => {
    expect(pecahQism("Syari'ah", { mustawa: 5 }).mustawa).toBe("5");
    expect(pecahQism("Syari'ah", { mustawa: "Khirrij" }).mustawa).toBe("khirij");
    expect(pecahQism("Syari'ah", { mustawa: "Lainnya" }).mustawa).toBe("lainnya");
  });

  it("isian bebas jadi Lainnya, tanpa melahirkan prodi baru", () => {
    for (const teks of ["Non lipia", "Non LIPIA", "FMIPA - UNJ", "Darul Hadits Yaman", "Pendidikan Bisnis", "Iqtishad islami"]) {
      expect(pecahQism(teks).qism).toBe("Lainnya");
    }
  });

  it("kosong dan tanda hubung jadi null, bukan Lainnya", () => {
    expect(pecahQism("")).toEqual({ qism: null, mustawa: null, fatroh: null });
    expect(pecahQism(null)).toEqual({ qism: null, mustawa: null, fatroh: null });
    expect(pecahQism("-")).toEqual({ qism: null, mustawa: null, fatroh: null });
  });

  it("menemukan qism di tengah kalimat panjang", () => {
    const r = pecahQism("Syariah Shobahi, Namun sedang mengikuti kegiatan tasyghil di kampus, dari siang sampai sore");
    expect(r.qism).toBe("Syariah");
    expect(r.fatroh).toBe("Shobahi");
  });
});
