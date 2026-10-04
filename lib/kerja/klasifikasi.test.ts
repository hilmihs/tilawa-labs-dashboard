import { describe, expect, it } from "vitest";
import { klasifikasiTap, parseHari, parseSesi, siapkanKelas, type KelasKonteks, type KonteksTap, type TapKlasifikasi } from "./klasifikasi";
import { BATAS_BAWAAN } from "./types";

// 29 Sep 2026 = Selasa. WIB = UTC+7.
const wib = (tanggal: string, jam: string) => new Date(`${tanggal}T${jam}:00+07:00`);
const SELASA = "2026-09-29";
const RABU = "2026-09-30";
const SABTU = "2026-10-03";
const AHAD = "2026-10-04";
const KANTOR = "kantor-rb";

const kelas = (halaqahId: string, day: string, session: string, lain: Partial<KelasKonteks> = {}): KelasKonteks => ({
  ...siapkanKelas({ halaqahId, nama: `Halaqah ${halaqahId}`, type: "offline", day, session }),
  ...lain,
});
const tap = (waktu: Date, lain: Partial<TapKlasifikasi> = {}): TapKlasifikasi => ({ orangId: "o1", waktu, kantorId: KANTOR, perangkat: "gerbang", ...lain });
const ktx = (lain: Partial<KonteksTap> = {}): KonteksTap => ({ kerja: null, mengajar: [], belajar: [], ...lain });
const anggota = { kantorId: KANTOR, batas: BATAS_BAWAAN };
const jenis = (xs: { jenis: string; yakin: string }[]) => xs.map((a) => `${a.jenis}:${a.yakin}`);

describe("parseHari — semua nilai halaqah_sync.day (lokal, 29 Sep 2026)", () => {
  const kasus: [string, number[]][] = [
    ["Senin", [1]],
    ["Rabu", [3]],
    ["Kamis", [4]],
    ["Jumat", [5]],
    ["Sabtu", [6]],
    ["Senin, Rabu", [1, 3]],
    ["Senin, Kamis", [1, 4]],
    ["Senin, Selasa", [1, 2]],
    ["Selasa, Kamis", [2, 4]],
    ["Selasa, Jumat", [2, 5]],
    ["Rabu, Jumat", [3, 5]],
    ["Sabtu, Ahad", [6, 7]],
    ["Selasa, Rabu, Kamis", [2, 3, 4]],
    ["Senin, Selasa, Rabu, Kamis, Jumat", [1, 2, 3, 4, 5]],
    ["Senin–Jumat", [1, 2, 3, 4, 5]],
    ["Rabu & Kamis", [3, 4]],
    ["Senin & Kamis", [1, 4]],
    ["Selasa & Rabu", [2, 3]],
    ["Selasa & Jumat", [2, 5]],
    ["Selasa & Jum'at", [2, 5]], // int_days tilawah untuk ini salah: [1] saja
  ];
  for (const [teks, hari] of kasus) it(teks, () => expect(parseHari(teks)).toEqual(hari));

  it("varian tulisan lain", () => {
    expect(parseHari("Senin - Jumat")).toEqual([1, 2, 3, 4, 5]);
    expect(parseHari("senin s.d. rabu")).toEqual([1, 2, 3]);
    expect(parseHari("Senin s/d Rabu")).toEqual([1, 2, 3]);
    expect(parseHari("Sabtu–Senin")).toEqual([1, 6, 7]); // melewati Ahad
    expect(parseHari("Sabtu dan Minggu")).toEqual([6, 7]);
    expect(parseHari("Jum’at")).toEqual([5]);
    expect(parseHari("Setiap hari")).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(parseHari("Kamis, Senin, Kamis")).toEqual([1, 4]);
  });
  it("kosong / tak dikenal → []", () => {
    expect(parseHari("")).toEqual([]);
    expect(parseHari(null)).toEqual([]);
    expect(parseHari(undefined)).toEqual([]);
    expect(parseHari("fleksibel")).toEqual([]);
  });
});

