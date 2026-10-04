/**
 * Masukan di berkas ini DITULIS TANGAN, bukan dari fixture: `lib/maahir/__fixtures__/`
 * hanya menyimpan tangkapan route `rekap/*`, sementara layar Inspeksi membaca
 * ENTITAS mentah (`penilaian-pedagogis`, `hits/pengajar`, `hits/kelompok-pengajar`,
 * `hits/halaqah`, `indikator-standar`, `hits/teguran`) yang tidak punya fixture.
 *
 * Bentuk tiap objek mengikuti tipe di `lib/maahir/entities.ts` dan dicocokkan ke
 * cermin hidup pada 7 Sep 2026:
 *   - `penilaian-pedagogis` 418 baris; `year_month` 2026-06 (104), 2026-07 (146),
 *     2026-08 (159), 2026-09 (9);
 *   - lima skor semuanya nullable — `skor_kepatuhan_sop` terisi 120/418,
 *     `skor_metode_pengajaran` 192/418, tiga sisanya ~82%;
 *   - `indikator-standar` untuk kelima kode di sini `standar = 4`, dengan
 *     `kepatuhan_sop` ber-`kategori = 'soft_skill'` sementara empat lainnya
 *     `pedagogis`;
 *   - `hits/pengajar` 183 baris, 5 di antaranya `matrix_exclude = true`.
 */
import { describe, expect, it } from "vitest";
import type {
  MaahirHitsHalaqah,
  MaahirHitsPengajar,
  MaahirIndikatorStandar,
  MaahirKelompokPengajar,
  MaahirPenilaianPedagogis,
  MaahirTeguran,
} from "@/lib/maahir/entities";
import {
  buildInspeksiView,
  bulanTersedia,
  formatSkor,
  KOLOM_PEDAGOGIS,
  labelBulan,
  resolveBulan,
  tanggalSingkat,
  type BuildInspeksiInput,
} from "./view-model";

const BULAN = "2026-08";

function pengajar(
  id: string,
  name: string,
  kelompok_id: string | null,
  extra: Partial<MaahirHitsPengajar> = {},
): MaahirHitsPengajar {
  return {
    id,
    name,
    gender: "ikhwan",
    kelompok_id,
    is_ketua: false,
    matrix_exclude: false,
    active: true,
    created_at: "2026-06-05T06:34:14.808Z",
    ...extra,
  };
}

function kelompok(id: string, name: string): MaahirKelompokPengajar {
  return { id, name, gender: "ikhwan", created_at: "2026-06-05T06:34:17.183Z" };
}

