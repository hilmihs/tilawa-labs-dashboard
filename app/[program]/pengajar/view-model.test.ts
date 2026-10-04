/**
 * Tes tab matrix, dijalankan terhadap tangkapan ASLI `rekap/matrix-guru`
 * (3 Sep 2026, 178 pengajar) supaya aturan "null bukan nol" diuji pada data yang
 * memang penuh null, bukan pada contoh buatan yang rapi.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MaahirMatrixPayload } from "@/lib/maahir/types";
import {
  KELOMPOK_KOMPONEN,
  buildMatrixView,
  ditarikLabel,
  formatSkor,
  labelBulan,
  nilaiKomponen,
  rataRata,
  skorTone,
  tanggalSnapshot,
} from "./view-model";

const fixture = JSON.parse(
  readFileSync(new URL("../../../lib/maahir/__fixtures__/matrix-guru.json", import.meta.url), "utf8"),
) as { data: MaahirMatrixPayload };

const payload = fixture.data;

/** Peta halaqah untuk tiga pengajar pertama — meniru satu batch kecil. */
function petaTiga(): Map<string, number> {
  return new Map(payload.pengajar.slice(0, 3).map((p, i) => [p.pengajar_id, i + 1]));
}

describe("buildMatrixView", () => {
  it("hanya menyimpan pengajar yang ada di peta halaqah batch", () => {
    const view = buildMatrixView(payload, petaTiga());
    expect(payload.pengajar.length).toBeGreaterThan(100); // upstream memang se-HITS
    expect(view.rows).toHaveLength(3);
    expect(view.totalUpstream).toBe(payload.pengajar.length);
  });

  it("peta kosong menghasilkan nol baris, BUKAN seluruh HITS", () => {
    // Kalau ini jebol, tiap koordinator melihat 178 baris milik orang lain.
    const view = buildMatrixView(payload, new Map());
    expect(view.rows).toHaveLength(0);
    expect(view.totalUpstream).toBe(payload.pengajar.length);
  });

  it("payload kosong tidak melempar dan tidak mengarang baris", () => {
    expect(buildMatrixView(null, petaTiga()).rows).toHaveLength(0);
    expect(buildMatrixView({ pengajar: [] }, petaTiga()).rows).toHaveLength(0);
  });

  it("membawa jumlah halaqah batch, bukan jumlah halaqah upstream", () => {
    const view = buildMatrixView(payload, petaTiga());
    expect(view.rows.map((r) => r.halaqahDiBatch)).toEqual([1, 2, 3]);
  });

  it("menghitung pengajar batch yang sama sekali tidak ada di snapshot", () => {
    const peta = petaTiga();
    peta.set("pengajar-yang-tidak-ada-di-snapshot", 4);
    const view = buildMatrixView(payload, peta);
    expect(view.rows).toHaveLength(3);
    expect(view.ringkas.tidakDiSnapshot).toBe(1);
  });

  it("rata-rata program mengabaikan yang belum dinilai", () => {
    const view = buildMatrixView(payload, petaTiga());
    const dinilai = view.rows.filter((r) => !r.belumDinilai);
    expect(view.ringkas.dinilai).toBe(dinilai.length);
    if (dinilai.length > 0) {
      expect(view.ringkas.rataProgram).toBeCloseTo(
        dinilai.reduce((n, r) => n + (r.rataKeseluruhan ?? 0), 0) / dinilai.length,
      );
    }
  });

  it("skor null tetap null di baris — tidak pernah diubah jadi 0", () => {
    // Di tangkapan ini skor_hafalan null pada hampir semua pengajar.
    const semua = buildMatrixView(
      payload,
      new Map(payload.pengajar.map((p) => [p.pengajar_id, 1])),
    );
    const adaNull = semua.rows.some((r) => nilaiKomponen(r.skor, "skor_hafalan") === null);
    expect(adaNull).toBe(true);
    expect(semua.rows.every((r) => nilaiKomponen(r.skor, "skor_hafalan") !== 0)).toBe(true);
  });

  it("teguran 0 tetap 0 — cacahan, bukan skor", () => {
    const semua = buildMatrixView(
      payload,
      new Map(payload.pengajar.map((p) => [p.pengajar_id, 1])),
    );
    const punyaBaris = semua.rows.filter((r) => r.skor !== null);
    expect(punyaBaris.some((r) => r.teguranKumulatif === 0)).toBe(true);
  });
});

describe("format", () => {
  it("null jadi tanda pisah, bukan 0.0", () => {
    expect(formatSkor(null)).toBe("—");
    expect(formatSkor(undefined)).toBe("—");
    expect(formatSkor(0)).toBe("0.0"); // nol yang sungguhan tetap dicetak
    expect(formatSkor(3.32)).toBe("3.3");
  });

  it("null diberi warna netral, bukan merah", () => {
    expect(skorTone(null)).toBe("neutral");
    expect(skorTone(0)).toBe("danger");
    expect(skorTone(4)).toBe("success");
  });

  it("rataRata mengabaikan null dan mengembalikan null saat kosong", () => {
    expect(rataRata([])).toBeNull();
    expect(rataRata([null, undefined])).toBeNull();
    expect(rataRata([2, null, 4])).toBe(3);
  });

  it("nilaiKomponen menolak field non-angka", () => {
    const skor = payload.pengajar[0].matrix;
    expect(nilaiKomponen(skor, "year_month" as never)).toBeNull();
    expect(nilaiKomponen(null, "skor_bacaan")).toBeNull();
  });

  it("tanggalSnapshot memotong string ISO, tidak lewat Date", () => {
    expect(tanggalSnapshot("2026-09-01T13:30:41.935Z")).toBe("1 Sep 2026");
    expect(tanggalSnapshot(null)).toBeNull();
    expect(tanggalSnapshot("bukan tanggal")).toBeNull();
  });

  it("labelBulan hanya untuk pemilih bulan", () => {
    expect(labelBulan("2026-08")).toBe("Agustus 2026");
    expect(labelBulan("ngawur")).toBe("ngawur");
  });

  it("ditarikLabel menyebut umur data", () => {
    const at = new Date("2026-09-03T08:21:41Z");
    expect(ditarikLabel(at, new Date("2026-09-03T08:22:41Z"))).toContain("1 menit lalu");
    expect(ditarikLabel(at, new Date("2026-09-03T10:21:41Z"))).toContain("2 jam lalu");
    expect(ditarikLabel(at, new Date("2026-09-05T08:21:41Z"))).toContain("2 hari lalu");
  });
});

describe("susunan komponen", () => {
  it("setiap key komponen benar-benar ada di payload upstream", () => {
    // Menjaga kolom rapor tidak mengarang field yang tidak pernah dikirim.
    const contoh = payload.pengajar.find((p) => p.matrix !== null)?.matrix;
    expect(contoh).toBeTruthy();
    for (const kelompok of KELOMPOK_KOMPONEN) {
      expect(contoh).toHaveProperty(kelompok.rata);
      for (const k of kelompok.komponen) expect(contoh).toHaveProperty(k.key);
    }
  });
});