describe("parseSesi — nilai halaqah_sync.session", () => {
  it("format tilawah 'HH:MM - HH:MM'", () => {
    expect(parseSesi("20:00 - 21:30")).toEqual({ mulai: 1200, selesai: 1290 });
    expect(parseSesi("06:00 - 07:30")).toEqual({ mulai: 360, selesai: 450 });
    expect(parseSesi("07:50 - 09:00")).toEqual({ mulai: 470, selesai: 540 });
    expect(parseSesi("20:10 - 21:40")).toEqual({ mulai: 1210, selesai: 1300 });
    expect(parseSesi("13:00 - 15:00")).toEqual({ mulai: 780, selesai: 900 });
  });
  it("format isian manual (en-dash, titik, tanpa jam selesai)", () => {
    expect(parseSesi("15:50–19:00")).toEqual({ mulai: 950, selesai: 1140 });
    expect(parseSesi("16:00–19:30")).toEqual({ mulai: 960, selesai: 1170 });
    expect(parseSesi("16:00–18.00")).toEqual({ mulai: 960, selesai: 1080 });
    expect(parseSesi("16:00")).toEqual({ mulai: 960, selesai: null });
    expect(parseSesi("07.30 - 09.00")).toEqual({ mulai: 450, selesai: 540 });
    expect(parseSesi("7:30-9:00 WIB")).toEqual({ mulai: 450, selesai: 540 });
    expect(parseSesi(" 16:00 s.d. 17:30 ")).toEqual({ mulai: 960, selesai: 1050 });
  });
  it("tak bisa dipakai → null", () => {
    expect(parseSesi("00:00 - 00:45")).toBeNull(); // placeholder tilawah
    expect(parseSesi("00:00")).toBeNull();
    expect(parseSesi("")).toBeNull();
    expect(parseSesi(null)).toBeNull();
    expect(parseSesi("ba'da maghrib")).toBeNull();
    expect(parseSesi("25:00 - 26:00")).toBeNull();
  });
  it("jam selesai tak masuk akal dibuang, jam mulai dipertahankan", () => {
    expect(parseSesi("21:00 - 20:00")).toEqual({ mulai: 1260, selesai: null });
    expect(parseSesi("16:00 - 16:75")).toEqual({ mulai: 960, selesai: null });
  });
});

describe("klasifikasiTap — kerja", () => {
  it("anggota di kantornya, dalam sesi → kerja pasti", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "07:40")), ktx({ kerja: anggota }));
    expect(r).toEqual([expect.objectContaining({ jenis: "kerja", sesi: "pagi", yakin: "pasti" })]);
  });
  it("sesi mengikuti batas kantor", () => {
    expect(klasifikasiTap(tap(wib(SELASA, "11:05")), ktx({ kerja: anggota }))[0].sesi).toBe("siang");
    expect(klasifikasiTap(tap(wib(SELASA, "15:30")), ktx({ kerja: anggota }))[0].sesi).toBe("sore");
  });
  it("di luar semua sesi → tak_terpetakan dengan alasan", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "23:10")), ktx({ kerja: anggota }));
    expect(jenis(r)).toEqual(["tak_terpetakan:perlu_tinjau"]);
    expect(r[0].alasan).toContain("di luar semua sesi");
  });
  it("tap di kantor lain → bukan kerja", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "08:00"), { kantorId: "kantor-lain" }), ktx({ kerja: anggota }));
    expect(jenis(r)).toEqual(["tak_terpetakan:perlu_tinjau"]);
    expect(r[0].alasan).toContain("bukan di kantornya");
  });
  it("jam WIB dipakai, bukan UTC (00:30 WIB Rabu = 17:30Z Selasa)", () => {
    const r = klasifikasiTap(tap(new Date("2026-09-29T17:30:00Z")), ktx({ kerja: anggota }));
    expect(r[0].jenis).toBe("tak_terpetakan");
  });
});

