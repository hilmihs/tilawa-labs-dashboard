import { describe, expect, it } from "vitest";
import type { BarisRekap, SesiMeta } from "./rekap";
import { antarPemateri, bacaDefinisiRutin, matriksLoyalitas, ringkasRutin } from "./rekap-rutin";

const sesi = (i: number, pemateri = "Ust. A", seri = "kajian-lipia"): SesiMeta => ({
  acaraId: `a${i}`, slug: `s${i}`, nama: `Sesi ${i}`, seri, tanggal: `2026-09-${String(i).padStart(2, "0")}`, pemateri, tema: null,
});
const h = (acara: number, orang: string): BarisRekap => ({
  acaraId: `a${acara}`, orangId: orang, nama: orang.toUpperCase(), gender: "L", qism: null, qismTaksiran: false, golongan: [], hadirAt: "",
});

// 5 sesi. x hadir 1-5, y hadir 2,3,5, z hadir 5 saja.
const S = [sesi(1), sesi(2, "Ust. B"), sesi(3), sesi(4, "Ust. B"), sesi(5)];
const H = [1, 2, 3, 4, 5].map((i) => h(i, "x")).concat([h(2, "y"), h(3, "y"), h(5, "y"), h(5, "z")]);

describe("ringkasRutin", () => {
  it("counts people with ≥3 of the last 4 sessions over those who came at least once", () => {
    const r = ringkasRutin(S, H, { minHadir: 3, jendela: 4 });
    expect(r.sesiJendela.map((s) => s.acaraId)).toEqual(["a2", "a3", "a4", "a5"]);
    expect(r).toMatchObject({ rutin: 2, penyebut: 3, persen: 66.7, cukup: true });
    // Jendela sebelumnya a1–a4: x (4) & y (2) → 1 dari 2 = 50%.
    expect(r.delta).toBe(16.7);
  });
  it("parses and clamps the definition", () => {
    expect(bacaDefinisiRutin("9", "4")).toEqual({ minHadir: 3, jendela: 4 });
    expect(bacaDefinisiRutin("2", "3")).toEqual({ minHadir: 2, jendela: 3 });
    expect(bacaDefinisiRutin(undefined, "x")).toEqual({ minHadir: 3, jendela: 4 });
  });
});

describe("antarPemateri", () => {
  it("averages attendance and next-session retention per speaker", () => {
    const rows = antarPemateri(S, H);
    const a = rows.find((r) => r.pemateri === "Ust. A")!;
    const b = rows.find((r) => r.pemateri === "Ust. B")!;
    // A: sesi 1 (1 orang), 3 (2), 5 (3) → rata 2. Retensi 1→2: x lagi 1/1; 3→4: x lagi, y tidak 1/2 → 75%.
    expect(a).toMatchObject({ sesi: 3, rataHadir: 2, retensi: 75 });
    // B: sesi 2 (2), 4 (1). Retensi 2→3: 2/2; 4→5: 1/1 → 100%.
    expect(b).toMatchObject({ sesi: 2, rataHadir: 1.5, retensi: 100 });
  });
});

describe("matriksLoyalitas", () => {
  it("orders by attendance within the window", () => {
    const m = matriksLoyalitas(S.slice(-4), H);
    expect(m.map((r) => [r.orangId, r.hadir])).toEqual([["x", 4], ["y", 3], ["z", 1]]);
    expect(m[1].perSesi).toEqual([true, true, false, true]);
  });
});
