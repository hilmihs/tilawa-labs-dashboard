import { describe, expect, it } from "vitest";
import { susunKlaster, type Keputusan, type Rekaman } from "./klaster";

const kosong: Keputusan = { gabung: [], pisah: [], kecuali: [] };
const rek = (ref: string, nama: string, over: Partial<Rekaman> = {}): Rekaman => ({
  ref,
  ruang: ref.split(":")[0] as Rekaman["ruang"],
  nama,
  email: null,
  hp: null,
  ...over,
});
const refsKlaster = (hasil: ReturnType<typeof susunKlaster>, ref: string) =>
  hasil.klaster.find((k) => k.some((r) => r.ref === ref))!.map((r) => r.ref).sort();

describe("susunKlaster", () => {
  it("email sama menggabungkan lintas ruang; email karangan diabaikan", () => {
    const h = susunKlaster(
      [
        rek("tilawah:93", "Luthfi Anisa Ramadhan", { email: "Afif@example.com" }),
        rek("mabni:29", "Muhammad Afif", { email: "afif@example.com" }),
        rek("tilawah:2816", "Aisyah", { email: "x@email.com" }),
        rek("tilawah:9", "Budi", { email: "x@email.com" }),
      ],
      kosong,
    );
    expect(refsKlaster(h, "mabni:29")).toEqual(["mabni:29", "tilawah:93"]);
    expect(h.metode.get("mabni:29")).toBe("email");
    expect(refsKlaster(h, "tilawah:9")).toEqual(["tilawah:9"]);
  });

  it("HP sama menggabungkan nama satu kata", () => {
    const h = susunKlaster([rek("tilawah:5", "Ruqayyah", { hp: "628111" }), rek("orang:a", "Ruqayyah", { hp: "628111" })], kosong);
    expect(h.klaster).toHaveLength(1);
  });

  it("nama persis digabung; nama satu kata hanya bila akunnya unik", () => {
    const h = susunKlaster(
      [
        rek("tilawah:75", "Amina Fitri Wijaya"),
        rek("maahir:musyrif:u1", "Amina  fitri wijaya"),
        rek("tilawah:30", "Ruqayyah", { hp: "6281" }),
        rek("orang:r", "Ruqayyah", { hp: "6281" }),
        rek("maahir:pengajar_hits:q", "Ruqayyah"),
        rek("tilawah:4763", "Salma"),
        rek("tilawah:4800", "Salma"),
        rek("maahir:syaikh:u2", "Salma"),
      ],
      kosong,
    );
    expect(refsKlaster(h, "tilawah:75")).toEqual(["maahir:musyrif:u1", "tilawah:75"]);
    expect(refsKlaster(h, "maahir:pengajar_hits:q")).toEqual(["maahir:pengajar_hits:q", "orang:r", "tilawah:30"]);
    expect(refsKlaster(h, "maahir:syaikh:u2")).toEqual(["maahir:syaikh:u2"]);
    expect(h.namaAmbigu.map((n) => n.namaKunci)).toEqual(["salma"]);
  });

  it("alias ikut dicocokkan", () => {
    const h = susunKlaster(
      [rek("tilawah:2128", "Amina Anisa Hidayat", { alias: ["Aisyah Shofia Safitri"] }), rek("maahir:syaikh:s", "Aisyah Shofia Safitri")],
      kosong,
    );
    expect(h.klaster).toHaveLength(1);
  });

  it("dua id tilawah bernama sama → ambigu, tidak digabung", () => {
    const h = susunKlaster([rek("tilawah:1", "Umar Latif Baswedan"), rek("tilawah:2", "Umar Latif Baswedan"), rek("orang:o", "Umar Latif Baswedan")], kosong);
    expect(h.klaster).toHaveLength(3);
    expect(h.namaAmbigu[0].namaKunci).toBe("umar latif baswedan");
  });

  it("peran Maahir bernama sama (uuid beda) tetap satu orang", () => {
    const h = susunKlaster([rek("maahir:koordinator:a", "Salma Anisa Maulana"), rek("maahir:musyrif:b", "Salma Anisa Maulana")], kosong);
    expect(h.klaster).toHaveLength(1);
  });

  it("putusan gabung, kecuali, dan pisah", () => {
    const keputusan: Keputusan = {
      gabung: [["Salma"], ["Radiatam Mardiyah", "Reda"]],
      pisah: [["Amina Zahira Handayani", "Amina Rahman Syahputra"]],
      kecuali: ["Koordinator KK Akhwat"],
    };
    const h = susunKlaster(
      [
        rek("tilawah:4763", "Salma"),
        rek("maahir:syaikh:u2", "Salma"),
        rek("tilawah:88", "Radiatam Mardiyah"),
        rek("maahir:koordinator:r", "Reda"),
        rek("maahir:koordinator-ketua-kelas:k", "Koordinator KK Akhwat"),
      ],
      keputusan,
    );
    expect(refsKlaster(h, "tilawah:4763")).toEqual(["maahir:syaikh:u2", "tilawah:4763"]);
    expect(h.metode.get("maahir:koordinator:r")).toBe("manual");
    expect(h.dikecualikan.map((r) => r.ref)).toEqual(["maahir:koordinator-ketua-kelas:k"]);
    expect(h.konflik).toEqual([]);
  });

  it("pisah melaporkan konflik bila keduanya tergabung", () => {
    const h = susunKlaster(
      [rek("tilawah:11", "Amina Zahira Handayani", { hp: "6281" }), rek("maahir:pengajar_hits:x", "Amina Rahman Syahputra", { hp: "6281" })],
      { gabung: [], pisah: [["Amina Zahira Handayani", "Amina Rahman Syahputra"]], kecuali: [] },
    );
    expect(h.konflik).toHaveLength(1);
  });
});
