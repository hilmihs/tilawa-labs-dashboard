/**
 * Kasusnya dipatok ke tanggal tetap, bukan ke hari ini: umur yang dihitung dari
 * `new Date()` akan lulus hari ini dan jatuh besok, dan yang paling rawan justru
 * hari-hari di sekitar ulang tahun.
 */
import { describe, expect, it } from "vitest";
import { formatUsia, usiaMonths } from "@/lib/directory/usia";

/** 8 September 2026, dibaca sebagai UTC seperti yang dilakukan usiaMonths. */
const HARI_INI = new Date(Date.UTC(2026, 8, 8));

describe("usiaMonths", () => {
  it("menghitung bulan kalender penuh", () => {
    // Muhammad Hatim Fahrezi, lahir 25 Mei 2021 — workbook menulis "5 tahun 3 bulan".
    expect(usiaMonths("2021-05-25", HARI_INI)).toBe(63);
    expect(formatUsia(63)).toBe("5 tahun 3 bulan");
  });

  it("belum menambah bulan sebelum tanggalnya lewat", () => {
    expect(usiaMonths("2026-08-09", HARI_INI)).toBe(0); // kurang sehari
    expect(usiaMonths("2026-08-08", HARI_INI)).toBe(1); // tepat sebulan
    expect(usiaMonths("2026-08-07", HARI_INI)).toBe(1);
  });

  it("tepat pada ulang tahun", () => {
    expect(usiaMonths("2019-09-08", HARI_INI)).toBe(84); // 7 tahun bulat
    expect(usiaMonths("2019-09-09", HARI_INI)).toBe(83); // sehari sebelum
  });

  it("null untuk tanggal kosong atau tidak terbaca", () => {
    expect(usiaMonths(null)).toBeNull();
    expect(usiaMonths(undefined)).toBeNull();
    expect(usiaMonths("")).toBeNull();
    expect(usiaMonths("25 Mei 2021", HARI_INI)).toBeNull();
  });

  it("tidak pernah negatif kalau tanggal lahirnya di masa depan", () => {
    expect(usiaMonths("2030-01-01", HARI_INI)).toBe(0);
  });

  it("memakai tanggal Jakarta, bukan UTC", () => {
    // 8 Sep 07:00 WIB masih 8 Sep 00:00 UTC; tanpa pergeseran +7 jam, seorang
    // anak yang berulang tahun hari ini akan tampak sehari lebih muda pada jam
    // kerja pagi di server UTC.
    const tengahMalamJakarta = new Date(Date.UTC(2026, 8, 7, 17, 30)); // = 8 Sep 00:30 WIB
    const digeser = new Date(tengahMalamJakarta.getTime() + 7 * 3_600_000);
    expect(digeser.getUTCDate()).toBe(8);
    expect(usiaMonths("2019-09-08", digeser)).toBe(84);
  });
});

describe("formatUsia", () => {
  it("menyembunyikan komponen yang nol", () => {
    expect(formatUsia(11)).toBe("11 bulan");
    expect(formatUsia(24)).toBe("2 tahun");
    expect(formatUsia(25)).toBe("2 tahun 1 bulan");
    expect(formatUsia(0)).toBe("0 bulan");
  });

  it("em-dash untuk yang tidak diketahui", () => {
    expect(formatUsia(null)).toBe("—");
    expect(formatUsia(undefined)).toBe("—");
  });
});
