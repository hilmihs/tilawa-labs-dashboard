/**
 * Diuji dengan masukan yang ditulis tangan: tidak ada fixture untuk entitas
 * mentah Maahir di repo ini (`lib/maahir/__fixtures__/` hanya menyimpan amplop
 * rekap). Bentuk objeknya mengikuti tipe di `lib/maahir/entities.ts` —
 * `MaahirPeserta`, `MaahirAnggota`, `MaahirKelas`, `MaahirOrang`,
 * `MaahirProgramKelas` — dan angka-angka yang ditiru di sini dibaca dari cermin
 * hidup pada 8 Sep 2026: peserta 82, anggota 227 (147 di antaranya tanpa
 * `peserta_id`, 117 nama berbeda), program-kelas 22, kelas 10, musyrif 12,
 * `mulai_tanggal` null pada 201 dari 227 baris.
 *
 * Yang dijaga: daftar ini GABUNGAN dua sisi (tidak ada yang boleh hilang),
 * identitas tidak dikarang dari nama, dan "tidak tahu" tidak pernah dirender
 * sebagai 0 atau sebagai "tidak".
 */
import { describe, expect, it } from "vitest";
import type { MaahirAnggota, MaahirPeserta } from "@/lib/maahir/entities";
import {
  buildMaahirRosterView,
  filterRoster,
  labelGender,
  MAAHIR_ROSTER_FILTER_AWAL,
  tanggalPendek,
  type MaahirRosterSumberData,
} from "./maahir-view-model";

function peserta(over: Partial<MaahirPeserta> & { id: string; name: string }): MaahirPeserta {
  return {
    gender: "ikhwan",
    kelas_id: "k-alif",
    active: true,
    created_at: "2026-05-22T16:29:24.484Z",
    ...over,
  };
}

function anggota(over: Partial<MaahirAnggota> & { id: string; name: string }): MaahirAnggota {
  return {
    program_kelas_id: "pk-takhassus",
    peserta_id: null,
    is_ketua: false,
    is_wakil: false,
    mulai_tanggal: null,
    created_at: "2026-08-07T09:45:10.198Z",
    ...over,
  };
}

const KELAS = [
  { id: "k-alif", name: "Alif", musyrif_id: "m-1" },
  { id: "k-ba", name: "Ba", musyrif_id: "m-hilang" },
];
const MUSYRIF = [{ id: "m-1", name: "Adiba Aziz Safitri" }];
const PROGRAM_KELAS = [
  { id: "pk-takhassus", name: "Maahir Takhassus Ikhwan" },
  { id: "pk-tibyan", name: "Kajian At-Tibyan" },
];

/**
 * Cermin kecil yang memuat setiap kasus yang dijaga berkas ini:
 * - Budi: peserta dengan dua enrolmen, salah satunya sebagai ketua.
 * - Citra: peserta akhwat nonaktif, tanpa satu pun enrolmen.
 * - Dedi: peserta yang kelasnya menunjuk musyrif yang tidak ada di cermin.
 * - dua baris `anggota` tanpa `peserta_id` bernama SAMA (Eko), di dua kelas.
 * - satu baris `anggota` yang menunjuk program-kelas yang tidak ada di cermin.
 */
const SUMBER: MaahirRosterSumberData = {
  peserta: [
    peserta({ id: "p-budi", name: "Budi Santoso" }),
    peserta({
      id: "p-citra",
      name: "Citra Ayu",
      gender: "akhwat",
      active: false,
      kelas_id: "k-alif",
    }),
    peserta({ id: "p-dedi", name: "Dedi Kurnia", kelas_id: "k-ba" }),
  ],
  anggota: [
    anggota({
      id: "a-1",
      name: "Budi Santoso",
      peserta_id: "p-budi",
      is_ketua: true,
      mulai_tanggal: "2026-08-07",
    }),
    anggota({
      id: "a-2",
      name: "Budi Santoso",
      peserta_id: "p-budi",
      program_kelas_id: "pk-tibyan",
      mulai_tanggal: "2026-06-01",
    }),
    anggota({ id: "a-3", name: "Eko Prasetyo" }),
    anggota({ id: "a-4", name: "Eko Prasetyo", program_kelas_id: "pk-tibyan", is_wakil: true }),
    anggota({ id: "a-5", name: "Fajar Nugroho", program_kelas_id: "pk-hantu" }),
  ],
  kelas: KELAS,
  musyrif: MUSYRIF,
  programKelas: PROGRAM_KELAS,
};

const view = buildMaahirRosterView(SUMBER);