function halaqah(id: string, pengajar_id: string | null): MaahirHitsHalaqah {
  return {
    id,
    batch_id: "batch-1",
    name: `HITS ${id}`,
    gender: "ikhwan",
    pengajar_id,
    level: "qoidah_nuroniyyah",
    program: "dasar",
    start_date: "2026-08-01",
    jadwal_hari: ["senin"],
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function penilaian(
  pengajar_id: string,
  skor: Partial<MaahirPenilaianPedagogis> = {},
  year_month = BULAN,
): MaahirPenilaianPedagogis {
  return {
    id: `nilai-${pengajar_id}-${year_month}`,
    pengajar_id,
    year_month,
    skor_metode_pengajaran: null,
    skor_kepatuhan_silabus: null,
    skor_manajemen_halaqah: null,
    skor_evaluasi_penguasaan: null,
    skor_kepatuhan_sop: null,
    updated_at: "2026-08-31T06:18:13.161Z",
    ...skor,
  };
}

/** Rubrik apa adanya dari cermin: standar 4 untuk kelimanya, SOP di soft skill. */
const INDIKATOR: MaahirIndikatorStandar[] = [
  { kode: "kepatuhan_silabus", kategori: "pedagogis", nama: "Kepatuhan Silabus", standar: 4 },
  { kode: "manajemen_halaqah", kategori: "pedagogis", nama: "Manajemen Halaqah", standar: 4 },
  { kode: "evaluasi_penguasaan", kategori: "pedagogis", nama: "Evaluasi & Penguasaan", standar: 4 },
  { kode: "metode_pengajaran", kategori: "pedagogis", nama: "Metode Pengajaran Modul", standar: 4 },
  { kode: "kepatuhan_sop", kategori: "soft_skill", nama: "Kepatuhan SOP Teknis", standar: 4 },
  { kode: "hafalan", kategori: "hard_skill", nama: "Hafalan (Tahfidz)", standar: 1 },
];

/**
 * Satu program berisi lima pengajar:
 *   g1 kelompok A — dinilai penuh
 *   g2 kelompok A — dinilai, tapi SOP dan metode pengajaran kosong (kasus 42% sel null)
 *   g3 kelompok B — TIDAK punya baris penilaian bulan ini
 *   g4 kelompok B — `matrix_exclude`, tidak ditagih
 *   g5 tanpa kelompok — skor di bawah standar
 * g9 memegang halaqah tapi tidak ada di `hits/pengajar` (tanpa profil).
 */
function input(over: Partial<BuildInspeksiInput> = {}): BuildInspeksiInput {
  return {
    bulan: BULAN,
    pengajar: [
      pengajar("g1", "Adiba Abdul Anggraini", "kel-a"),
      pengajar("g2", "Bahrul Ulum", "kel-a", { is_ketua: true }),
      pengajar("g3", "Cecep Nurdin", "kel-b"),
      pengajar("g4", "Dede Saepudin", "kel-b", { matrix_exclude: true }),
      pengajar("g5", "Endang Kurnia", null, { active: false }),
      pengajar("g8", "Fulan Luar Batch", "kel-a"),
    ],
    kelompok: [kelompok("kel-a", "Kelompok 2 Ikhwan"), kelompok("kel-b", "Kelompok 10 Ikhwan")],
    halaqah: [
      halaqah("h1", "g1"),
      halaqah("h2", "g1"),
      halaqah("h3", "g2"),
      halaqah("h4", "g3"),
      halaqah("h5", "g4"),
      halaqah("h6", "g5"),
      halaqah("h7", "g9"),
      halaqah("h8", null),
    ],
    penilaian: [
      penilaian("g1", {
        skor_kepatuhan_silabus: 4,
        skor_manajemen_halaqah: 4,
        skor_evaluasi_penguasaan: 4,
        skor_metode_pengajaran: 4,
        skor_kepatuhan_sop: 4,
      }),
      penilaian("g2", {
        skor_kepatuhan_silabus: 4,
        skor_manajemen_halaqah: 4,
        skor_evaluasi_penguasaan: 4,
      }),
      penilaian("g4", { skor_kepatuhan_silabus: 4 }),
      penilaian("g5", {
        skor_kepatuhan_silabus: 3.5,
        skor_manajemen_halaqah: 4,
        skor_evaluasi_penguasaan: 4,
      }),
      // Bulan lain: tidak boleh bocor ke bulan yang dibuka.
      penilaian("g3", { skor_kepatuhan_silabus: 4 }, "2026-07"),
    ],
    indikator: INDIKATOR,
    teguran: null,
    ...over,
  };
}

const view = buildInspeksiView(input());

function cari(id: string) {
  const row = view.kelompok.flatMap((k) => k.rows).find((r) => r.pengajarId === id);
  if (!row) throw new Error(`baris ${id} tidak ada`);
  return row;
}

describe("penyaringan ke batch program", () => {
  it("hanya memuat pengajar yang mengampu halaqah batch ini", () => {
    const ids = view.kelompok.flatMap((k) => k.rows).map((r) => r.pengajarId);
    expect(ids.sort()).toEqual(["g1", "g2", "g3", "g4", "g5"]);
    // g8 ada di daftar pengajar HITS tapi tidak mengampu halaqah batch ini.
    expect(ids).not.toContain("g8");
  });

  it("menghitung halaqah batch ini per pengajar", () => {
    expect(cari("g1").halaqahDiBatch).toBe(2);
    expect(cari("g3").halaqahDiBatch).toBe(1);
  });

  it("melaporkan pengajar batch ini yang tidak punya profil, bukan menelannya", () => {
    // g9 memegang h7 tapi tidak ada barisnya di hits/pengajar.
    expect(view.ringkas.tanpaProfil).toBe(1);
  });
});

describe("pengelompokan per kelompok", () => {
  it("membuat satu grup per kelompok, plus grup untuk yang belum berkelompok", () => {
    expect(view.kelompok.map((k) => k.nama)).toEqual([
      "Kelompok 2 Ikhwan",
      "Kelompok 10 Ikhwan",
      "Belum masuk kelompok",
    ]);
  });

  it("mengurutkan kelompok secara natural, bukan leksikografis", () => {
    const urut = view.kelompok.map((k) => k.nama);
    expect(urut.indexOf("Kelompok 2 Ikhwan")).toBeLessThan(urut.indexOf("Kelompok 10 Ikhwan"));
  });

  it("menaruh anggota di kelompoknya masing-masing", () => {
    const a = view.kelompok.find((k) => k.id === "kel-a");
    expect(a?.rows.map((r) => r.pengajarId)).toEqual(["g1", "g2"]);
    const b = view.kelompok.find((k) => k.id === "kel-b");
    expect(b?.rows.map((r) => r.pengajarId)).toEqual(["g3", "g4"]);
  });

  it("memakai id kelompok yang tidak dikenal apa adanya, tidak melebur ke tanpa kelompok", () => {
    const lain = buildInspeksiView(
      input({
        pengajar: [pengajar("g1", "Adiba Abdul Anggraini", "kel-hilang")],
        halaqah: [halaqah("h1", "g1")],
      }),
    );
    expect(lain.kelompok[0].nama).toBe("Kelompok tidak dikenal (kel-hilang)");
  });
});

describe("pengajar tanpa baris penilaian", () => {
  it("ditandai belum dinilai, bukan bernilai nol", () => {
    const g3 = cari("g3");
    expect(g3.belumDinilai).toBe(true);
    expect(g3.diperbaruiPada).toBeNull();
    for (const s of g3.pedagogis) expect(s.nilai).toBeNull();
    expect(g3.sop.nilai).toBeNull();
  });

  it("baris bulan lain tidak dipakai untuk mengisi bulan yang dibuka", () => {
    // g3 punya penilaian 2026-07; layar 2026-08 tetap harus bilang belum dinilai.
    expect(cari("g3").belumDinilai).toBe(true);
  });

  it("dihitung sebagai belum dinilai di kelompoknya", () => {
    const b = view.kelompok.find((k) => k.id === "kel-b");
    expect(b?.belumDinilai).toBe(1);
    expect(b?.dinilai).toBe(0);
  });
});

describe("skor null tetap null", () => {
  it("sel kosong tidak pernah berubah jadi 0", () => {
    const g2 = cari("g2");
    const metode = g2.pedagogis.find((s) => s.kode === "metode_pengajaran");
    expect(metode?.nilai).toBeNull();
    expect(metode?.nilai).not.toBe(0);
    expect(g2.sop.nilai).toBeNull();
    expect(g2.sop.nilai).not.toBe(0);
  });

  it("null tidak dianggap di bawah standar — belum dinilai bukan kabar buruk", () => {
    const metode = cari("g2").pedagogis.find((s) => s.kode === "metode_pengajaran");
    expect(metode?.dibawahStandar).toBe(false);
  });

  it("formatSkor mengembalikan tanda pisah untuk null, bukan 0.00", () => {
    expect(formatSkor(null)).toBe("—");
    expect(formatSkor(undefined)).toBe("—");
    expect(formatSkor(0)).toBe("0.00");
    expect(formatSkor(4)).toBe("4.00");
    expect(formatSkor(3.5)).toBe("3.50");
  });

  it("baris yang ada tapi kelima skornya kosong ditandai tersendiri", () => {
    const kosong = buildInspeksiView(
      input({
        pengajar: [pengajar("g1", "Adiba Abdul Anggraini", "kel-a")],
        halaqah: [halaqah("h1", "g1")],
        penilaian: [penilaian("g1")],
      }),
    );
    const row = kosong.kelompok[0].rows[0];
    expect(row.belumDinilai).toBe(false);
    expect(row.barisKosong).toBe(true);
  });
});

describe("matrix_exclude", () => {
  it("tidak ikut cacahan belum dinilai maupun sudah dinilai", () => {
    const b = view.kelompok.find((k) => k.id === "kel-b");
    expect(b?.dikecualikan).toBe(1);
    expect(b?.dinilai).toBe(0);
    expect(b?.belumDinilai).toBe(1); // hanya g3, bukan g4
  });

  it("tetap ditampilkan sebagai baris, hanya tidak ditagih", () => {
    expect(cari("g4").dikecualikan).toBe(true);
    expect(view.ringkas.pengajar).toBe(5);
    expect(view.ringkas.ditagih).toBe(4);
    expect(view.ringkas.dinilai + view.ringkas.belumDinilai).toBe(view.ringkas.ditagih);
    expect(view.ringkas.dikecualikan).toBe(1);
  });

  it("pengajar yang dikecualikan tapi ikut dinilai tidak menambah cacahan dinilai", () => {
    // g4 punya baris penilaian; angkanya tetap tampil, cacahannya tidak.
    expect(cari("g4").belumDinilai).toBe(false);
    expect(view.ringkas.dinilai).toBe(3); // g1, g2, g5
  });
});

describe("tanda di bawah standar", () => {
  it("menandai skor di bawah standar rubrik", () => {
    const silabus = cari("g5").pedagogis.find((s) => s.kode === "kepatuhan_silabus");
    expect(silabus?.nilai).toBe(3.5);
    expect(silabus?.standar).toBe(4);
    expect(silabus?.dibawahStandar).toBe(true);
  });

  it("skor sama dengan standar tidak ditandai", () => {
    const silabus = cari("g1").pedagogis.find((s) => s.kode === "kepatuhan_silabus");
    expect(silabus?.dibawahStandar).toBe(false);
  });

  it("tanpa rubrik tidak ada ambang, jadi tidak ada yang ditandai", () => {
    const tanpaRubrik = buildInspeksiView(input({ indikator: [] }));
    const rows = tanpaRubrik.kelompok.flatMap((k) => k.rows);
    expect(rows.every((r) => r.pedagogis.every((s) => s.standar === null))).toBe(true);
    expect(rows.every((r) => r.pedagogis.every((s) => !s.dibawahStandar))).toBe(true);
    // Labelnya jatuh ke bawaan kolom, bukan jadi kosong.
    expect(tanpaRubrik.legenda.pedagogis[0].label).toBe("Kepatuhan Silabus");
  });
});

describe("SOP di luar pedagogis", () => {
  it("tidak pernah masuk daftar kolom pedagogis", () => {
    expect(KOLOM_PEDAGOGIS.map((k) => k.kode)).not.toContain("kepatuhan_sop");
    expect(view.legenda.pedagogis.map((i) => i.kode)).not.toContain("kepatuhan_sop");
    for (const row of view.kelompok.flatMap((k) => k.rows)) {
      expect(row.pedagogis.map((s) => s.kode)).not.toContain("kepatuhan_sop");
      expect(row.pedagogis).toHaveLength(4);
    }
  });

  it("membawa kategori upstream apa adanya: SOP soft skill, sisanya pedagogis", () => {
    expect(view.legenda.sop.kode).toBe("kepatuhan_sop");
    expect(view.legenda.sop.kategori).toBe("soft_skill");
    expect(view.legenda.pedagogis.map((i) => i.kategori)).toEqual([
      "pedagogis",
      "pedagogis",
      "pedagogis",
      "pedagogis",
    ]);
  });

  it("skor SOP tetap terbaca sebagai kolomnya sendiri", () => {
    expect(cari("g1").sop.nilai).toBe(4);
  });
});

describe("cacahan teguran", () => {
  it("null saat cermin teguran tidak dibaca — bukan 0 palsu", () => {
    for (const row of view.kelompok.flatMap((k) => k.rows)) {
      expect(row.teguranBulan).toBeNull();
    }
  });

  it("menghitung teguran bulan yang dibuka saja", () => {
    const teguran: MaahirTeguran[] = [
      {
        id: "t1",
        pengajar_id: "g1",
        category: "komitmen_jadwal",
        year_month: BULAN,
        nomor_teguran: 1,
        created_at: "2026-08-10T00:00:00.000Z",
      },
      {
        id: "t2",
        pengajar_id: "g1",
        category: "kedisiplinan_waktu",
        year_month: "2026-07",
        nomor_teguran: 1,
        created_at: "2026-07-10T00:00:00.000Z",
      },
    ];
    const dengan = buildInspeksiView(input({ teguran }));
    const rows = dengan.kelompok.flatMap((k) => k.rows);
    expect(rows.find((r) => r.pengajarId === "g1")?.teguranBulan).toBe(1);
    expect(rows.find((r) => r.pengajarId === "g2")?.teguranBulan).toBe(0);
  });
});

describe("pilihan bulan", () => {
  it("hanya menawarkan bulan yang ada di cermin, terbaru dulu", () => {
    const rows = [
      penilaian("g1", {}, "2026-06"),
      penilaian("g2", {}, "2026-09"),
      penilaian("g3", {}, "2026-08"),
      penilaian("g4", {}, "2026-08"),
    ];
    expect(bulanTersedia(rows)).toEqual(["2026-09", "2026-08", "2026-06"]);
  });

  it("mengabaikan year_month yang tidak berbentuk YYYY-MM", () => {
    expect(bulanTersedia([penilaian("g1", {}, "Agustus"), penilaian("g2", {}, "2026-08")])).toEqual([
      "2026-08",
    ]);
  });

  it("bulan kosong berarti tidak ada yang bisa dipilih", () => {
    expect(bulanTersedia([])).toEqual([]);
    expect(resolveBulan("2026-08", [])).toBeNull();
  });

  it("permintaan di luar daftar jatuh ke bulan terbaru, bukan tabel kosong tanpa sebab", () => {
    const ada = ["2026-09", "2026-08"];
    expect(resolveBulan("2026-08", ada)).toBe("2026-08");
    expect(resolveBulan("2025-01", ada)).toBe("2026-09");
    expect(resolveBulan(undefined, ada)).toBe("2026-09");
  });
});

describe("format tanggal", () => {
  it("melabeli bulan dalam bahasa Indonesia", () => {
    expect(labelBulan("2026-08")).toBe("Agustus 2026");
    expect(labelBulan("2026-13")).toBe("2026-13");
    expect(labelBulan("bukan-bulan")).toBe("bukan-bulan");
  });

  it("memotong updated_at dari string, tidak lewat Date", () => {
    expect(tanggalSingkat("2026-08-31T06:18:13.161Z")).toBe("31 Agu 2026");
    expect(tanggalSingkat(null)).toBeNull();
    expect(tanggalSingkat("entah")).toBeNull();
  });
});
