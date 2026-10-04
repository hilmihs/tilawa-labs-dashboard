import { describe, expect, it } from "vitest";
import { pilihRentang, rencanakanBatchLepas, sebaranJam, tanggalScan, type EventLepas } from "./lepas";

describe("tanggalScan", () => {
  it("memakai hari WIB dari waktu scan, bukan UTC", () => {
    // 22 Sep 23.50 WIB = 22 Sep 16.50 UTC
    expect(tanggalScan("2026-09-22T16:50:00.000Z")).toBe("2026-09-22");
    // 23 Sep 00.10 WIB = 22 Sep 17.10 UTC — tetap 23 Sep menurut WIB
    expect(tanggalScan("2026-09-22T17:10:00.000Z")).toBe("2026-09-23");
  });

  it("menerima ISO ber-offset +07:00", () => {
    expect(tanggalScan("2026-09-22T23:50:00+07:00")).toBe("2026-09-22");
  });
});

describe("rencanakanBatchLepas", () => {
  const A = "aaaa1111-1111-1111-1111-111111111111";
  const B = "bbbb2222-2222-2222-2222-222222222222";
  const dikenal = new Set([A, B]);
  const ev = (klienId: string, orangId: string, waktu: string): EventLepas =>
    ({ klienId, orangId, waktu, metode: "qr", perangkatId: "hp-1" });

  it("scan baru ditulis dengan tanggal dari waktunya", () => {
    const r = rencanakanBatchLepas([ev("k1", A, "2026-09-22T01:00:00.000Z")], new Set(), dikenal);
    expect(r.tulis).toEqual([{ klienId: "k1", orangId: A, waktu: "2026-09-22T01:00:00.000Z", metode: "qr", perangkatId: "hp-1", tanggal: "2026-09-22" }]);
    expect(r.status.get("k1")).toBe("baru");
  });

  it("klien_id yang sama dikirim dua kali hanya ditulis sekali", () => {
    const e = ev("k1", A, "2026-09-22T01:00:00.000Z");
    const r = rencanakanBatchLepas([e, e], new Set(), dikenal);
    expect(r.tulis).toHaveLength(1);
  });

  it("orang yang sama dua kali di HARI yang sama = satu baris, sisanya 'sudah'", () => {
    const r = rencanakanBatchLepas(
      [ev("k1", A, "2026-09-22T01:00:00.000Z"), ev("k2", A, "2026-09-22T02:00:00.000Z")],
      new Set(),
      dikenal,
    );
    expect(r.tulis).toHaveLength(1);
    expect(r.tulis[0].klienId).toBe("k1"); // yang paling awal menang
    expect(r.status.get("k2")).toBe("sudah");
  });

  it("orang yang sama di dua hari berbeda = dua baris", () => {
    const r = rencanakanBatchLepas(
      [ev("k1", A, "2026-09-22T01:00:00.000Z"), ev("k2", A, "2026-09-23T01:00:00.000Z")],
      new Set(),
      dikenal,
    );
    expect(r.tulis).toHaveLength(2);
    expect(r.tulis.map((t) => t.tanggal)).toEqual(["2026-09-22", "2026-09-23"]);
  });

  it("yang sudah ada di DB untuk hari itu dijawab 'sudah'", () => {
    const r = rencanakanBatchLepas([ev("k1", A, "2026-09-22T01:00:00.000Z")], new Set(["2026-09-22|" + A]), dikenal);
    expect(r.tulis).toEqual([]);
    expect(r.status.get("k1")).toBe("sudah");
  });

  it("sudah ada di hari LAIN tidak menghalangi hari ini", () => {
    const r = rencanakanBatchLepas([ev("k1", A, "2026-09-22T01:00:00.000Z")], new Set(["2026-09-21|" + A]), dikenal);
    expect(r.tulis).toHaveLength(1);
  });

  it("orang yang tidak dikenal ditolak, tidak ditulis", () => {
    const r = rencanakanBatchLepas([ev("k1", "cccc3333-3333-3333-3333-333333333333", "2026-09-22T01:00:00.000Z")], new Set(), dikenal);
    expect(r.tulis).toEqual([]);
    expect(r.status.get("k1")).toBe("tak_dikenal");
  });

  it("tanpa kegiatan tidak pernah ada status ditolak_jendela", () => {
    // Jam berapa pun diterima: tanpa kegiatan tidak ada jendela scan.
    const r = rencanakanBatchLepas([ev("k1", A, "2026-09-22T19:00:00.000Z"), ev("k2", B, "2026-09-21T22:00:00.000Z")], new Set(), dikenal);
    expect([...r.status.values()]).toEqual(["baru", "baru"]);
  });
});

describe("sebaranJam", () => {
  const r = (waktu: string) => ({ waktu });

  it("mengelompokkan per jam WIB, hanya jam yang berisi, urut naik", () => {
    // 23.00, 00.05, 00.35, 01.10 UTC = 06.00, 07.05, 07.35, 08.10 WIB
    const out = sebaranJam([r("2026-09-21T23:00:00.000Z"), r("2026-09-22T00:05:00.000Z"), r("2026-09-22T00:35:00.000Z"), r("2026-09-22T01:10:00.000Z")]);
    expect(out).toEqual([
      { jam: "06:00", jumlah: 1 },
      { jam: "07:00", jumlah: 2 },
      { jam: "08:00", jumlah: 1 },
    ]);
  });

  it("kosong menghasilkan daftar kosong", () => {
    expect(sebaranJam([])).toEqual([]);
  });

  it("memakai jam WIB, bukan UTC", () => {
    // 16.50 UTC = 23.50 WIB — kalau salah, akan muncul sebagai 16:00
    expect(sebaranJam([r("2026-09-22T16:50:00.000Z")])).toEqual([{ jam: "23:00", jumlah: 1 }]);
  });
});

describe("pilihRentang", () => {
  const baris = [
    { id: "1", waktu: "2026-09-21T23:00:00.000Z" }, // 06:00 WIB
    { id: "2", waktu: "2026-09-22T00:30:00.000Z" }, // 07:30
    { id: "3", waktu: "2026-09-22T09:00:00.000Z" }, // 16:00
  ];

  it("inklusif di dua ujung", () => {
    expect(pilihRentang(baris, "06:00", "07:30").map((b) => b.id)).toEqual(["1", "2"]);
  });

  it("null di salah satu ujung = tanpa batas di ujung itu", () => {
    expect(pilihRentang(baris, null, "07:30").map((b) => b.id)).toEqual(["1", "2"]);
    expect(pilihRentang(baris, "07:30", null).map((b) => b.id)).toEqual(["2", "3"]);
    expect(pilihRentang(baris, null, null).map((b) => b.id)).toEqual(["1", "2", "3"]);
  });

  it("rentang yang tidak memuat apa pun menghasilkan kosong", () => {
    expect(pilihRentang(baris, "10:00", "12:00")).toEqual([]);
  });
});