describe("gabungan roster", () => {
  it("memuat kedua sisi: peserta dan anggota yang tidak menunjuk siapa pun", () => {
    // 3 peserta + 3 baris anggota tanpa peserta_id = 6 baris. Yang punya
    // peserta_id melebur ke barisnya, tidak dihitung dua kali.
    expect(view.baris).toHaveLength(6);
    expect(view.ringkas.peserta).toBe(3);
    expect(view.ringkas.anggotaLepas).toBe(3);
  });

  it("tidak membuang satu baris anggota pun", () => {
    expect(view.ringkas.keanggotaan).toBe(SUMBER.anggota.length);
  });

  it("menandai sisi asal tiap baris", () => {
    const eko = view.baris.filter((r) => r.nama === "Eko Prasetyo");
    expect(eko.map((r) => r.sumber)).toEqual(["anggota", "anggota"]);
    expect(view.baris.find((r) => r.nama === "Budi Santoso")?.sumber).toBe("peserta");
  });

  it("tidak mengarang identitas: dua enrolmen bernama sama tetap dua baris", () => {
    // Nama bukan kunci, jadi cacah baris ≠ cacah orang. Yang dilaporkan sebagai
    // 'nama berbeda' memang cacah NAMA, dan angkanya lebih kecil dari barisnya.
    expect(view.baris.filter((r) => r.nama === "Eko Prasetyo")).toHaveLength(2);
    expect(view.ringkas.namaLepas).toBe(2);
    expect(view.ringkas.namaLepas).toBeLessThan(view.ringkas.anggotaLepas);
  });

  it("mengumpulkan enrolmen ber-peserta_id ke satu baris orang", () => {
    const budi = view.baris.find((r) => r.key === "p-budi");
    expect(budi?.keanggotaan.map((k) => k.programKelasNama)).toEqual([
      "Kajian At-Tibyan",
      "Maahir Takhassus Ikhwan",
    ]);
  });

  it("mengurutkan menurut nama, sisi peserta lebih dulu bila namanya sama", () => {
    expect(view.baris.map((r) => r.nama)).toEqual([
      "Budi Santoso",
      "Citra Ayu",
      "Dedi Kurnia",
      "Eko Prasetyo",
      "Eko Prasetyo",
      "Fajar Nugroho",
    ]);
  });
});

describe("penamaan lewat entitas rujukan", () => {
  it("menamai kelas dan musyrif dari cermin", () => {
    const budi = view.baris.find((r) => r.key === "p-budi");
    expect(budi?.kelasNama).toBe("Alif");
    expect(budi?.musyrifNama).toBe("Adiba Aziz Safitri");
  });

  it("musyrif yang tidak ada di cermin jadi null, barisnya tetap tampil", () => {
    const dedi = view.baris.find((r) => r.key === "p-dedi");
    expect(dedi?.kelasNama).toBe("Ba");
    expect(dedi?.musyrifNama).toBeNull();
  });

  it("program-kelas yang tidak ada di cermin jadi null, enrolmennya tidak dibuang", () => {
    const fajar = view.baris.find((r) => r.key === "a-5");
    expect(fajar?.keanggotaan).toHaveLength(1);
    expect(fajar?.keanggotaan[0].programKelasNama).toBeNull();
    expect(fajar?.keanggotaan[0].programKelasId).toBe("pk-hantu");
  });

  it("baris sisi anggota tidak mengarang kelas maupun gender", () => {
    const eko = view.baris.find((r) => r.key === "a-3");
    expect(eko?.kelasNama).toBeNull();
    expect(eko?.musyrifNama).toBeNull();
    expect(eko?.gender).toBeNull();
  });
});

describe("kosong bukan nol, dan bukan 'tidak'", () => {
  it("status aktif sisi anggota null — bukan false", () => {
    expect(view.baris.find((r) => r.key === "a-3")?.aktif).toBeNull();
    expect(view.baris.find((r) => r.key === "p-citra")?.aktif).toBe(false);
    expect(view.baris.find((r) => r.key === "p-budi")?.aktif).toBe(true);
  });

  it("tanpa mulai_tanggal terisi → null, bukan string kosong", () => {
    expect(view.baris.find((r) => r.key === "a-3")?.mulaiTanggal).toBeNull();
  });

  it("mengambil mulai_tanggal terisi paling awal di antara enrolmen", () => {
    expect(view.baris.find((r) => r.key === "p-budi")?.mulaiTanggal).toBe("2026-06-01");
  });

  it("peserta tanpa enrolmen tetap tampil, dan dicacah terpisah", () => {
    const citra = view.baris.find((r) => r.key === "p-citra");
    expect(citra?.keanggotaan).toEqual([]);
    expect(citra?.mulaiTanggal).toBeNull();
    // Citra dan Dedi: keduanya ada di roster, keduanya tanpa satu pun enrolmen.
    expect(view.ringkas.pesertaTanpaKelasProgram).toBe(2);
  });
});

