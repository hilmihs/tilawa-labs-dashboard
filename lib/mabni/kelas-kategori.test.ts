/**
 * The category vocabulary is the only bridge between the roster workbook's
 * class names and `halaqah_sync`, so the strings below are the real ones — the
 * 15 mabni halaqah as they stood on 8 Sep 2026, and the exact cells of the
 * "Data Pengajar" sheet, macrons and mismatched apostrophes included.
 *
 * The mirror is a fixture, not a query: the point of the table at the bottom is
 * to fail loudly the day a halaqah is renamed or a category stops resolving, and
 * a test that read the live DB would just quietly agree with whatever it found.
 */
import { describe, expect, it } from "vitest";
import {
  halaqahGenderFromName,
  matchHalaqah,
  parseKelasKategori,
  type HalaqahLike,
} from "@/lib/mabni/kelas-kategori";

const MIRROR: HalaqahLike[] = [
  { halaqahId: 16, name: "(MA) Ikhwan - Yaumi - Bintang", level: "MA", jenis: "yaumi" },
  { halaqahId: 17, name: "(MA) Akhwat - Yaumi - Putri & Nafil", level: "MA", jenis: "yaumi" },
  { halaqahId: 18, name: "(M1) Ikhwan - Yaumi - Ibrahim", level: "M1", jenis: "yaumi" },
  { halaqahId: 19, name: "(M1) Akhwat - Yaumi - Yuva & Fira", level: "M1", jenis: "yaumi" },
  { halaqahId: 20, name: "(M2) Ikhwan - Yaumi - Giffari", level: "M2", jenis: "yaumi" },
  { halaqahId: 22, name: "(M1) Ikhwan - Senin & Kamis - Sidqi", level: "M1", jenis: "usbui" },
  { halaqahId: 23, name: "(M1) Ikhwan - Selasa & Jumat - Adit", level: "M1", jenis: "usbui" },
  { halaqahId: 24, name: "(M2) Ikhwan - Rabu & Kamis - Zahid & Afif", level: "M2", jenis: "usbui" },
  { halaqahId: 25, name: "(M2) Ikhwan - Selasa & Jumat - Zahid & Afif", level: "M2", jenis: "usbui" },
  { halaqahId: 26, name: "(M2) Akhwat - Selasa & Jumat - Rahmah", level: "M2", jenis: "usbui" },
  { halaqahId: 30, name: "(M3) Akhwat - Yaumi - Rahmah", level: "M3", jenis: "yaumi" },
  { halaqahId: 31, name: "(M1) Ikhwan - Selasa & Jumat - Ghina & Ismi", level: "M1", jenis: "usbui" },
  { halaqahId: 32, name: "(M1) Ikhwan - Yaumi - Ghina & Ismi", level: "M1", jenis: "yaumi" },
  { halaqahId: 33, name: "(M1) Akhwat - Senin & Kamis - Fira & Yuva", level: "M1", jenis: "usbui" },
  { halaqahId: 34, name: "(M1) Akhwat - Selasa & Jumat - Fira & Yuva", level: "M1", jenis: "usbui" },
];

/** Convenience: parse a single-class cell and assert it really was single. */
function one(raw: string) {
  const parsed = parseKelasKategori(raw);
  expect(parsed).toHaveLength(1);
  return parsed[0];
}

describe("parseKelasKategori — ejaan transliterasi (sheet Data Pengajar)", () => {
  it("membaca marhalah, gender, dan jenis dari nama panjang", () => {
    expect(one("Al Marhalah al-Ūlā Yaumi Ikhwan")).toMatchObject({
      level: "M1",
      gender: 1,
      jenis: "yaumi",
      key: "M1-1-yaumi",
    });
  });

  it("melipat makron: Ūlā → ula, Atfāl → atfal", () => {
    expect(one("Marhalat al-Atfāl Ikhwan")).toMatchObject({ level: "MA", gender: 1, jenis: null });
    expect(one("Marhalat al-Atfāl Akhwat")).toMatchObject({ level: "MA", gender: 2, jenis: null });
  });

  it("menyamakan tiga varian apostrof pada Usbu'i", () => {
    // U+2019 (baris 7 & 9), ASCII (baris 11, 12, 14), dan bentuk pendek sheet santri.
    expect(one("Al Marhalah al-Ūlā Usbu’i Ikhwan").key).toBe("M1-1-usbui");
    expect(one("Al Marhalah al-Thaaniyah Usbu'i Ikhwan").key).toBe("M2-1-usbui");
    expect(one("M2 IKHWAN USBU'I").key).toBe("M2-1-usbui");
  });

  it("tidak tertukar antara Thaaniyah (M2) dan Thalithah (M3)", () => {
    expect(one("Al Marhalah al-Thaaniyah Yaumi Ikhwan").level).toBe("M2");
    expect(one("Al Marhalah al-Thalithah Yaumi Akhwat").level).toBe("M3");
  });

  it("memecah sel yang memuat dua kelas terpisah newline", () => {
    const dua = parseKelasKategori(
      "Al Marhalah al-Thaaniyah Yaumi Akhwat \nAl Marhalah al-Thaaniyah Usbu'i Akhwat",
    );
    expect(dua.map((k) => k.key)).toEqual(["M2-2-yaumi", "M2-2-usbui"]);

    const duaM3 = parseKelasKategori(
      "Al Marhalah al-Thalithah Yaumi Akhwat\nAl Marhalah al-Thalithah Usbu'i Akhwat",
    );
    expect(duaM3.map((k) => k.key)).toEqual(["M3-2-yaumi", "M3-2-usbui"]);
  });

  it("menyimpan teks asli per fragmen, sudah dipangkas", () => {
    const [pertama] = parseKelasKategori(
      "Al Marhalah al-Thaaniyah Yaumi Akhwat \nAl Marhalah al-Thaaniyah Usbu'i Akhwat",
    );
    expect(pertama.raw).toBe("Al Marhalah al-Thaaniyah Yaumi Akhwat");
  });
});

