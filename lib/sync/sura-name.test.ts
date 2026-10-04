import { describe, expect, it } from "vitest";
// Relative, not "@/": the prod lineage runs vitest without the tsconfig alias.
import { buildSuraNameMap, parseSuraNumber, suraKey } from "./sura-name";

const REMEMBERED = [
  { name: "Maryam", number: 19 },
  { name: "An-Nahl", number: 16 },
  { name: "Al-A'raf", number: 7 },
  { name: "Asy-Syura", number: 42 },
];

const map = buildSuraNameMap(REMEMBERED);

describe("parseSuraNumber", () => {
  it("reads the placeholder the export switched to on 19 Agu 2026", () => {
    expect(parseSuraNumber("Surah 42", map)).toBe(42);
    expect(parseSuraNumber("surah 1", map)).toBe(1);
    expect(parseSuraNumber("Surat 114", map)).toBe(114);
    expect(parseSuraNumber("QS. 36", map)).toBe(36);
    expect(parseSuraNumber("42", map)).toBe(42);
  });

  it("still reads the latin names the export used before, however punctuated", () => {
    expect(parseSuraNumber("Maryam", map)).toBe(19);
    expect(parseSuraNumber("an-nahl", map)).toBe(16);
    expect(parseSuraNumber("Al A'raf", map)).toBe(7);
    expect(parseSuraNumber("  Asy-Syura  ", map)).toBe(42);
  });

  it("returns null rather than guessing", () => {
    expect(parseSuraNumber(null, map)).toBeNull();
    expect(parseSuraNumber("", map)).toBeNull();
    expect(parseSuraNumber("   ", map)).toBeNull();
    expect(parseSuraNumber("Surah tak dikenal", map)).toBeNull();
    // Out of range: 0 and 115 are not surahs, and a wrong number would silently
    // colour the wrong cell in the Peta Surah heatmap.
    expect(parseSuraNumber("Surah 0", map)).toBeNull();
    expect(parseSuraNumber("Surah 115", map)).toBeNull();
    expect(parseSuraNumber("Surah 999", map)).toBeNull();
  });
});

describe("buildSuraNameMap", () => {
  it("prefers a live upstream answer over a remembered one", () => {
    const m = buildSuraNameMap([{ name: "Maryam", number: 99 }], [
      { latinName: "Maryam", surahNumber: 19 },
    ]);
    expect(m.get(suraKey("Maryam"))).toBe(19);
  });

  it("skips blanks, out-of-range numbers and placeholder names", () => {
    const m = buildSuraNameMap([
      { name: null, number: 3 },
      { name: "Kosong", number: null },
      { name: "Terlalu Besar", number: 115 },
      { name: "Nol", number: 0 },
      // "Surah 19" is a placeholder, not a name — it belongs to the numeric path.
      { name: "Surah 19", number: 19 },
    ]);
    for (const junk of ["kosong", "terlalubesar", "nol", "surah19"]) {
      expect(m.has(junk)).toBe(false);
    }
  });

  it("resolves names from the baked table with no sources at all", () => {
    const m = buildSuraNameMap([]);
    expect(parseSuraNumber("Al-Fatihah", m)).toBe(1);
    expect(parseSuraNumber("An-Nisa'", m)).toBe(4);
    expect(parseSuraNumber("ali imran", m)).toBe(3);
    // And the numeric path works regardless of the map — that is what keeps the
    // sync alive while the surah endpoint is down.
    expect(parseSuraNumber("Surah 42", m)).toBe(42);
  });
});