describe("peran", () => {
  it("ketua menang atas wakil, tanpa keduanya berarti null", () => {
    expect(view.baris.find((r) => r.key === "p-budi")?.peran).toBe("ketua");
    expect(view.baris.find((r) => r.key === "a-4")?.peran).toBe("wakil");
    expect(view.baris.find((r) => r.key === "a-3")?.peran).toBeNull();
  });
});

describe("opsi saringan", () => {
  it("hanya menawarkan program-kelas yang benar-benar dipakai baris", () => {
    // pk-hantu ikut karena ada barisnya; namanya jatuh ke id, tidak dikarang.
    expect(view.programKelasOpsi).toEqual([
      { id: "pk-tibyan", nama: "Kajian At-Tibyan" },
      { id: "pk-takhassus", nama: "Maahir Takhassus Ikhwan" },
      { id: "pk-hantu", nama: "pk-hantu" },
    ]);
  });

  it("gender hanya dari nilai yang muncul", () => {
    expect(view.genderOpsi).toEqual(["akhwat", "ikhwan"]);
  });
});

describe("saringan", () => {
  it("tanpa saringan = semua baris", () => {
    expect(filterRoster(view.baris, MAAHIR_ROSTER_FILTER_AWAL)).toHaveLength(view.baris.length);
  });

  it("menyaring per kelas-program lewat enrolmennya", () => {
    const rows = filterRoster(view.baris, {
      ...MAAHIR_ROSTER_FILTER_AWAL,
      programKelas: "pk-tibyan",
    });
    expect(rows.map((r) => r.key)).toEqual(["p-budi", "a-4"]);
  });

  it("menyaring gender", () => {
    const rows = filterRoster(view.baris, { ...MAAHIR_ROSTER_FILTER_AWAL, gender: "akhwat" });
    expect(rows.map((r) => r.key)).toEqual(["p-citra"]);
  });

  it("saringan aktif/nonaktif tidak menelan baris yang statusnya tidak diketahui", () => {
    const aktif = filterRoster(view.baris, { ...MAAHIR_ROSTER_FILTER_AWAL, status: "aktif" });
    const nonaktif = filterRoster(view.baris, { ...MAAHIR_ROSTER_FILTER_AWAL, status: "nonaktif" });
    expect(aktif.map((r) => r.key)).toEqual(["p-budi", "p-dedi"]);
    expect(nonaktif.map((r) => r.key)).toEqual(["p-citra"]);
    // Tiga baris sisi anggota tidak masuk ke salah satu pun: "tidak tahu"
    // bukan "tidak". Kalau mereka bocor ke `nonaktif`, layar akan menuduh.
    expect(aktif.length + nonaktif.length).toBe(view.baris.length - 3);
  });

  it("saringan bisa ditumpuk", () => {
    const rows = filterRoster(view.baris, {
      programKelas: "pk-takhassus",
      gender: "ikhwan",
      status: "aktif",
    });
    expect(rows.map((r) => r.key)).toEqual(["p-budi"]);
  });
});

describe("format", () => {
  it("tanggal diformat tanpa lewat Date (tidak mundur sehari)", () => {
    expect(tanggalPendek("2026-08-07")).toBe("7 Agu 2026");
    expect(tanggalPendek("2026-01-31")).toBe("31 Jan 2026");
  });

  it("tanggal kosong jadi em dash, tidak pernah 0 atau '-'", () => {
    expect(tanggalPendek(null)).toBe("—");
  });

  it("tanggal yang tidak berbentuk tanggal tampil apa adanya", () => {
    expect(tanggalPendek("bukan-tanggal")).toBe("bukan-tanggal");
    expect(tanggalPendek("2026-13-01")).toBe("2026-13-01");
  });

  it("gender dikapitalkan, nilai yang belum dikenal tetap lolos apa adanya", () => {
    expect(labelGender("ikhwan")).toBe("Ikhwan");
    expect(labelGender("akhwat")).toBe("Akhwat");
    expect(labelGender("campuran")).toBe("Campuran");
    expect(labelGender(null)).toBeNull();
  });
});

describe("tidak ada angka turunan", () => {
  it("ringkasan hanya berisi cacah baris, tidak ada persen atau rata-rata", () => {
    // Dijaga secara struktural: begitu ada kunci baru bernama persen/rata-rata/
    // skor/peringkat di ringkasan, uji ini gagal dan §9 kembali dibaca.
    expect(Object.keys(view.ringkas).sort()).toEqual([
      "anggotaLepas",
      "keanggotaan",
      "kelas",
      "namaLepas",
      "peserta",
      "pesertaTanpaKelasProgram",
      "programKelas",
    ]);
    for (const v of Object.values(view.ringkas)) expect(Number.isInteger(v)).toBe(true);
  });
});
