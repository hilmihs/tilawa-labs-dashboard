import { describe, expect, it } from "vitest";
import { adaFinal, hanyaDraft, susunEvaluasi, tilawahUserIdDari, type EvalMentah, type EvalSesi } from "./maahir-view-model";

const sesi = (id: string, jenis: EvalSesi["jenis"], nomor: number, over: Partial<EvalSesi> = {}): EvalSesi => ({
  id, halaqahId: "hits-regular:77", jenis, nomor, tglJadwal: null, surat: null, status: "terkirim", dihapus: false, updatedAt: "2026-09-20T00:00:00Z", createdAt: null, ...over,
});

function mentah(over: Partial<EvalMentah> = {}): EvalMentah {
  return {
    halaqah: [{ id: "hits-regular:77", nama: "HITS 77", gender: "akhwat", pengajarId: "wa:62811", ambangUjian: 65 }],
    pengajar: [{ id: "wa:62811", nama: "Ustadzah A" }],
    peserta: [
      { id: "hits-regular:1", nama: "Aisyah", gender: "akhwat", halaqahId: "hits-regular:77", aktif: true },
      { id: "hits-regular:2", nama: "Fatimah", gender: "akhwat", halaqahId: "hits-regular:77", aktif: true },
      { id: "hits-regular:3", nama: "Belum Dinilai", gender: "akhwat", halaqahId: "hits-regular:77", aktif: true },
    ],
    sesi: [sesi("s1", "qn", 1), sesi("s2", "qn", 2), sesi("s3", "pb", 1), sesi("d1", "qn", 3, { status: "draft" }), sesi("x1", "ujian", 1, { dihapus: true })],
    nilai: [
      { id: "n1", sesiId: "s1", pesertaId: "hits-regular:1", hadir: true, skor: 70, updatedAt: "2026-09-21T00:00:00Z" },
      { id: "n2", sesiId: "s2", pesertaId: "hits-regular:1", hadir: true, skor: 80, updatedAt: "2026-09-22T00:00:00Z" },
      { id: "n3", sesiId: "s3", pesertaId: "hits-regular:1", hadir: true, skor: 90, updatedAt: null },
      { id: "n4", sesiId: "s1", pesertaId: "hits-regular:2", hadir: false, skor: null, updatedAt: null },
      { id: "n5", sesiId: "d1", pesertaId: "hits-regular:2", hadir: true, skor: 99, updatedAt: null },
      { id: "n6", sesiId: "x1", pesertaId: "hits-regular:3", hadir: true, skor: 50, updatedAt: null },
    ],
    rapot: [],
    ...over,
  };
}

describe("susunEvaluasi", () => {
  it("nilai draft ikut tapi ditandai; sesi dihapus tidak pernah dihitung", () => {
    const r = susunEvaluasi(mentah());
    expect(r.peserta.map((p) => p.nama)).toEqual(["Aisyah", "Fatimah"]);
    const [a, f] = r.peserta;
    expect(a.qn).toEqual({ sesi: 2, rata: 75, terakhir: 80, draft: 0 });
    expect(a.pb).toEqual({ sesi: 1, rata: 90, terakhir: 90, draft: 0 });
    expect(a.ujian.sesi).toBe(0);
    expect(a.pengajar).toBe("Ustadzah A");
    expect(a.tilawahUserId).toBe(1);
    expect(adaFinal(a)).toBe(true);
    expect(f.qn).toEqual({ sesi: 1, rata: 99, terakhir: 99, draft: 1 });
    expect(hanyaDraft(f)).toBe(true);
    expect(r.ringkas).toMatchObject({ peserta: 3, pesertaBernilai: 2, pesertaFinal: 1, sesiTerkirim: 3, sesiDraft: 1, nilaiTercatat: 4, nilaiDraft: 1 });
  });

  it("rapot aktif memasukkan peserta walau tanpa nilai sesi; rapot dicabut diabaikan", () => {
    const base = mentah();
    const r = susunEvaluasi(
      mentah({
        nilai: base.nilai.filter((n) => n.id !== "n5"),
        rapot: [
          { id: "r1", halaqahId: "hits-regular:77", pesertaId: "hits-regular:2", jenis: "qn", nilaiAkhir: 60, lulus: false, ambang: 65, status: "aktif", diterbitkanAt: null },
          { id: "r2", halaqahId: "hits-regular:77", pesertaId: "hits-regular:3", jenis: "qn", nilaiAkhir: 90, lulus: true, ambang: 65, status: "dicabut", diterbitkanAt: null },
        ],
      }),
    );
    const f = r.peserta.find((p) => p.nama === "Fatimah");
    expect(f?.rapot).toEqual([{ jenis: "qn", nilaiAkhir: 60, lulus: false, ambang: 65, diterbitkanAt: null }]);
    expect(f?.tidakHadir).toBe(1);
    expect(r.peserta.some((p) => p.nama === "Belum Dinilai")).toBe(false);
    expect(r.ringkas.rapotAktif).toBe(1);
    expect(r.ringkas.rapotLulus).toBe(0);
    expect(r.halaqah[0]).toMatchObject({ peserta: 3, pesertaBernilai: 2, sesiDraft: 1, rapotAktif: 1, sesiTerkirim: { qn: 2, pb: 1, ujian: 0 } });
  });
});

