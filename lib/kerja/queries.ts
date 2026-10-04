/**
 * Baca/tulis logbook kehadiran pengurus. Aturan sesi murni ada di ./sesi.ts;
 * di sini hanya pencocokan kartu → orang dan penulisan baris.
 */
import { and, asc, between, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kartuNfc, kerjaAnggota, kerjaHadir, orang, tapArti, tapKartu } from "@/lib/db/schema";
import { ekstrakKode } from "@/lib/hadir/kode";
import { insertHadirBatch } from "@/lib/hadir/queries";
import { getKantor, type Kantor } from "@/lib/kantor/queries";
import { jakartaDate } from "@/lib/time/jakarta";
import { muatKelasTap, tujuanKirim } from "./kelas-tap";
import { bolehKirim, klasifikasiTap } from "./klasifikasi";
import { jamTitik, jamWibDari, sesiDari, waktuTepercaya } from "./sesi";
import { labelKerja, pilihAcara, type AcaraCalon, type ArtiTap } from "./terpadu";
import type { BatasSesi, HasilTap, InputTap, JawabanTap, Sesi, SumberHadir } from "./types";

export function batasKantor(k: Kantor): BatasSesi {
  return { pagiMulai: k.sesiPagiMulai, siangMulai: k.sesiSiangMulai, soreMulai: k.sesiSoreMulai, selesai: k.sesiSelesai };
}

/** UID NFC dinormalkan: huruf besar, tanpa pemisah (04:A2:3F… → 04A23F…). */
export function normalUid(raw: string): string {
  return raw.replace(/[^0-9a-f]/gi, "").toUpperCase();
}

export type Anggota = {
  id: string; // kerja_anggota.id
  orangId: string;
  nama: string;
  gender: string; // 'L' | 'P'
  kodeQr: string;
  bagian: string;
  urutan: number;
  aktif: boolean;
  uidNfc: string | null;
};

/** Anggota logbook, urut Ikhwan dulu lalu Akhwat, lalu `urutan`, lalu nama. */
export async function listAnggota(opts: { termasukNonaktif?: boolean } = {}): Promise<Anggota[]> {
  const db = getDb();
  const k = await getKantor();
  const rows = await db
    .select({
      id: kerjaAnggota.id,
      orangId: orang.id,
      nama: orang.nama,
      gender: orang.gender,
      kodeQr: orang.kodeQr,
      bagian: kerjaAnggota.bagian,
      urutan: kerjaAnggota.urutan,
      aktif: kerjaAnggota.aktif,
      uidNfc: sql<string | null>`(select n.uid from kartu_nfc n where n.orang_id = ${orang.id} and n.aktif order by n.created_at desc limit 1)`,
    })
    .from(kerjaAnggota)
    .innerJoin(orang, eq(orang.id, kerjaAnggota.orangId))
    .where(and(eq(kerjaAnggota.kantorId, k.id), opts.termasukNonaktif ? undefined : eq(kerjaAnggota.aktif, true)))
    .orderBy(asc(orang.gender), asc(kerjaAnggota.urutan), asc(orang.nama));
  return rows;
}

export type BarisHadir = {
  orangId: string;
  tanggal: string;
  sesi: Sesi;
  waktu: Date;
  sumber: SumberHadir;
  catatan: string | null;
};

export async function hadirRentang(dari: string, sampai: string): Promise<BarisHadir[]> {
  const db = getDb();
  const k = await getKantor();
  const rows = await db
    .select({
      orangId: kerjaHadir.orangId,
      tanggal: kerjaHadir.tanggal,
      sesi: kerjaHadir.sesi,
      waktu: kerjaHadir.waktu,
      sumber: kerjaHadir.sumber,
      catatan: kerjaHadir.catatan,
    })
    .from(kerjaHadir)
    .where(and(eq(kerjaHadir.kantorId, k.id), between(kerjaHadir.tanggal, dari, sampai)));
  return rows as BarisHadir[];
}

