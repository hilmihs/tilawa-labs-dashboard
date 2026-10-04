import { describe, expect, it } from "vitest";
import { jarakMeter, putuskanAbsen, statusHari, type KantorTitik } from "./aturan";

const KANTOR: KantorTitik = { lat: -6.2700, lng: 106.8400, radiusM: 100 };
const geser = (m: number) => ({ lat: KANTOR.lat! + m / 111_320, lng: KANTOR.lng! });

describe("jarakMeter", () => {
  it("≈ 111 m per 0.001° lintang", () => {
    expect(Math.round(jarakMeter({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }))).toBe(111);
  });
});

describe("statusHari", () => {
  it("mengambil masuk/keluar dari baris hari itu", () => {
    const m = new Date("2026-09-23T01:00:00Z");
    expect(statusHari([{ jenis: "masuk", waktu: m }])).toEqual({ masuk: m, keluar: null });
  });
});

describe("putuskanAbsen", () => {
  const kosong = { masuk: null, keluar: null };
  const pos = (m: number, akurasi = 10) => ({ ...geser(m), akurasi });

  it("masuk di dalam radius diterima, jarak dilaporkan", () => {
    const k = putuskanAbsen("masuk", KANTOR, pos(40), kosong);
    expect(k.ok).toBe(true);
    if (k.ok) expect(Math.round(k.jarakM)).toBe(40);
  });
  it("di luar radius ditolak", () => {
    expect(putuskanAbsen("masuk", KANTOR, pos(300), kosong)).toMatchObject({ ok: false, alasan: "di-luar-radius" });
  });
  it("akurasi dipakai sebagai kelonggaran, dipagari 50 m", () => {
    expect(putuskanAbsen("masuk", KANTOR, pos(140, 45), kosong).ok).toBe(true); // 140-45 = 95
    expect(putuskanAbsen("masuk", KANTOR, pos(170, 200), kosong).ok).toBe(false); // 170-50 = 120
  });
  it("akurasi > 500 m ditolak sebagai akurasi buruk", () => {
    expect(putuskanAbsen("masuk", KANTOR, pos(0, 900), kosong)).toMatchObject({ ok: false, alasan: "akurasi-buruk" });
  });
  it("kantor tanpa titik menolak semuanya", () => {
    expect(putuskanAbsen("masuk", { lat: null, lng: null, radiusM: 100 }, pos(0), kosong))
      .toMatchObject({ ok: false, alasan: "kantor-belum-disetel" });
  });
  it("posisi tidak sah ditolak", () => {
    expect(putuskanAbsen("masuk", KANTOR, { lat: NaN, lng: 0, akurasi: 5 }, kosong))
      .toMatchObject({ ok: false, alasan: "posisi-tidak-sah" });
  });
  it("urutan harian: keluar tanpa masuk, masuk dua kali, keluar dua kali", () => {
    const t = new Date();
    expect(putuskanAbsen("keluar", KANTOR, pos(0), kosong)).toMatchObject({ alasan: "belum-masuk" });
    expect(putuskanAbsen("masuk", KANTOR, pos(0), { masuk: t, keluar: null })).toMatchObject({ alasan: "sudah-masuk" });
    expect(putuskanAbsen("keluar", KANTOR, pos(0), { masuk: t, keluar: t })).toMatchObject({ alasan: "sudah-keluar" });
    expect(putuskanAbsen("keluar", KANTOR, pos(0), { masuk: t, keluar: null }).ok).toBe(true);
  });
});
