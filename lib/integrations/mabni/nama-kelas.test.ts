import { describe, expect, it } from "vitest";
import { namaKelasBaru, type KelasUntukNama } from "./nama-kelas";

const k = (v: Partial<KelasUntukNama> & { id: number }): KelasUntukNama => ({
  nama: `lama-${v.id}`,
  gender: "ikhwan",
  jenis_pertemuan: "usbui",
  hari: [2, 5],
  jenjang: { nama: "M1" },
  ...v,
});

describe("namaKelasBaru", () => {
  it("membuang hari dan nama pengajar, memakai nomor urut per kelompok", () => {
    const out = namaKelasBaru([
      k({ id: 1, nama: "(M1) Ikhwan - Senin & Kamis - Sidqi", hari: [1, 4] }),
      k({ id: 2, nama: "(M1) Ikhwan - Selasa & Jumat - Adit", hari: [2, 5] }),
    ]);
    expect(out.map((o) => o.namaBaru)).toEqual(["M1 - Usbu'i 1 (ikh)", "M1 - Usbu'i 2 (ikh)"]);
  });

  it("menomori terpisah per level, per jenis, per gender", () => {
    const out = namaKelasBaru([
      k({ id: 1, jenjang: { nama: "M1" }, jenis_pertemuan: "usbui", gender: "ikhwan" }),
      k({ id: 2, jenjang: { nama: "M1" }, jenis_pertemuan: "yaumi", gender: "ikhwan" }),
      k({ id: 3, jenjang: { nama: "M1" }, jenis_pertemuan: "usbui", gender: "akhwat" }),
      k({ id: 4, jenjang: { nama: "M2" }, jenis_pertemuan: "usbui", gender: "ikhwan" }),
    ]);
    expect(out.map((o) => o.namaBaru)).toEqual([
      "M1 - Usbu'i 1 (ikh)",
      "M1 - Yaumi 1 (ikh)",
      "M1 - Usbu'i 1 (akh)",
      "M2 - Usbu'i 1 (ikh)",
    ]);
  });

  it("urut menurut hari lebih dulu, lalu nama lama — jadi nomornya tidak berubah antar jalan", () => {
    const a = namaKelasBaru([
      k({ id: 1, nama: "Zulu", hari: [2, 5] }),
      k({ id: 2, nama: "Alfa", hari: [1, 4] }),
    ]);
    const b = namaKelasBaru([
      k({ id: 2, nama: "Alfa", hari: [1, 4] }),
      k({ id: 1, nama: "Zulu", hari: [2, 5] }),
    ]);
    expect(a.find((o) => o.id === 2)?.namaBaru).toBe("M1 - Usbu'i 1 (ikh)");
    expect(b.find((o) => o.id === 2)?.namaBaru).toBe("M1 - Usbu'i 1 (ikh)");
  });

  it("satu kelas sendirian tetap diberi nomor 1", () => {
    const out = namaKelasBaru([k({ id: 1 })]);
    expect(out[0].namaBaru).toBe("M1 - Usbu'i 1 (ikh)");
  });

  it("kelas yang datanya kurang TIDAK diberi nama baru, tapi dilaporkan alasannya", () => {
    const out = namaKelasBaru([
      k({ id: 1, jenjang: null }),
      k({ id: 2, jenis_pertemuan: null }),
      k({ id: 3, gender: null }),
    ]);
    expect(out.map((o) => o.namaBaru)).toEqual([null, null, null]);
    expect(out.map((o) => o.alasan)).toEqual(["jenjang kosong", "jenis pertemuan kosong", "gender kosong"]);
  });

  it("nama yang sudah sesuai bentuk baru ditandai tidak berubah", () => {
    const out = namaKelasBaru([k({ id: 1, nama: "M1 - Usbu'i 1 (ikh)" })]);
    expect(out[0].namaBaru).toBe("M1 - Usbu'i 1 (ikh)");
    expect(out[0].berubah).toBe(false);
  });

  it("gender dipendekkan jadi ikh / akh", () => {
    const out = namaKelasBaru([k({ id: 1, gender: "akhwat" })]);
    expect(out[0].namaBaru).toBe("M1 - Usbu'i 1 (akh)");
  });

  it("hari kosong tidak menggagalkan penamaan, hanya mempengaruhi urutan", () => {
    const out = namaKelasBaru([k({ id: 1, hari: null }), k({ id: 2, hari: [1, 4] })]);
    expect(out.every((o) => o.namaBaru != null)).toBe(true);
  });
});