/** Cari orang dari teks yang dibaca: QR (/h/KODE atau kode mentah) lalu UID NFC. */
async function cariOrang(dibaca: string, metode: InputTap["metode"]) {
  const db = getDb();
  // Orang yang sudah digabung diteruskan ke orang induknya, dari QR maupun chip.
  const induk = async (o: typeof orang.$inferSelect) =>
    o.gabungKeId ? ((await db.select().from(orang).where(eq(orang.id, o.gabungKeId)).limit(1))[0] ?? o) : o;
  const kode = metode === "nfc" ? null : ekstrakKode(dibaca);
  if (kode) {
    const [o] = await db.select().from(orang).where(eq(orang.kodeQr, kode)).limit(1);
    if (o) return induk(o);
  }
  const uid = normalUid(dibaca);
  if (uid.length >= 8) {
    const [n] = await db
      .select({ o: orang })
      .from(kartuNfc)
      .innerJoin(orang, eq(orang.id, kartuNfc.orangId))
      .where(and(eq(kartuNfc.uid, uid), eq(kartuNfc.aktif, true)))
      .limit(1);
    if (n) return induk(n.o);
  }
  return null;
}

/** Siapa yang mengoperasikan kiosk: email untuk jejak logbook, id staff untuk acara_hadir. */
export type OperatorTap = { email: string | null; staffId: string | null };

/**
 * Satu tap dari tautan scan terpadu. Idempoten per `klienId`: antrean offline
 * yang mengirim ulang mendapat jawaban yang sama tanpa baris ganda.
 *
 * Satu tap bisa punya beberapa arti sekaligus, masing-masing dicatat di
 * `tap_arti`:
 * - kerja: anggota logbook + jam di dalam sesi → jam datang sesi itu (tap
 *   PERTAMA per sesi yang dipakai; berikutnya 'sudah').
 * - acara: kegiatan yang jendelanya mencakup jam tap → hadir kegiatan.
 * - mengajar: pengajar kelas offline yang mulai sekitar jam tap → terdeteksi,
 *   'menunggu_sinkron' ke tilawah (penulisan ke tilawah = fase berikutnya).
 * `hasil` tetap menjawab bagian logbook, untuk kompatibilitas panel admin.
 */
