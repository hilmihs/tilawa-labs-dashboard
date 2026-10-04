import { describe, expect, it } from "vitest";
import { bagiHalaman, computeBoard, jakartaToday, jamWib } from "./board";
import type { Momen } from "@/app/countdown/momen";

/** Tengah malam WIB pada tanggal yang diberikan, sebagai epoch ms. */
const wib = (iso: string, time = "00:00") => Date.parse(`${iso}T${time}:00+07:00`);

const SATU_HARI: Momen = {
  name: "Idul Fitri",
  judul: "Menuju Idul Fitri",
  kategori: "Hari Raya",
  date: "2027-03-09",
  accent: "#E9B949",
};
const BERENTANG: Momen = {
  name: "10 Hari Dzulhijjah",
  judul: "10 Hari Pertama Dzulhijjah",
  kategori: "Amalan Utama",
  date: "2027-05-07",
  end: "2027-05-16",
  accent: "#F0A868",
};
const BERJAM: Momen = {
  name: "Umroh September",
  judul: "Menuju Umroh September",
  kategori: "Perjalanan Umrah",
  date: "2026-09-29",
  time: "08:00",
  end: "2026-10-08",
  endTime: "14:05",
  accent: "#38BDF8",
};

describe("jakartaToday", () => {
  it("memakai hari kalender Jakarta, bukan UTC", () => {
    // 17:30 UTC = 00:30 keesokan harinya di Jakarta (UTC+7). Ini kasus yang
    // membuat server UTC dan TV Jakarta berbeda hari kalau zona diabaikan.
    expect(jakartaToday(new Date("2026-09-03T17:30:00Z"))).toBe("2026-09-04");
    expect(jakartaToday(new Date("2026-09-03T16:59:00Z"))).toBe("2026-09-03");
  });
});

describe("jamWib", () => {
  it("membaca jam WIB, bukan jam mesin yang merender", () => {
    expect(jamWib(Date.parse("2026-09-03T17:30:09Z"))).toEqual({ jam: "00.30", detik: "09" });
    expect(jamWib(Date.parse("2026-09-04T05:04:00Z"))).toEqual({ jam: "12.04", detik: "00" });
  });
});

describe("computeBoard — momen tanpa jam", () => {
  it("menghitung sisa hari kalender dan menaruh yang terdekat di hero", () => {
    const v = computeBoard(wib("2027-03-01", "22:00"), [BERENTANG, SATU_HARI]);
    expect(v.hero.title).toBe("Menuju Idul Fitri");
    expect(v.hero.mode).toBe("counting");
    // Hari kalender, bukan durasi: jam 22.00 tidak memotong hitungannya.
    expect(v.hero.days).toBe(8);
    expect(v.hero.jamMenit).toBeNull();
    expect(v.cards[0].days).toBe(67);
  });

  it("menandai urgent pada sisa 7 hari, tidak pada 8", () => {
    expect(computeBoard(wib("2027-03-02"), [SATU_HARI]).hero.pill).toBe("SEGERA");
    expect(computeBoard(wib("2027-03-01"), [SATU_HARI]).hero.pill).toBeNull();
  });

  it("beralih ke hari-ini saat sisa nol", () => {
    expect(computeBoard(wib("2027-03-09", "06:00"), [SATU_HARI]).hero.mode).toBe("hari-ini");
  });

  it("momen sehari langsung lewat keesokan harinya", () => {
    const v = computeBoard(wib("2027-03-10"), [SATU_HARI, BERENTANG]);
    expect(v.hero.title).toBe("10 Hari Pertama Dzulhijjah");
    expect(v.cards[0].name).toBe("Idul Fitri");
    expect(v.cards[0].opacity).toBe(0.4);
    expect(v.cards[0].days).toBe(0);
  });

  it("momen berentang jadi progress bar selama rentangnya", () => {
    const v = computeBoard(wib("2027-05-10"), [BERENTANG]);
    expect(v.hero.mode).toBe("berlangsung");
    expect(v.hero.dayIndex).toBe(4);
    expect(v.hero.total).toBe(10);
    expect(v.hero.pct).toBe(40);
  });

  it("hari terakhir rentang masih berlangsung, hari sesudahnya lewat", () => {
    expect(computeBoard(wib("2027-05-16", "23:00"), [BERENTANG]).hero.mode).toBe("berlangsung");
    expect(computeBoard(wib("2027-05-17"), [BERENTANG]).hero.mode).not.toBe("berlangsung");
  });
});

describe("computeBoard — jumlah kartu", () => {
  /** n momen bertanggal berurutan mulai 1 Januari 2027. */
  const deret = (n: number): Momen[] =>
    Array.from({ length: n }, (_, i) => ({
      name: `Momen ${i + 1}`,
      judul: `Menuju Momen ${i + 1}`,
      kategori: "Uji",
      date: `2027-01-${String(i + 1).padStart(2, "0")}`,
      accent: "#38BDF8",
    }));

  it("menampilkan seluruh momen sisanya, bukan hanya enam", () => {
    // Regresi: papan dulu memotong di enam kartu, dan momen ke-8 dan ke-9
    // (Wukuf Arafah, Qurban Plus) hilang dari layar tanpa jejak.
    const v = computeBoard(wib("2026-12-01"), deret(9));
    expect(v.hero.title).toBe("Menuju Momen 1");
    expect(v.cards).toHaveLength(8);
    expect(v.cards.at(-1)?.name).toBe("Momen 9");
  });

  it("tidak memangkas di atas delapan — sisanya dirotasi, bukan dibuang", () => {
    const v = computeBoard(wib("2026-12-01"), deret(12));
    expect(v.cards).toHaveLength(11);
    expect(v.cards.at(-1)?.no).toBe("12");
  });
});

