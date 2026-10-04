/**
 * Tarikan NAWA (`GET /api/export`) → rencana tulis orang + pendaftaran + hadir.
 * Murni: peta pencocokan diberi pemanggil (lib/hadir/queries-nawa.ts), supaya
 * aturan pencocokan bisa diuji tanpa DB.
 *
 * Urutan cocok per peserta NAWA:
 *   1. orang_tautan (sumber 'nawa', id peserta NAWA) — tautan yang sudah ada
 *      menang, termasuk yang dikoreksi manusia;
 *   2. WA yang sama;
 *   3. nama_kunci dengan tepat satu kandidat bergender sama;
 *   4. selain itu orang baru (perlu_review bila nama itu punya >1 kandidat).
 * Dua peserta NAWA dengan WA sama (daftar dua kali) = satu orang.
 */
import type {
  NawaCachePayload,
  NawaExport,
  NawaKehadiran,
  NawaPeserta,
} from "@/lib/integrations/nawa/types";
import { normalizePhone } from "@/lib/wa";
import { namaKunci } from "./nama";
import { pecahQism, type Fatroh, type Qism } from "./qism";
import type { Konfirmasi } from "./view-model";

export type PetaNawa = {
  /** id peserta NAWA → orang.id (orang_tautan sumber 'nawa') */
  tautan: ReadonlyMap<string, string>;
  /** wa (62…) → orang.id */
  byWa: ReadonlyMap<string, string>;
  /** nama_kunci → kandidat orang kanonik aktif */
  byNamaKunci: ReadonlyMap<string, readonly { id: string; gender: string }[]>;
};

export type StatusNawa = "tautan" | "cocok_wa" | "cocok_nama" | "baru" | "ragu";

export type AtributNawa = {
  nama: string;
  gender: "L" | "P";
  wa: string | null;
  email: string | null;
  qism: Qism | null;
  mustawa: string | null;
  fatroh: Fatroh | null;
  asalSekolah: string | null;
};

export type RencanaNawa = {
  pesertaId: string;
  status: StatusNawa;
  /** orang yang sudah ada; null → buat baru (atau ikut `ikutBaru`). */
  orangId: string | null;
  /** Peserta NAWA lain di tarikan yang sama yang membuat orang baru untuk WA ini. */
  ikutBaru: string | null;
  /** Belum punya orang_tautan → tulis satu. */
  perluTautan: boolean;
  atribut: AtributNawa;
  konfirmasi: Konfirmasi;
  /** ISO; null = belum hadir. */
  hadirAt: string | null;
};

export function genderNawa(g: string): "L" | "P" | null {
  if (g === "ikhwan") return "L";
  if (g === "akhwat") return "P";
  return null;
}

/** Waktu masuk yang benar: jam HP petugas bila scan offline disinkron belakangan. */
export function waktuHadir(k: Pick<NawaKehadiran, "clientScannedAt" | "scannedAt">): string {
  return k.clientScannedAt ?? k.scannedAt;
}

function teksAtauNull(v: string | null | undefined, max = 200): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
}

export function atributDari(p: NawaPeserta): AtributNawa | null {
  const gender = genderNawa(p.gender);
  const nama = teksAtauNull(p.nama, 120);
  if (!gender || !nama) return null;
  const lipia = pecahQism(p.prodi, { mustawa: p.semester, fatroh: p.sesi });
  const khirij = /^khir+ij$/i.test(String(p.statusLipia ?? "").trim());
  const email = teksAtauNull(p.email, 200);
  return {
    nama,
    gender,
    wa: normalizePhone(p.wa),
    email: email && email.includes("@") ? email.toLowerCase() : null,
    qism: lipia.qism,
    mustawa: khirij ? "khirij" : lipia.mustawa,
    fatroh: lipia.fatroh,
    asalSekolah: teksAtauNull(p.asalSekolah, 200),
  };
}

export type HasilRencanaNawa = { rencana: RencanaNawa[]; dilewati: { pesertaId: string; alasan: string }[] };

