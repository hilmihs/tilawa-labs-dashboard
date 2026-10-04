import { describe, expect, it } from "vitest";
import { namaKunci } from "@/lib/hadir/nama";
import { anggotaUntuk, belumTerdaftar, pilihOrang, samarUid, uidSah, urutanBaru, type Calon } from "./anggota-view";

const o = (id: string, nama: string, gender = "L"): Calon => ({ id, nama, namaKunci: namaKunci(nama), gender, wa: null });

const ORANG = [
  o("hilmi", "Ilham Kamila Anggraini"),
  o("muhsin", "Abdul Muhsin Bachtar"),
  o("syukri", "Amina Fitri Wijaya"),
  o("syukri2", "Amina Fitri Wijaya Maulana"),
  o("izz", "Izzuddin Fathurrohman"),
  o("salma", "Salma", "P"),
  o("salmak", "Salma Wijaya", "P"),
  o("rsalma", "Salma Hakim", "P"),
  o("hanifah", "Nur Hanifah Rasmani", "P"),
  o("wildan", "Zahra Rahma Utami"),
  o("wildan2", "Zahra Rahma Utami Hakim"),
  o("hanif-p", "Ilham Kamila", "P"),
];

describe("pilihOrang", () => {
  it("nama pendek ≥ 2 kata → satu-satunya kandidat awalan", () => {
    expect(pilihOrang("Ilham Kamila", "L", ORANG)).toMatchObject({ jenis: "pakai", orang: { id: "hilmi" } });
    expect(pilihOrang("Abdul Muhsin", "L", ORANG)).toMatchObject({ jenis: "pakai", orang: { id: "muhsin" } });
  });

  it("nama persis menang atas kandidat awalan lain", () => {
    expect(pilihOrang("Amina Fitri Wijaya", "L", ORANG)).toMatchObject({ jenis: "pakai", orang: { id: "syukri" } });
    expect(pilihOrang("Zahra Rahma Utami", "L", ORANG)).toMatchObject({ jenis: "pakai", orang: { id: "wildan" } });
  });

  it("gender lain tidak dihitung", () => {
    expect(pilihOrang("Nur Hanifah", "L", ORANG)).toEqual({ jenis: "baru" });
    expect(pilihOrang("Nur Hanifah", "P", ORANG)).toMatchObject({ jenis: "pakai", orang: { id: "hanifah" } });
  });

  it("nama satu kata tidak pernah ditebak, sekalipun ada yang persis", () => {
    const s = pilihOrang("Salma", "P", ORANG);
    expect(s.jenis).toBe("ambigu");
    if (s.jenis === "ambigu") expect(s.kandidat.map((k) => k.id)).toEqual(["salma", "rsalma", "salmak"]);
    const z = pilihOrang("Izzuddin", "L", ORANG);
    expect(z).toMatchObject({ jenis: "ambigu", kandidat: [{ id: "izz" }] });
  });

  it("dua kandidat awalan → ambigu; tak ada kandidat → baru", () => {
    expect(pilihOrang("Zahra", "L", ORANG).jenis).toBe("ambigu");
    expect(pilihOrang("Akmal Shiddiq", "L", ORANG)).toEqual({ jenis: "baru" });
    expect(pilihOrang("Zendraszka", "L", ORANG)).toEqual({ jenis: "baru" });
  });

  it("dua orang bernama persis sama → ambigu", () => {
    const r = pilihOrang("Amina Fitri Wijaya", "L", [...ORANG, o("syukri-b", "Amina Fitri Wijaya")]);
    expect(r).toMatchObject({ jenis: "ambigu", kandidat: [{ id: "syukri" }, { id: "syukri-b" }] });
  });
});

describe("anggotaUntuk / belumTerdaftar", () => {
  const anggota = [o("hilmi", "Ilham Kamila Anggraini"), o("salmak", "Salma Wijaya", "P")];

  it("nama kertas dikenali dari anggota yang sudah ada (termasuk pilihan tangan)", () => {
    expect(anggotaUntuk("Ilham Kamila", "L", anggota)?.id).toBe("hilmi");
    expect(anggotaUntuk("Salma", "P", anggota)?.id).toBe("salmak");
    expect(anggotaUntuk("Abdul Muhsin", "L", anggota)).toBeNull();
  });

  it("belumTerdaftar menyisakan nama yang belum punya anggota", () => {
    const awal = [
      { nama: "Ilham Kamila", gender: "L" },
      { nama: "Abdul Muhsin", gender: "L" },
      { nama: "Salma", gender: "P" },
    ];
    expect(belumTerdaftar(awal, anggota).map((p) => p.nama)).toEqual(["Abdul Muhsin"]);
    expect(belumTerdaftar(awal, [])).toHaveLength(3);
  });
});

describe("urutanBaru", () => {
  const k = [
    { id: "a", urutan: 0 },
    { id: "b", urutan: 1 },
    { id: "c", urutan: 2 },
  ];

  it("menukar dengan tetangga dan hanya mengembalikan yang berubah", () => {
    expect(urutanBaru(k, "b", "naik")).toEqual([
      { id: "b", urutan: 0 },
      { id: "a", urutan: 1 },
    ]);
    expect(urutanBaru(k, "b", "turun")).toEqual([
      { id: "c", urutan: 1 },
      { id: "b", urutan: 2 },
    ]);
  });

  it("ujung daftar dan id tak dikenal → tanpa perubahan", () => {
    expect(urutanBaru(k, "a", "naik")).toEqual([]);
    expect(urutanBaru(k, "c", "turun")).toEqual([]);
    expect(urutanBaru(k, "x", "naik")).toEqual([]);
  });

  it("urutan kembar/berjarak dinomori ulang", () => {
    const kembar = [
      { id: "a", urutan: 19 },
      { id: "b", urutan: 19 },
      { id: "c", urutan: 25 },
    ];
    expect(urutanBaru(kembar, "c", "naik")).toEqual([
      { id: "a", urutan: 0 },
      { id: "c", urutan: 1 },
      { id: "b", urutan: 2 },
    ]);
  });
});

describe("UID", () => {
  it("disamarkan untuk layar", () => {
    expect(samarUid("04A23F1B6C8091")).toBe("04A2…8091");
    expect(samarUid("A1B2C3D4")).toBe("A1B2C3D4");
    expect(samarUid(null)).toBe("");
  });

  it("panjang wajar", () => {
    expect(uidSah("04A23F1B")).toBe(true);
    expect(uidSah("04A23F1B6C8091")).toBe(true);
    expect(uidSah("0012345678")).toBe(true);
    expect(uidSah("04A2")).toBe(false);
    expect(uidSah("")).toBe(false);
  });
});