export async function catatTap(input: InputTap, oleh: OperatorTap, now = new Date()): Promise<JawabanTap> {
  const db = getDb();
  const k = await getKantor();
  const waktu = waktuTepercaya(input.waktu, now);
  const tanggal = jakartaDate(waktu);

  const ulang = await db.select().from(tapKartu).where(eq(tapKartu.klienId, input.klienId)).limit(1);
  if (ulang[0]) return jawabanDariTap(ulang[0], k.id);

  const o = await cariOrang(input.dibaca, input.metode);
  const dasar = { klienId: input.klienId, kantorId: k.id, dibaca: input.dibaca.slice(0, 200), metode: input.metode, waktu, dicatatOleh: oleh.email };
  if (!o) {
    await db.insert(tapKartu).values({ ...dasar, orangId: null, hasil: "tak_dikenal", sesi: null }).onConflictDoNothing();
    return { hasil: "tak_dikenal", nama: null, gender: null, sesi: null, jam: null, tanggal, arti: [] };
  }

  // ── Kerja (logbook pengurus) ──
  const [anggota] = await db
    .select({ id: kerjaAnggota.id })
    .from(kerjaAnggota)
    .where(and(eq(kerjaAnggota.kantorId, k.id), eq(kerjaAnggota.orangId, o.id), eq(kerjaAnggota.aktif, true)))
    .limit(1);
  const sesi = anggota ? sesiDari(waktu, batasKantor(k)) : null;
  let hasil: HasilTap = !anggota ? "bukan_anggota" : !sesi ? "di_luar_sesi" : "tercatat";
  let jamKerja: Date | null = null;
  if (anggota && sesi) {
    const r = await tulisKerja(k.id, o.id, tanggal, sesi, waktu, input.metode, oleh.email);
    hasil = r.hasil;
    jamKerja = r.jam;
  }

  const [tap] = await db
    .insert(tapKartu)
    .values({ ...dasar, orangId: o.id, hasil, sesi: sesi ?? null })
    .onConflictDoNothing()
    .returning({ id: tapKartu.id });
  // Kiriman ganda yang berbarengan: yang kalah cukup membaca jawaban pemenangnya.
  if (!tap) {
    const [t] = await db.select().from(tapKartu).where(eq(tapKartu.klienId, input.klienId)).limit(1);
    return jawabanDariTap(t, k.id);
  }
  if (hasil === "tercatat" && sesi) {
    await db
      .update(kerjaHadir)
      .set({ tapId: tap.id })
      .where(and(eq(kerjaHadir.kantorId, k.id), eq(kerjaHadir.orangId, o.id), eq(kerjaHadir.tanggal, tanggal), eq(kerjaHadir.sesi, sesi), eq(kerjaHadir.waktu, waktu)));
  }

  const baris: (typeof tapArti.$inferInsert)[] = [];
  if (anggota && sesi && jamKerja) {
    baris.push({ tapId: tap.id, jenis: "kerja", status: hasil === "sudah" ? "sudah" : "tercatat", sesi, label: labelKerja(sesi, jamTitik(jamWibDari(jamKerja)), hasil === "sudah") });
  }

  // ── Kegiatan (acara) ──
  const calon = await acaraCalon(o.id, tanggal);
  const { acara: kegiatan, bentrok } = pilihAcara(calon, waktu);
  if (kegiatan) {
    const metode = input.metode === "ketik" ? "manual" : "qr";
    const ditulis = await insertHadirBatch(kegiatan.id, [{ klienId: input.klienId, orangId: o.id, waktu: waktu.toISOString(), metode }], oleh.staffId);
    const baru = ditulis.has(o.id);
    baris.push({ tapId: tap.id, jenis: "acara", status: baru ? "tercatat" : "sudah", acaraId: kegiatan.id, label: `${baru ? "Hadir" : "Sudah hadir"} · ${kegiatan.nama}` });
  } else if (bentrok.length > 0) {
    baris.push({
      tapId: tap.id,
      jenis: "tak_terpetakan",
      status: "perlu_tinjau",
      label: `${bentrok.length} kegiatan berjalan — pakai pemindai kegiatannya`,
      alasan: bentrok.map((b) => b.nama).join(" · "),
    });
  }

  // ── Kelas tatap muka: mengajar & belajar (tilawah, Maahir, Mabni) ──
  const kelas = await muatKelasTap(o.id, tanggal);
  if (kelas.length > 0) {
    const perId = new Map(kelas.map((x) => [x.konteks.halaqahId, x]));
    const artiKelas = klasifikasiTap(
      { orangId: o.id, waktu, kantorId: k.id, perangkat: "gerbang" },
      {
        kerja: null,
        mengajar: kelas.filter((x) => x.peran === "mengajar").map((x) => x.konteks),
        belajar: kelas.filter((x) => x.peran === "belajar").map((x) => x.konteks),
        adalahPengajar: kelas.some((x) => x.peran === "mengajar"),
      },
    );
    for (const a of artiKelas) {
      if (a.jenis !== "mengajar" && a.jenis !== "badal_mungkin" && a.jenis !== "belajar") continue;
      const kls = a.halaqahId ? perId.get(a.halaqahId) : undefined;
      const nama = kls?.konteks.nama ?? "kelas";
      // Tap kedua di kelas yang sama hari itu tidak membuat kiriman baru.
      const sudah = a.halaqahId ? await kelasSudahTercatat(o.id, a.jenis, a.halaqahId, tanggal, tap.id) : false;
      const tujuan = sudah ? null : tujuanKirim(a, kls, tanggal);
      baris.push({
        tapId: tap.id,
        jenis: a.jenis,
        status: sudah ? "sudah" : tujuan ? "menunggu_sinkron" : bolehKirim(a) ? "tercatat" : "perlu_tinjau",
        halaqahSyncId: a.halaqahId && !a.halaqahId.startsWith("maahir:") ? a.halaqahId : null,
        jadwalId: a.jadwalId ?? null,
        label: a.jenis === "mengajar" ? `Mengajar · ${nama}` : a.jenis === "belajar" ? `Hadir kelas · ${nama}` : `Badal? · ${nama}`,
        alasan: a.alasan,
        sasaran: tujuan?.sasaran ?? null,
        ref: tujuan ? { ...tujuan.ref, waktu: waktu.toISOString() } : a.halaqahId ? { kunci: a.halaqahId } : null,
        kirimSetelah: tujuan?.kirimSetelah ?? null,
      });
    }
  }

  if (baris.length > 0) await db.insert(tapArti).values(baris);
  return {
    hasil,
    nama: o.nama,
    gender: o.gender,
    sesi: sesi ?? null,
    jam: jamKerja ? jamWibDari(jamKerja) : hasil === "di_luar_sesi" ? jamWibDari(waktu) : null,
    tanggal,
    arti: baris.map((b) => ({ jenis: b.jenis as ArtiTap["jenis"], status: b.status as ArtiTap["status"], label: b.label })),
  };
}