describe("klasifikasiTap — mengajar lewat gerbang", () => {
  const pagi = kelas("h1", "Selasa, Jumat", "07:30 - 09:00");

  it("dua-duanya: pengurus yang juga mengajar, tap 07.10 → kerja + mengajar", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "07:10")), ktx({ kerja: anggota, mengajar: [pagi] }));
    expect(jenis(r)).toEqual(["kerja:pasti", "mengajar:pasti"]);
    expect(r[0].sesi).toBe("pagi");
    expect(r[1].halaqahId).toBe("h1");
    expect(r[1].alasan).toContain("20 menit sebelum");
  });

  it("3 jam sebelum kelas bukan mengajar", () => {
    const sore = kelas("h2", "Selasa, Jumat", "16:30 - 18:00");
    const r = klasifikasiTap(tap(wib(SELASA, "13:30")), ktx({ kerja: anggota, mengajar: [sore] }));
    expect(jenis(r)).toEqual(["kerja:pasti"]);
    const r2 = klasifikasiTap(tap(wib(SELASA, "13:30")), ktx({ mengajar: [sore] }));
    expect(jenis(r2)).toEqual(["tak_terpetakan:perlu_tinjau"]);
    expect(r2[0].alasan).toContain("tidak ada kelas tatap mukanya");
  });

  it("tepi jendela: -30 dan +15 masuk, -31 tidak, +16 = terlambat", () => {
    const m = (jam: string) => jenis(klasifikasiTap(tap(wib(SELASA, jam)), ktx({ mengajar: [pagi] })));
    expect(m("07:00")).toEqual(["mengajar:pasti"]);
    expect(m("07:45")).toEqual(["mengajar:pasti"]);
    expect(m("06:59")).toEqual(["tak_terpetakan:perlu_tinjau"]);
    expect(m("07:46")).toEqual(["mengajar:perlu_tinjau"]);
    expect(m("08:59")).toEqual(["mengajar:perlu_tinjau"]);
    expect(m("09:00")).toEqual(["tak_terpetakan:perlu_tinjau"]);
  });

  it("hari tidak cocok → bukan mengajar", () => {
    const r = klasifikasiTap(tap(wib(RABU, "07:20")), ktx({ mengajar: [pagi] }));
    expect(jenis(r)).toEqual(["tak_terpetakan:perlu_tinjau"]);
  });

  it("Ahad = 7", () => {
    const k = kelas("h3", "Sabtu, Ahad", "06:00 - 07:30");
    expect(jenis(klasifikasiTap(tap(wib(AHAD, "05:45")), ktx({ mengajar: [k] })))).toEqual(["mengajar:pasti"]);
  });

  it("kelas online tidak pernah cocok lewat jam", () => {
    const k = kelas("h4", "Selasa, Kamis", "20:00 - 21:30", { tipe: "online" });
    const r = klasifikasiTap(tap(wib(SELASA, "19:50")), ktx({ mengajar: [k] }));
    expect(jenis(r)).toEqual(["tak_terpetakan:perlu_tinjau"]);
    expect(r[0].alasan).toContain("online");
  });

  it("hybrid diperlakukan seperti tatap muka", () => {
    const k = kelas("h5", "Selasa & Rabu", "08:00 - 10:00", { tipe: "hybrid" });
    expect(jenis(klasifikasiTap(tap(wib(SELASA, "07:55")), ktx({ mengajar: [k] })))).toEqual(["mengajar:pasti"]);
  });

  it("jam kelas hanya mulai ('16:00') tetap cocok; terlambat tak dinilai", () => {
    const k = kelas("h6", "Senin–Jumat", "16:00");
    expect(jenis(klasifikasiTap(tap(wib(SELASA, "15:45")), ktx({ mengajar: [k] })))).toEqual(["mengajar:pasti"]);
    expect(jenis(klasifikasiTap(tap(wib(SELASA, "16:40")), ktx({ mengajar: [k] })))).toEqual(["tak_terpetakan:perlu_tinjau"]);
  });

  it("jadwal tilawah: ada pertemuan → jadwalId terbawa; libur → perlu_tinjau", () => {
    const ada = klasifikasiTap(tap(wib(SELASA, "07:20")), ktx({ mengajar: [{ ...pagi, jadwalHariIni: 9101 }] }));
    expect(ada).toEqual([expect.objectContaining({ jenis: "mengajar", yakin: "pasti", jadwalId: 9101 })]);
    const libur = klasifikasiTap(tap(wib(SELASA, "07:20")), ktx({ mengajar: [{ ...pagi, jadwalHariIni: null }] }));
    expect(jenis(libur)).toEqual(["mengajar:perlu_tinjau"]);
    expect(libur[0].alasan).toContain("tidak mencatat pertemuan");
  });

  it("pertemuan pengganti di hari lain tetap cocok bila ada di jadwal", () => {
    const r = klasifikasiTap(tap(wib(RABU, "07:20")), ktx({ mengajar: [{ ...pagi, jadwalHariIni: 9102 }] }));
    expect(r).toEqual([expect.objectContaining({ jenis: "mengajar", yakin: "pasti", jadwalId: 9102 })]);
  });

  it("lebih dari satu kelas cocok → semua perlu_tinjau", () => {
    const dobel = kelas("h1b", "Selasa, Jumat", "07:30 - 09:00");
    const r = klasifikasiTap(tap(wib(SELASA, "07:20")), ktx({ mengajar: [pagi, dobel] }));
    expect(jenis(r)).toEqual(["mengajar:perlu_tinjau", "mengajar:perlu_tinjau"]);
    expect(r[0].alasan).toContain("lebih dari satu kelas");
  });

  it("lokasi kelas diketahui dan beda dengan lokasi perangkat → perlu_tinjau", () => {
    const k = { ...pagi, kantorId: "masjid-x" };
    expect(jenis(klasifikasiTap(tap(wib(SELASA, "07:20")), ktx({ mengajar: [k] })))).toEqual(["mengajar:perlu_tinjau"]);
    expect(jenis(klasifikasiTap(tap(wib(SELASA, "07:20")), ktx({ mengajar: [{ ...k, kantorId: KANTOR }] })))).toEqual(["mengajar:pasti"]);
  });
});

