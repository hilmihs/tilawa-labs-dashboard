import { describe, expect, it } from "vitest";
import {
  barisProgram,
  fmtKode,
  fmtUid,
  isiKartu,
  kodeDuaBaris,
  namaKelasMaahir,
  namaProgramRingkas,
  PALET,
  peranKartu,
  pilihHalaqahUtama,
  pilihKelasPeserta,
  PROGRAM_MAAHIR,
  rumpunKartu,
  rumpunProgram,
} from "./kartu-view";

describe("peranKartu", () => {
  it("puts an active logbook member first, whatever the kategori", () => {
    expect(peranKartu({ anggotaAktif: true, kategori: "pengajar", peranTautan: ["pengajar"] })).toBe("pengurus");
    expect(peranKartu({ anggotaAktif: false, kategori: "pengurus", peranTautan: [] })).toBe("pengurus");
  });
  it("treats teaching links or kategori pengajar as Pengajar", () => {
    expect(peranKartu({ anggotaAktif: false, kategori: "umum", peranTautan: ["musyrif"] })).toBe("pengajar");
    expect(peranKartu({ anggotaAktif: false, kategori: "pengajar", peranTautan: [] })).toBe("pengajar");
  });
  it("leaves Maahir coordinators (students) and everyone else as Peserta", () => {
    expect(peranKartu({ anggotaAktif: false, kategori: "umum", peranTautan: ["koordinator"] })).toBe("peserta");
    expect(peranKartu({ anggotaAktif: false, kategori: "umum", peranTautan: [] })).toBe("peserta");
  });
});

describe("palet", () => {
  it("keeps the front watermark subordinate to the back, but not below print visibility", () => {
    for (const p of Object.values(PALET)) {
      expect(p.markDepan).toBeLessThan(p.markBelakang);
      expect(p.markDepan).toBeGreaterThanOrEqual(0.05);
    }
  });
});

describe("rumpun", () => {
  it("recognises Qur'an programs by slug, name or declared text", () => {
    for (const t of ["hits-regular", "HKM (Halaqah Al-Qur'an)", "Kelas Maahir", "dpq", "Tahsin Keluarga", "tafm-laz", "Pengajar HITS"])
      expect(rumpunProgram(t)).toBe("tilawah");
    for (const t of ["mabni", "Madrasah Nusantara", "Pengajar MLP", "al-arabiyyah", "Ruang Belajar Islam (RBI)"])
      expect(rumpunProgram(t)).toBe("pendidikan");
    expect(rumpunProgram("  ")).toBeNull();
  });
  it("always gives Pengurus the #Pendidikan lockup", () => {
    expect(rumpunKartu("pengurus", ["hits-regular"], ["tilawah"])).toBe("pendidikan");
  });
  it("falls back to the account source when the program is unknown", () => {
    expect(rumpunKartu("pengajar", [null], ["maahir"])).toBe("tilawah");
    expect(rumpunKartu("peserta", [], [])).toBe("pendidikan");
    expect(rumpunKartu("pengajar", ["mabni"], ["tilawah"])).toBe("pendidikan");
  });
});

describe("format kode & UID", () => {
  it("splits the 10-letter code into two blocks of five", () => {
    expect(fmtKode("abcde23456")).toBe("ABCDE 23456");
    expect(kodeDuaBaris("ABCDE23456")).toEqual(["ABCDE", "23456"]);
  });
  it("formats a normalised UID with colons, dash when absent", () => {
    expect(fmtUid("04A23F1B6C8091")).toBe("04:A2:3F:1B:6C:80:91");
    expect(fmtUid("04:a2:3f")).toBe("04:A2:3F");
    expect(fmtUid(null)).toBe("—");
    expect(fmtUid("")).toBe("—");
  });
});

describe("baris program", () => {
  it("shortens program names for the card", () => {
    expect(namaProgramRingkas("HITS Reguler (Batch Juni 2026)")).toBe("HITS Reguler");
    expect(namaProgramRingkas("HKM — Presensi (Halaqah Keluarga Tilawa Labs)")).toBe("HKM");
    expect(namaProgramRingkas("Pengajar HITS")).toBe("HITS");
    expect(namaProgramRingkas(null)).toBeNull();
  });
  it("gives Pengurus only 'Pengurus Pendidikan', never a division or halaqah", () => {
    expect(barisProgram("pengurus", "Divisi Kaderisasi", "HITS 006")).toEqual({ program: "Pengurus Pendidikan", halaqah: null });
  });
  it("keeps the halaqah for teachers and drops it when there is no program", () => {
    expect(barisProgram("pengajar", "HITS Safar", "SAFAR IKHWAN 03")).toEqual({ program: "HITS Safar", halaqah: "SAFAR IKHWAN 03" });
    expect(barisProgram("peserta", null, "X")).toEqual({ program: null, halaqah: null });
    expect(barisProgram("pengajar", "Pengajar MLP", " ")).toEqual({ program: "MLP", halaqah: null });
  });
});

