import { describe, expect, it } from "vitest";
import {
  barangBelumKembali,
  bolehUbahStatusTugas,
  formatJumlah,
  hMinus,
  hakAksesDivisi,
  isTerlambat,
  kelompokRab,
  parseAngkaId,
  progresDivisi,
  ringkasRab,
  saringTugas,
  susunPapanTugas,
  terlambatPerDivisi,
  totalHarga,
} from "./view-model";

// Uji #1 spec: total dari jumlah × harga_satuan, bukan kolom tersimpan.
describe("totalHarga", () => {
  it("multiplies numeric strings as pg returns them", () => {
    expect(totalHarga("3.00", "15000.00")).toBe(45000);
  });
  it("accepts numbers", () => {
    expect(totalHarga(2, 2500)).toBe(5000);
  });
  it("is null when either side is missing", () => {
    expect(totalHarga(null, "100")).toBeNull();
    expect(totalHarga("2", null)).toBeNull();
    expect(totalHarga("", "100")).toBeNull();
  });
  it("keeps fractional quantities (1.5 meter × 20000)", () => {
    expect(totalHarga("1.50", "20000")).toBe(30000);
  });
});

// Uji #2 spec: terlambat dari tenggat vs hari ini, bukan status tersimpan.
describe("isTerlambat", () => {
  const today = "2026-09-14";
  it("is late when tenggat passed and status is open", () => {
    expect(isTerlambat({ tenggat: "2026-09-13", status: "berjalan" }, today)).toBe(true);
    expect(isTerlambat({ tenggat: "2026-09-13", status: "belum_mulai" }, today)).toBe(true);
    expect(isTerlambat({ tenggat: "2026-09-13", status: "ditahan" }, today)).toBe(true);
  });
  it("is not late on the deadline day itself", () => {
    expect(isTerlambat({ tenggat: "2026-09-14", status: "berjalan" }, today)).toBe(false);
  });
  it("is never late once selesai or disetujui, even past tenggat", () => {
    expect(isTerlambat({ tenggat: "2026-09-01", status: "selesai" }, today)).toBe(false);
    expect(isTerlambat({ tenggat: "2026-09-01", status: "disetujui" }, today)).toBe(false);
  });
  it("is not late without a tenggat", () => {
    expect(isTerlambat({ tenggat: null, status: "berjalan" }, today)).toBe(false);
  });
});

describe("hMinus", () => {
  it("counts whole days to the event", () => {
    expect(hMinus("2026-09-20", "2026-09-10")).toBe(10);
    expect(hMinus("2026-09-20", "2026-09-20")).toBe(0);
    expect(hMinus("2026-09-20", "2026-09-22")).toBe(-2);
  });
  it("crosses a leap day without drifting", () => {
    expect(hMinus("2028-03-01", "2028-02-28")).toBe(2);
  });
});

// Keputusan koordinator (disetujui/ditahan) tidak boleh dibalik dari token divisi.
describe("bolehUbahStatusTugas", () => {
  it("locks the coordinator decisions", () => {
    expect(bolehUbahStatusTugas("disetujui")).toBe(false);
    expect(bolehUbahStatusTugas("ditahan")).toBe(false);
  });
  it("leaves the divisi-owned statuses open", () => {
    expect(bolehUbahStatusTugas("belum_mulai")).toBe(true);
    expect(bolehUbahStatusTugas("berjalan")).toBe(true);
    expect(bolehUbahStatusTugas("selesai")).toBe(true);
  });
});