describe("klasifikasiTap — kelas tanpa jam yang bisa dipakai", () => {
  const tanpaJam = kelas("h7", "Sabtu", "00:00 - 00:45");

  it("gerbang: tidak pernah jadi mengajar, tapi meninggalkan catatan tinjau", () => {
    const r = klasifikasiTap(tap(wib(SABTU, "07:40")), ktx({ kerja: anggota, mengajar: [tanpaJam] }));
    expect(jenis(r)).toEqual(["kerja:pasti", "tak_terpetakan:perlu_tinjau"]);
    expect(r[1].halaqahId).toBe("h7");
    expect(r[1].alasan).toContain("jam kelas tidak tercatat");
  });
  it("gerbang di hari lain: tak ada catatan", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "07:40")), ktx({ kerja: anggota, mengajar: [tanpaJam] }));
    expect(jenis(r)).toEqual(["kerja:pasti"]);
  });
  it("hari & jam kosong: catatan tinjau (data rusak, perlu diperbaiki)", () => {
    const kosong = kelas("h8", "", "");
    expect(jenis(klasifikasiTap(tap(wib(SELASA, "10:00")), ktx({ mengajar: [kosong] })))).toEqual(["tak_terpetakan:perlu_tinjau"]);
  });
  it("perangkat kelas: tetap mengajar; pasti bila hari cocok", () => {
    const r = klasifikasiTap(tap(wib(SABTU, "07:40"), { perangkat: { kelas: "h7" } }), ktx({ mengajar: [tanpaJam] }));
    expect(r).toEqual([expect.objectContaining({ jenis: "mengajar", halaqahId: "h7", yakin: "pasti" })]);
  });
});

