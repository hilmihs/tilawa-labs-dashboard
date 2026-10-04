import { describe, expect, it } from "vitest";
import {
  geserPekan,
  isSenin,
  labelPekan,
  pekanKe,
  rentangPekan,
  seninPekanIni,
  urutkanProgram,
} from "./program";

describe("seninPekanIni", () => {
  it("Kamis 17 Sep 2026 siang → Senin 14 Sep", () => {
    expect(seninPekanIni(Date.parse("2026-09-17T05:00:00Z"))).toBe("2026-09-14");
  });
  it("Ahad malam masih pekan yang sama, Senin 00:30 WIB sudah pekan baru", () => {
    expect(seninPekanIni(Date.parse("2026-09-20T16:00:00Z"))).toBe("2026-09-14"); // Ahad 23:00 WIB
    expect(seninPekanIni(Date.parse("2026-09-20T17:30:00Z"))).toBe("2026-09-21"); // Senin 00:30 WIB
  });
});

describe("pekanKe & rentang", () => {
  it("cocok dengan papan tulis: Pekan ke-3 (14–20 September 2026)", () => {
    expect(labelPekan("2026-09-14")).toBe("Pekan ke-3 (14–20 September 2026)");
  });
  it("pekan yang terpotong tanggal 1 dihitung pekan pertama", () => {
    expect(pekanKe("2026-09-07")).toBe(2);
    expect(pekanKe("2026-06-01")).toBe(1); // 1 Juni 2026 Senin
  });
  it("lintas bulan dan lintas tahun", () => {
    expect(rentangPekan("2026-09-28")).toBe("28 September – 4 Oktober 2026");
    expect(rentangPekan("2025-12-29")).toBe("29 Desember 2025 – 4 Januari 2026");
  });
});

describe("isSenin & geserPekan", () => {
  it("menolak bukan Senin dan tanggal mustahil", () => {
    expect(isSenin("2026-09-14")).toBe(true);
    expect(isSenin("2026-09-15")).toBe(false);
    expect(isSenin("2026-02-30")).toBe(false);
    expect(isSenin("14-09-2026")).toBe(false);
  });
  it("geser maju/mundur", () => {
    expect(geserPekan("2026-09-14", 1)).toBe("2026-09-21");
    expect(geserPekan("2026-09-14", -2)).toBe("2026-08-31");
  });
});

it("urutkanProgram: urutan baku, program asing di bawah", () => {
  const out = urutkanProgram([
    { program: "Lain", task: "x", urutan: 0 },
    { program: "SGA", task: "x", urutan: 8 },
    { program: "hits", task: "x", urutan: 1 },
  ]);
  expect(out.map((t) => t.program)).toEqual(["hits", "SGA", "Lain"]);
});
