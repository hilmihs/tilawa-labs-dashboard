import { describe, expect, it } from "vitest";
import { dalamJendela, rencanakanBatch, ringkasHadir, rosterScanner, terlambat, type OrangAcaraRow } from "./view-model";

const acara = { tanggal: "2026-09-12", jamMulai: "10:00:00", toleransiMenit: 15, scanBukaAt: null, scanTutupAt: null };

function orang(over: Partial<OrangAcaraRow>): OrangAcaraRow {
  return { id: "x", nama: "X", gender: "L", programTeks: "Pengajar HITS", kategori: "pengajar", kodeQr: "ABCDEFGHJK", wa: null, konfirmasi: null, alasan: null, hadirAt: null, metode: null, golongan: [], ...over };
}

describe("terlambat", () => {
  it("dibandingkan dalam WIB, bukan UTC", () => {
    expect(terlambat("2026-09-12T02:59:00Z", acara)).toBe(false); // 09:59 WIB
    expect(terlambat("2026-09-12T03:15:00Z", acara)).toBe(false); // 10:15 tepat toleransi
    expect(terlambat("2026-09-12T03:16:00Z", acara)).toBe(true); // 10:16
    expect(terlambat("2026-09-12T10:16:00+07:00", acara)).toBe(true);
  });
  it("tanpa jam mulai tidak pernah terlambat", () => {
    expect(terlambat("2026-09-12T23:00:00+07:00", { ...acara, jamMulai: null })).toBe(false);
  });
});

describe("dalamJendela", () => {
  it("null = tanpa batas; batas inklusif", () => {
    expect(dalamJendela("2026-09-12T01:00:00Z", null, null)).toBe(true);
    expect(dalamJendela("2026-09-12T01:00:00Z", "2026-09-12T01:00:00Z", "2026-09-12T06:00:00Z")).toBe(true);
    expect(dalamJendela("2026-09-12T00:59:59Z", "2026-09-12T01:00:00Z", null)).toBe(false);
    expect(dalamJendela("2026-09-12T06:00:01Z", null, "2026-09-12T06:00:00Z")).toBe(false);
  });
});

describe("ringkasHadir", () => {
  const rows = [
    orang({ id: "1", konfirmasi: "bisa", hadirAt: "2026-09-12T02:35:00Z" }), // 09:35 hadir
    orang({ id: "2", konfirmasi: "bisa" }), // no-show
    orang({ id: "3", gender: "P", konfirmasi: "belum_bisa", hadirAt: "2026-09-12T03:20:00Z", programTeks: "Pengajar Mabni" }), // hadir tanpa rsvp, terlambat
    orang({ id: "4", gender: "P", konfirmasi: null, programTeks: null }),
    orang({ id: "5", konfirmasi: "bisa", hadirAt: "2026-09-12T02:39:00Z" }), // 09:39 → bucket 09:30
  ];
  const r = ringkasHadir(rows, acara);
  it("angka inti", () => {
    expect(r.terdaftar).toBe(5);
    expect(r.hadir).toBe(3);
    expect(r.bisa).toBe(3);
    expect(r.belumBisa).toBe(1);
    expect(r.tanpaJawaban).toBe(1);
    expect(r.noShow).toBe(1);
    expect(r.hadirTanpaRsvp).toBe(1);
    expect(r.terlambat).toBe(1);
  });
  it("per gender & per program", () => {
    expect(r.perGender).toEqual({ L: { terdaftar: 3, hadir: 2 }, P: { terdaftar: 2, hadir: 1 } });
    expect(r.perProgram.map((p) => [p.program, p.terdaftar, p.hadir])).toEqual([
      ["Pengajar HITS", 3, 2],
      ["Pengajar Mabni", 1, 1],
      ["Tanpa program", 1, 0],
    ]);
  });
  it("histogram per 10 menit WIB", () => {
    expect(r.histogram).toEqual([{ jam: "09:30", jumlah: 2 }, { jam: "10:20", jumlah: 1 }]);
  });
});

describe("rosterScanner", () => {
  it("membawa golongan dan penanda wajib, tanpa WA penuh", () => {
    const [e] = rosterScanner([orang({ id: "a", wa: "6281234567890", golongan: ["pengajar-hits"] })], new Set(["a"]));
    expect(e.golongan).toEqual(["pengajar-hits"]);
    expect(e.wajib).toBe(true);
    expect(JSON.stringify(e)).not.toContain("6281234567890");
  });

  it("orang di luar target bukan wajib", () => {
    const [e] = rosterScanner([orang({ id: "z" })], new Set(["a"]));
    expect(e.wajib).toBe(false);
  });

  it("tidak memuat WA penuh", () => {
    const [e] = rosterScanner([orang({ wa: "6281234567890" })]);
    expect(JSON.stringify(e)).not.toContain("6281234567890");
    expect(e.waAkhir4).toBe("7890");
    expect(e.kode).toBe("ABCDEFGHJK");
  });
});

describe("rencanakanBatch", () => {
  const jendela = { bukaISO: "2026-09-12T01:00:00Z", tutupISO: "2026-09-12T06:00:00Z" };
  const dikenal = new Set(["a", "b", "c"]);
  it("klien_id ganda dan orang ganda ditulis sekali; yang sudah hadir → sudah", () => {
    const ev = (klienId: string, orangId: string, waktu: string) => ({ klienId, orangId, waktu, metode: "qr" as const });
    const { tulis, status } = rencanakanBatch(
      [ev("k2", "a", "2026-09-12T02:10:00Z"), ev("k1", "a", "2026-09-12T02:05:00Z"), ev("k1", "a", "2026-09-12T02:05:00Z"), ev("k3", "b", "2026-09-12T02:06:00Z"), ev("k4", "c", "2026-09-12T07:00:00Z"), ev("k5", "z", "2026-09-12T02:06:00Z")],
      new Set(["b"]),
      dikenal,
      jendela,
    );
    expect(tulis.map((t) => t.klienId)).toEqual(["k1"]);
    expect(status.get("k1")).toBe("baru");
    expect(status.get("k2")).toBe("sudah");
    expect(status.get("k3")).toBe("sudah");
    expect(status.get("k4")).toBe("ditolak_jendela");
    expect(status.get("k5")).toBe("tak_dikenal");
  });
});
