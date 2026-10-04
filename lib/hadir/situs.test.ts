import { describe, expect, it } from "vitest";
import {
  BATAS_PER_KLIEN,
  BATAS_TOTAL,
  acaraPublik,
  buatPembatas,
  kartuPublik,
  kunciKlien,
  situsBolehMasuk,
} from "./situs";
import type { AcaraRow } from "@/lib/acara/types";

const TOKEN = "t".repeat(32);
const req = (headers: Record<string, string> = {}) => new Request("https://dash.example/api/daftar/acara", { headers });

describe("situsBolehMasuk", () => {
  it("accepts only the exact bearer token", () => {
    expect(situsBolehMasuk(req({ authorization: `Bearer ${TOKEN}` }), TOKEN)).toBe(true);
    expect(situsBolehMasuk(req({ authorization: `Bearer ${TOKEN}x` }), TOKEN)).toBe(false);
    expect(situsBolehMasuk(req(), TOKEN)).toBe(false);
  });

  it("fails closed when the env token is unset, empty or short", () => {
    for (const env of [undefined, "", "   ", "short-token"]) {
      expect(situsBolehMasuk(req({ authorization: "Bearer " }), env)).toBe(false);
      expect(situsBolehMasuk(req({ authorization: `Bearer ${env ?? ""}` }), env)).toBe(false);
    }
  });
});

describe("buatPembatas", () => {
  it("allows BATAS_PER_KLIEN per visitor per hour, then refuses", () => {
    let t = 0;
    const p = buatPembatas(() => t);
    for (let i = 0; i < BATAS_PER_KLIEN; i++) expect(p.lewat("a")).toBe(false);
    expect(p.lewat("a")).toBe(true);
    expect(p.lewat("b")).toBe(false); // another visitor is unaffected
    t += 60 * 60_000; // window slides
    expect(p.lewat("a")).toBe(false);
  });

  it("caps the total across visitors", () => {
    const p = buatPembatas(() => 0);
    for (let i = 0; i < BATAS_TOTAL; i++) expect(p.lewat(`k${i}`)).toBe(false);
    expect(p.lewat("baru")).toBe(true);
  });
});

describe("kunciKlien", () => {
  it("uses a sane x-klien, otherwise one shared bucket", () => {
    expect(kunciKlien(req({ "x-klien": "abcDEF12_-" }))).toBe("abcDEF12_-");
    expect(kunciKlien(req({ "x-klien": "bad value;" }))).toBe("tanpa-klien");
    expect(kunciKlien(req())).toBe("tanpa-klien");
  });
});

describe("public shapes", () => {
  it("kartuPublik never carries contact fields", () => {
    const orang = {
      nama: "Fulan",
      programTeks: "Pengajar HITS",
      gender: "L",
      kodeQr: "ABCDEFGHJK",
      wa: "6281234567890",
      email: "x@y.z",
    };
    const k = kartuPublik(orang, "https://dash/h/ABCDEFGHJK");
    expect(Object.keys(k).sort()).toEqual(["gender", "kode", "nama", "program", "qrUrl"]);
    expect(JSON.stringify(k)).not.toContain("6281234567890");
  });

  it("acaraPublik trims time to HH:MM and drops internal columns", () => {
    const a = {
      slug: "kajian-1",
      nama: "Kajian",
      pemateri: null,
      tanggal: "2026-09-26",
      jamMulai: "09:30:00",
      lokasi: "Masjid",
      terimaPendaftaran: true,
    } as unknown as AcaraRow;
    expect(acaraPublik(a)).toEqual({
      slug: "kajian-1",
      nama: "Kajian",
      pemateri: null,
      tanggal: "2026-09-26",
      jamMulai: "09:30",
      lokasi: "Masjid",
    });
  });
});
