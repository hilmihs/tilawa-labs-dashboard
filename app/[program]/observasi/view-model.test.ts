/**
 * Uji `buildObservasiView` dengan masukan yang DITULIS TANGAN.
 *
 * Berbeda dari layar rekap (`sp`, `tibyan`, `disiplin`) yang punya tangkapan
 * asli di `lib/maahir/__fixtures__/`, entitas mentah `hits/*` tidak punya
 * fixture sama sekali. Jadi bentuk objek di bawah disalin dari tipe di
 * `lib/maahir/entities.ts` dan dicocokkan dengan cermin hidup (`maahir_sync`,
 * 7 Sep 2026): nilai `kondisi` (KBBS 9368, JKG 433, LIBUR 386, KMT 192,
 * KBLA 45), `status_latihan` (SML 6948, PTML 2507, null 607, TAL 362),
 * `pelanggaran.jenis` (TIDAK_LATIHAN, JKG, KMT, BADAL, KBLA) dan
 * `tabayyun.status` (decided, pending, awaiting_reason) semuanya dibaca dari
 * sana, bukan dari dokumentasi — API tidak mengenumerasi satu pun di antaranya.
 *
 * Yang dijaga di sini persis hal-hal yang paling gampang salah: baris tanpa
 * anak tidak boleh hilang, nilai enum asing harus lolos apa adanya, dan
 * `null` tidak boleh berubah jadi 0.
 */
import { describe, expect, it } from "vitest";
import type {
  MaahirHutangBayar,
  MaahirKeteranganHarian,
  MaahirPelanggaran,
  MaahirTabayyun,
} from "@/lib/maahir/entities";
import {
  buildObservasiView,
  filterBaris,
  jumlahMenit,
  kodeHint,
  kondisiTone,
  tabayyunTerbuka,
  tanggalPanjang,
  tanggalPendek,
  type ObservasiSumber,
} from "./view-model";

const HALAQAH = [
  { id: "hal-1", name: "HITS 01", gender: "ikhwan", pengajar_id: "peng-1", level: "qoidah_nuroniyyah" },
  { id: "hal-2", name: "Lanjutan HITS 02", gender: "akhwat", pengajar_id: "peng-2", level: "perbaikan_bacaan" },
];

const PENGAJAR = [
  { id: "peng-1", name: "Ustadz Abdullah" },
  { id: "peng-2", name: "Ustadzah Nurlayla" },
];

function keterangan(over: Partial<MaahirKeteranganHarian> & { id: string }): MaahirKeteranganHarian {
  return {
    halaqah_id: "hal-1",
    level: "qoidah_nuroniyyah",
    pertemuan_no: 1,
    tanggal: "2026-08-03",
    kondisi: "KBBS",
    status_latihan: "SML",
    // Sengaja jauh dari `tanggal`: baris Jan/Apr di-backfill 21 Jun 2026, dan
    // tak satu pun urutan di modul ini boleh bergantung pada cap ini.
    created_at: "2026-06-21T04:00:00.000Z",
    ...over,
  };
}

