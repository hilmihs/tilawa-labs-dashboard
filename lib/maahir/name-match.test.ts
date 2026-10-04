/**
 * The name bridge is the only thing standing between a Maahir observation row
 * and the dashboard halaqah it describes, so the cases below are the real ones
 * counted off the live mirror on 7 Sep 2026 — not invented strings.
 */
import { describe, expect, it } from "vitest";
import {
  halaqahIndex,
  halaqahKey,
  matchHalaqah,
  matchPerson,
  personIndex,
  personKey,
} from "@/lib/maahir/name-match";

describe("halaqahKey", () => {
  it("menyamakan underscore dengan spasi", () => {
    expect(halaqahKey("Lanjutan_HITS 045 IKHWAN APRIL")).toBe("HITS 045 IKHWAN APRIL");
    expect(halaqahKey("HITS 045 IKHWAN APRIL")).toBe("HITS 045 IKHWAN APRIL");
  });

  it("membuang awalan Lanjutan — Maahir memecah dasar/lanjutan, dashboard tidak", () => {
    expect(halaqahKey("Lanjutan HITS 082 IKHWAN JUNI")).toBe("HITS 082 IKHWAN JUNI");
  });

  it("hanya membuang Lanjutan di awal, bukan di tengah nama", () => {
    expect(halaqahKey("HITS LANJUTAN 09 AKHWAT")).toBe("HITS LANJUTAN 09 AKHWAT");
  });

  it("merapatkan spasi ganda dan memangkas ujung", () => {
    expect(halaqahKey("  HITS   01   IKHWAN 0747 ")).toBe("HITS 01 IKHWAN 0747");
  });
});

describe("halaqahIndex + matchHalaqah", () => {
  const index = halaqahIndex([
    { id: "h1", name: "HITS 045 IKHWAN APRIL" },
    { id: "h2", name: "HITS 082 IKHWAN JUNI" },
    { id: "h3", name: "SAFAR IKHWAN 02" },
  ]);

  it("mencocokkan lewat kunci yang sudah dinormalkan", () => {
    expect(matchHalaqah(index, "Lanjutan_HITS 045 IKHWAN APRIL")?.id).toBe("h1");
    expect(matchHalaqah(index, "Lanjutan HITS 082 IKHWAN JUNI")?.id).toBe("h2");
    expect(matchHalaqah(index, "SAFAR IKHWAN 02")?.id).toBe("h3");
  });

  it("mengembalikan null untuk halaqah yang memang tak pernah disinkron dashboard", () => {
    // Batch "Januari Khusus" (…0347) tidak ada di dashboard sama sekali.
    expect(matchHalaqah(index, "HITS 02 IKHWAN 0347")).toBeNull();
  });

  it("menolak menebak saat satu kunci diklaim dua halaqah", () => {
    const bentrok = halaqahIndex([
      { id: "a", name: "HITS 010 IKHWAN APRIL" },
      { id: "b", name: "Lanjutan HITS 010 IKHWAN APRIL" },
    ]);
    expect(matchHalaqah(bentrok, "HITS 010 IKHWAN APRIL")).toBeNull();
    expect(bentrok.collisions.get("HITS 010 IKHWAN APRIL")).toHaveLength(2);
    expect(bentrok.byKey.size).toBe(0);
  });

  it("tidak ikut mengindeks nama kosong", () => {
    const kosong = halaqahIndex([{ id: "x", name: "   " }]);
    expect(kosong.byKey.size).toBe(0);
    expect(kosong.collisions.size).toBe(0);
  });
});

describe("personKey + matchPerson", () => {
  const index = personIndex([
    { id: "2054", name: "YASMIN WAFA SAPUTRA" },
    { id: "2101", name: "LAILA WAFA ANGGRAINI" },
  ]);

  it("mencocokkan beda kapitalisasi dan spasi", () => {
    expect(matchPerson(index, "Yasmin  Wafa Saputra")?.id).toBe("2054");
  });

  it("TIDAK membuang awalan Lanjutan pada nama orang", () => {
    expect(personKey("Lanjutan Ahmad")).toBe("LANJUTAN AHMAD");
  });

  it("menyerah pada ejaan yang berbeda — link salah lebih buruk daripada tanpa link", () => {
    // Varian nyata di mirror: Maahir "Laila Lestari" vs dashboard
    // "LAILA WAFA ANGGRAINI". Rasio kemiripan 0.92, tetap tidak dicocokkan.
    expect(matchPerson(index, "Laila Lestari")).toBeNull();
  });
});
