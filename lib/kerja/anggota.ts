/**
 * Kelola daftar pengurus logbook (/operating-office/pengurus): isi awal dari
 * lembar kertas, tambah/aktif/urutan, dan pasang/cabut chip NFC. Aturan
 * pencocokan nama murni ada di ./anggota-view.ts.
 *
 * `oleh` diterima demi kontrak aksi, tapi kerja_anggota belum punya kolom
 * pencatat — yang tercatat hanya created_at.
 */
import { and, asc, eq, ilike, isNull, max, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kartuNfc, kerjaAnggota, orang } from "@/lib/db/schema";
import { namaKunci } from "@/lib/hadir/nama";
import { getOrangById, insertOrang } from "@/lib/hadir/queries";
import { getKantor } from "@/lib/kantor/queries";
import { anggotaUntuk, pilihOrang, uidSah, urutanBaru, type Calon } from "./anggota-view";
import { PENGURUS_AWAL } from "./pengurus-awal";
import { listAnggota, normalUid } from "./queries";

export type Hasil = { ok: true } | { ok: false; error: string };

export type KandidatAwal = { id: string; nama: string; kategori: string; kodeQr: string };
export type HasilIsiAwal = {
  tertaut: number;
  dibuat: number;
  sudahAda: number;
  /** Nama kertas yang tidak ditebak; `indeks` = posisi di PENGURUS_AWAL (untuk tautkanAwal). */
  ambigu: { indeks: number; nama: string; gender: string; kandidat: KandidatAwal[] }[];
};

type CalonDb = Calon & { kategori: string; kodeQr: string };

async function calonOrang(): Promise<CalonDb[]> {
  return (await getDb()
    .select({ id: orang.id, nama: orang.nama, namaKunci: orang.namaKunci, gender: orang.gender, wa: orang.wa, kategori: orang.kategori, kodeQr: orang.kodeQr })
    .from(orang)
    .where(and(isNull(orang.gabungKeId), eq(orang.status, "aktif")))) as CalonDb[];
}

/** Masukkan orang ke daftar; yang sudah ada tidak diubah (urutan & aktif hasil tangan menang). */
async function sisipkan(kantorId: string, orangId: string, urutan: number): Promise<boolean> {
  const r = await getDb()
    .insert(kerjaAnggota)
    .values({ kantorId, orangId, urutan })
    .onConflictDoNothing({ target: [kerjaAnggota.kantorId, kerjaAnggota.orangId] })
    .returning({ id: kerjaAnggota.id });
  return r.length > 0;
}

function orangPengurusBaru(nama: string, gender: "L" | "P") {
  return insertOrang({ nama, gender, kategori: "pengurus", sumber: "dashboard", perluReview: true });
}

/** Kandidat yang punya tautan akun program tertentu (mis. maahir · syaikh). */
async function denganTautan(ids: string[], t: { sumber: string; peran: string }): Promise<string[]> {
  if (ids.length === 0) return [];
  const r = await getDb().execute(sql`
    select distinct orang_id from orang_tautan
    where sumber = ${t.sumber} and peran = ${t.peran} and orang_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  return (r.rows as { orang_id: string }[]).map((x) => x.orang_id);
}

/**
 * Isi daftar dari PENGURUS_AWAL, berurutan (urutan = indeks). Idempoten: nama
 * yang sudah terwakili anggota — termasuk yang dulu dipilih tangan — dilewati;
 * nama ambigu tidak ditebak dan dilaporkan dengan kandidatnya.
 */
export async function isiDaftarAwal(oleh: string): Promise<HasilIsiAwal> {
  return berurutan(() => isiDaftarAwalInti());
}

/**
 * Dua tab / permintaan yang diulang bisa menjalankan isi-awal berbarengan dan
 * sama-sama membuat orang baru untuk nama yang sama. Kunci advisory menahan
 * pemanggil kedua sampai yang pertama selesai; sesudah itu ia membaca daftar
 * yang sudah terisi dan melewati nama tadi.
 */
async function berurutan<T>(f: () => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4207290)`);
    return f();
  });
}