describe("parseKelasKategori — ejaan pendek (sheet Data Anak)", () => {
  it("membaca kode marhalah langsung", () => {
    expect(one("MA IKHWAN").key).toBe("MA-1");
    expect(one("M1 AKHWAT YAUMI").key).toBe("M1-2-yaumi");
    expect(one("M3 AKHWAT YAUMI").key).toBe("M3-2-yaumi");
  });

  it("kedua ejaan menghasilkan key yang sama", () => {
    expect(one("M1 IKHWAN YAUMI").key).toBe(one("Al Marhalah al-Ūlā Yaumi Ikhwan").key);
    expect(one("MA AKHWAT").key).toBe(one("Marhalat al-Atfāl Akhwat").key);
  });
});

describe("parseKelasKategori — yang tidak terbaca", () => {
  it("mengembalikan kosong, bukan menebak", () => {
    expect(parseKelasKategori("Kategori Kelas")).toEqual([]); // baris header
    expect(parseKelasKategori("Al Marhalah al-Ūlā Yaumi")).toEqual([]); // tanpa gender
    expect(parseKelasKategori("Ikhwan Yaumi")).toEqual([]); // tanpa marhalah
  });

  it("mengabaikan sel kosong dan baris kosong di dalam sel", () => {
    expect(parseKelasKategori(null)).toEqual([]);
    expect(parseKelasKategori("")).toEqual([]);
    expect(parseKelasKategori("\n  \nMA IKHWAN\n")).toHaveLength(1);
  });
});

describe("halaqahGenderFromName", () => {
  it("membaca gender dari nama halaqah", () => {
    expect(halaqahGenderFromName("(M1) Akhwat - Yaumi - Yuva & Fira")).toBe(2);
    expect(halaqahGenderFromName("(M2) Ikhwan - Rabu & Kamis - Zahid & Afif")).toBe(1);
  });

  it("null kalau nama tidak menyebut gender", () => {
    expect(halaqahGenderFromName(null)).toBeNull();
    expect(halaqahGenderFromName("(M1) - Yaumi")).toBeNull();
  });

  it("sepakat dengan level dan jenis seluruh cermin", () => {
    // Tripwire: kalau ada halaqah salah nama di upstream, ini yang jatuh duluan.
    expect(MIRROR.every((h) => halaqahGenderFromName(h.name) !== null)).toBe(true);
  });
});

describe("matchHalaqah — peta kategori → halaqah per 8 Sep 2026", () => {
  const cases: [string, number[]][] = [
    ["MA IKHWAN", [16]],
    ["MA AKHWAT", [17]],
    ["M1 IKHWAN YAUMI", [18, 32]],
    // Satu kategori xlsx menutupi TIGA halaqah — alasan penempatan kelas tidak
    // pernah diturunkan dari kategori.
    ["M1 IKHWAN USBU'I", [22, 23, 31]],
    ["M1 AKHWAT YAUMI", [19]],
    ["M1 AKHWAT USBU'I", [33, 34]],
    ["M2 IKHWAN YAUMI", [20]],
    ["M2 IKHWAN USBU'I", [24, 25]],
    ["M2 AKHWAT USBU'I", [26]],
    // Ada di sheet santri (2 anak) dan sheet pengajar, tapi halaqah-nya tidak
    // ada di upstream. Kosong adalah jawaban yang benar, bukan error.
    ["M2 AKHWAT YAUMI", []],
    ["M3 AKHWAT YAUMI", [30]],
    ["M3 AKHWAT USBU'I", []],
  ];

  for (const [raw, expected] of cases) {
    it(`${raw} → [${expected.join(", ")}]`, () => {
      expect(matchHalaqah(one(raw), MIRROR)).toEqual(expected);
    });
  }

  it("jenis null cocok dengan cadence apa pun", () => {
    // MA tidak menyebut yaumi/usbu'i, kedua halaqah MA kebetulan yaumi.
    expect(matchHalaqah(one("Marhalat al-Atfāl Ikhwan"), MIRROR)).toEqual([16]);
  });

  it("menutupi setiap halaqah di cermin, tanpa sisa", () => {
    const tertutup = new Set(cases.flatMap(([, ids]) => ids));
    expect([...tertutup].sort((a, b) => a - b)).toEqual(MIRROR.map((h) => h.halaqahId).sort((a, b) => a - b));
  });
});
