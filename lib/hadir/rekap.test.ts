import { describe, expect, it } from "vitest";
import { bandingSesi, namaBerulang, pivotGolongan, rekapSesi, type BarisRekap, type SesiMeta, type TargetSesi } from "./rekap";

const sesi1: SesiMeta = {
  acaraId: "s1", slug: "krb-04", nama: "Kajian Rumah Belajar", seri: "kajian-rumah-belajar",
  tanggal: "2026-09-04", pemateri: "Ust Fariq", tema: null,
};

function hadir(v: Partial<BarisRekap> & { orangId: string }): BarisRekap {
  return {
    acaraId: "s1", nama: `Orang ${v.orangId}`, gender: "L", qism: null, qismTaksiran: false,
    golongan: [], hadirAt: "2026-09-04T03:00:00.000Z", ...v,
  };
}

describe("rekapSesi", () => {
  it("total selalu = ikhwan + akhwat + gender tak diketahui", () => {
    const rows = [hadir({ orangId: "a", gender: "L" }), hadir({ orangId: "b", gender: "P" }), hadir({ orangId: "c", gender: "" })];
    const [r] = rekapSesi([sesi1], rows, [], new Map());
    expect(r.total).toBe(3);
    expect(r.ikhwan + r.akhwat + r.genderTakDiketahui).toBe(r.total);
    expect(r.genderTakDiketahui).toBe(1);
  });

  it("membawa pemateri, tema, dan tanggal apa adanya", () => {
    const [r] = rekapSesi([{ ...sesi1, tema: "Kitab Tauhid" }], [], [], new Map());
    expect(r.pemateri).toBe("Ust Fariq");
    expect(r.tema).toBe("Kitab Tauhid");
    expect(r.tanggal).toBe("2026-09-04");
  });

  it("menghitung prodi per sesi dan menandai berapa yang taksiran", () => {
    const rows = [
      hadir({ orangId: "a", qism: "Syariah" }),
      hadir({ orangId: "b", qism: "Syariah", qismTaksiran: true }),
      hadir({ orangId: "c", qism: null }),
    ];
    const [r] = rekapSesi([sesi1], rows, [], new Map());
    expect(r.perQism).toEqual([
      { qism: "Syariah", jumlah: 2, taksiran: 1 },
      { qism: "Tak diketahui", jumlah: 1, taksiran: 0 },
    ]);
  });

  it("mangkir hanya dari golongan wajib, bukan diundang", () => {
    const target: TargetSesi[] = [
      { acaraId: "s1", klasifikasiSlug: "pengajar-hits", sifat: "wajib" },
      { acaraId: "s1", klasifikasiSlug: "majelis-tazhim-rumah-belajar", sifat: "diundang" },
    ];
    const anggota = new Map<string, Set<string>>([
      ["pengajar-hits", new Set(["a", "b", "c"])],
      ["majelis-tazhim-rumah-belajar", new Set(["d", "e"])],
    ]);
    const rows = [
      hadir({ orangId: "a", golongan: ["pengajar-hits"] }),
      hadir({ orangId: "d", golongan: ["majelis-tazhim-rumah-belajar"] }),
    ];
    const [r] = rekapSesi([sesi1], rows, target, anggota);
    expect(r.wajib).toBe(3);
    expect(r.hadirWajib).toBe(1);
    expect(r.mangkir).toBe(2); // b dan c; d TIDAK menambah mangkir meski tidak wajib
    expect(r.hadirDiundang).toBe(1);
    expect(r.hadirTambahan).toBe(0);
  });

  it("hadir tambahan tidak menaikkan mangkir", () => {
    const target: TargetSesi[] = [{ acaraId: "s1", klasifikasiSlug: "pengajar-hits", sifat: "wajib" }];
    const anggota = new Map<string, Set<string>>([["pengajar-hits", new Set(["a"])]]);
    const rows = [hadir({ orangId: "a", golongan: ["pengajar-hits"] }), hadir({ orangId: "z", golongan: [] })];
    const [r] = rekapSesi([sesi1], rows, target, anggota);
    expect(r.mangkir).toBe(0);
    expect(r.hadirTambahan).toBe(1);
    expect(r.total).toBe(2);
  });

  it("orang yang wajib DAN diundang dihitung sekali, sebagai wajib", () => {
    const target: TargetSesi[] = [
      { acaraId: "s1", klasifikasiSlug: "pengajar-hits", sifat: "wajib" },
      { acaraId: "s1", klasifikasiSlug: "majelis-tazhim-rumah-belajar", sifat: "diundang" },
    ];
    const anggota = new Map<string, Set<string>>([
      ["pengajar-hits", new Set(["a"])],
      ["majelis-tazhim-rumah-belajar", new Set(["a"])],
    ]);
    const [r] = rekapSesi([sesi1], [hadir({ orangId: "a", golongan: ["pengajar-hits", "majelis-tazhim-rumah-belajar"] })], target, anggota);
    expect(r.hadirWajib).toBe(1);
    expect(r.hadirDiundang).toBe(0);
    expect(r.hadirTambahan).toBe(0);
  });

  it("sesi tanpa target: semua hadir jadi hadir tambahan, mangkir 0", () => {
    const [r] = rekapSesi([sesi1], [hadir({ orangId: "a" })], [], new Map());
    expect(r.wajib).toBe(0);
    expect(r.mangkir).toBe(0);
    expect(r.hadirTambahan).toBe(1);
  });

  it("baris acara lain tidak bocor ke sesi ini", () => {
    const rows = [hadir({ orangId: "a" }), hadir({ orangId: "b", acaraId: "s2" })];
    const [r] = rekapSesi([sesi1], rows, [], new Map());
    expect(r.total).toBe(1);
  });
});