async function isiDaftarAwalInti(): Promise<HasilIsiAwal> {
  const k = await getKantor();
  const semua = await calonOrang();
  const perId = new Map(semua.map((o) => [o.id, o]));
  const anggota = (await listAnggota({ termasukNonaktif: true })).flatMap((a) => perId.get(a.orangId) ?? []);
  const hasil: HasilIsiAwal = { tertaut: 0, dibuat: 0, sudahAda: 0, ambigu: [] };

  for (const [indeks, p] of PENGURUS_AWAL.entries()) {
    if (anggotaUntuk(p.nama, p.gender, anggota)) {
      hasil.sudahAda++;
      continue;
    }
    let pilih = pilihOrang(p.nama, p.gender, semua);
    if (pilih.jenis === "ambigu" && p.petunjuk) {
      const cocok = await denganTautan((pilih.kandidat as CalonDb[]).map((c) => c.id), p.petunjuk);
      if (cocok.length === 1) pilih = { jenis: "pakai", orang: (pilih.kandidat as CalonDb[]).find((c) => c.id === cocok[0])! };
    }
    if (pilih.jenis === "ambigu") {
      hasil.ambigu.push({
        indeks,
        nama: p.nama,
        gender: p.gender,
        kandidat: (pilih.kandidat as CalonDb[]).slice(0, 8).map((c) => ({ id: c.id, nama: c.nama, kategori: c.kategori, kodeQr: c.kodeQr })),
      });
      continue;
    }
    let o: CalonDb;
    if (pilih.jenis === "pakai") o = pilih.orang as CalonDb;
    else {
      const b = await orangPengurusBaru(p.nama, p.gender);
      o = { id: b.id, nama: b.nama, namaKunci: b.namaKunci, gender: b.gender, wa: b.wa, kategori: b.kategori, kodeQr: b.kodeQr };
      semua.push(o);
      hasil.dibuat++;
    }
    if (await sisipkan(k.id, o.id, indeks)) {
      if (pilih.jenis === "pakai") hasil.tertaut++;
    } else hasil.sudahAda++;
    anggota.push(o);
  }
  return hasil;
}

/** Keputusan tangan untuk nama ambigu: orang yang dipilih, atau orang baru dari nama kertas. */
export async function tautkanAwal(indeks: number, orangId: string | "baru", oleh: string): Promise<Hasil> {
  const p = PENGURUS_AWAL[indeks];
  if (!p) return { ok: false, error: "Nama daftar awal tidak dikenal." };
  const k = await getKantor();
  let target = orangId;
  if (orangId === "baru") {
    // Klik ganda / dua tab: jangan sampai "Salma" dibuat dua kali — periksa dan buat di bawah kunci yang sama.
    const baru = await berurutan(async () => {
      const perId = new Map((await calonOrang()).map((o) => [o.id, o]));
      const anggota = (await listAnggota({ termasukNonaktif: true })).flatMap((a) => perId.get(a.orangId) ?? []);
      if (anggotaUntuk(p.nama, p.gender, anggota)) return null;
      const o = (await orangPengurusBaru(p.nama, p.gender)).id;
      await sisipkan(k.id, o, indeks);
      return o;
    });
    return baru ? { ok: true } : { ok: false, error: `${p.nama} sudah ada di daftar.` };
  }
  else {
    const o = await getOrangById(orangId);
    if (!o) return { ok: false, error: "Orang tidak ditemukan." };
    target = o.gabungKeId ?? o.id;
  }
  await sisipkan(k.id, target, indeks);
  return { ok: true };
}

/** Tambah dari pencarian. Anggota nonaktif yang ditambah lagi diaktifkan kembali. */
export async function tambahAnggota(orangId: string, oleh: string): Promise<Hasil> {
  const o = await getOrangById(orangId);
  if (!o) return { ok: false, error: "Orang tidak ditemukan." };
  const id = o.gabungKeId ?? o.id;
  const db = getDb();
  const k = await getKantor();
  const [m] = await db.select({ u: max(kerjaAnggota.urutan) }).from(kerjaAnggota).where(eq(kerjaAnggota.kantorId, k.id));
  await db
    .insert(kerjaAnggota)
    .values({ kantorId: k.id, orangId: id, urutan: (m?.u ?? -1) + 1 })
    .onConflictDoUpdate({ target: [kerjaAnggota.kantorId, kerjaAnggota.orangId], set: { aktif: true } });
  return { ok: true };
}

export async function aturAktif(id: string, aktif: boolean): Promise<Hasil> {
  const k = await getKantor();
  const r = await getDb()
    .update(kerjaAnggota)
    .set({ aktif })
    .where(and(eq(kerjaAnggota.id, id), eq(kerjaAnggota.kantorId, k.id)))
    .returning({ id: kerjaAnggota.id });
  return r.length ? { ok: true } : { ok: false, error: "Anggota tidak ditemukan." };
}

