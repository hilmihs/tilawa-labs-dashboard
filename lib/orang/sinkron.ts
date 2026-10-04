/**
 * Daftar individu Div. Kaderisasi & Amaliyyah: setiap pengajar lintas program →
 * satu baris `orang` + baris `orang_tautan` per akun/peran upstream.
 *
 * Dulu hanya hidup di scripts/seed-orang-tautan.ts dan dijalankan tangan di
 * tiap prod; sejak 28 Sep 2026 intinya di sini supaya juga berjalan sendiri di
 * akhir setiap sinkron (lib/orang/sinkron-otomatis.ts) — pengajar baru dari
 * tilawah/mabni/Maahir langsung punya baris `orang` dan muncul di /orang dan
 * /pengajar tanpa ada yang ingat menjalankan skrip.
 *
 * Idempoten. Sumber: guru_sync + pemilik halaqah_sync (tilawah, mabni; id tilawah
 * dikanonikkan lewat lib/guru/duplicates.ts) dan peran Maahir (musyrif, syaikh,
 * koordinator, koordinator-ketua-kelas, hits/pengajar). Aturan gabung di
 * lib/orang/klaster.ts, putusan manusia di lib/orang/keputusan.ts.
 *
 * Yang dilakukan per orang:
 *  - belum ada di `orang` → dibuat (kode QR baru, sumber guru_sync/maahir_sync);
 *  - sudah ada → nama dirapikan, wa/email diisi bila masih kosong;
 *  - dua baris `orang` dalam satu klaster (form kajian mengimpor dua ejaan) →
 *    pendaftaran & hadir dipindah ke baris tertua, yang lain `gabung_ke_id`
 *    (kode QR lamanya tetap membuka orang kanonik, lihat getOrangByKode);
 *  - tautan disisipkan; tautan yang sudah menunjuk orang LAIN tidak dipindah
 *    (dilaporkan) — koreksi manusia menang atas seed.
 * Konflik dengan putusan "pisah" → tidak menulis apa pun, dikembalikan ke pemanggil.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { namaKunci } from "@/lib/hadir/nama";
import { buatKode } from "@/lib/hadir/kode";
import { canonicalGuruId } from "@/lib/guru/duplicates";
import { pickPhone } from "@/lib/guru/phone";
import { susunKlaster, type Rekaman } from "@/lib/orang/klaster";
import { GENDER_DITETAPKAN, KATEGORI_PENGURUS, KEPUTUSAN_IDENTITAS } from "@/lib/orang/keputusan";
import { pilihNamaTampil, rapikanNama } from "@/lib/orang/nama-rapi";



type Akun = Rekaman & {
  sumber: "tilawah" | "mabni" | "maahir" | "orang";
  peran: string;
  idUpstream: string;
  program: Set<string>;
  gender: Set<"L" | "P">;
  petunjukGender: Set<"L" | "P">; // dari nama halaqah, dipakai hanya bila akun tak punya gender
  aktif: boolean;
  orangId?: string;
  orangNama?: string;
  orangWa?: string | null;
  orangEmail?: string | null;
  orangKategori?: string;
  orangGender?: "L" | "P";
  orangPerluReview?: boolean;
};

const PERAN_MAAHIR: Record<string, string> = {
  musyrif: "musyrif",
  syaikh: "syaikh",
  koordinator: "koordinator",
  "koordinator-ketua-kelas": "koordinator_ketua_kelas",
  "hits/pengajar": "pengajar_hits",
};

function labelProgram(a: Akun[]): string {
  const slug = a.flatMap((x) => [...x.program]);
  const peran = new Set(a.map((x) => x.peran));
  if (slug.some((s) => /^(hits|dpq|tahfizh|tahsin|tafm)/.test(s)) || peran.has("pengajar_hits")) return "Pengajar HITS";
  if (slug.includes("mabni")) return "Boarding Teacher";
  if (slug.some((s) => s === "hkm-presensi" || s === "rbi")) return "Pengajar MLP";
  return "Pengajar Maahir";
}


export type HasilSinkron = Awaited<ReturnType<typeof sinkronOrangTautan>>;

/** Cukup `execute` — getDb() atau transaksi yang sedang berjalan. */
type Eksekutor = { execute: ReturnType<typeof getDb>["execute"] };

