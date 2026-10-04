import { describe, expect, it } from "vitest";
import type {
  MaahirAnggota,
  MaahirKehadiranEntity,
  MaahirPertemuanEntity,
  MaahirPeserta,
  MaahirRekamanEntity,
  MaahirSetoranEntity,
} from "@/lib/maahir/entities";
import {
  buildRiwayatKehadiran,
  buildSetoran,
  cacahPerStatus,
  durasiLabel,
  labelStatusKehadiran,
  resolveOrang,
} from "./view-model";

const peserta = (id: string, name = id): MaahirPeserta => ({
  id,
  name,
  gender: "ikhwan",
  kelas_id: null,
  active: true,
  created_at: null,
});

const anggota = (id: string, pesertaId: string | null, name = id): MaahirAnggota => ({
  id,
  program_kelas_id: "pk1",
  peserta_id: pesertaId,
  name,
  is_ketua: false,
  is_wakil: false,
  mulai_tanggal: null,
  created_at: null,
});

describe("resolveOrang", () => {
  const P = [peserta("p1")];
  const A = [anggota("a1", "p1"), anggota("a2", "p1"), anggota("a3", null), anggota("a4", "p-hilang")];

  it("peserta membawa semua enrolmennya", () => {
    const r = resolveOrang("p1", P, A);
    expect(r.jenis).toBe("peserta");
    if (r.jenis === "peserta") expect(r.anggota.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("enrolmen milik peserta dialihkan ke halaman pesertanya", () => {
    expect(resolveOrang("a1", P, A)).toEqual({ jenis: "alihkan", pesertaId: "p1" });
  });

  it("enrolmen lepas berdiri sendiri", () => {
    expect(resolveOrang("a3", P, A).jenis).toBe("anggota");
  });

  it("enrolmen yang menunjuk peserta di luar cermin tidak dialihkan ke 404", () => {
    expect(resolveOrang("a4", P, A).jenis).toBe("anggota");
  });

  it("kunci tak dikenal → tidak-ada", () => {
    expect(resolveOrang("zzz", P, A).jenis).toBe("tidak-ada");
  });
});

describe("buildRiwayatKehadiran", () => {
  const pert = (id: string, tanggal: string): MaahirPertemuanEntity => ({
    id,
    program: "kelas_maahir",
    program_kelas_id: "pk1",
    kelas_id: null,
    tanggal,
    nama_kegiatan: "Kelas Maahir",
    waktu_mulai: "14:00:00",
    waktu_selesai: "17:30:00",
    keterangan: null,
    created_at: null,
  });
  const hadir = (id: string, pertemuanId: string | null, status: string, catatan: string | null = null): MaahirKehadiranEntity => ({
    id,
    pertemuan_id: pertemuanId,
    anggota_id: "a1",
    peserta_id: null,
    status,
    mode: null,
    setoran_halaman: null,
    catatan,
    diisi_at: null,
    updated_at: null,
  });

  it("terbaru di atas, pertemuan hilang di bawah, catatan kosong jadi null", () => {
    const rows = buildRiwayatKehadiran(
      [hadir("k1", "x1", "hadir", "  "), hadir("k2", "x2", "sakit", "demam"), hadir("k3", "hilang", "izin")],
      [pert("x1", "2026-08-01"), pert("x2", "2026-08-10")],
      [{ id: "pk1", name: "Maahir Takhassus Ikhwan" }],
    );
    expect(rows.map((r) => r.id)).toEqual(["k2", "k1", "k3"]);
    expect(rows[0]).toMatchObject({ catatan: "demam", jam: "14.00–17.30", programKelasNama: "Maahir Takhassus Ikhwan" });
    expect(rows[1].catatan).toBeNull();
    expect(rows[2].tanggal).toBeNull();
  });

  it("cacah per status mengikuti urutan H-T-I-S-A, status asing di belakang", () => {
    const rows = buildRiwayatKehadiran(
      [hadir("1", null, "tidak_ada_keterangan"), hadir("2", null, "hadir"), hadir("3", null, "baru"), hadir("4", null, "hadir")],
      [],
      [],
    );
    expect(cacahPerStatus(rows)).toEqual([
      { status: "hadir", n: 2 },
      { status: "tidak_ada_keterangan", n: 1 },
      { status: "baru", n: 1 },
    ]);
    expect(labelStatusKehadiran("baru")).toBe("baru");
    expect(labelStatusKehadiran("tidak_ada_keterangan")).toBe("Alpa");
  });
});

describe("buildSetoran", () => {
  const s = (id: string, week: string, musyrif: string | null): MaahirSetoranEntity => ({
    id,
    peserta_id: "p1",
    week_start: week,
    status: musyrif ? "checked" : "submitted",
    submitted_at: null,
    checked_at: null,
    checked_by_musyrif_id: musyrif,
    created_at: null,
    updated_at: null,
  });
  const r = (id: string, setoranId: string, jenis: string, nilai: string | null): MaahirRekamanEntity => ({
    id,
    setoran_id: setoranId,
    jenis,
    duration_seconds: 538,
    recorded_at: null,
    nilai,
    checked_at: null,
    created_at: null,
  });

  it("pekan terbaru di atas, rekaman menempel ke setorannya, musyrif dinamai", () => {
    const rows = buildSetoran(
      [s("s1", "2026-08-03", "m1"), s("s2", "2026-08-10", null)],
      [r("r1", "s1", "tuhfatul_athfal", "hijau"), r("r2", "s1", "jazariyyah", null), r("r3", "yatim", "syawahid", "merah")],
      [{ id: "m1", name: "Ust. Hakim" }],
    );
    expect(rows.map((x) => x.id)).toEqual(["s2", "s1"]);
    expect(rows[1].pengecek).toBe("Ust. Hakim");
    expect(rows[1].rekaman.map((x) => x.id)).toEqual(["r2", "r1"]);
    expect(rows[0].rekaman).toEqual([]);
  });
});

describe("durasiLabel", () => {
  it("menit:detik, jam bila perlu, null tetap em dash", () => {
    expect(durasiLabel(538)).toBe("8:58");
    expect(durasiLabel(3725)).toBe("1:02:05");
    expect(durasiLabel(null)).toBe("—");
  });
});