/** Geser di dalam kelompok gender (Ikhwan/Akhwat), urut seperti yang tampil. */
export async function pindahUrutan(id: string, arah: "naik" | "turun"): Promise<Hasil> {
  const semua = await listAnggota({ termasukNonaktif: true });
  const ini = semua.find((a) => a.id === id);
  if (!ini) return { ok: false, error: "Anggota tidak ditemukan." };
  const ubah = urutanBaru(
    semua.filter((a) => a.gender === ini.gender),
    id,
    arah,
  );
  if (ubah.length === 0) return { ok: true };
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const u of ubah) await tx.update(kerjaAnggota).set({ urutan: u.urutan }).where(eq(kerjaAnggota.id, u.id));
  });
  return { ok: true };
}

export type OrangDicari = { id: string; nama: string; gender: string; kategori: string; kodeQr: string; anggota: boolean };

/** Cari orang by nama untuk ditambahkan (maks. 10); `anggota` = sudah aktif di daftar. */
export async function cariOrang(q: string): Promise<OrangDicari[]> {
  const t = q.trim().replace(/\s+/g, " ");
  if (t.length < 2) return [];
  const kunci = namaKunci(t);
  const pola = `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const k = await getKantor();
  const rows = await getDb()
    .select({
      id: orang.id,
      nama: orang.nama,
      gender: orang.gender,
      kategori: orang.kategori,
      kodeQr: orang.kodeQr,
      anggota: sql<boolean>`exists (select 1 from kerja_anggota a where a.orang_id = ${orang.id} and a.kantor_id = ${k.id} and a.aktif)`,
    })
    .from(orang)
    .where(
      and(
        isNull(orang.gabungKeId),
        eq(orang.status, "aktif"),
        or(ilike(orang.nama, pola), kunci ? sql`${orang.namaKunci} like ${`%${kunci}%`}` : undefined),
      ),
    )
    // Yang namanya diawali teks pencarian lebih dulu.
    .orderBy(sql`(${orang.namaKunci} like ${`${kunci}%`}) desc`, asc(orang.nama))
    .limit(10);
  return rows;
}

/**
 * Pasang chip NFC ke orang. UID yang masih aktif di orang lain ditolak (cabut
 * dulu di sana); chip aktif lama orang ini dicabut — satu orang satu chip.
 */
export async function pasangNfc(orangId: string, uidRaw: string): Promise<Hasil> {
  const uid = normalUid(uidRaw);
  if (!uidSah(uid)) return { ok: false, error: "UID chip tidak sah — tempelkan kartu ke pembaca atau ketik 8–20 digit hex." };
  const db = getDb();
  const [lain] = await db
    .select({ nama: orang.nama })
    .from(kartuNfc)
    .innerJoin(orang, eq(orang.id, kartuNfc.orangId))
    .where(and(eq(kartuNfc.uid, uid), eq(kartuNfc.aktif, true), ne(kartuNfc.orangId, orangId)))
    .limit(1);
  if (lain) return { ok: false, error: `Chip ini masih terpasang di ${lain.nama}. Cabut dulu di sana.` };
  const [sama] = await db
    .select({ id: kartuNfc.id })
    .from(kartuNfc)
    .where(and(eq(kartuNfc.uid, uid), eq(kartuNfc.aktif, true), eq(kartuNfc.orangId, orangId)))
    .limit(1);
  if (sama) return { ok: true };
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(kartuNfc)
        .set({ aktif: false, dicabutAt: new Date() })
        .where(and(eq(kartuNfc.orangId, orangId), eq(kartuNfc.aktif, true)));
      await tx.insert(kartuNfc).values({ orangId, uid });
    });
  } catch (e) {
    // Balapan dengan pemasangan lain: indeks unik UID aktif yang menjaga.
    const g = e as { code?: string; cause?: { code?: string } };
    if ((g.code ?? g.cause?.code) === "23505") return { ok: false, error: "Chip ini baru saja dipasang ke orang lain." };
    throw e;
  }
  return { ok: true };
}

export async function cabutNfc(orangId: string): Promise<Hasil> {
  await getDb()
    .update(kartuNfc)
    .set({ aktif: false, dicabutAt: new Date() })
    .where(and(eq(kartuNfc.orangId, orangId), eq(kartuNfc.aktif, true)));
  return { ok: true };
}