/** Susunan dasar: dua halaqah, empat catatan, anak-anak menempel di sebagian. */
function sumber(over: Partial<ObservasiSumber> = {}): ObservasiSumber {
  const keteranganRows: MaahirKeteranganHarian[] = [
    keterangan({ id: "k-1", tanggal: "2026-08-03", pertemuan_no: 11, kondisi: "KMT" }),
    keterangan({ id: "k-2", tanggal: "2026-08-10", pertemuan_no: 12, kondisi: "KBBS" }),
    keterangan({
      id: "k-3",
      halaqah_id: "hal-2",
      tanggal: "2026-08-10",
      pertemuan_no: 5,
      kondisi: "JKG",
      status_latihan: null,
      level: "perbaikan_bacaan",
    }),
    keterangan({
      id: "k-4",
      halaqah_id: "hal-2",
      tanggal: "2026-08-17",
      pertemuan_no: 6,
      kondisi: "LIBUR",
      status_latihan: "TAL",
    }),
  ];
  const pelanggaran: MaahirPelanggaran[] = [
    { id: "p-1", keterangan_id: "k-1", jenis: "KMT", menit: 12 },
    { id: "p-2", keterangan_id: "k-3", jenis: "JKG", menit: null },
  ];
  const tabayyun: MaahirTabayyun[] = [
    {
      id: "t-1",
      keterangan_id: "k-1",
      pengajar_id: "peng-1",
      status: "pending",
      kondisi: "KMT",
      deadline_at: "2026-08-05T14:57:02.411Z",
      created_at: "2026-08-03T14:57:02.411Z",
    },
    {
      id: "t-2",
      keterangan_id: "k-3",
      pengajar_id: "peng-2",
      status: "decided",
      kondisi: "JKG",
      deadline_at: null,
      created_at: "2026-08-10T02:00:00.000Z",
    },
  ];
  const hutang: MaahirHutangBayar[] = [
    {
      id: "h-1",
      halaqah_id: "hal-1",
      pengajar_id: "peng-1",
      keterangan_id: "k-1",
      menit: 30,
      tanggal: "2026-08-03",
      created_at: "2026-08-04T01:00:00.000Z",
    },
    {
      id: "h-2",
      halaqah_id: "hal-1",
      pengajar_id: "peng-1",
      keterangan_id: "k-1",
      menit: 15,
      tanggal: "2026-08-03",
      created_at: "2026-08-04T01:00:00.000Z",
    },
  ];
  return {
    keterangan: keteranganRows,
    pelanggaran,
    tabayyun,
    hutang,
    halaqah: HALAQAH,
    pengajar: PENGAJAR,
    tautan: { "hal-1": { tilawahHalaqahId: 4211 } },
    ...over,
  };
}

describe("penggabungan keterangan dengan anak-anaknya", () => {
  const view = buildObservasiView(sumber());

  it("tidak membuang satu catatan pun", () => {
    expect(view.baris).toHaveLength(4);
    expect(view.ringkas.keterangan).toBe(4);
  });

  it("menempelkan pelanggaran, tabayyun, dan hutang ke catatan yang benar", () => {
    const k1 = view.baris.find((r) => r.id === "k-1")!;
    expect(k1.pelanggaran.map((p) => p.id)).toEqual(["p-1"]);
    expect(k1.tabayyun.map((t) => t.id)).toEqual(["t-1"]);
    expect(k1.hutang.map((h) => h.id)).toEqual(["h-1", "h-2"]);
    expect(k1.adaTindakLanjut).toBe(true);
  });

  it("menempelkan nama halaqah dan nama pengajar lewat pengajar_id halaqah", () => {
    const k3 = view.baris.find((r) => r.id === "k-3")!;
    expect(k3.halaqahNama).toBe("Lanjutan HITS 02");
    expect(k3.pengajarNama).toBe("Ustadzah Nurlayla");
    expect(k3.halaqahGender).toBe("akhwat");
  });

  it("membawa id numerik untuk deep link, dan null saat namanya tidak cocok", () => {
    // hal-1 punya tautan hasil matchHalaqah(); hal-2 meleset — barisnya TETAP ada.
    expect(view.baris.find((r) => r.id === "k-1")!.tilawahHalaqahId).toBe(4211);
    expect(view.baris.find((r) => r.id === "k-3")!.tilawahHalaqahId).toBeNull();
    expect(view.baris.filter((r) => r.halaqahId === "hal-2")).toHaveLength(2);
  });

  it("menjumlahkan menit hutang pada satu catatan", () => {
    expect(view.baris.find((r) => r.id === "k-1")!.menitHutang).toBe(45);
  });

  it("mengurutkan dari tanggal terbaru, bukan dari created_at", () => {
    expect(view.baris.map((r) => r.tanggal)).toEqual([
      "2026-08-17",
      "2026-08-10",
      "2026-08-10",
      "2026-08-03",
    ]);
    // created_at k-1..k-4 tidak monoton terhadap tanggal; kalau urutannya
    // ikut cap tulis, uji di atas akan gagal.
    expect(view.baris[0].id).toBe("k-4");
  });

  it("mencacah anak-anaknya sebagai panjang daftar, tanpa angka turunan", () => {
    expect(view.ringkas).toEqual({
      keterangan: 4,
      pelanggaran: 2,
      tabayyun: 2,
      tabayyunBelumDiputus: 1,
      hutang: 2,
      halaqah: 2,
    });
  });
});