/** Arti kelas yang sama (jenis + kelas) sudah tercatat dari tap lain orang ini hari itu? */
async function kelasSudahTercatat(orangId: string, jenis: string, kunci: string, tanggal: string, kecualiTap: string): Promise<boolean> {
  const r = await getDb().execute(sql`
    select 1 from tap_arti a join tap_kartu t on t.id = a.tap_id
    where t.orang_id = ${orangId} and a.jenis = ${jenis} and a.ref->>'kunci' = ${kunci}
      and t.id <> ${kecualiTap}::uuid and (t.waktu at time zone 'Asia/Jakarta')::date = ${tanggal}::date
    limit 1`);
  return r.rows.length > 0;
}

/** Jam datang sesi: tap paling pagi menang, ditegakkan di WHERE supaya dua tap berbarengan tak saling menimpa. */
async function tulisKerja(kantorId: string, orangId: string, tanggal: string, sesi: Sesi, waktu: Date, metode: InputTap["metode"], oleh: string | null) {
  const db = getDb();
  const kunci = and(eq(kerjaHadir.kantorId, kantorId), eq(kerjaHadir.orangId, orangId), eq(kerjaHadir.tanggal, tanggal), eq(kerjaHadir.sesi, sesi));
  const tulis = await db
    .insert(kerjaHadir)
    .values({ kantorId, orangId, tanggal, sesi, waktu, sumber: metode, dicatatOleh: oleh })
    .onConflictDoUpdate({
      target: [kerjaHadir.kantorId, kerjaHadir.orangId, kerjaHadir.tanggal, kerjaHadir.sesi],
      set: { waktu, sumber: metode, catatan: null, dicatatOleh: oleh, updatedAt: new Date() },
      setWhere: sql`${kerjaHadir.waktu} > ${waktu}`,
    })
    .returning({ id: kerjaHadir.id });
  if (tulis.length > 0) return { hasil: "tercatat" as const, jam: waktu };
  const [kini] = await db.select({ waktu: kerjaHadir.waktu }).from(kerjaHadir).where(kunci).limit(1);
  return { hasil: "sudah" as const, jam: kini?.waktu ?? waktu };
}

/** Kegiatan kemarin s.d. besok (jendela bisa melewati tengah malam), plus apakah orang ini terdaftar. */
async function acaraCalon(orangId: string, tanggal: string): Promise<AcaraCalon[]> {
  const db = getDb();
  const r = await db.execute(sql`
    select a.id, a.nama, a.tanggal::text as tanggal, a.jam_mulai::text as jam_mulai, a.scan_buka_at, a.scan_tutup_at,
      exists(select 1 from acara_pendaftaran p where p.acara_id = a.id and p.orang_id = ${orangId}) as terdaftar
    from acara a
    where a.tanggal between (${tanggal}::date - 1) and (${tanggal}::date + 1)`);
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    id: String(x.id),
    nama: String(x.nama),
    tanggal: String(x.tanggal),
    jamMulai: (x.jam_mulai as string | null) ?? null,
    scanBukaAt: x.scan_buka_at ? new Date(x.scan_buka_at as string) : null,
    scanTutupAt: x.scan_tutup_at ? new Date(x.scan_tutup_at as string) : null,
    terdaftar: Boolean(x.terdaftar),
  }));
}

async function jawabanDariTap(t: typeof tapKartu.$inferSelect, kantorId: string): Promise<JawabanTap> {
  const db = getDb();
  const tanggal = jakartaDate(t.waktu);
  const o = t.orangId ? (await db.select().from(orang).where(eq(orang.id, t.orangId)).limit(1))[0] : undefined;
  let jam: string | null = t.sesi ? jamWibDari(t.waktu) : null;
  if (t.orangId && t.sesi) {
    const [h] = await db
      .select({ waktu: kerjaHadir.waktu })
      .from(kerjaHadir)
      .where(and(eq(kerjaHadir.kantorId, kantorId), eq(kerjaHadir.orangId, t.orangId), eq(kerjaHadir.tanggal, tanggal), eq(kerjaHadir.sesi, t.sesi)))
      .limit(1);
    if (h) jam = jamWibDari(h.waktu);
  }
  const arti = await db.select({ jenis: tapArti.jenis, status: tapArti.status, label: tapArti.label }).from(tapArti).where(eq(tapArti.tapId, t.id));
  return {
    hasil: t.hasil as JawabanTap["hasil"],
    nama: o?.nama ?? null,
    gender: o?.gender ?? null,
    sesi: (t.sesi as Sesi | null) ?? null,
    jam,
    tanggal,
    arti: arti as ArtiTap[],
  };
}

