import { describe, expect, it } from "vitest";
import { jendelaAcara, nadaTap, pilihAcara, type AcaraCalon } from "./terpadu";

const a = (v: Partial<AcaraCalon>): AcaraCalon => ({ id: "x", nama: "Kajian", tanggal: "2026-09-29", jamMulai: null, scanBukaAt: null, scanTutupAt: null, terdaftar: false, ...v });

describe("jendelaAcara", () => {
  it("uses the explicit scan window, else start time −60/+180, else nothing", () => {
    const buka = new Date("2026-09-29T11:00:00Z");
    const tutup = new Date("2026-09-29T14:00:00Z");
    expect(jendelaAcara(a({ scanBukaAt: buka, scanTutupAt: tutup }))).toEqual({ buka, tutup });
    expect(jendelaAcara(a({ jamMulai: "19:30:00" }))).toEqual({ buka: new Date("2026-09-29T11:30:00Z"), tutup: new Date("2026-09-29T15:30:00Z") });
    expect(jendelaAcara(a({}))).toBeNull();
  });
});

describe("pilihAcara", () => {
  const kajian = a({ id: "k", jamMulai: "19:30" });
  it("does not count a morning office check-in as attending the evening kajian", () => {
    expect(pilihAcara([kajian], new Date("2026-09-29T01:00:00Z")).acara).toBeNull();
    expect(pilihAcara([kajian], new Date("2026-09-29T12:20:00Z")).acara?.id).toBe("k");
  });
  it("breaks overlaps by registration and never guesses otherwise", () => {
    const lain = a({ id: "l", jamMulai: "19:00" });
    const t = new Date("2026-09-29T12:10:00Z");
    expect(pilihAcara([kajian, { ...lain, terdaftar: true }], t).acara?.id).toBe("l");
    const r = pilihAcara([kajian, lain], t);
    expect(r.acara).toBeNull();
    expect(r.bentrok.map((x) => x.id)).toEqual(["k", "l"]);
  });
});

describe("nadaTap", () => {
  it("is green when anything new was recorded", () => {
    expect(nadaTap([{ jenis: "kerja", status: "sudah", label: "" }, { jenis: "acara", status: "tercatat", label: "" }])).toBe("baru");
    expect(nadaTap([{ jenis: "kerja", status: "sudah", label: "" }])).toBe("sudah");
    expect(nadaTap([{ jenis: "badal_mungkin", status: "perlu_tinjau", label: "" }])).toBe("tinjau");
    expect(nadaTap([])).toBe("kosong");
  });
});