describe("catatan tanpa anak", () => {
  it("tetap muncul dengan daftar kosong, bukan hilang", () => {
    const view = buildObservasiView(sumber());
    const k2 = view.baris.find((r) => r.id === "k-2")!;
    expect(k2.pelanggaran).toEqual([]);
    expect(k2.tabayyun).toEqual([]);
    expect(k2.hutang).toEqual([]);
    expect(k2.adaTindakLanjut).toBe(false);
  });

  it("menit hutangnya null — tidak ada baris bermenit bukan berarti nol menit", () => {
    const view = buildObservasiView(sumber());
    const k2 = view.baris.find((r) => r.id === "k-2")!;
    expect(k2.menitHutang).toBeNull();
    expect(k2.menitHutang).not.toBe(0);
    expect(k2.menitPelanggaran).toBeNull();
  });

  it("pelanggaran ber-menit null juga tidak dijadikan 0", () => {
    const view = buildObservasiView(sumber());
    const k3 = view.baris.find((r) => r.id === "k-3")!;
    expect(k3.pelanggaran).toHaveLength(1);
    expect(k3.menitPelanggaran).toBeNull();
  });

  it("tidak jatuh saat semua daftar anak kosong", () => {
    const view = buildObservasiView(
      sumber({ pelanggaran: [], tabayyun: [], hutang: [] }),
    );
    expect(view.baris).toHaveLength(4);
    expect(view.ringkas.pelanggaran).toBe(0);
    expect(view.baris.every((r) => r.adaTindakLanjut === false)).toBe(true);
  });
});

describe("status_latihan null", () => {
  const view = buildObservasiView(sumber());

  it("tetap null di view-model — em dash urusan render, 0 tidak pernah muncul", () => {
    const k3 = view.baris.find((r) => r.id === "k-3")!;
    expect(k3.statusLatihan).toBeNull();
    expect(k3.statusLatihan).not.toBe(0);
    expect(k3.statusLatihan).not.toBe("0");
  });

  it("null tidak ikut jadi pilihan saringan kondisi", () => {
    const kosong = buildObservasiView(
      sumber({
        keterangan: [keterangan({ id: "k-9", kondisi: null, status_latihan: null })],
        pelanggaran: [],
        tabayyun: [],
        hutang: [],
      }),
    );
    expect(kosong.kondisiTampil).toEqual([]);
    expect(kosong.baris[0].kondisi).toBeNull();
  });
});

describe("nilai enum yang belum dikenal", () => {
  const view = buildObservasiView(
    sumber({
      keterangan: [
        keterangan({ id: "k-x", kondisi: "KBSS_BARU", status_latihan: "ZZZ" }),
      ],
      pelanggaran: [{ id: "p-x", keterangan_id: "k-x", jenis: "JENIS_BARU", menit: 7 }],
      tabayyun: [
        {
          id: "t-x",
          keterangan_id: "k-x",
          pengajar_id: "peng-1",
          status: "escalated",
          kondisi: "JENIS_BARU",
          deadline_at: null,
          created_at: null,
        },
      ],
      hutang: [],
    }),
  );

  it("meneruskan kondisi dan status_latihan asing apa adanya", () => {
    expect(view.baris[0].kondisi).toBe("KBSS_BARU");
    expect(view.baris[0].statusLatihan).toBe("ZZZ");
    expect(view.kondisiTampil).toEqual(["KBSS_BARU"]);
  });

  it("meneruskan jenis pelanggaran dan status tabayyun asing tanpa membuangnya", () => {
    expect(view.baris[0].pelanggaran[0].jenis).toBe("JENIS_BARU");
    expect(view.baris[0].tabayyun[0].status).toBe("escalated");
    expect(view.ringkas.tabayyun).toBe(1);
  });

  it("tidak mengarang kepanjangan untuk kode yang tidak diketahui", () => {
    expect(kodeHint("KBSS_BARU")).toBeNull();
    expect(kodeHint("KBLA")).toBeNull();
    expect(kodeHint("BADAL")).toBeNull();
    expect(kodeHint("JKG")).toBe("Jadwal Kelas Ganti");
    expect(kodeHint(null)).toBeNull();
  });

  it("kode asing diberi warna netral, bukan ditebak parah/tidaknya", () => {
    expect(kondisiTone("KBSS_BARU")).toBe("neutral");
    expect(kondisiTone("KBBS")).toBe("success");
    expect(kondisiTone("KMT")).toBe("warning");
    expect(kondisiTone(null)).toBe("neutral");
  });

  it("status tabayyun selain decided dihitung belum diputus", () => {
    expect(tabayyunTerbuka({ status: "escalated" })).toBe(true);
    expect(tabayyunTerbuka({ status: "awaiting_reason" })).toBe(true);
    expect(tabayyunTerbuka({ status: "decided" })).toBe(false);
  });
});