/**
 * `db` diisi transaksi bila pemanggil sudah memegang kunci (sinkron otomatis):
 * baca dan tulis lalu terjadi di transaksi yang sama. Tanpa `db`, penulisan
 * dibungkus transaksinya sendiri.
 */
export async function sinkronOrangTautan(opts: { tulis: boolean; db?: Eksekutor }) {
  const db: Eksekutor = opts.db ?? getDb();
  const q = async <T,>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];
  const akun = new Map<string, Akun>();
  const ambil = (ref: string, init: () => Akun) => akun.get(ref) ?? akun.set(ref, init()).get(ref)!;

  // tilawah + mabni: satu akun per id (kanonik), program digabung
  const guru = await q<{ slug: string; ds: string; id: number; name: string | null; email: string | null; phone: string | null; gender: number | null; halaqah: string | null; owner: boolean }>(sql`
    select p.slug, p.data_source_type ds, g.tilawah_guru_id id, g.name, g.email, g.phone, g.gender, null as halaqah,
      exists(select 1 from halaqah_sync h where h.program_id = g.program_id and h.guru_id = g.tilawah_guru_id) owner
    from guru_sync g join programs p on p.id = g.program_id
    union all
    select p.slug, p.data_source_type, h.guru_id, h.pengajar, null, h.guru_phone, null, h.name, true
    from halaqah_sync h join programs p on p.id = h.program_id
    where h.guru_id is not null
    union all
    -- Pendamping Boarding: a second teacher kelas hanya ada di raw.gurus, tidak di
    -- guru_sync. Tanpa baris ini akunnya tak pernah punya orang/tautan dan tampil
    -- sebagai baris terpisah di /pengajar (Atalika, Ismi, Lubna, …). Nama halaqah
    -- dikosongkan: gender kelas Mabni = gender murid, bukan petunjuk gender pengajar.
    select p.slug, p.data_source_type, (g->>'id')::int, g->>'nama', null, null, null, '', true
    from halaqah_sync h join programs p on p.id = h.program_id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(h.raw->'gurus') = 'array' then h.raw->'gurus' else '[]'::jsonb end) g
    where p.data_source_type = 'mabni_api' and g->>'id' ~ '^[0-9]+$'
      and (g->>'id')::int is distinct from h.guru_id`);
  for (const g of guru) {
    const ns = g.ds === "mabni_api" ? "mabni" : "tilawah";
    const id = String(ns === "tilawah" ? canonicalGuruId(g.id) : g.id);
    const a = ambil(`${ns}:${id}`, () => ({
      ref: `${ns}:${id}`, ruang: ns, sumber: ns, peran: "pengajar", idUpstream: id, nama: "", alias: [], email: null, hp: null,
      program: new Set(), gender: new Set(), petunjukGender: new Set(), aktif: false,
    }));
    // Nama utama: baris guru_sync milik id kanonik; nama akun ganda / halaqah_sync jadi alias.
    if (g.name) {
      const utama = g.halaqah === null && String(g.id) === id;
      if (!a.nama || utama) {
        if (a.nama && a.nama !== g.name) (a.alias as string[]).push(a.nama);
        a.nama = g.name;
      } else if (g.name !== a.nama) (a.alias as string[]).push(g.name);
    }
    a.email ??= g.email;
    a.hp ??= pickPhone(g.name, g.phone);
    a.program.add(g.slug);
    if (g.gender === 1) a.gender.add("L");
    if (g.gender === 2) a.gender.add("P");
    if (g.halaqah && /akhwat/i.test(g.halaqah)) a.petunjukGender.add("P");
    if (g.halaqah && /ikhwan/i.test(g.halaqah)) a.petunjukGender.add("L");
    a.aktif ||= g.owner;
  }

  const maahir = await q<{ entity: string; id: string; name: string; gender: string | null; active: string | null }>(sql`
    select entity, raw->>'id' id, raw->>'name' "name", raw->>'gender' gender, raw->>'active' active
    from maahir_sync where entity in ('musyrif','syaikh','koordinator','koordinator-ketua-kelas','hits/pengajar')`);
  for (const m of maahir) {
    const peran = PERAN_MAAHIR[m.entity];
    akun.set(`maahir:${peran}:${m.id}`, {
      ref: `maahir:${peran}:${m.id}`, ruang: "maahir", sumber: "maahir", peran, idUpstream: m.id, nama: m.name,
      email: null, hp: null, program: new Set(), aktif: m.active !== "false",
      gender: new Set(m.gender === "ikhwan" ? ["L"] : m.gender === "akhwat" ? ["P"] : []), petunjukGender: new Set(),
    });
  }

  const orangRows = await q<{ id: string; nama: string; wa: string | null; email: string | null; gender: "L" | "P"; kategori: string; perlu_review: boolean; created_at: string }>(sql`
    select id, nama, wa, email, gender, kategori, perlu_review, created_at from orang where gabung_ke_id is null order by created_at`);
  // Ejaan yang diputus manusia sebagai satu orang (lib/orang/keputusan.ts).
  const ejaanPutusan = new Set(KEPUTUSAN_IDENTITAS.gabung.flat().map(namaKunci));
  for (const o of orangRows) {
    // Murid (sinkron-peserta) bukan calon pengajar: jangan dicocokkan nama/HP ke akun
    // guru. Nomor mereka tetap terhitung terpakai lewat indeks unik orang.wa.
    // Kecuali ejaannya ada di putusan gabung: pengajar yang juga murid (akun murid
    // tilawah/anggota Maahir terpisah) lalu tergabung ke baris pengajarnya. Nama satu
    // kata ("Salma") tidak: putusannya tentang pengajar, bukan murid senama.
    const kunciMurid = namaKunci(o.nama);
    const muridPutusan = o.kategori === "peserta" && kunciMurid.includes(" ") && ejaanPutusan.has(kunciMurid);
    if (o.kategori === "peserta" && !muridPutusan) continue;
    akun.set(`orang:${o.id}`, {
      ref: `orang:${o.id}`, ruang: "orang", sumber: "orang", peran: "", idUpstream: o.id, nama: o.nama, email: o.email,
      hp: muridPutusan ? null : o.wa,
      program: new Set(), gender: new Set([o.gender]), petunjukGender: new Set(), aktif: true,
      orangId: o.id, orangNama: o.nama, orangWa: o.wa, orangEmail: o.email, orangKategori: o.kategori,
      orangGender: o.gender, orangPerluReview: o.perlu_review,
    });
  }

  const hasil = susunKlaster([...akun.values()], KEPUTUSAN_IDENTITAS);
  if (hasil.konflik.length) {
    return { konflik: hasil.konflik, stat: null, laporan: [], lewati: [], namaAmbigu: [], tautanPindah: [], dikecualikan: [], akun: akun.size, klaster: 0, pernyataan: 0 };
  }

  const tautanAda = await q<{ sumber: string; peran: string; id_upstream: string; program_slug: string; orang_id: string }>(sql`
    select sumber, peran, id_upstream, program_slug, orang_id from orang_tautan`);
  const tautanPeta = new Map(tautanAda.map((t) => [`${t.sumber}|${t.peran}|${t.id_upstream}|${t.program_slug}`, t.orang_id]));
  const waTerpakai = new Map(orangRows.filter((o) => o.wa).map((o) => [o.wa!, o.id]));
  const pengurus = new Set(KATEGORI_PENGURUS.map(namaKunci));
  const genderDitetapkan = new Map(Object.entries(GENDER_DITETAPKAN).map(([n, g]) => [namaKunci(n), g]));
  const urutSumber = { tilawah: 0, mabni: 1, maahir: 2, orang: 3 } as const;

  const laporan: string[] = ["aksi\tnama_lama\tnama_baru\tgender\tprogram\tkategori\twa\takun"];
  const lewati: string[] = [];
  const tautanPindah: string[] = [];
  const stat = { orangBaru: 0, orangUbah: 0, orangTetap: 0, tautanBaru: 0, tautanAda: 0, orangGanda: 0 };

  type Rencana = { sqls: ReturnType<typeof sql>[] };
  const rencana: Rencana = { sqls: [] };

  for (const k of hasil.klaster.map((x) => x as Akun[])) {
    // Baris murid tak pernah jadi kanonik selama ada baris pengajar/pengurus (sort stabil: tertua tetap duluan).
    const orangs = k.filter((a) => a.sumber === "orang").sort((a, b) => Number(a.orangKategori === "peserta") - Number(b.orangKategori === "peserta"));
    const upstream = k.filter((a) => a.sumber !== "orang").sort((a, b) => urutSumber[a.sumber] - urutSumber[b.sumber]);
    const namaBaru = pilihNamaTampil([...upstream.map((a) => a.nama), ...orangs.map((a) => a.nama)]);
    const nk = new Set(k.flatMap((a) => [a.nama, ...(a.alias ?? [])].map(namaKunci)));
    const hpKandidat = [...new Set(k.map((a) => a.hp).filter((h): h is string => !!h))];
    const genderManusia = [...nk].map((n) => genderDitetapkan.get(n)).find(Boolean);
    const emailKandidat = k.map((a) => a.email?.trim().toLowerCase()).find((e) => e && !e.endsWith("@email.com")) ?? null;

    let orangId: string;
    if (orangs.length === 0) {
      if (upstream.length === 0) continue;
      const g = new Set(upstream.flatMap((a) => [...a.gender]));
      const petunjuk = new Set(upstream.flatMap((a) => [...a.petunjukGender]));
      // Gender dari nama halaqah hanya tebakan (pengajar akhwat bisa memegang kelas ikhwan anak) → perlu_review.
      const tebakan = !genderManusia && g.size === 0 && petunjuk.size === 1;
      const gender = genderManusia ?? (g.size === 1 ? [...g][0] : tebakan ? [...petunjuk][0] : null);
      if (!gender) {
        lewati.push(`${namaBaru}\tgender tak diketahui/bentrok\t${upstream.map((a) => a.ref).join(" ")}`);
        continue;
      }
      const wa = hpKandidat.find((h) => !waTerpakai.has(h)) ?? null;
      const kategori = [...nk].some((n) => pengurus.has(n)) ? "pengurus" : "pengajar";
      const programTeks = kategori === "pengurus" ? "Pengurus Education Board" : labelProgram(upstream);
      const sumber = upstream.some((a) => a.sumber !== "maahir") ? "guru_sync" : "maahir_sync";
      orangId = crypto.randomUUID();
      if (wa) waTerpakai.set(wa, orangId);
      rencana.sqls.push(sql`insert into orang (id, nama, nama_kunci, gender, wa, email, program_teks, kategori, kode_qr, sumber, perlu_review)
        values (${orangId}, ${namaBaru}, ${namaKunci(namaBaru)}, ${gender}, ${wa}, ${emailKandidat}, ${programTeks}, ${kategori},
          ${buatKode()}, ${sumber}, ${tebakan})`);
      stat.orangBaru++;
      laporan.push(`baru\t\t${namaBaru}\t${gender}${tebakan ? " (tebakan dari nama halaqah)" : ""}\t${programTeks}\t${kategori}\t${wa ? `…${wa.slice(-4)}` : ""}\t${upstream.map((a) => a.ref).join(" ")}`);
    } else {
      const utama = orangs[0]; // tertua
      orangId = utama.orangId!;
      for (const ganda of orangs.slice(1)) {
        stat.orangGanda++;
        // Pendaftaran/hadir yang bentrok (acara sama) diselesaikan: hadir tercepat menang,
        // konfirmasi utama dipertahankan kecuali kosong.
        rencana.sqls.push(sql`update acara_hadir u set waktu = least(u.waktu, g.waktu)
          from acara_hadir g where g.orang_id = ${ganda.orangId} and u.orang_id = ${orangId} and u.acara_id = g.acara_id`);
        rencana.sqls.push(sql`delete from acara_hadir g using acara_hadir u
          where g.orang_id = ${ganda.orangId} and u.orang_id = ${orangId} and u.acara_id = g.acara_id`);
        rencana.sqls.push(sql`update acara_hadir set orang_id = ${orangId} where orang_id = ${ganda.orangId}`);
        rencana.sqls.push(sql`update acara_pendaftaran u set konfirmasi = coalesce(u.konfirmasi, g.konfirmasi), alasan = coalesce(u.alasan, g.alasan)
          from acara_pendaftaran g where g.orang_id = ${ganda.orangId} and u.orang_id = ${orangId} and u.acara_id = g.acara_id`);
        rencana.sqls.push(sql`delete from acara_pendaftaran g using acara_pendaftaran u
          where g.orang_id = ${ganda.orangId} and u.orang_id = ${orangId} and u.acara_id = g.acara_id`);
        rencana.sqls.push(sql`update acara_pendaftaran set orang_id = ${orangId} where orang_id = ${ganda.orangId}`);
        rencana.sqls.push(sql`update orang_tautan set orang_id = ${orangId} where orang_id = ${ganda.orangId}`);
        // WA pindah ke kanonik bila kanonik belum punya (indeks unik parsial: kosongkan dulu yang ganda).
        rencana.sqls.push(sql`update orang set gabung_ke_id = ${orangId}, wa = null, updated_at = now() where id = ${ganda.orangId}`);
        if (ganda.orangWa && !utama.orangWa && !hpKandidat.length) {
          rencana.sqls.push(sql`update orang set wa = ${ganda.orangWa} where id = ${orangId} and wa is null`);
        }
        laporan.push(`gabung\t${ganda.orangNama}\t→ ${utama.orangNama}\t\t\t\t\t${ganda.ref}`);
      }
      const perubahan: string[] = [];
      const namaTarget = upstream.length ? namaBaru : rapikanNama(utama.orangNama);
      if (namaTarget && namaTarget !== utama.orangNama) perubahan.push("nama");
      const wa = !utama.orangWa ? hpKandidat.find((h) => !waTerpakai.has(h)) ?? null : null;
      if (wa) { perubahan.push("wa"); waTerpakai.set(wa, orangId); }
      const email = !utama.orangEmail && emailKandidat ? emailKandidat : null;
      if (email) perubahan.push("email");
      const jadiPengurus = [...nk].some((n) => pengurus.has(n)) && utama.orangKategori !== "pengurus";
      // Murid yang ternyata pengajar (putusan gabung) dan belum punya baris pengajar sendiri.
      const jadiPengajar = !jadiPengurus && utama.orangKategori === "peserta" && upstream.length > 0;
      if (jadiPengurus || jadiPengajar) perubahan.push("kategori");
      const genderBaru = genderManusia && (genderManusia !== utama.orangGender || utama.orangPerluReview) ? genderManusia : null;
      if (genderBaru) perubahan.push("gender");
      if (perubahan.length) {
        rencana.sqls.push(sql`update orang set
          nama = ${namaTarget}, nama_kunci = ${namaKunci(namaTarget)},
          wa = coalesce(wa, ${wa}), email = coalesce(email, ${email}),
          kategori = case when ${jadiPengurus} then 'pengurus' when ${jadiPengajar} then 'pengajar' else kategori end,
          program_teks = case when ${jadiPengajar} then ${labelProgram(upstream)} else program_teks end,
          gender = coalesce(${genderBaru}, gender),
          perlu_review = case when ${genderBaru !== null} then false else perlu_review end,
          updated_at = now()
          where id = ${orangId}`);
        stat.orangUbah++;
        laporan.push(`ubah(${perubahan.join(",")})\t${utama.orangNama}\t${namaTarget}\t\t\t\t${wa ? `…${wa.slice(-4)}` : ""}\t${upstream.map((a) => a.ref).join(" ")}`);
      } else stat.orangTetap++;
    }

    for (const a of upstream) {
      const program = a.sumber === "maahir" ? [""] : [...a.program].sort();
      const metode = hasil.metode.get(a.ref) ?? (orangs.length ? "manual" : "baru");
      for (const slug of program) {
        const kunci = `${a.sumber}|${a.peran}|${a.idUpstream}|${slug}`;
        const ada = tautanPeta.get(kunci);
        if (ada) {
          stat.tautanAda++;
          if (ada !== orangId) tautanPindah.push(`${kunci}\tsekarang ${ada}\tseed ingin ${orangId} (${namaBaru})`);
          continue;
        }
        rencana.sqls.push(sql`insert into orang_tautan (orang_id, sumber, peran, id_upstream, program_slug, nama_upstream, aktif, metode)
          values (${orangId}, ${a.sumber}, ${a.peran}, ${a.idUpstream}, ${slug}, ${a.nama}, ${a.aktif}, ${metode})`);
        stat.tautanBaru++;
      }
    }
  }


  if (opts.tulis && rencana.sqls.length > 0) {
    if (opts.db) {
      for (const s of rencana.sqls) await opts.db.execute(s);
    } else {
      await getDb().transaction(async (tx) => {
        for (const s of rencana.sqls) await tx.execute(s);
      });
    }
  }
  return {
    konflik: [] as unknown[],
    stat,
    laporan,
    lewati,
    namaAmbigu: hasil.namaAmbigu,
    tautanPindah,
    dikecualikan: hasil.dikecualikan.map((a) => `${a.nama} (${a.ref})`),
    akun: akun.size,
    klaster: hasil.klaster.length,
    pernyataan: rencana.sqls.length,
  };
}
