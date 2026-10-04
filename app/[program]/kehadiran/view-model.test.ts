/**
 * The `/maahir/kehadiran` view model, checked against the REAL `rekap/kehadiran`
 * response captured on 3 Sep 2026 (`lib/maahir/__fixtures__/kehadiran.json`).
 * No network, no DB.
 *
 * These tests exist for the four ways this screen can lie:
 *   - a `persenHadir: null` rendered as 0%;
 *   - a missing presensi row collapsed into the "-" (belum diisi) marker;
 *   - a class's grid built from another class's meetings;
 *   - a period label invented from a month name (asserted here by NOT having a
 *     label function at all — labels come from `periodLabel(meta)`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MaahirKehadiranPayload, MaahirRekapEnvelope } from "@/lib/maahir/types";
import {
  buildGrid,
  fetchedAtLabel,
  parseGender,
  persenLabel,
  pilihKelas,
  programLabel,
  ringkasKelas,
  tanggalPendek,
  tarikanBasi,
  totalRingkas,
} from "./view-model";

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "..", "lib", "maahir", "__fixtures__", "kehadiran.json"),
    "utf8",
  ),
) as MaahirRekapEnvelope<MaahirKehadiranPayload>;

const payload = fixture.data;

describe("ringkasKelas", () => {
  it("keeps every class of the capture and upstream's order", () => {
    const list = ringkasKelas(payload);
    expect(list).toHaveLength(payload.length);
    expect(list.map((k) => k.kelasName)).toEqual(payload.map((k) => k.kelasName));
  });

  it("filters by gender without touching the counts", () => {
    const ikhwan = ringkasKelas(payload, "ikhwan");
    expect(ikhwan.length).toBeGreaterThan(0);
    expect(ikhwan.every((k) => k.gender === "ikhwan")).toBe(true);
    expect(ikhwan.length + ringkasKelas(payload, "akhwat").length).toBe(payload.length);
    const first = ikhwan[0];
    const src = payload.find((k) => k.kelasId === first.kelasId)!;
    expect(first.jumlahAnggota).toBe(src.anggota.length);
    expect(first.belumDiisi).toBe(src.belumDiisi);
  });

  it("survives a null payload (route never pulled) instead of throwing", () => {
    expect(ringkasKelas(null)).toEqual([]);
    expect(totalRingkas(ringkasKelas(null))).toEqual({
      kelas: 0,
      anggota: 0,
      pertemuan: 0,
      belumDiisi: 0,
    });
  });
});

describe("totalRingkas", () => {
  it("counts rows only — the totals match the raw payload exactly", () => {
    const total = totalRingkas(ringkasKelas(payload));
    expect(total.kelas).toBe(payload.length);
    expect(total.anggota).toBe(payload.reduce((n, k) => n + k.anggota.length, 0));
    expect(total.pertemuan).toBe(payload.reduce((n, k) => n + k.pertemuan.length, 0));
    expect(total.belumDiisi).toBe(payload.reduce((n, k) => n + k.belumDiisi, 0));
  });
});

describe("pilihKelas", () => {
  it("returns the requested class", () => {
    const target = payload[5];
    expect(pilihKelas(payload, "semua", target.kelasId)?.kelasName).toBe(target.kelasName);
  });

  it("falls back to the first class of the slice when the pin is filtered out", () => {
    const akhwat = payload.find((k) => k.gender === "akhwat")!;
    const ikhwanPertama = payload.find((k) => k.gender === "ikhwan")!;
    expect(pilihKelas(payload, "ikhwan", akhwat.kelasId)?.kelasId).toBe(ikhwanPertama.kelasId);
  });

  it("returns null when there is nothing to show", () => {
    expect(pilihKelas([], "semua")).toBeNull();
    expect(pilihKelas(null, "semua")).toBeNull();
  });
});

describe("buildGrid", () => {
  it("builds one column per pertemuan of THAT class, in date order", () => {
    for (const kelas of payload) {
      const grid = buildGrid(kelas);
      expect(grid.kolom).toHaveLength(kelas.pertemuan.length);
      expect(grid.kolom.map((k) => k.pertemuanId).sort()).toEqual(
        kelas.pertemuan.map((p) => p.id).sort(),
      );
      const tanggal = grid.kolom.map((k) => k.tanggal);
      expect(tanggal).toEqual([...tanggal].sort());
    }
  });

  it("gives every member a cell for every column, aligned by pertemuan id", () => {
    const kelas = payload.find((k) => k.pertemuan.length > 10)!;
    const grid = buildGrid(kelas);
    for (const baris of grid.baris) {
      expect(baris.sel).toHaveLength(grid.kolom.length);
      baris.sel.forEach((s, i) => expect(s.pertemuanId).toBe(grid.kolom[i].pertemuanId));
    }
  });

  it("keeps 'no presensi row' (null) apart from '-' (session not filled)", () => {
    const kelas = payload.find((k) =>
      k.anggota.some((a) => Object.values(a.perPertemuan).includes("-")),
    )!;
    const grid = buildGrid(kelas);
    const semuaKode = grid.baris.flatMap((b) => b.sel.map((s) => s.kode));
    expect(semuaKode).toContain("-");

    // A member with a key missing for a column must land on null, never on "-".
    const anggota = kelas.anggota[0];
    const hilang = kelas.pertemuan.find((p) => !(p.id in anggota.perPertemuan));
    if (hilang) {
      const baris = grid.baris.find((b) => b.anggotaId === anggota.anggotaId)!;
      expect(baris.sel.find((s) => s.pertemuanId === hilang.id)!.kode).toBeNull();
    }
  });

  it("carries the per-meeting note to the cell it belongs to", () => {
    const kelas = payload.find((k) =>
      k.anggota.some((a) => Object.keys(a.catatanPerPertemuan).length > 0),
    )!;
    const anggota = kelas.anggota.find((a) => Object.keys(a.catatanPerPertemuan).length > 0)!;
    const [pertemuanId, catatan] = Object.entries(anggota.catatanPerPertemuan)[0];
    const baris = buildGrid(kelas).baris.find((b) => b.anggotaId === anggota.anggotaId)!;
    expect(baris.sel.find((s) => s.pertemuanId === pertemuanId)?.catatan).toBe(catatan);
  });

  it("lists the unfilled sessions and agrees with upstream's belumDiisi count", () => {
    for (const kelas of payload) {
      expect(buildGrid(kelas).sesiBelumDiisi).toHaveLength(kelas.belumDiisi);
    }
  });

  it("marks ketua and wakil, and passes totals through untouched", () => {
    const kelas = payload.find((k) => k.anggota.some((a) => a.isKetua))!;
    const grid = buildGrid(kelas);
    const ketua = kelas.anggota.find((a) => a.isKetua)!;
    const baris = grid.baris.find((b) => b.anggotaId === ketua.anggotaId)!;
    expect(baris.peran).toBe("Ketua");
    expect(baris.totals).toEqual(ketua.totals);
  });

  it("labels the program per column only when the class mixes programs", () => {
    const campur = payload.find(
      (k) => new Set(k.pertemuan.map((p) => p.program)).size > 1,
    )!;
    const tunggal = payload.find(
      (k) => k.pertemuan.length > 0 && new Set(k.pertemuan.map((p) => p.program)).size === 1,
    )!;
    expect(buildGrid(campur).kolom.every((k) => k.tampilkanProgram)).toBe(true);
    expect(buildGrid(tunggal).kolom.every((k) => !k.tampilkanProgram)).toBe(true);
  });

  it("returns an empty grid for a missing class rather than throwing", () => {
    expect(buildGrid(null)).toEqual({ kolom: [], baris: [], sesiBelumDiisi: [] });
  });
});

describe("persenLabel", () => {
  it("renders null as an em dash — never 0%", () => {
    expect(persenLabel(null)).toBe("—");
    expect(persenLabel(undefined)).toBe("—");
    expect(persenLabel(0)).toBe("0%");
    expect(persenLabel(87.4)).toBe("87%");
  });

  it("never turns a null persenHadir in the capture into a zero", () => {
    const nulls = payload.flatMap((k) =>
      k.anggota.filter((a) => a.persenHadir == null).map((a) => a.anggotaId),
    );
    expect(nulls.length).toBeGreaterThan(0); // the capture really does have some
    for (const kelas of payload) {
      for (const baris of buildGrid(kelas).baris) {
        if (nulls.includes(baris.anggotaId)) expect(persenLabel(baris.persenHadir)).toBe("—");
      }
    }
  });
});

describe("formatting helpers", () => {
  it("formats a date without a UTC round-trip", () => {
    expect(tanggalPendek("2026-08-24")).toBe("24 Agu");
    expect(tanggalPendek("2026-01-01")).toBe("1 Jan");
    expect(tanggalPendek("bukan-tanggal")).toBe("bukan-tanggal");
  });

  it("humanises a program key upstream left unlabelled", () => {
    expect(programLabel("Kelas Maahir", "kelas_maahir")).toBe("Kelas Maahir");
    expect(programLabel("muallim_najih", "muallim_najih")).toBe("Muallim Najih");
    expect(programLabel("", "at_tibyan")).toBe("At Tibyan");
    expect(programLabel(null)).toBe("—");
  });

  it("reads gender off the query string, defaulting to semua", () => {
    expect(parseGender("ikhwan")).toBe("ikhwan");
    expect(parseGender("akhwat")).toBe("akhwat");
    expect(parseGender("ngawur")).toBe("semua");
    expect(parseGender(undefined)).toBe("semua");
  });

  it("says how old a pull is, so stale data is labelled instead of hidden", () => {
    const now = new Date("2026-09-03T10:00:00+07:00");
    expect(fetchedAtLabel(new Date("2026-09-03T09:30:00+07:00"), now)).toContain("30 menit lalu");
    expect(fetchedAtLabel(new Date("2026-09-03T07:00:00+07:00"), now)).toContain("3 jam lalu");
    expect(fetchedAtLabel(new Date("2026-09-01T10:00:00+07:00"), now)).toContain("2 hari lalu");
    expect(tarikanBasi(new Date("2026-09-03T09:00:00+07:00"), now)).toBe(false);
    expect(tarikanBasi(new Date("2026-09-01T09:00:00+07:00"), now)).toBe(true);
  });
});