describe("pengelompokan per halaqah", () => {
  const view = buildObservasiView(sumber());

  it("mengumpulkan catatan ke halaqahnya, urut nama", () => {
    expect(view.perHalaqah.map((g) => g.halaqahNama)).toEqual(["HITS 01", "Lanjutan HITS 02"]);
    expect(view.perHalaqah.map((g) => g.baris.length)).toEqual([2, 2]);
    expect(view.perHalaqah[0].baris.map((r) => r.id)).toEqual(["k-2", "k-1"]);
  });

  it("membawa nama pengajar dan tautan detail pada tiap kelompok", () => {
    expect(view.perHalaqah[0].pengajarNama).toBe("Ustadz Abdullah");
    expect(view.perHalaqah[0].tilawahHalaqahId).toBe(4211);
    expect(view.perHalaqah[1].tilawahHalaqahId).toBeNull();
  });

  it("tetap mengelompokkan halaqah yang tidak ada di cermin, tanpa membuang barisnya", () => {
    const view2 = buildObservasiView(
      sumber({
        keterangan: [keterangan({ id: "k-z", halaqah_id: "hal-hantu" })],
        pelanggaran: [],
        tabayyun: [],
        hutang: [],
      }),
    );
    expect(view2.perHalaqah).toHaveLength(1);
    expect(view2.perHalaqah[0].halaqahNama).toBeNull();
    expect(view2.perHalaqah[0].baris).toHaveLength(1);
    expect(view2.baris[0].pengajarNama).toBeNull();
  });
});

describe("saringan tampilan", () => {
  const view = buildObservasiView(sumber());

  it("menyaring per kondisi tanpa mengubah data asalnya", () => {
    expect(filterBaris(view.baris, { kondisi: "KBBS", hanyaTindakLanjut: false })).toHaveLength(1);
    expect(filterBaris(view.baris, { kondisi: "semua", hanyaTindakLanjut: false })).toHaveLength(4);
    expect(view.baris).toHaveLength(4);
  });

  it("saringan tindak lanjut hanya menyisakan yang punya pelanggaran atau tabayyun", () => {
    const hasil = filterBaris(view.baris, { kondisi: "semua", hanyaTindakLanjut: true });
    expect(hasil.map((r) => r.id).sort()).toEqual(["k-1", "k-3"]);
  });
});

describe("format tanggal", () => {
  it("tidak lewat Date, jadi tidak mundur sehari di barat UTC", () => {
    expect(tanggalPendek("2026-08-01")).toBe("1 Agu");
    expect(tanggalPanjang("2026-01-12")).toBe("12 Januari 2026");
  });

  it("null jadi em dash, dan string aneh dikembalikan apa adanya", () => {
    expect(tanggalPendek(null)).toBe("—");
    expect(tanggalPendek("bukan-tanggal")).toBe("bukan-tanggal");
    expect(tanggalPendek("2026-13-01")).toBe("2026-13-01");
  });
});

describe("jumlahMenit", () => {
  it("null ketika tak satu pun baris membawa angka", () => {
    expect(jumlahMenit([])).toBeNull();
    expect(jumlahMenit([{ menit: null }, { menit: null }])).toBeNull();
  });

  it("0 tetap 0 — nol menit adalah angka, bukan ketiadaan", () => {
    expect(jumlahMenit([{ menit: 0 }])).toBe(0);
    expect(jumlahMenit([{ menit: 10 }, { menit: null }, { menit: 5 }])).toBe(15);
  });
});
