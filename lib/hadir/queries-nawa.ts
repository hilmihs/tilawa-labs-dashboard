/**
 * Tulis tarikan NAWA ke DB: acara `nawa-<slug>` (seri kajian-lipia-nawa),
 * orang + orang_tautan, acara_pendaftaran, acara_hadir metode 'nawa', dan
 * acara_peserta_cache (payload sudah dipangkas dari data pribadi).
 *
 * Idempoten: tarik kedua menemukan setiap peserta lewat orang_tautan, jadi nol
 * orang baru. Pendaftaran/hadir bersumber 'nawa' yang sudah hilang dari NAWA
 * (dinonaktifkan panitia, scan dibatalkan) dicabut; baris sumber lain tidak disentuh.
 * Atribut orang hanya DILENGKAPI bila kosong — tidak pernah menimpa isian lain.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { acara, acaraHadir, acaraPendaftaran, acaraPesertaCache, orang, orangTautan } from "@/lib/db/schema";
import { NawaError, pesanNawaError, tarikNawa, tarikSemuaNawa } from "@/lib/integrations/nawa/client";
import type { NawaCachePayload, NawaExport, NawaStatusAcara } from "@/lib/integrations/nawa/types";
import {
  pangkasPayload,
  rencanakanNawa,
  ringkasNawa,
  ringkasRencanaNawa,
  slugAcaraNawa,
  statusAcaraDariNawa,
  type AtributNawa,
  type PetaNawa,
  type RingkasNawa,
  type StatusNawa,
} from "./nawa";
import { insertOrang } from "./queries";

export type HasilSinkronNawa = {
  acaraId: string;
  acaraSlug: string;
  acaraBaru: boolean;
  orangBaru: number;
  cocok: Record<StatusNawa, number>;
  pendaftaran: number;
  hadir: number;
  dicabut: { pendaftaran: number; hadir: number };
  dilewati: number;
  ringkas: RingkasNawa;
  diambilAt: string;
};

async function petaNawa(nawaSlug: string): Promise<PetaNawa> {
  const db = getDb();
  const [tautanRows, orangRows] = await Promise.all([
    db
      .select({ idUpstream: orangTautan.idUpstream, orangId: orangTautan.orangId })
      .from(orangTautan)
      .where(and(eq(orangTautan.sumber, "nawa"), eq(orangTautan.peran, "peserta"), eq(orangTautan.programSlug, nawaSlug))),
    db
      .select({ id: orang.id, wa: orang.wa, namaKunci: orang.namaKunci, gender: orang.gender })
      .from(orang)
      .where(and(eq(orang.status, "aktif"), sql`${orang.gabungKeId} is null`)),
  ]);
  // Tautan ke orang yang sudah digabung → ikuti ke orang kanonik.
  const gabung = new Map<string, string>();
  const idTautan = tautanRows.map((t) => t.orangId);
  if (idTautan.length) {
    const rows = await db.select({ id: orang.id, ke: orang.gabungKeId }).from(orang).where(inArray(orang.id, idTautan));
    for (const r of rows) if (r.ke) gabung.set(r.id, r.ke);
  }
  const tautan = new Map(tautanRows.map((t) => [t.idUpstream, gabung.get(t.orangId) ?? t.orangId]));
  const byWa = new Map<string, string>();
  const byNamaKunci = new Map<string, { id: string; gender: string }[]>();
  for (const r of orangRows) {
    if (r.wa) byWa.set(r.wa, r.id);
    const arr = byNamaKunci.get(r.namaKunci) ?? [];
    arr.push({ id: r.id, gender: r.gender });
    byNamaKunci.set(r.namaKunci, arr);
  }
  return { tautan, byWa, byNamaKunci };
}

/** Lengkapi atribut yang masih kosong. WA hanya bila nomor itu belum dipegang orang lain. */
async function lengkapiOrang(orangId: string, a: AtributNawa, waBoleh: boolean): Promise<void> {
  const db = getDb();
  const set = {
    qism: sql`coalesce(${orang.qism}, ${a.qism})`,
    mustawa: sql`coalesce(${orang.mustawa}, ${a.mustawa})`,
    fatroh: sql`coalesce(${orang.fatroh}, ${a.fatroh})`,
    asalSekolah: sql`coalesce(${orang.asalSekolah}, ${a.asalSekolah})`,
    email: sql`coalesce(${orang.email}, ${a.email})`,
    updatedAt: new Date(),
  };
  if (!a.qism && !a.mustawa && !a.fatroh && !a.asalSekolah && !a.email && !(waBoleh && a.wa)) return;
  try {
    await db
      .update(orang)
      .set(waBoleh && a.wa ? { ...set, wa: sql`coalesce(${orang.wa}, ${a.wa})` } : set)
      .where(eq(orang.id, orangId));
  } catch {
    // WA bentrok (unik parsial) → lengkapi tanpa WA.
    await db.update(orang).set(set).where(eq(orang.id, orangId));
  }
}

