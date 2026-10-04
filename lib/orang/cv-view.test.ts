import { describe, expect, it } from "vitest";
import { ringkasKegiatan, ringkasMengajar, ringkasTautan, statusKegiatan, type BarisHalaqah, type BarisKegiatan } from "./cv-view";

const h = (over: Partial<BarisHalaqah>): BarisHalaqah => ({
  programSlug: "hits-regular",
  programNama: "HITS Reguler",
  halaqahId: 1,
  halaqah: "HITS 001 IKHWAN",
  diampu: 10,
  selesai: 8,
  dibadalkan: 0,
  pemilik: true,
  ...over,
});

const k = (over: Partial<BarisKegiatan>): BarisKegiatan => ({
  slug: "kajian-pengajar-2026-09-12",
  nama: "Kajian Pengajar",
  tanggal: "2026-09-12",
  pemateri: null,
  jamMulai: "09:30",
  toleransiMenit: 15,
  hadirWaktu: null,
  konfirmasi: null,
  ...over,
});

describe("ringkasMengajar", () => {
  it("mengelompokkan per program dan menjumlahkan", () => {
    const r = ringkasMengajar(
      [
        h({}),
        h({ halaqah: "HITS 002 IKHWAN", diampu: 4, selesai: 4 }),
        h({ programSlug: "dpq", programNama: "DPQ", halaqah: "DPQ 01", diampu: 6, selesai: 1 }),
      ],
      3,
    );
    expect(r.perProgram.map((p) => p.programSlug)).toEqual(["hits-regular", "dpq"]);
    expect(r.perProgram[0].selesai).toBe(12);
    expect(r.totalHalaqah).toBe(3);
    expect(r.totalDiampu).toBe(20);
    expect(r.totalSelesai).toBe(13);
    expect(r.jadiBadal).toBe(3);
  });
});

describe("statusKegiatan", () => {
  it("hadir sebelum ambang toleransi", () => {
    expect(statusKegiatan(k({ hadirWaktu: "2026-09-12T02:40:00Z" }))).toBe("hadir"); // 09.40 WIB, ambang 09.45
  });
  it("terlambat setelah ambang", () => {
    expect(statusKegiatan(k({ hadirWaktu: "2026-09-12T03:00:00Z" }))).toBe("terlambat"); // 10.00 WIB
  });
  it("bilang bisa lalu tidak datang = mangkir", () => {
    expect(statusKegiatan(k({ konfirmasi: "bisa" }))).toBe("mangkir");
    expect(statusKegiatan(k({ konfirmasi: "belum_bisa" }))).toBe("tidak_hadir");
    expect(statusKegiatan(k({}))).toBe("tidak_hadir");
  });
  it("tanpa jam mulai tidak pernah terlambat", () => {
    expect(statusKegiatan(k({ jamMulai: null, hadirWaktu: "2026-09-12T12:00:00Z" }))).toBe("hadir");
  });
});

describe("ringkasKegiatan", () => {
  it("urut terbaru dulu dan menghitung", () => {
    const r = ringkasKegiatan([
      k({ slug: "a", tanggal: "2026-08-01", hadirWaktu: "2026-08-01T03:00:00Z" }),
      k({ slug: "b", tanggal: "2026-09-12", konfirmasi: "bisa" }),
      k({ slug: "c", tanggal: "2026-07-01", hadirWaktu: "2026-07-01T02:00:00Z" }),
    ]);
    expect(r.baris.map((x) => x.slug)).toEqual(["b", "a", "c"]);
    expect(r).toMatchObject({ diundang: 3, hadir: 2, terlambat: 1, mangkir: 1 });
  });
});

describe("ringkasTautan", () => {
  const t = (over: Partial<Parameters<typeof ringkasTautan>[0][number]>) => ({
    sumber: "maahir", peran: "pengajar_hits", programSlug: "", namaUpstream: "Adiba Aziz Safitri", idUpstream: "u1", aktif: true, ...over,
  });
  it("dua akun Maahir peran sama jadi satu chip, nama akunnya ditampilkan", () => {
    const r = ringkasTautan([t({}), t({ idUpstream: "u2", namaUpstream: "Adiba Abdul Anggraini" })]);
    expect(r).toHaveLength(1);
    expect(r[0].jumlah).toBe(2);
    expect(r[0].namaAkun).toEqual(["Adiba Aziz Safitri", "Adiba Abdul Anggraini"]);
  });
  it("satu akun tidak menampilkan nama akun; program dikumpulkan; urut tilawah dulu", () => {
    const r = ringkasTautan([
      t({}),
      t({ sumber: "tilawah", peran: "pengajar", programSlug: "hits-regular", idUpstream: "7" }),
      t({ sumber: "tilawah", peran: "pengajar", programSlug: "dpq", idUpstream: "7" }),
    ]);
    expect(r.map((x) => x.sumber)).toEqual(["tilawah", "maahir"]);
    expect(r[0].program).toEqual(["hits-regular", "dpq"]);
    expect(r[0].namaAkun).toEqual([]);
    expect(r[1].namaAkun).toEqual([]);
  });
});
