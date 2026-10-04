import { describe, expect, it } from "vitest";
import { susunTrackRecord } from "./track-record";

describe("susunTrackRecord", () => {
  it("groups system data and self-reported entries per year, newest first", () => {
    const r = susunTrackRecord({
      tahun: [2024, 2025, 2026],
      hadir: [
        { tahun: 2026, seri: "kajian-pengajar", acara: "Kajian 1" },
        { tahun: 2026, seri: "kajian-pengajar", acara: "Kajian 2" },
        { tahun: 2026, seri: null, acara: "Tabligh Akbar" },
      ],
      panitia: [{ tahun: 2026, acara: "Kajian LIPIA 3", peran: "anggota" }],
      mandiri: [
        { tahun: 2024, kegiatan: "kurban", peran: "panitia", status: "terverifikasi" },
        { tahun: 2024, kegiatan: "lain:Bakti sosial", peran: "peserta", status: "menunggu" },
        { tahun: 2024, kegiatan: "khutbah", peran: "pengisi", status: "ditolak" },
      ],
    });
    expect(r.map((x) => x.tahun)).toEqual([2026, 2025, 2024]);
    expect(r[0].rutin).toEqual([{ label: "Kajian Pengajar", hadir: 2 }, { label: "Tabligh Akbar", hadir: 1 }]);
    expect(r[0].kepanitiaan).toEqual([{ acara: "Kajian LIPIA 3", peran: "anggota" }]);
    expect(r[1].kosong).toBe(true);
    expect(r[2].mandiri).toEqual([
      { nama: "Kurban", peran: "panitia", menunggu: false },
      { nama: "Bakti sosial", peran: "peserta", menunggu: true },
    ]);
  });
});