describe("pilihHalaqahUtama", () => {
  const c = (programSlug: string, halaqah: string, selesai: number, terakhir: string | null) => ({ programSlug, programNama: programSlug, halaqah, selesai, terakhir });
  it("prefers a running class over a finished batch with more meetings", () => {
    const u = pilihHalaqahUtama([c("hits-regular", "HITS 017", 21, "2026-09-19"), c("hits-safar", "SAFAR 03", 15, "2026-10-11"), c("rbi", "Kadis 1", 5, "2026-12-24")], "2026-09-29");
    expect(u?.halaqah).toBe("SAFAR 03");
  });
  it("falls back to the most meetings, then the latest, when nothing runs", () => {
    expect(pilihHalaqahUtama([c("a", "A", 3, "2026-08-01"), c("b", "B", 3, "2026-09-01")], "2026-09-29")?.halaqah).toBe("B");
    expect(pilihHalaqahUtama([], "2026-09-29")).toBeNull();
  });
});

describe("kartu peserta", () => {
  const kp = (sumber: "tilawah" | "maahir", kunci: string, programSlug: string, programNama: string, halaqah: string, selesai = 0, terakhir: string | null = null) =>
    ({ sumber, kunci, programSlug, programNama, halaqah, selesai, terakhir });
  const dasar = { halaqahPegang: null, tautanPeserta: true, programTautan: null, programTeks: null, sumber: ["tilawah"] };

  it("drops the redundant Maahir prefix from class names", () => {
    expect(namaKelasMaahir("Maahir Talaqqi (Senin pagi)")).toBe("Talaqqi (Senin pagi)");
    expect(namaKelasMaahir("Maahir 6A - Ikhwan")).toBe("6A - Ikhwan");
    expect(namaKelasMaahir("Maahir")).toBe("Maahir");
    expect(namaKelasMaahir("  ")).toBeNull();
  });

  it("writes 'program · halaqah' of the class they attend, always under #Tilawah", () => {
    const rbi = kp("tilawah", "h1", "rbi", "Ruang Belajar Islam (RBI)", "Kadis 1", 4, "2026-12-24");
    expect(isiKartu({ ...dasar, peran: "peserta", kelasPeserta: rbi })).toEqual({ program: "Ruang Belajar Islam", halaqah: "Kadis 1", rumpun: "tilawah" });
    const m = kp("maahir", "k1", "maahir", PROGRAM_MAAHIR, "Talaqqi (Senin pagi)");
    expect(isiKartu({ ...dasar, sumber: ["maahir"], peran: "peserta", kelasPeserta: m })).toEqual({ program: "Maahir", halaqah: "Talaqqi (Senin pagi)", rumpun: "tilawah" });
  });

  it("keeps #Tilawah for a linked peserta whose class is no longer offline", () => {
    const r = isiKartu({ ...dasar, peran: "peserta", kelasPeserta: null, programTeks: "Peserta Ruang Belajar Islam (RBI)" });
    expect(r).toEqual({ program: "Ruang Belajar Islam", halaqah: null, rumpun: "tilawah" });
  });

  it("gives a teacher who also studies their own halaqah first", () => {
    const pegang = { programSlug: "hits-safar", programNama: "HITS Safar", halaqah: "SAFAR 03", selesai: 5, terakhir: "2026-10-11" };
    const ikut = kp("tilawah", "h2", "rbi", "Ruang Belajar Islam (RBI)", "Kadis 1");
    expect(isiKartu({ ...dasar, peran: "pengajar", halaqahPegang: pegang, kelasPeserta: ikut })).toEqual({ program: "HITS Safar", halaqah: "SAFAR 03", rumpun: "tilawah" });
    expect(isiKartu({ ...dasar, peran: "pengajar", halaqahPegang: null, kelasPeserta: ikut }).halaqah).toBe("Kadis 1");
  });

  it("leaves non-linked cards as before", () => {
    expect(isiKartu({ ...dasar, tautanPeserta: false, sumber: [], peran: "peserta", kelasPeserta: null, programTeks: "Madrasah Nusantara" }))
      .toEqual({ program: "Madrasah Nusantara", halaqah: null, rumpun: "pendidikan" });
    expect(isiKartu({ ...dasar, tautanPeserta: false, sumber: ["maahir"], peran: "pengajar", kelasPeserta: null }))
      .toEqual({ program: "Kelas Maahir", halaqah: null, rumpun: "tilawah" });
  });

  it("prints the class being printed when the peserta sits in several", () => {
    const a = kp("maahir", "k1", "maahir", "Maahir", "Talaqqi (Senin pagi)");
    const b = kp("maahir", "k2", "maahir", "Maahir", "Halaqah Tahfizh Pagi (Rabu)");
    const c = kp("tilawah", "h9", "hits-regular", "HITS Reguler", "HITS 065", 3, "2026-12-01");
    expect(pilihKelasPeserta([a, b, c], "2026-09-30", { kunci: "k1" })?.kunci).toBe("k1");
    expect(pilihKelasPeserta([a, b, c], "2026-09-30", { programSlug: "maahir" })?.kunci).toBe("k2");
    expect(pilihKelasPeserta([a, b, c], "2026-09-30")?.kunci).toBe("h9");
    expect(pilihKelasPeserta([a], "2026-09-30", { kunci: "zzz" })?.kunci).toBe("k1");
    expect(pilihKelasPeserta([], "2026-09-30")).toBeNull();
  });
});