async function buatOrang(a: AtributNawa, perluReview: boolean): Promise<string> {
  const db = getDb();
  const dasar = { nama: a.nama, gender: a.gender, email: a.email, programTeks: null, kategori: "umum", sumber: "nawa" };
  const o = await insertOrang({ ...dasar, wa: a.wa, perluReview }).catch((e) => {
    console.error("nawa: insert orang gagal, ulang tanpa wa", e instanceof Error ? e.message : e);
    return insertOrang({ ...dasar, wa: null, perluReview: true });
  });
  await db
    .update(orang)
    .set({ qism: a.qism, mustawa: a.mustawa, fatroh: a.fatroh, asalSekolah: a.asalSekolah })
    .where(eq(orang.id, o.id));
  return o.id;
}

async function simpanGalat(acaraId: string, pesan: string): Promise<void> {
  const db = getDb();
  await db
    .update(acaraPesertaCache)
    .set({ galatTerakhir: pesan.slice(0, 500), galatAt: new Date() })
    .where(eq(acaraPesertaCache.acaraId, acaraId));
}

function potong<T>(arr: readonly T[], n = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Program NAWA berjenis selain "acara" (kelas, seleksi, …) tidak dicampur ke seri kajian. */
function seriNawa(jenis: string | undefined): string {
  return !jenis || jenis === "acara" ? "kajian-lipia-nawa" : `nawa-${jenis}`;
}

/**
 * Tarik satu program NAWA dan tulis. Gagal tarik → galat dicatat di cache
 * (payload lama tetap) lalu galatnya dilempar ulang untuk pemanggil.
 * `pra` = data yang sudah ditarik lewat /api/export/semua (tanpa tarik ulang).
 */
export async function sinkronNawa(nawaSlug: string, pra?: NawaExport): Promise<HasilSinkronNawa> {
  if (SLUG_NAWA_BUKAN_KEGIATAN.includes(nawaSlug)) {
    throw new NawaError(-1, `Program NAWA "${nawaSlug}" adalah data latihan/dummy dan tidak disalin ke dashboard.`);
  }
  const db = getDb();
  let data;
  try {
    data = pra ?? (await tarikNawa(nawaSlug));
  } catch (e) {
    const [ada] = await db.select({ id: acara.id }).from(acara).where(eq(acara.slug, slugAcaraNawa(nawaSlug))).limit(1);
    if (ada) await simpanGalat(ada.id, e instanceof Error ? e.message : String(e)).catch(() => {});
    throw e;
  }

  const slug = slugAcaraNawa(data.acara.slug);
  const status = statusAcaraDariNawa(data.acara.status);
  let [row] = await db.select({ id: acara.id }).from(acara).where(eq(acara.slug, slug)).limit(1);
  const acaraBaru = !row;
  if (row) {
    await db.update(acara).set({ tanggal: data.acara.tanggal, status, updatedAt: new Date() }).where(eq(acara.id, row.id));
  } else {
    [row] = await db
      .insert(acara)
      .values({ slug, nama: data.acara.nama, tanggal: data.acara.tanggal, status, seri: seriNawa(data.acara.jenis) })
      .returning({ id: acara.id });
  }
  const acaraId = row.id;

  try {
    const peta = await petaNawa(data.acara.slug);
    const { rencana, dilewati } = rencanakanNawa(data, peta);

    const waTerpakai = new Set(peta.byWa.keys());
    const orangBaruDari = new Map<string, string>(); // pesertaId → orang.id yang dibuat
    const orangPeserta = new Map<string, string>(); // pesertaId → orang.id
    let orangBaru = 0;

    for (const r of rencana) {
      let orangId = r.orangId ?? (r.ikutBaru ? orangBaruDari.get(r.ikutBaru) ?? null : null);
      if (!orangId) {
        const waBebas = r.atribut.wa && !waTerpakai.has(r.atribut.wa) ? r.atribut.wa : null;
        orangId = await buatOrang({ ...r.atribut, wa: waBebas }, r.status === "ragu" || (Boolean(r.atribut.wa) && !waBebas));
        if (waBebas) waTerpakai.add(waBebas);
        orangBaruDari.set(r.pesertaId, orangId);
        orangBaru++;
      } else if (r.status !== "baru" && r.status !== "ragu") {
        const waBoleh = Boolean(r.atribut.wa) && !waTerpakai.has(r.atribut.wa!);
        await lengkapiOrang(orangId, r.atribut, waBoleh);
        if (waBoleh) waTerpakai.add(r.atribut.wa!);
      }
      orangPeserta.set(r.pesertaId, orangId);
    }

    const tautanBaru = rencana
      .filter((r) => r.perluTautan)
      .map((r) => ({
        orangId: orangPeserta.get(r.pesertaId)!,
        sumber: "nawa",
        peran: "peserta",
        idUpstream: r.pesertaId,
        programSlug: data.acara.slug,
        namaUpstream: r.atribut.nama,
        metode: r.status === "cocok_wa" ? "hp" : r.status === "cocok_nama" ? "nama" : "baru",
      }));
    for (const c of potong(tautanBaru)) await db.insert(orangTautan).values(c).onConflictDoNothing();

    // Satu orang bisa punya dua pendaftaran NAWA (daftar ganda): yang masih memegang kursi menang.
    const daftar = new Map<string, "bisa" | "belum_bisa">();
    const hadir = new Map<string, string>();
    for (const r of rencana) {
      const o = orangPeserta.get(r.pesertaId)!;
      if (r.konfirmasi === "bisa" || !daftar.has(o)) daftar.set(o, r.konfirmasi ?? "bisa");
      if (r.hadirAt) {
        const lama = hadir.get(o);
        if (!lama || r.hadirAt < lama) hadir.set(o, r.hadirAt);
      }
    }
    const sekarang = new Date();
    for (const c of potong([...daftar])) {
      await db
        .insert(acaraPendaftaran)
        .values(c.map(([orangId, konfirmasi]) => ({ acaraId, orangId, konfirmasi, sumber: "nawa", dijawabAt: sekarang })))
        .onConflictDoUpdate({
          target: [acaraPendaftaran.acaraId, acaraPendaftaran.orangId],
          set: { konfirmasi: sql`excluded.konfirmasi`, sumber: sql`excluded.sumber` },
        });
    }
    for (const c of potong([...hadir])) {
      await db
        .insert(acaraHadir)
        .values(c.map(([orangId, waktu]) => ({ acaraId, orangId, waktu: new Date(waktu), metode: "nawa", klienId: `nawa:${orangId}` })))
        .onConflictDoNothing({ target: [acaraHadir.acaraId, acaraHadir.orangId] });
    }

    // Cabut yang sudah hilang dari NAWA — hanya baris bersumber NAWA.
    const idDaftar = [...daftar.keys()];
    const idHadir = [...hadir.keys()];
    const cabutDaftar = await db
      .delete(acaraPendaftaran)
      .where(and(eq(acaraPendaftaran.acaraId, acaraId), eq(acaraPendaftaran.sumber, "nawa"), idDaftar.length ? notInArray(acaraPendaftaran.orangId, idDaftar) : sql`true`))
      .returning({ id: acaraPendaftaran.id });
    const cabutHadir = await db
      .delete(acaraHadir)
      .where(and(eq(acaraHadir.acaraId, acaraId), eq(acaraHadir.metode, "nawa"), idHadir.length ? notInArray(acaraHadir.orangId, idHadir) : sql`true`))
      .returning({ id: acaraHadir.id });

    const payload = pangkasPayload(data);
    await db
      .insert(acaraPesertaCache)
      .values({ acaraId, ditarikAt: new Date(data.diambilAt), payload, galatTerakhir: null, galatAt: null })
      .onConflictDoUpdate({
        target: acaraPesertaCache.acaraId,
        set: { ditarikAt: new Date(data.diambilAt), payload, galatTerakhir: null, galatAt: null },
      });

    return {
      acaraId,
      acaraSlug: slug,
      acaraBaru,
      orangBaru,
      cocok: ringkasRencanaNawa(rencana),
      pendaftaran: daftar.size,
      hadir: hadir.size,
      dicabut: { pendaftaran: cabutDaftar.length, hadir: cabutHadir.length },
      dilewati: dilewati.length,
      ringkas: ringkasNawa(payload),
      diambilAt: data.diambilAt,
    };
  } catch (e) {
    await simpanGalat(acaraId, `tulis gagal: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
    throw e;
  }
}

/**
 * Status program yang ditarik tombol "Tarik semua": semua kecuali `draft`
 * (belum dibuka, peserta kosong) dan `batal`. `selesai` ikut supaya tarikan
 * final program yang baru ditutup tidak terlewat.
 */
export const STATUS_TARIK_SEMUA: readonly NawaStatusAcara[] = ["pendaftaran", "ditutup", "berlangsung", "selesai"];

/**
 * Program NAWA yang BUKAN kegiatan sungguhan. `latihan-scan` = 1.000 peserta
 * dummy untuk gladi petugas gerbang (nawa lib/latihan/data.ts), berstatus
 * "berlangsung" dan disembunyikan di situs NAWA — tapi tetap ikut export. Tarikan
 * pertama 1 Okt 2026 menyalin 988 orang palsu ke direktori dashboard.edu.
 */
export const SLUG_NAWA_BUKAN_KEGIATAN: readonly string[] = ["latihan-scan"];

export type HasilSinkronSemuaNawa = {
  diambilAt: string;
  program: ({ nawaSlug: string; nama: string } & ({ ok: true; hasil: HasilSinkronNawa } | { ok: false; error: string }))[];
};

/**
 * Satu tarikan `/api/export/semua`, lalu tiap program ditulis seperti tarikan
 * satuan. Gagal di satu program tidak menghentikan yang lain; gagal tarik
 * (401/5xx) dilempar karena tidak ada satu program pun yang bisa ditulis.
 */
export async function sinkronSemuaNawa(status: readonly NawaStatusAcara[] = STATUS_TARIK_SEMUA): Promise<HasilSinkronSemuaNawa> {
  const data = await tarikSemuaNawa(status);
  const program: HasilSinkronSemuaNawa["program"] = [];
  for (const p of data.program) {
    const nawaSlug = p.acara.slug;
    if (SLUG_NAWA_BUKAN_KEGIATAN.includes(nawaSlug)) continue;
    try {
      const hasil = await sinkronNawa(nawaSlug, { ...p, diambilAt: data.diambilAt });
      program.push({ nawaSlug, nama: p.acara.nama, ok: true, hasil });
    } catch (e) {
      if (!(e instanceof NawaError)) console.error(`nawa: tulis ${nawaSlug} gagal`, e);
      program.push({ nawaSlug, nama: p.acara.nama, ok: false, error: e instanceof NawaError ? pesanNawaError(e) : "Gagal menulis program ini." });
    }
  }
  return { diambilAt: data.diambilAt, program };
}

export type CacheNawa = {
  ditarikAt: Date;
  galatTerakhir: string | null;
  galatAt: Date | null;
  ringkas: RingkasNawa | null;
  nawaSlug: string | null;
};

export async function getCacheNawa(acaraId: string): Promise<CacheNawa | null> {
  const db = getDb();
  const [r] = await db.select().from(acaraPesertaCache).where(eq(acaraPesertaCache.acaraId, acaraId)).limit(1);
  if (!r) return null;
  const p = r.payload as NawaCachePayload | null;
  const sah = p && Array.isArray(p.peserta) && Array.isArray(p.kehadiran) && p.acara;
  return {
    ditarikAt: r.ditarikAt,
    galatTerakhir: r.galatTerakhir,
    galatAt: r.galatAt,
    ringkas: sah ? ringkasNawa(p) : null,
    nawaSlug: sah ? p.acara.slug : null,
  };
}