export function rencanakanNawa(data: Pick<NawaExport, "peserta" | "kehadiran">, peta: PetaNawa): HasilRencanaNawa {
  const hadir = new Map<string, string>();
  for (const k of data.kehadiran) hadir.set(k.pesertaId, waktuHadir(k));

  const rencana: RencanaNawa[] = [];
  const dilewati: HasilRencanaNawa["dilewati"] = [];
  // WA → peserta pertama di tarikan ini yang memegangnya, supaya daftar ganda tetap satu orang.
  const waDiTarikan = new Map<string, RencanaNawa>();

  for (const p of data.peserta) {
    if (p.aktif === false) {
      dilewati.push({ pesertaId: p.id, alasan: "dinonaktifkan panitia NAWA" });
      continue;
    }
    const atribut = atributDari(p);
    if (!atribut) {
      dilewati.push({ pesertaId: p.id, alasan: `nama/gender tak terbaca (${p.gender})` });
      continue;
    }
    const r: RencanaNawa = {
      pesertaId: p.id,
      status: "baru",
      orangId: null,
      ikutBaru: null,
      perluTautan: true,
      atribut,
      konfirmasi: p.konfirmasi === false ? "belum_bisa" : "bisa",
      hadirAt: hadir.get(p.id) ?? null,
    };

    const viaTautan = peta.tautan.get(p.id);
    if (viaTautan) {
      r.status = "tautan";
      r.orangId = viaTautan;
      r.perluTautan = false;
    } else {
      const viaWa = atribut.wa ? peta.byWa.get(atribut.wa) : undefined;
      const kembar = atribut.wa ? waDiTarikan.get(atribut.wa) : undefined;
      if (viaWa) {
        r.status = "cocok_wa";
        r.orangId = viaWa;
      } else if (kembar) {
        r.status = kembar.status;
        r.orangId = kembar.orangId;
        r.ikutBaru = kembar.orangId ? null : (kembar.ikutBaru ?? kembar.pesertaId);
      } else {
        const kandidat = peta.byNamaKunci.get(namaKunci(atribut.nama)) ?? [];
        if (kandidat.length === 1 && kandidat[0].gender === atribut.gender) {
          r.status = "cocok_nama";
          r.orangId = kandidat[0].id;
        } else if (kandidat.length > 1) {
          r.status = "ragu";
        }
      }
    }
    if (atribut.wa && !waDiTarikan.has(atribut.wa)) waDiTarikan.set(atribut.wa, r);
    rencana.push(r);
  }
  return { rencana, dilewati };
}

export function ringkasRencanaNawa(r: readonly RencanaNawa[]): Record<StatusNawa, number> {
  const out: Record<StatusNawa, number> = { tautan: 0, cocok_wa: 0, cocok_nama: 0, baru: 0, ragu: 0 };
  for (const x of r) if (!x.ikutBaru) out[x.status]++;
  return out;
}

/** Buang data pribadi sebelum disimpan di acara_peserta_cache. */
export function pangkasPayload(d: NawaExport): NawaCachePayload {
  return {
    acara: { slug: d.acara.slug, nama: d.acara.nama, tanggal: d.acara.tanggal, status: d.acara.status, kuota: d.acara.kuota ?? null },
    diambilAt: d.diambilAt,
    peserta: d.peserta.map((p) => ({
      id: p.id,
      nomor: p.nomor,
      nama: p.nama,
      gender: p.gender,
      prodi: p.prodi ?? null,
      statusLipia: p.statusLipia ?? null,
      jenis: p.jenis,
      aktif: p.aktif,
      konfirmasi: p.konfirmasi ?? null,
      createdAt: p.createdAt,
    })),
    kehadiran: d.kehadiran.map((k) => ({
      pesertaId: k.pesertaId,
      scannedAt: k.scannedAt,
      clientScannedAt: k.clientScannedAt ?? null,
      gate: k.gate ?? null,
      metode: k.metode,
      offline: Boolean(k.offline),
    })),
  };
}

export type RingkasNawa = {
  terdaftar: number;
  batalHadir: number;
  walkIn: number;
  hadir: number;
  ikhwan: { terdaftar: number; hadir: number };
  akhwat: { terdaftar: number; hadir: number };
  kuota: number | null;
};

/**
 * Definisi yang dipakai NAWA sendiri: terdaftar = aktif && konfirmasi !== false;
 * batal hadir = aktif && konfirmasi === false; hadir = terdaftar yang punya baris
 * kehadiran; walk-in = jenis 'ots'.
 */
export function ringkasNawa(d: NawaCachePayload): RingkasNawa {
  const aktif = d.peserta.filter((p) => p.aktif && p.konfirmasi !== false);
  const hadirIds = new Set(d.kehadiran.map((k) => k.pesertaId));
  const perGender = (g: string) => ({
    terdaftar: aktif.filter((p) => p.gender === g).length,
    hadir: aktif.filter((p) => p.gender === g && hadirIds.has(p.id)).length,
  });
  return {
    terdaftar: aktif.length,
    batalHadir: d.peserta.filter((p) => p.aktif && p.konfirmasi === false).length,
    walkIn: aktif.filter((p) => p.jenis === "ots").length,
    hadir: aktif.filter((p) => hadirIds.has(p.id)).length,
    ikhwan: perGender("ikhwan"),
    akhwat: perGender("akhwat"),
    kuota: d.acara.kuota ?? null,
  };
}

/** Status acara dashboard dari status NAWA; tanggal & status disegarkan tiap tarik, nama tidak. */
export function statusAcaraDariNawa(s: string): "selesai" | "berlangsung" | "persiapan" {
  if (s === "selesai") return "selesai";
  if (s === "berlangsung") return "berlangsung";
  return "persiapan";
}

export const slugAcaraNawa = (nawaSlug: string) => `nawa-${nawaSlug}`;