describe("tilawahUserIdDari", () => {
  it("membaca id tilawah dari prefix slug, bukan dari peserta manual", () => {
    expect(tilawahUserIdDari("hits-regular-apr:3764")).toBe(3764);
    expect(tilawahUserIdDari("manual:armalah-12")).toBeNull();
  });
});

describe("susunEvaluasi dengan periode", () => {
  const m = () =>
    mentah({
      sesi: [
        sesi("s1", "qn", 1, { createdAt: "2026-08-20T03:00:00Z" }),
        sesi("s2", "qn", 2, { createdAt: "2026-09-10T03:00:00Z" }),
        sesi("s3", "pb", 1, { createdAt: "2026-10-02T03:00:00Z" }),
      ],
      nilai: [
        { id: "n1", sesiId: "s1", pesertaId: "hits-regular:1", hadir: true, skor: 70, updatedAt: null },
        { id: "n2", sesiId: "s2", pesertaId: "hits-regular:1", hadir: true, skor: 80, updatedAt: null },
        { id: "n3", sesiId: "s3", pesertaId: "hits-regular:2", hadir: true, skor: 90, updatedAt: null },
      ],
      rapot: [
        { id: "r1", halaqahId: "hits-regular:77", pesertaId: "hits-regular:1", jenis: "qn", nilaiAkhir: 75, lulus: true, ambang: 65, status: "aktif", diterbitkanAt: "2026-09-26T05:00:00Z" },
        { id: "r2", halaqahId: "hits-regular:77", pesertaId: "hits-regular:3", jenis: "qn", nilaiAkhir: 50, lulus: false, ambang: 65, status: "aktif", diterbitkanAt: "2026-10-05T05:00:00Z" },
      ],
    });

  it("membuang sesi & rapot sesudah `sampai`, menghitung aktivitas di periode", () => {
    const r = susunEvaluasi(m(), { dari: "2026-09-01", sampai: "2026-09-30" });
    expect(r.peserta.map((p) => p.pesertaId)).toEqual(["hits-regular:1"]);
    expect(r.peserta[0].qn).toMatchObject({ sesi: 2, rata: 75 });
    expect(r.peserta[0].sesiDiPeriode).toBe(1);
    expect(r.ringkas).toMatchObject({ sesiDiPeriode: 1, pesertaDiPeriode: 1, rapotAktif: 1, rapotTerbitDiPeriode: 1 });
    expect(r.halaqah[0].sesiDiPeriode).toBe(1);
  });

  it("tanpa opsi = semua data, aktivitas periode nol", () => {
    const r = susunEvaluasi(m());
    expect(r.peserta).toHaveLength(3);
    expect(r.ringkas.sesiDiPeriode).toBe(0);
    expect(r.ringkas.rapotTerbitDiPeriode).toBe(0);
  });

  it("batas hari memakai WIB: 30 Sep 23.30 WIB masih masuk September", () => {
    const r = susunEvaluasi(
      mentah({
        sesi: [sesi("s9", "qn", 1, { createdAt: "2026-09-30T16:30:00Z" })],
        nilai: [{ id: "n9", sesiId: "s9", pesertaId: "hits-regular:1", hadir: true, skor: 70, updatedAt: null }],
        rapot: [],
      }),
      { dari: "2026-09-01", sampai: "2026-09-30" },
    );
    expect(r.ringkas.sesiDiPeriode).toBe(1);
  });
});
