import { describe, expect, it } from "vitest";
import { namaKunci } from "./nama";

describe("namaKunci", () => {
  it("huruf kecil, spasi tunggal, tanpa tanda baca", () => {
    expect(namaKunci("  Rahmat   Hidayat ")).toBe("rahmat hidayat");
    expect(namaKunci("Safiyah Sabil Kurniawan, S.Pd.")).toBe("safiyah sabil kurniawan s pd");
  });
  it("buang gelar dari depan saja, jangan sampai habis", () => {
    expect(namaKunci("Ustadz Nadia Anisa Hidayat")).toBe("nadia anisa hidayat");
    expect(namaKunci("Ust. Ahmad")).toBe("ahmad");
    expect(namaKunci("Ustadzah")).toBe("ustadzah");
  });
  it("samakan ejaan yang jelas", () => {
    expect(namaKunci("Muhamad Hakim")).toBe(namaKunci("Muhammad Hakim"));
    expect(namaKunci("M. Hakim")).toBe("muhammad hakim");
    expect(namaKunci("Achmad Fauzi")).toBe("ahmad fauzi");
    expect(namaKunci("Fitri")).not.toBe(namaKunci("Fitria"));
  });
  it("aksen dibuang", () => {
    expect(namaKunci("Nafi'")).toBe("nafi'");
    expect(namaKunci("Zaïd")).toBe("zaid");
  });
});
