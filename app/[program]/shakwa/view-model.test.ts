/**
 * Ember shakwa: memeriksa `view-model.ts` melawan respons ASLI `rekap/shakwa`
 * yang ditangkap 3 Sep 2026 (`lib/maahir/__fixtures__/shakwa.json`). Tanpa
 * jaringan, tanpa DB.
 *
 * Yang dijaga di sini bukan "apakah fixture-nya begini" melainkan tiga janji
 * halaman: (1) angka kepala tetap milik upstream, (2) tidak ada isi tiket yang
 * dipotong, (3) label periode datang dari `meta`, bukan dari nama bulan.
 *
 * Catatan: `vitest.config.ts` hanya menyertakan `lib/**\/*.test.ts`, jadi berkas
 * ini tidak ikut `pnpm vitest run` biasa. Jalankan dengan config sekali pakai:
 *   npx vitest run --config <(printf '%s' 'export default { test: { include: ["app/**\/*.test.ts"] }, resolve: { alias: { "@": process.cwd() } } }')
 * atau pindahkan modulnya ke `lib/maahir/` saat layar rekap dikonsolidasikan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { periodLabel } from "@/lib/maahir/rekap";
import type { MaahirRekapEnvelope, MaahirShakwaPayload } from "@/lib/maahir/types";
import {
  belumDitangani,
  fetchedAtLabel,
  filterTickets,
  jawabanEntries,
  kategoriBuckets,
  kategoriOptions,
  sortTickets,
  statusBuckets,
  waktuWib,
} from "./view-model";

const envelope = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "..", "lib", "maahir", "__fixtures__", "shakwa.json"),
    "utf8",
  ),
) as MaahirRekapEnvelope<MaahirShakwaPayload>;

const payload = envelope.data;

describe("kategoriBuckets", () => {
  it("mengurut terbesar dulu dan menjumlah persis payload", () => {
    const buckets = kategoriBuckets(payload);
    expect(buckets.length).toBe(payload.perKategori.length);
    expect(buckets.map((b) => b.jumlah)).toEqual(
      [...buckets.map((b) => b.jumlah)].sort((a, b) => b - a),
    );
    const total = buckets.reduce((s, b) => s + b.jumlah, 0);
    expect(total).toBe(payload.total);
    expect(buckets[0].label).toBe("Peserta");
  });

  it("tidak menambah kategori yang tidak dikirim upstream", () => {
    const keys = kategoriBuckets(payload).map((b) => b.key);
    // Delapan kategori ada di tipe; jendela ini cuma memuat empat.
    expect(keys).not.toContain("tali_kasih");
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("statusBuckets", () => {
  it("mempertahankan urutan alur kerja upstream, nol sekalipun", () => {
    const buckets = statusBuckets(payload);
    expect(buckets.map((b) => b.key)).toEqual(
      payload.perStatus.map((s) => s.status),
    );
    // "Diproses" 0 tetap muncul: tahap kosong adalah informasi, bukan baris hilang.
    expect(buckets.find((b) => b.key === "in_review")?.jumlah).toBe(0);
    expect(buckets.find((b) => b.key === "submitted")?.tone).toBe("danger");
  });
});

describe("angka kepala tetap milik upstream", () => {
  it("belumDitangani dari payload, bukan hitungan ulang items", () => {
    const derived = payload.items.filter(belumDitangani).length;
    // Pada tangkapan ini keduanya cocok (12). Yang dijaga: halaman memakai
    // payload.belumDitangani, sehingga kalau upstream mengubah definisinya
    // dashboard ikut berubah, bukan berselisih diam-diam.
    expect(payload.belumDitangani).toBe(12);
    expect(derived).toBe(payload.belumDitangani);
  });
});

describe("filter + urutan antrean", () => {
  it("menyaring status dan kategori tanpa membuang tiket lain", () => {
    const belum = filterTickets(payload.items, { status: "belum", kategori: "semua" });
    const selesai = filterTickets(payload.items, { status: "selesai", kategori: "semua" });
    expect(belum.length + selesai.length).toBe(payload.items.length);
    expect(belum.length).toBe(payload.belumDitangani);

    const izin = filterTickets(payload.items, { status: "semua", kategori: "izin" });
    expect(izin.length).toBe(
      payload.perKategori.find((k) => k.kategori === "izin")?.jumlah,
    );
    expect(izin.every((t) => t.kategori === "izin")).toBe(true);
  });

  it("menaruh tiket belum ditangani di atas, lalu terbaru dulu", () => {
    const sorted = sortTickets(payload.items);
    expect(sorted.length).toBe(payload.items.length);
    const firstDone = sorted.findIndex((t) => !belumDitangani(t));
    expect(firstDone).toBe(payload.belumDitangani);
    const open = sorted.slice(0, firstDone).map((t) => t.createdAt);
    expect(open).toEqual([...open].sort().reverse());
  });

  it("tidak memotong isi tiket", () => {
    const terpanjang = [...payload.items].sort((a, b) => b.isi.length - a.isi.length)[0];
    const lewat = sortTickets(payload.items).find((t) => t.id === terpanjang.id);
    expect(lewat?.isi).toBe(terpanjang.isi);
    expect(terpanjang.isi.length).toBeGreaterThan(200);
  });
});

describe("jawaban + opsi kategori", () => {
  it("mengubah kunci snake_case jadi label yang terbaca", () => {
    const dengan = payload.items.find((t) => Object.keys(t.jawaban).length > 0);
    expect(dengan).toBeDefined();
    const entries = jawabanEntries(dengan!);
    expect(entries[0].label).toBe("Sudah info koordinator");
    expect(entries[0].value).toBe(dengan!.jawaban[entries[0].key]);
  });

  it("jawaban kosong tidak menghasilkan baris", () => {
    const kosong = payload.items.find((t) => Object.keys(t.jawaban).length === 0);
    expect(jawabanEntries(kosong!)).toEqual([]);
  });

  it("opsi kategori = kategori yang benar-benar ada", () => {
    expect(kategoriOptions(payload).map((o) => o.value)).toEqual(
      kategoriBuckets(payload).map((b) => b.key),
    );
  });
});

describe("periode dan waktu", () => {
  it("label periode dari meta, bukan nama bulan", () => {
    // meta = 28 Jul .. 27 Agu — jendela 28→27, bukan "Agustus 2026".
    expect(periodLabel(envelope.meta)).toBe("28 Jul – 27 Agu 2026");
    expect(periodLabel(envelope.meta)).not.toMatch(/Agustus/);
  });

  it("waktu dicetak dalam WIB tanpa bergantung TZ server", () => {
    expect(waktuWib("2026-08-27T08:48:51.034Z")).toBe("27 Agu 2026 · 15:48 WIB");
    expect(waktuWib("2026-08-26", false)).toBe("26 Agu 2026");
    expect(waktuWib(null)).toBeNull();
  });

  it("cap terakhir ditarik menyebut umurnya", () => {
    const now = new Date("2026-09-03T10:00:00.000Z");
    const dua = new Date("2026-09-03T08:00:00.000Z");
    expect(fetchedAtLabel(dua, now)).toBe("3 Sep 2026 · 15:00 WIB (2 jam lalu)");
    expect(fetchedAtLabel(new Date("2026-09-01T10:00:00.000Z"), now)).toContain("2 hari lalu");
  });
});