describe("klasifikasiTap — perangkat kelas", () => {
  const pagi = kelas("h1", "Selasa, Jumat", "07:30 - 09:00");

  it("pengajar di perangkat kelasnya → mengajar pasti", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "07:25"), { perangkat: { kelas: "h1" } }), ktx({ mengajar: [pagi] }));
    expect(jenis(r)).toEqual(["mengajar:pasti"]);
  });
  it("perangkat kelas di kantor + anggota → kerja dan mengajar", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "07:25"), { perangkat: { kelas: "h1" } }), ktx({ kerja: anggota, mengajar: [pagi] }));
    expect(jenis(r)).toEqual(["kerja:pasti", "mengajar:pasti"]);
  });
  it("hari bukan hari kelas / jam jauh → mengajar perlu_tinjau", () => {
    const beda = klasifikasiTap(tap(wib(RABU, "07:25"), { perangkat: { kelas: "h1" } }), ktx({ mengajar: [pagi] }));
    expect(jenis(beda)).toEqual(["mengajar:perlu_tinjau"]);
    expect(beda[0].alasan).toContain("bukan hari kelas");
    const jauh = klasifikasiTap(tap(wib(SELASA, "13:00"), { perangkat: { kelas: "h1" } }), ktx({ mengajar: [pagi] }));
    expect(jenis(jauh)).toEqual(["mengajar:perlu_tinjau"]);
    expect(jauh[0].alasan).toContain("jauh dari jam kelas");
  });
  it("pengajar di perangkat kelas orang lain → badal_mungkin", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "07:25"), { perangkat: { kelas: "h99" } }), ktx({ mengajar: [pagi] }));
    expect(r).toEqual([expect.objectContaining({ jenis: "badal_mungkin", halaqahId: "h99", yakin: "perlu_tinjau" })]);
  });
  it("pengajar tanpa kelas tatap muka (flag adalahPengajar) juga bisa badal", () => {
    const r = klasifikasiTap(tap(wib(SELASA, "07:25"), { perangkat: { kelas: "h99" } }), ktx({ adalahPengajar: true }));
    expect(jenis(r)).toEqual(["badal_mungkin:perlu_tinjau"]);
  });
  it("peserta di perangkat kelasnya → belajar; bukan kelasnya & bukan pengajar → tak_terpetakan", () => {
    const k = kelas("h10", "Selasa, Kamis", "16:00 - 17:30");
    expect(jenis(klasifikasiTap(tap(wib(SELASA, "15:50"), { perangkat: { kelas: "h10" } }), ktx({ belajar: [k] })))).toEqual(["belajar:pasti"]);
    const r = klasifikasiTap(tap(wib(SELASA, "15:50"), { perangkat: { kelas: "h11" } }), ktx({ belajar: [k] }));
    expect(jenis(r)).toEqual(["tak_terpetakan:perlu_tinjau"]);
    expect(r[0].alasan).toContain("bukan pengajar atau peserta");
  });
  it("pengajar yang juga peserta kelas itu → belajar, bukan badal", () => {
    const k = kelas("h12", "Selasa, Kamis", "16:00 - 17:30");
    const r = klasifikasiTap(tap(wib(SELASA, "15:55"), { perangkat: { kelas: "h12" } }), ktx({ mengajar: [pagi], belajar: [k] }));
    expect(jenis(r)).toEqual(["belajar:pasti"]);
  });
});

describe("klasifikasiTap — belajar lewat gerbang", () => {
  const sore = kelas("h20", "Senin, Rabu", "16:30 - 18:00");
  it("peserta datang 10 menit sebelum → belajar pasti", () => {
    expect(jenis(klasifikasiTap(tap(wib(RABU, "16:20")), ktx({ belajar: [sore] })))).toEqual(["belajar:pasti"]);
  });
  it("peserta terlambat 40 menit → belajar perlu_tinjau", () => {
    const r = klasifikasiTap(tap(wib(RABU, "17:10")), ktx({ belajar: [sore] }));
    expect(jenis(r)).toEqual(["belajar:perlu_tinjau"]);
    expect(r[0].alasan).toContain("terlambat 40 menit");
  });
  it("pengurus yang juga peserta kelas sore → kerja + belajar", () => {
    const r = klasifikasiTap(tap(wib(RABU, "16:25")), ktx({ kerja: anggota, belajar: [sore] }));
    expect(jenis(r)).toEqual(["kerja:pasti", "belajar:pasti"]);
  });
});
