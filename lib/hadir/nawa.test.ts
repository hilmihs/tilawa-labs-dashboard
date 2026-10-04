import { describe, expect, it } from "vitest";
import type { NawaExport, NawaPeserta } from "@/lib/integrations/nawa/types";
import { pangkasPayload, rencanakanNawa, ringkasNawa, ringkasRencanaNawa, statusAcaraDariNawa, type PetaNawa } from "./nawa";

function peserta(v: Partial<NawaPeserta> & { id: string; nama: string }): NawaPeserta {
  return {
    nomor: "A-001", gender: "akhwat", wa: null, email: null, statusLipia: "mahasiswa", nim: "123", prodi: null, sesi: null,
    semester: null, tahunLulus: null, domisili: "Jakarta", asalDaerah: null, asalSekolah: null, keahlian: null, transportasi: null,
    kebutuhanKhusus: "kursi roda", jenis: "pra", sumber: "web", aktif: true, konfirmasi: null, konfirmasiAt: null, tiketDibukaAt: null,
    grupWaAt: null, urutOts: null, izinOtsAt: null, catatan: "rahasia panitia", createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z",
    ...v,
  };
}

const kosong: PetaNawa = { tautan: new Map(), byWa: new Map(), byNamaKunci: new Map() };

function ekspor(p: NawaPeserta[], kehadiran: NawaExport["kehadiran"] = []): NawaExport {
  return { acara: { slug: "kajian-2", nama: "Kajian 2", tanggal: "2026-10-04", status: "pendaftaran", kuota: 500 }, diambilAt: "2026-09-29T08:00:00Z", peserta: p, kehadiran };
}

describe("rencanakanNawa", () => {
  it("tautan yang sudah ada menang atas WA", () => {
    const peta: PetaNawa = { ...kosong, tautan: new Map([["p1", "o-tautan"]]), byWa: new Map([["6281234567890", "o-wa"]]) };
    const { rencana } = rencanakanNawa(ekspor([peserta({ id: "p1", nama: "Aisyah", wa: "081234567890" })]), peta);
    expect(rencana[0]).toMatchObject({ status: "tautan", orangId: "o-tautan", perluTautan: false });
  });

  it("cocok WA setelah dinormalkan", () => {
    const peta: PetaNawa = { ...kosong, byWa: new Map([["6281234567890", "o-wa"]]) };
    const { rencana } = rencanakanNawa(ekspor([peserta({ id: "p1", nama: "Aisyah", wa: "+62 812-3456-7890" })]), peta);
    expect(rencana[0]).toMatchObject({ status: "cocok_wa", orangId: "o-wa", perluTautan: true });
  });

  it("nama: tepat satu kandidat bergender sama → cocok; gender beda → baru; >1 → ragu", () => {
    const peta: PetaNawa = {
      ...kosong,
      byNamaKunci: new Map([
        ["aisyah", [{ id: "o1", gender: "P" }]],
        ["ahmad", [{ id: "o2", gender: "P" }]],
        ["fatimah", [{ id: "o3", gender: "P" }, { id: "o4", gender: "P" }]],
      ]),
    };
    const { rencana } = rencanakanNawa(
      ekspor([
        peserta({ id: "p1", nama: "Aisyah" }),
        peserta({ id: "p2", nama: "Ahmad", gender: "ikhwan" }),
        peserta({ id: "p3", nama: "Fatimah" }),
      ]),
      peta,
    );
    expect(rencana.map((r) => [r.status, r.orangId])).toEqual([["cocok_nama", "o1"], ["baru", null], ["ragu", null]]);
  });

  it("dua pendaftaran dengan WA sama = satu orang baru", () => {
    const { rencana } = rencanakanNawa(
      ekspor([peserta({ id: "p1", nama: "Aisyah", wa: "081234567890" }), peserta({ id: "p2", nama: "Aisyah R", wa: "6281234567890" })]),
      kosong,
    );
    expect(rencana[1]).toMatchObject({ status: "baru", ikutBaru: "p1", orangId: null });
    expect(ringkasRencanaNawa(rencana).baru).toBe(1);
  });

  it("melewati peserta nonaktif; batal hadir → belum_bisa; hadir pakai jam HP bila ada", () => {
    const { rencana, dilewati } = rencanakanNawa(
      ekspor(
        [peserta({ id: "p1", nama: "Spam", aktif: false }), peserta({ id: "p2", nama: "Aisyah", konfirmasi: false }), peserta({ id: "p3", nama: "Khadijah" })],
        [{ pesertaId: "p3", acaraId: "x", scannedAt: "2026-10-04T02:10:00Z", clientScannedAt: "2026-10-04T01:55:00Z", gate: "A1", petugas: "budi", metode: "qr", offline: true }],
      ),
      kosong,
    );
    expect(dilewati.map((d) => d.pesertaId)).toEqual(["p1"]);
    expect(rencana.find((r) => r.pesertaId === "p2")?.konfirmasi).toBe("belum_bisa");
    expect(rencana.find((r) => r.pesertaId === "p3")).toMatchObject({ konfirmasi: "bisa", hadirAt: "2026-10-04T01:55:00Z" });
  });

  it("atribut LIPIA: prodi → qism, semester → mustawa, khirrij → khirij", () => {
    const { rencana } = rencanakanNawa(
      ekspor([
        peserta({ id: "p1", nama: "Aisyah", prodi: "Lughah Arabiyyah", semester: "3" }),
        peserta({ id: "p2", nama: "Khadijah", prodi: "Syariah", statusLipia: "khirrij", semester: null }),
      ]),
      kosong,
    );
    expect(rencana[0].atribut).toMatchObject({ qism: "Lughoh", mustawa: "3", gender: "P" });
    expect(rencana[1].atribut).toMatchObject({ qism: "Syariah", mustawa: "khirij" });
  });
});

describe("pangkasPayload & ringkasNawa", () => {
  const d = ekspor(
    [
      peserta({ id: "p1", nama: "A", wa: "081234567890", email: "a@x.id" }),
      peserta({ id: "p2", nama: "B", gender: "ikhwan", jenis: "ots" }),
      peserta({ id: "p3", nama: "C", konfirmasi: false }),
      peserta({ id: "p4", nama: "D", aktif: false }),
    ],
    [{ pesertaId: "p2", acaraId: "x", scannedAt: "2026-10-04T02:00:00Z", clientScannedAt: null, gate: "B", petugas: "budi", metode: "qr", offline: false }],
  );

  it("tidak menyimpan WA, email, NIM, domisili, kebutuhan khusus, catatan, petugas", () => {
    const s = JSON.stringify(pangkasPayload(d));
    for (const bocor of ["081234567890", "a@x.id", "\"nim\"", "Jakarta", "kursi roda", "rahasia panitia", "budi"]) expect(s).not.toContain(bocor);
  });

  it("memakai definisi NAWA", () => {
    expect(ringkasNawa(pangkasPayload(d))).toEqual({
      terdaftar: 2, batalHadir: 1, walkIn: 1, hadir: 1,
      ikhwan: { terdaftar: 1, hadir: 1 }, akhwat: { terdaftar: 1, hadir: 0 }, kuota: 500,
    });
  });

  it("status acara", () => {
    expect(["selesai", "berlangsung", "pendaftaran", "batal"].map(statusAcaraDariNawa)).toEqual(["selesai", "berlangsung", "persiapan", "persiapan"]);
  });
});