/**
 * Isian tangan admin (lupa kartu, koreksi): tulis/ubah satu sel logbook.
 * `jam` null = kosongkan sel.
 */
export async function setelSel(v: { orangId: string; tanggal: string; sesi: Sesi; jam: string | null; catatan?: string | null; oleh: string }) {
  const db = getDb();
  const k = await getKantor();
  const kunci = and(eq(kerjaHadir.kantorId, k.id), eq(kerjaHadir.orangId, v.orangId), eq(kerjaHadir.tanggal, v.tanggal), eq(kerjaHadir.sesi, v.sesi));
  if (!v.jam) {
    await db.delete(kerjaHadir).where(kunci);
    return;
  }
  const waktu = new Date(`${v.tanggal}T${v.jam.slice(0, 5)}:00+07:00`);
  await db
    .insert(kerjaHadir)
    .values({ kantorId: k.id, orangId: v.orangId, tanggal: v.tanggal, sesi: v.sesi, waktu, sumber: "manual", catatan: v.catatan ?? null, dicatatOleh: v.oleh })
    .onConflictDoUpdate({
      target: [kerjaHadir.kantorId, kerjaHadir.orangId, kerjaHadir.tanggal, kerjaHadir.sesi],
      set: { waktu, sumber: "manual", tapId: null, catatan: v.catatan ?? null, dicatatOleh: v.oleh, updatedAt: new Date() },
    });
}

/** Tap terakhir hari ini untuk panel kiosk/admin (termasuk yang tak dikenal). */
export async function tapHariIni(tanggal: string, limit = 30) {
  const db = getDb();
  const k = await getKantor();
  return db
    .select({
      id: tapKartu.id,
      waktu: tapKartu.waktu,
      hasil: tapKartu.hasil,
      sesi: tapKartu.sesi,
      metode: tapKartu.metode,
      nama: orang.nama,
      dibaca: tapKartu.dibaca,
      // Arti selain kerja (kegiatan, mengajar …) — yang kerja sudah tampak dari kolom sesi.
      artiLain: sql<string | null>`(select string_agg(a.label, ' · ' order by a.created_at) from tap_arti a where a.tap_id = ${tapKartu.id} and a.jenis <> 'kerja')`,
    })
    .from(tapKartu)
    .leftJoin(orang, eq(orang.id, tapKartu.orangId))
    .where(and(eq(tapKartu.kantorId, k.id), sql`(${tapKartu.waktu} at time zone 'Asia/Jakarta')::date = ${tanggal}::date`))
    .orderBy(sql`${tapKartu.waktu} desc`)
    .limit(limit);
}

/** Ringkasan antrean kirim ke tilawah/Maahir untuk panel admin (7 hari terakhir). */
export async function ringkasAntreanKirim(): Promise<{ menunggu: number; terkirim: number; dilewati: number; gagal: number; tinjau: number; pesanTerakhir: string | null }> {
  const r = await getDb().execute(sql`
    select
      count(*) filter (where status = 'menunggu_sinkron')::int as menunggu,
      count(*) filter (where status = 'tersinkron')::int as terkirim,
      count(*) filter (where status = 'dilewati')::int as dilewati,
      count(*) filter (where status = 'gagal')::int as gagal,
      count(*) filter (where status = 'perlu_tinjau')::int as tinjau,
      (select pesan_kirim from tap_arti where pesan_kirim is not null and status in ('menunggu_sinkron', 'gagal') order by created_at desc limit 1) as pesan
    from tap_arti where created_at > now() - interval '7 days' and jenis <> 'kerja' and jenis <> 'acara'`);
  const x = r.rows[0] as Record<string, unknown>;
  return {
    menunggu: Number(x.menunggu ?? 0),
    terkirim: Number(x.terkirim ?? 0),
    dilewati: Number(x.dilewati ?? 0),
    gagal: Number(x.gagal ?? 0),
    tinjau: Number(x.tinjau ?? 0),
    pesanTerakhir: (x.pesan as string | null) ?? null,
  };
}