describe("parseAngkaId", () => {
  it("reads Indonesian thousands dots and decimal commas", () => {
    expect(parseAngkaId("150.000")).toBe("150000");
    expect(parseAngkaId("1,5")).toBe("1.5");
    expect(parseAngkaId("1.500,25")).toBe("1500.25");
    expect(parseAngkaId("2")).toBe("2");
    expect(parseAngkaId(" 2 ")).toBe("2");
  });
  it("reads a lone dot with 1–2 digits as a decimal (JS numbers, or '2.5' typed)", () => {
    expect(parseAngkaId("2.5")).toBe("2.5");
    expect(parseAngkaId("1.555")).toBe("1555");
  });
  it("accepts finite non-negative numbers", () => {
    expect(parseAngkaId(2)).toBe("2");
    expect(parseAngkaId(1.5)).toBe("1.5");
    expect(parseAngkaId(0)).toBe("0");
  });
  it("rejects garbage, negatives, and exponents", () => {
    expect(parseAngkaId("1e5")).toBeNull();
    expect(parseAngkaId("abc")).toBeNull();
    expect(parseAngkaId("-1")).toBeNull();
    expect(parseAngkaId("")).toBeNull();
    expect(parseAngkaId("   ")).toBeNull();
    expect(parseAngkaId(null)).toBeNull();
    expect(parseAngkaId(undefined)).toBeNull();
    expect(parseAngkaId(NaN)).toBeNull();
    expect(parseAngkaId(-3)).toBeNull();
    expect(parseAngkaId(1.555)).toBeNull();
    expect(parseAngkaId({})).toBeNull();
  });
  it("caps at numeric(12,2): 10 integer digits, 2 decimals", () => {
    expect(parseAngkaId("9999999999")).toBe("9999999999");
    expect(parseAngkaId("12345678901")).toBeNull();
    expect(parseAngkaId("1,25")).toBe("1.25");
    expect(parseAngkaId("1,255")).toBeNull();
  });
});

describe("formatJumlah", () => {
  it("drops trailing zeros and shows a decimal comma", () => {
    expect(formatJumlah("2.00")).toBe("2");
    expect(formatJumlah("1.50")).toBe("1,5");
    expect(formatJumlah("1.25")).toBe("1,25");
    expect(formatJumlah(3)).toBe("3");
  });
  it("is null for missing or unreadable input", () => {
    expect(formatJumlah(null)).toBeNull();
    expect(formatJumlah("")).toBeNull();
    expect(formatJumlah("abc")).toBeNull();
  });
});

describe("progresDivisi", () => {
  const divisi = [
    { id: "a", nama: "Registrasi", sisi: "ikhwan" },
    { id: "b", nama: "Konsumsi", sisi: "ikhwan" },
    { id: "c", nama: "LO", sisi: "akhwat" },
  ];
  const tugas = [
    { divisiId: "a", status: "selesai" },
    { divisiId: "a", status: "berjalan" },
    { divisiId: "b", status: "disetujui" },
    { divisiId: "b", status: "selesai" },
    { divisiId: null, status: "berjalan" }, // lintas divisi — tidak dihitung ke divisi mana pun
  ];
  it("counts selesai+disetujui over total, lowest first, empty divisi last", () => {
    expect(progresDivisi(divisi, tugas)).toEqual([
      { divisiId: "a", nama: "Registrasi", sisi: "ikhwan", selesai: 1, total: 2, persen: 50 },
      { divisiId: "b", nama: "Konsumsi", sisi: "ikhwan", selesai: 2, total: 2, persen: 100 },
      { divisiId: "c", nama: "LO", sisi: "akhwat", selesai: 0, total: 0, persen: null },
    ]);
  });
});

describe("susunPapanTugas", () => {
  const today = "2026-09-14";
  const t = (id: string, tenggat: string | null, status: string) => ({ id, tenggat, status, judul: id });
  it("puts late tasks first, then open by tenggat (null last), then done", () => {
    const rows = [
      t("done", "2026-09-01", "selesai"),
      t("open-late-deadline", "2026-09-30", "berjalan"),
      t("open-no-deadline", null, "belum_mulai"),
      t("late-2", "2026-09-12", "berjalan"),
      t("open-soon", "2026-09-15", "belum_mulai"),
      t("late-1", "2026-09-10", "ditahan"),
    ];
    const out = susunPapanTugas(rows, today);
    expect(out.map((x) => x.id)).toEqual([
      "late-1", "late-2", "open-soon", "open-late-deadline", "open-no-deadline", "done",
    ]);
    expect(out[0].terlambat).toBe(true);
    expect(out[2].terlambat).toBe(false);
    expect(out[5].beres).toBe(true);
  });
});