describe("bandingSesi", () => {
  const dasar = {
    slug: "x", nama: "Kajian", pemateri: null, tema: null, genderTakDiketahui: 0,
    perQism: [], perGolongan: [], wajib: 0, hadirWajib: 0, mangkir: 0, hadirDiundang: 0, hadirTambahan: 0,
  };
  const s = (acaraId: string, seri: string | null, tanggal: string, total: number, ikhwan: number, akhwat: number) =>
    ({ ...dasar, acaraId, seri, tanggal, total, ikhwan, akhwat });

  it("sesi pertama dalam seri tidak punya delta", () => {
    const d = bandingSesi([s("a", "krb", "2026-09-04", 135, 40, 87)]);
    expect(d.get("a")).toEqual({ total: null, ikhwan: null, akhwat: null });
  });

  it("membandingkan dengan sesi sebelumnya dalam seri yang sama, urut tanggal", () => {
    const d = bandingSesi([
      s("b", "krb", "2026-09-07", 56, 10, 45),
      s("a", "krb", "2026-09-04", 135, 40, 87),
    ]);
    expect(d.get("a")).toEqual({ total: null, ikhwan: null, akhwat: null });
    expect(d.get("b")).toEqual({ total: -79, ikhwan: -30, akhwat: -42 });
  });

  it("seri berbeda tidak pernah dibandingkan satu sama lain", () => {
    const d = bandingSesi([
      s("a", "krb", "2026-09-04", 135, 40, 87),
      s("p", "kajian-pengajar", "2026-09-12", 180, 60, 120),
    ]);
    expect(d.get("p")).toEqual({ total: null, ikhwan: null, akhwat: null });
  });

  it("seri null tidak digabung ke seri bernama", () => {
    const d = bandingSesi([
      s("a", "krb", "2026-09-04", 135, 40, 87),
      s("n", null, "2026-09-05", 10, 5, 5),
    ]);
    expect(d.get("n")).toEqual({ total: null, ikhwan: null, akhwat: null });
  });

  it("dua sesi tanpa seri TIDAK saling dibandingkan", () => {
    // Kajian Pengajar dan Kajian Mahasiswa LIPIA sama-sama tanpa seri: keduanya
    // kajian berbeda, jadi selisihnya tidak punya arti dan tidak boleh ditampilkan.
    const d = bandingSesi([
      s("x", null, "2026-09-12", 180, 60, 120),
      s("y", null, "2026-11-01", 0, 0, 0),
    ]);
    expect(d.get("x")).toEqual({ total: null, ikhwan: null, akhwat: null });
    expect(d.get("y")).toEqual({ total: null, ikhwan: null, akhwat: null });
  });
});

describe("namaBerulang", () => {
  const b = (acaraId: string, orangId: string, nama: string, gender: string): BarisRekap => ({
    acaraId, orangId, nama, gender, qism: null, qismTaksiran: false, golongan: [], hadirAt: "2026-09-04T03:00:00.000Z",
  });

  it("menyatukan dua ejaan lewat satu orangId", () => {
    const r = namaBerulang([b("s1", "a", "Annisa Kurniasari", "P"), b("s2", "a", "Annisa kurniasari", "P")]);
    expect(r.orang).toHaveLength(1);
    expect(r.orang[0].jumlahSesi).toBe(2);
  });

  it("tidak menghitung sesi yang sama dua kali", () => {
    const r = namaBerulang([b("s1", "a", "A", "P"), b("s1", "a", "A", "P")]);
    expect(r.orang[0].jumlahSesi).toBe(1);
  });

  it("sebaran frekuensi dipecah ikhwan / akhwat", () => {
    const r = namaBerulang([
      b("s1", "a", "A", "L"), b("s2", "a", "A", "L"),
      b("s1", "p", "P1", "P"), b("s2", "p", "P1", "P"),
      b("s1", "q", "Q", "P"),
    ]);
    expect(r.sebaran).toEqual([
      { kali: 1, total: 1, ikhwan: 0, akhwat: 1 },
      { kali: 2, total: 2, ikhwan: 1, akhwat: 1 },
    ]);
  });

  it("urut menurun berdasarkan jumlah sesi, lalu nama", () => {
    const r = namaBerulang([b("s1", "z", "Zaid", "L"), b("s1", "a", "Aisyah", "P"), b("s2", "a", "Aisyah", "P")]);
    expect(r.orang.map((o) => o.orangId)).toEqual(["a", "z"]);
  });
});

describe("pivotGolongan", () => {
  it("menyusun matriks golongan x sesi sesuai urutan sesi", () => {
    const rekap = [
      { acaraId: "s1", perGolongan: [{ slug: "pengajar-hits", jumlah: 3 }] },
      { acaraId: "s2", perGolongan: [{ slug: "pengajar-hits", jumlah: 1 }, { slug: "majelis-tazhim-rumah-belajar", jumlah: 5 }] },
    ];
    const r = pivotGolongan(rekap, ["pengajar-hits", "majelis-tazhim-rumah-belajar"]);
    expect(r).toEqual([
      { slug: "pengajar-hits", perSesi: [3, 1], totalKehadiran: 4 },
      { slug: "majelis-tazhim-rumah-belajar", perSesi: [0, 5], totalKehadiran: 5 },
    ]);
  });
});
