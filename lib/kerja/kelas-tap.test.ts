import { describe, expect, it } from "vitest";
import { tujuanKirim, type KelasTap } from "./kelas-tap";
import { bolehKirim, siapkanKelas, type Arti } from "./klasifikasi";
import { mundur } from "./kirim";

const kelas = (v: Partial<KelasTap>): KelasTap => ({
  peran: "mengajar",
  sumber: "tilawah",
  programId: "prog",
  konteks: siapkanKelas({ halaqahId: "h1", nama: "Halaqah Ayah", type: "offline", day: "Selasa", session: "07:30 - 08:30", jadwalHariIni: 17083 }),
  ...v,
});
const arti = (v: Partial<Arti>): Arti => ({ jenis: "mengajar", halaqahId: "h1", jadwalId: 17083, alasan: "", yakin: "pasti", ...v });

describe("bolehKirim", () => {
  it("sends sure and merely-late meanings, never ambiguous ones", () => {
    expect(bolehKirim(arti({}))).toBe(true);
    expect(bolehKirim(arti({ yakin: "perlu_tinjau", telat: true }))).toBe(true);
    expect(bolehKirim(arti({ yakin: "perlu_tinjau" }))).toBe(false);
    expect(bolehKirim(arti({ yakin: "perlu_tinjau", telat: true, ganda: true }))).toBe(false);
  });
});

describe("tujuanKirim", () => {
  it("marks a tilawah meeting Selesai only after the class ends", () => {
    const t = tujuanKirim(arti({}), kelas({ guruId: 89 }), "2026-09-29");
    expect(t?.sasaran).toBe("tilawah_selesai");
    expect(t?.ref).toMatchObject({ jadwalId: 17083, guruId: 89, programId: "prog", kunci: "h1" });
    expect(t?.kirimSetelah?.toISOString()).toBe("2026-09-29T01:30:00.000Z"); // 08.30 WIB
  });
  it("adds a student's Hadir in tilawah and a Maahir attendance", () => {
    expect(tujuanKirim(arti({ jenis: "belajar" }), kelas({ peran: "belajar", halaqahUserId: 555 }), "2026-09-29")).toMatchObject({
      sasaran: "tilawah_presensi",
      ref: { halaqahUserId: 555, jadwalId: 17083 },
      kirimSetelah: null,
    });
    const m = kelas({ peran: "belajar", sumber: "maahir", programKelasId: "pk", anggotaId: "ag", konteks: siapkanKelas({ halaqahId: "maahir:pk", nama: "Maahir", type: "offline", day: "", session: "08:30 - 10:30" }) });
    expect(tujuanKirim(arti({ jenis: "belajar", halaqahId: "maahir:pk", jadwalId: undefined }), m, "2026-09-29")).toMatchObject({
      sasaran: "maahir_kehadiran",
      ref: { programKelasId: "pk", anggotaId: "ag", tanggal: "2026-09-29" },
    });
  });
  it("keeps Mabni classes, missing meetings and doubtful taps local", () => {
    expect(tujuanKirim(arti({}), kelas({ sumber: "mabni", guruId: 3 }), "2026-09-29")).toBeNull();
    expect(tujuanKirim(arti({ jadwalId: undefined }), kelas({ guruId: 89 }), "2026-09-29")).toBeNull();
    expect(tujuanKirim(arti({ yakin: "perlu_tinjau" }), kelas({ guruId: 89 }), "2026-09-29")).toBeNull();
  });
});

describe("mundur", () => {
  it("backs off 15, 30, 60 minutes", () => {
    const now = new Date("2026-09-29T00:00:00Z");
    expect([1, 2, 3].map((n) => (mundur(n, now).getTime() - now.getTime()) / 60_000)).toEqual([15, 30, 60]);
  });
});

describe("petaHasilMaahir", async () => {
  const { petaHasilMaahir } = await import("./kirim-maahir");
  it("waits for the class leader to open today's meeting, but not for past days", () => {
    expect(petaHasilMaahir("tercatat", "2026-09-30", "2026-09-30")).toBe("tersinkron");
    expect(petaHasilMaahir("tanpa_pertemuan", "2026-09-30", "2026-09-30")).toBe("tunggu");
    expect(petaHasilMaahir("tanpa_pertemuan", "2026-09-29", "2026-09-30")).toBe("dilewati");
    expect(petaHasilMaahir("sudah_diisi", "2026-09-30", "2026-09-30")).toBe("dilewati");
    expect(petaHasilMaahir("terkunci", "2026-09-30", "2026-09-30")).toBe("dilewati");
    expect(petaHasilMaahir("galat", "2026-09-30", "2026-09-30")).toBe("ulang");
  });
});