describe("ringkasRab", () => {
  const b = (sumber: string, statusApproval: string, jumlah: string, harga: string) => ({
    sumber, statusApproval, jumlah, hargaSatuan: harga,
  });
  it("sums only sumber=beli, split by approval", () => {
    const rows = [
      b("beli", "diajukan", "2", "10000"),
      b("beli", "disetujui", "1", "50000"),
      b("beli", "ditolak", "3", "1000"),
      b("pinjam", "disetujui", "10", "99999"), // bukan RAB
      b("beli", "disetujui", null as unknown as string, "5000"), // tanpa jumlah → dihitung, bukan diam-diam 0
    ];
    expect(ringkasRab(rows)).toEqual({ diajukan: 20000, disetujui: 50000, ditolak: 3000, tanpaHarga: 1, lain: 0 });
  });
  it("counts beli rows with an unknown approval status instead of dropping them", () => {
    const rows = [
      b("beli", "diajukan", "1", "1000"),
      b("beli", "menunggu", "1", "1000"), // status di luar kosakata
      b("pinjam", "menunggu", "1", "1000"), // bukan beli → tidak dihitung ke mana pun
    ];
    expect(ringkasRab(rows)).toEqual({ diajukan: 1000, disetujui: 0, ditolak: 0, tanpaHarga: 0, lain: 1 });
  });
});

// Uji #3 spec + keputusan 11 Sep: tulis hanya ke divisi sendiri; baca ke divisi
// mana pun di acara yang sama; divisi acara lain tidak sama sekali.
describe("hakAksesDivisi", () => {
  const payload = { did: "A", slug: "kajian-lipia-3", v: 1 };
  const divisiA = { id: "A", acaraId: "ACARA-1" };
  it("tulis on its own divisi", () => {
    expect(hakAksesDivisi(payload, divisiA, { id: "A", acaraId: "ACARA-1" })).toBe("tulis");
  });
  it("baca on any divisi of the same acara", () => {
    expect(hakAksesDivisi(payload, divisiA, { id: "B", acaraId: "ACARA-1" })).toBe("baca");
    expect(hakAksesDivisi(payload, divisiA, { id: "C", acaraId: "ACARA-1" })).toBe("baca");
  });
  it("null on a divisi of another acara", () => {
    expect(hakAksesDivisi(payload, divisiA, { id: "Z", acaraId: "ACARA-2" })).toBeNull();
  });
  it("null when the loaded divisi is not the token's divisi (defensive)", () => {
    expect(hakAksesDivisi(payload, { id: "Q", acaraId: "ACARA-1" }, { id: "A", acaraId: "ACARA-1" })).toBeNull();
  });
});

describe("terlambatPerDivisi", () => {
  const divisi = [
    { id: "a", nama: "Registrasi", sisi: "ikhwan" },
    { id: "b", nama: "Konsumsi", sisi: "ikhwan" },
  ];
  const today = "2026-09-14";
  it("counts late tasks per divisi, most late first, zero omitted", () => {
    const tugas = [
      { divisiId: "a", tenggat: "2026-09-01", status: "berjalan" },
      { divisiId: "b", tenggat: "2026-09-01", status: "berjalan" },
      { divisiId: "b", tenggat: "2026-09-02", status: "belum_mulai" },
      { divisiId: "b", tenggat: "2026-09-02", status: "selesai" },
      { divisiId: null, tenggat: "2026-09-02", status: "berjalan" },
    ];
    expect(terlambatPerDivisi(divisi, tugas, today)).toEqual([
      { divisiId: "b", nama: "Konsumsi", sisi: "ikhwan", jumlah: 2 },
      { divisiId: "a", nama: "Registrasi", sisi: "ikhwan", jumlah: 1 },
    ]);
  });
  it("is empty when nothing is late", () => {
    expect(terlambatPerDivisi(divisi, [{ divisiId: "a", tenggat: "2026-12-01", status: "berjalan" }], today)).toEqual([]);
  });
});

