import { describe, expect, it } from "vitest";
import { bacaBarisForm, ringkasRencana, siapkanImporForm, tebakKonfirmasi } from "./impor";
import { normalizePhone } from "@/lib/wa";

const H = { nama: "Nama Lengkap", g: "Jenis Kelamin", p: "Mengajar dalam program", k: "Konfirmasi kehadiran Pengajar", a: "Alasan tidak bisa hadir" };
const row = (nama: string, g = "Laki-laki", k = "InsyaAllah, bisa", p = "Pengajar HITS", a = "") => ({ Timestamp: "x", [H.nama]: nama, [H.g]: g, [H.p]: p, [H.k]: k, [H.a]: a });

describe("bacaBarisForm", () => {
  it("membaca kolom form 3 Sep dan melaporkan baris rusak", () => {
    const { baris, kolomHilang } = bacaBarisForm([row("Rahmat Hidayat "), row("", "Perempuan"), row("Aida", "?")]);
    expect(kolomHilang).toEqual([]);
    expect(baris[0].baris).toMatchObject({ nama: "Rahmat Hidayat", gender: "L", programTeks: "Pengajar HITS", konfirmasi: "bisa" });
    expect(baris[1]).toMatchObject({ no: 3, baris: null });
    expect(baris[2].alasanTolak).toContain("jenis kelamin");
  });
  it("konfirmasi", () => {
    expect(tebakKonfirmasi("InsyaAllah, bisa")).toBe("bisa");
    expect(tebakKonfirmasi("Belum bisa")).toBe("belum_bisa");
    expect(tebakKonfirmasi("")).toBeNull();
  });
});

describe("siapkanImporForm", () => {
  const ctx = {
    byWa: new Map([["6281111111111", "o-wa"]]),
    byNamaKunci: new Map<string, string[]>([["nadia anisa hidayat", ["o-nama"]], ["amina kamila permata", ["o-1", "o-2"]]]),
    teleponByNamaKunci: new Map([["idris latif baswedan", "6281111111111"], ["hafsah haura cahyani", "6282222222222"]]),
    normalisasiWa: normalizePhone,
  };
  it("wa → nama tunggal → ragu → baru; HP dari guru_sync melengkapi baris baru", () => {
    const { baris } = bacaBarisForm([
      row("Idris Latif Baswedan", "Perempuan"), // HP dari guru_sync cocok ke o-wa
      row("nadia  anisa hidayat"), // kapital dan spasi beda, cocok nama
      row("Amina Kamila Permata", "Perempuan"), // dua kandidat → ragu
      row("Hafsah Haura Cahyani", "Perempuan"), // baru, dapat HP
      row("Orang Baru Sekali", "Perempuan", "Belum bisa", "Pengajar MLP", "sakit"),
    ]);
    const r = siapkanImporForm(baris, ctx);
    expect(r.map((x) => [x.status, x.orangId, x.input.wa])).toEqual([
      ["cocok_wa", "o-wa", "6281111111111"],
      ["cocok_nama", "o-nama", null],
      ["ragu", null, null],
      ["baru", null, "6282222222222"],
      ["baru", null, null],
    ]);
    expect(r[4].input).toMatchObject({ konfirmasi: "belum_bisa", alasan: "sakit", programTeks: "Pengajar MLP" });
    expect(ringkasRencana(r)).toEqual({ cocok_wa: 1, cocok_nama: 1, baru: 2, ragu: 1, berHp: 2 });
  });
  it("nama dobel dalam satu file = satu orang, jawaban terakhir menang", () => {
    const { baris } = bacaBarisForm([row("Hamzah Anisa Maulana", "Perempuan", "InsyaAllah, bisa"), row("hamzah anisa maulana ", "Perempuan", "Belum bisa", "Pengajar HITS", "izin")]);
    const r = siapkanImporForm(baris, { ...ctx, byWa: new Map(), byNamaKunci: new Map(), teleponByNamaKunci: new Map() });
    expect(r).toHaveLength(1);
    expect(r[0].dariBaris).toEqual([2, 3]);
    expect(r[0].input.konfirmasi).toBe("belum_bisa");
    expect(r[0].input.nama).toBe("Hamzah Anisa Maulana");
  });
});
