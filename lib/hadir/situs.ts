/**
 * Pintu situs daftar eksternal (Vercel) ke dashboard — `app/api/daftar/*`.
 * Desain: docs/superpowers/specs/2026-09-23-situs-daftar-design.md.
 *
 * Murni (tanpa DB, tanpa next/headers) supaya aturan yang menentukan keamanan —
 * siapa yang boleh masuk, berapa kali, dan field apa yang boleh keluar — bisa
 * diuji langsung.
 */
import { bearerToken, safeEqual } from "@/lib/auth/bearer";
import type { AcaraRow } from "@/lib/acara/types";

/**
 * Satu kredensial: `Authorization: Bearer ${DAFTAR_SITE_TOKEN}`.
 *
 * Gagal tertutup. Token tidak diset / < 24 karakter = setiap rute 401 — itu
 * kill switch-nya: hapus env, restart, situs buta tanpa deploy kode. Batas
 * panjang bukan kosmetik: `timingSafeEqual` atas dua buffer kosong bernilai
 * TRUE, jadi tanpa batas itu env kosong + `Bearer ` kosong akan lolos.
 */
export function situsBolehMasuk(req: Request, env: string | undefined = process.env.DAFTAR_SITE_TOKEN): boolean {
  const secret = (env ?? "").trim();
  if (secret.length < 24) return false;
  const presented = bearerToken(req);
  if (!presented) return false;
  return safeEqual(presented.trim(), secret);
}

/** Batas per pengunjung — sama dengan /daftar/[slug]: satu masjid bisa satu NAT. */
export const BATAS_PER_KLIEN = 30;
/** Rem darurat total per proses: situs dibanjiri → dashboard tetap bernapas. */
export const BATAS_TOTAL = 600;
const JENDELA_MS = 60 * 60_000;

/**
 * Pembatas laju geser 1 jam, in-memory per proses (sama dengan jalur lama).
 * Semua permintaan datang dari IP Vercel, jadi kuncinya `x-klien` — hash IP
 * pengunjung yang dihitung situs dengan garamnya sendiri; dashboard tidak
 * pernah melihat IP aslinya.
 */
export function buatPembatas(now: () => number = Date.now) {
  const per = new Map<string, number[]>();
  const semua: number[] = [];
  const bersihkan = (arr: number[], t: number) => {
    while (arr.length && t - arr[0] >= JENDELA_MS) arr.shift();
  };
  return {
    /** true = ditolak. Hanya permintaan yang diterima yang dihitung. */
    lewat(klien: string): boolean {
      const t = now();
      bersihkan(semua, t);
      const arr = per.get(klien) ?? [];
      bersihkan(arr, t);
      if (arr.length >= BATAS_PER_KLIEN || semua.length >= BATAS_TOTAL) {
        per.set(klien, arr);
        return true;
      }
      arr.push(t);
      semua.push(t);
      per.set(klien, arr);
      return false;
    },
  };
}

/** `x-klien` yang masuk akal (hex/base64url pendek), selain itu satu ember bersama. */
export function kunciKlien(req: Request): string {
  const v = (req.headers.get("x-klien") ?? "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(v) ? v : "tanpa-klien";
}

export type AcaraPublik = {
  slug: string;
  nama: string;
  pemateri: string | null;
  tanggal: string;
  jamMulai: string | null; // "09:30"
  lokasi: string | null;
};

/** Hanya yang boleh dilihat siapa pun di internet. */
export function acaraPublik(a: AcaraRow): AcaraPublik {
  return {
    slug: a.slug,
    nama: a.nama,
    pemateri: a.pemateri ?? null,
    tanggal: a.tanggal,
    jamMulai: a.jamMulai ? a.jamMulai.slice(0, 5) : null,
    lokasi: a.lokasi ?? null,
  };
}

export type KartuPublik = {
  nama: string;
  program: string | null;
  gender: "L" | "P";
  kode: string;
  /** Isi QR: URL halaman kartu di dashboard — bentuk yang dikenali pemindai. */
  qrUrl: string;
};

/**
 * Field kartu untuk situs. Sengaja whitelist, bukan menghapus field sensitif:
 * kolom baru di `orang` (mis. alamat) tidak akan ikut bocor diam-diam.
 * Tanpa WA/email — sama dengan /h/[kode], yang dibagikan lewat grup.
 */
export function kartuPublik(
  o: { nama: string; programTeks: string | null; gender: string; kodeQr: string },
  qrUrl: string,
): KartuPublik {
  return {
    nama: o.nama,
    program: o.programTeks,
    gender: o.gender === "P" ? "P" : "L",
    kode: o.kodeQr,
    qrUrl,
  };
}