describe("bagiHalaman", () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => i + 2);

  it("satu halaman diam selama muat sebaris", () => {
    const h = bagiHalaman(n(8), 5);
    expect(h).toMatchObject({ jumlah: 1, indeks: 0, per: 8 });
    expect(h.isi).toEqual(n(8));
  });

  it("membagi rata, bukan 8 + 2", () => {
    expect(bagiHalaman(n(10), 0)).toMatchObject({ jumlah: 2, per: 5, isi: [2, 3, 4, 5, 6] });
    expect(bagiHalaman(n(10), 1).isi).toEqual([7, 8, 9, 10, 11]);
    // 13 kartu: 7 + 6, halaman terakhir satu lebih pendek dengan lebar kartu sama.
    expect(bagiHalaman(n(13), 1)).toMatchObject({ per: 7, isi: [9, 10, 11, 12, 13, 14] });
  });

  it("membungkus putaran berapa pun ke jumlah halaman", () => {
    expect(bagiHalaman(n(10), 7).indeks).toBe(1);
    expect(bagiHalaman(n(10), 8).indeks).toBe(0);
    expect(bagiHalaman(n(10), -1).indeks).toBe(1);
  });

  it("aman pada daftar kosong", () => {
    expect(bagiHalaman([], 3)).toMatchObject({ jumlah: 1, indeks: 0, isi: [] });
  });
});

describe("computeBoard — acara sehari berjam", () => {
  const SEMINAR: Momen = {
    name: "Gently Parenting Seminar",
    judul: "Menuju Gently Parenting Seminar",
    kategori: "Seminar",
    date: "2026-09-27",
    time: "10:00",
    end: "2026-09-27",
    endTime: "12:00",
    lokasi: "Granada, Menara 165",
    accent: "#A78BFA",
  };

  it("menulis rentang jam, bukan rentang tanggal 27–27", () => {
    const sebelum = computeBoard(wib("2026-09-14", "09:00"), [SEMINAR]);
    expect(sebelum.hero.dateLine).toContain("Ahad, 27 September 2026 · 10.00–12.00");
    expect(sebelum.hero.lokasi).toBe("Granada, Menara 165");

    const saat = computeBoard(wib("2026-09-27", "10:30"), [SEMINAR]);
    expect(saat.hero.mode).toBe("berlangsung");
    expect(saat.hero.dateLine).not.toContain("27–27");
    expect(saat.hero.dateLine).toContain("10.00–12.00");
    expect(saat.hero.sampai).toBe("12.00");
  });

  it("progress bar mengukur jam yang lewat, bukan hari ke-1 dari 1", () => {
    expect(computeBoard(wib("2026-09-27", "10:30"), [SEMINAR]).hero.pct).toBe(25);
    expect(computeBoard(wib("2026-09-27", "11:00"), [SEMINAR]).hero.pct).toBe(50);
  });

  it("lewat tepat sesudah jam selesai", () => {
    const v = computeBoard(wib("2026-09-27", "12:01"), [SEMINAR, SATU_HARI]);
    expect(v.hero.title).toBe("Menuju Idul Fitri");
    expect(v.cards[0].opacity).toBe(0.4);
  });

  it("momen tanpa lokasi tidak mengarang baris lokasi", () => {
    expect(computeBoard(wib("2026-09-03"), [BERJAM]).hero.lokasi).toBeNull();
  });
});

describe("computeBoard — momen berjam", () => {
  it("menghitung durasi sungguhan, bukan hari kalender", () => {
    // 3 Sep 14.30 → 29 Sep 08.00 = 25 hari 17 jam 30 menit.
    // Selisih hari kalender akan bilang 26; yang benar di sini 25.
    const v = computeBoard(wib("2026-09-03", "14:30"), [BERJAM]);
    expect(v.hero.days).toBe(25);
    expect(v.hero.jamMenit).toBe("17 jam 30 menit");
  });

  it("menampilkan jam keberangkatan di baris tanggal", () => {
    const v = computeBoard(wib("2026-09-03"), [BERJAM]);
    expect(v.hero.dateLine).toContain("29 September 2026 · 08.00");
  });

  it("tidak pernah memakai HARI INI — sisa jam lebih berguna di hari-H", () => {
    const v = computeBoard(wib("2026-09-29", "05:00"), [BERJAM]);
    expect(v.hero.mode).toBe("counting");
    expect(v.hero.days).toBe(0);
    expect(v.hero.jamMenit).toBe("03 jam 00 menit");
    expect(v.hero.pill).toBe("SEGERA");
  });

  it("beralih ke berlangsung tepat pada jam keberangkatan", () => {
    expect(computeBoard(wib("2026-09-29", "07:59"), [BERJAM]).hero.mode).toBe("counting");
    expect(computeBoard(wib("2026-09-29", "08:00"), [BERJAM]).hero.mode).toBe("berlangsung");
  });

  it("selesai tepat pada jam pulang", () => {
    expect(computeBoard(wib("2026-10-08", "14:05"), [BERJAM, SATU_HARI]).hero.mode).toBe(
      "berlangsung",
    );
    const sesudah = computeBoard(wib("2026-10-08", "14:06"), [BERJAM, SATU_HARI]);
    expect(sesudah.hero.title).toBe("Menuju Idul Fitri");
  });

  it("menulis rentang lintas bulan dengan dua nama bulan", () => {
    const v = computeBoard(wib("2026-10-01"), [BERJAM]);
    expect(v.hero.dateLine).toContain("29 September 2026 – 8 Oktober 2026");
  });
});