describe("barangBelumKembali", () => {
  it("keeps only harus_kembali rows not yet returned", () => {
    const rows = [
      { id: "1", kriteria: "harus_kembali", sudahKembali: false },
      { id: "2", kriteria: "harus_kembali", sudahKembali: true },
      { id: "3", kriteria: "boleh_habis", sudahKembali: false },
      { id: "4", kriteria: null, sudahKembali: false },
    ];
    expect(barangBelumKembali(rows).map((r) => r.id)).toEqual(["1"]);
  });
});

describe("saringTugas", () => {
  const today = "2026-09-14";
  const rows = [
    { id: "1", divisiId: "a", fase: 1, status: "berjalan", tenggat: "2026-09-01" },
    { id: "2", divisiId: "a", fase: 2, status: "selesai", tenggat: "2026-09-01" },
    { id: "3", divisiId: "b", fase: 1, status: "berjalan", tenggat: null },
    { id: "4", divisiId: null, fase: 1, status: "ditahan", tenggat: "2026-09-20" },
  ];
  const ids = (x: { id: string }[]) => x.map((r) => r.id);
  it("no filter returns everything", () => expect(ids(saringTugas(rows, {}, today))).toEqual(["1", "2", "3", "4"]));
  it("filters by divisi, fase, status", () => {
    expect(ids(saringTugas(rows, { divisiId: "a" }, today))).toEqual(["1", "2"]);
    expect(ids(saringTugas(rows, { fase: 2 }, today))).toEqual(["2"]);
    expect(ids(saringTugas(rows, { status: "berjalan" }, today))).toEqual(["1", "3"]);
  });
  it("divisiId 'lintas' selects cross-division tasks", () => expect(ids(saringTugas(rows, { divisiId: "lintas" }, today))).toEqual(["4"]));
  it("terlambat only", () => expect(ids(saringTugas(rows, { terlambat: true }, today))).toEqual(["1"]));
});

// Uji #10 spec: RAB dikelompokkan per peruntukan dulu, baru per divisi pengaju.
describe("kelompokRab", () => {
  const divisi = [{ id: "lo", nama: "LO", sisi: "ikhwan" }, { id: "reg", nama: "Registrasi", sisi: "ikhwan" }];
  const b = (id: string, divisiId: string, peruntukan: string, sumber: string, jumlah: string, harga: string, statusApproval = "diajukan") => ({
    id, divisiId, peruntukan, sumber, jumlah, hargaSatuan: harga, statusApproval, nama: id,
  });
  it("groups beli rows by peruntukan first, then by divisi; ustadz_keluarga never lands in the requesting divisi group", () => {
    const rows = [
      b("ht", "lo", "divisi", "beli", "2", "100000"),
      b("bantal", "lo", "ustadz_keluarga", "beli", "4", "50000"),
      b("spanduk", "reg", "divisi", "beli", "1", "300000"),
      b("meja", "reg", "divisi", "pinjam", "3", "0"), // bukan RAB
    ];
    const out = kelompokRab(rows, divisi);
    expect(out.kelompok.map((k) => [k.label, k.rows.map((r) => r.id), k.subtotal])).toEqual([
      ["LO (ikhwan)", ["ht"], 200000],
      ["Registrasi (ikhwan)", ["spanduk"], 300000],
      ["Untuk ustadz & keluarga", ["bantal"], 200000],
    ]);
    expect(out.total).toBe(700000);
  });
  it("filters by approval when asked", () => {
    const rows = [b("a", "lo", "divisi", "beli", "1", "10", "disetujui"), b("c", "lo", "divisi", "beli", "1", "20", "ditolak")];
    expect(kelompokRab(rows, divisi, "disetujui").total).toBe(10);
  });
});
