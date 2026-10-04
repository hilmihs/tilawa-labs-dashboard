/**
 * Peserta kelas tatap muka → `orang` + `orang_tautan`, supaya tap kartu mereka
 * bisa dikenali sebagai "belajar" di kelasnya (lib/kerja/kelas-tap.ts) dan
 * kartunya bisa dicetak per kelas (/orang/kartu?kelompok=peserta…).
 *
 * Lingkup:
 *  - tilawah: `students_sync` aktif (lib/enrollment.ts `pesertaAktif`) di
 *    halaqah `offline`/`hybrid` program `tilawah_api`, bukan kelas `[DEMO` dan
 *    bukan akun isian ("Nama Murid"). Satu tautan per ORANG, bukan per program:
 *    (sumber 'tilawah', peran 'peserta', id_upstream = tilawah_user_id, program_slug '').
 *  - Maahir: setiap baris `anggota` di maahir_sync → tautan (sumber 'maahir',
 *    peran 'anggota', id_upstream = anggota.id). Satu orang bisa punya beberapa
 *    baris anggota (satu per program_kelas); lihat `kelompokkanAnggota`.
 *
 * Aturan identitas — sengaja sempit:
 *  - `orang` lama dipakai HANYA lewat tautan yang sudah ada: tautan peserta/anggota
 *    yang sama (jalan ulang idempoten), atau tautan tilawah 'pengajar' dengan id
 *    tilawah yang sama (akun tilawah yang sama, jadi orang yang sama — pengajar
 *    yang juga duduk sebagai murid di kelas lain). TIDAK pernah lewat nama atau
 *    WA: id upstream lintas sumber bertabrakan dan nama murid banyak yang kembar.
 *    Satu pengecualian: ejaan yang ada di putusan gabung manusia
 *    (lib/orang/keputusan.ts) menempel ke baris pengajarnya — lihat `petaPutusan`.
 *  - `orang` baru: kategori 'peserta', sumber 'sinkron_peserta', kode QR baru.
 *    WA hanya bila bisa dinormalkan, belum dipakai `orang` mana pun, bukan nomor
 *    akun pengajar, dan tidak dipakai bersama beberapa murid (nomor keluarga) —
 *    lihat `pilihWaPeserta`.
 *  - Tautan yang keluar dari lingkup (keluar, pindah ke kelas online, anggota
 *    dihapus) di-`aktif = false`; masuk lagi → aktif lagi. Tautan tidak pernah
 *    dipindah ke orang lain — koreksi manusia menang.
 *
 * Murah dan terbatas: lima SELECT atas ±1.000 baris, lalu paling banyak empat
 * pernyataan tulis bertumpuk (jsonb_to_recordset), dan nol tulisan bila tak ada
 * yang berubah. Dijalankan dari lib/orang/sinkron-otomatis.ts di bawah kunci
 * advisory yang sama dengan sinkron pengajar.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bukanAkunSampah, bukanKelasDemo, pesertaAktif } from "@/lib/enrollment";
import { canonicalGuruId } from "@/lib/guru/duplicates";
import { buatKode } from "@/lib/hadir/kode";
import { namaKunci } from "@/lib/hadir/nama";
import { KEPUTUSAN_IDENTITAS } from "@/lib/orang/keputusan";
import { pilihNamaTampil } from "@/lib/orang/nama-rapi";
import { normalizePhone } from "@/lib/wa";

export type Gender = "L" | "P";

// ── Bagian murni ─────────────────────────────────────────────────────────

/**
 * students_sync.gender: 1 = laki-laki, 2 = perempuan (dari akun tilawah).
 * Kosong → petunjuk dari nama halaqah ("… AKHWAT"), sama dengan /peserta.
 */
export function genderTilawah(kode: number | null | undefined, namaHalaqah?: string | null): Gender | null {
  if (kode === 1) return "L";
  if (kode === 2) return "P";
  if (namaHalaqah && /akhwat|perempuan/i.test(namaHalaqah)) return "P";
  if (namaHalaqah && /ikhwan|laki/i.test(namaHalaqah)) return "L";
  return null;
}

/** program_kelas.gender / peserta.gender Maahir: 'ikhwan' | 'akhwat'. */
export function genderMaahir(g: string | null | undefined): Gender | null {
  const s = g?.trim().toLowerCase();
  return s === "ikhwan" ? "L" : s === "akhwat" ? "P" : null;
}

export type AnggotaMaahir = {
  /** anggota.id (uuid) = id_upstream tautan. */
  id: string;
  nama: string;
  pesertaId: string | null;
  /** Dari program_kelas-nya; null bila kelasnya tak dikenal. */
  gender: Gender | null;
};

/**
 * Baris `anggota` Maahir → manusia. Satu orang duduk di beberapa program_kelas
 * (Talaqqi Senin + Tahfizh Rabu …) dan tiap kursi punya id anggota sendiri.
 *  1. `peserta_id` sama → orang yang sama.
 *  2. Tanpa `peserta_id`: `namaKunci` + gender kelas sama → orang yang sama; ikut
 *     grup ber-peserta_id bila tepat SATU peserta_id memakai nama+gender itu.
 *     Dua peserta_id berbeda dengan nama itu = dua orang kembar nama; baris tanpa
 *     peserta_id tak bisa memilih, jadi dikelompokkan sendiri dan dilaporkan.
 * Dua baris ber-peserta_id berbeda tidak pernah digabung, meski namanya sama.
 */
export function kelompokkanAnggota(rows: readonly AnggotaMaahir[]): { orang: AnggotaMaahir[][]; ambigu: string[] } {
  const kunciNama = (a: AnggotaMaahir) => `${namaKunci(a.nama)}|${a.gender ?? "?"}`;
  const pidPerNama = new Map<string, Set<string>>();
  for (const a of rows) {
    if (!a.pesertaId) continue;
    const k = kunciNama(a);
    pidPerNama.set(k, (pidPerNama.get(k) ?? new Set()).add(a.pesertaId));
  }
  const grup = new Map<string, AnggotaMaahir[]>();
  const tambah = (k: string, a: AnggotaMaahir) => grup.set(k, [...(grup.get(k) ?? []), a]);
  const ambigu = new Set<string>();
  for (const a of rows) {
    if (a.pesertaId) {
      tambah(`pid:${a.pesertaId}`, a);
      continue;
    }
    if (!namaKunci(a.nama)) {
      tambah(`id:${a.id}`, a); // tanpa nama: tak ada dasar untuk digabung
      continue;
    }
    const k = kunciNama(a);
    const pids = pidPerNama.get(k);
    if (pids?.size === 1) tambah(`pid:${[...pids][0]}`, a);
    else {
      if (pids && pids.size > 1) ambigu.add(k);
      tambah(`nama:${k}`, a);
    }
  }
  return { orang: [...grup.values()], ambigu: [...ambigu].sort() };
}

/** Gender satu kelompok: satu-satunya nilai yang muncul; kosong atau bentrok → null. */
export function genderKelompok(gs: readonly (Gender | null)[]): Gender | null {
  const s = new Set(gs.filter((g): g is Gender => !!g));
  return s.size === 1 ? [...s][0] : null;
}

/**
 * Ejaan putusan gabung (lib/orang/keputusan.ts) → orang pengajar/pengurus. Pengajar
 * yang juga murid sering memakai akun murid terpisah dengan ejaan lain ("Al Hafizh"
 * vs "Al hafiz"); manusia sudah memutuskan keduanya satu orang, jadi akun murid itu
 * menempel ke baris pengajarnya, bukan dibuatkan kartu kedua. Grup yang ejaannya
 * menunjuk ke lebih dari satu orang tidak dipakai — biar sinkron pengajar yang
 * menggabungkannya dulu. Ejaan satu kata ("Salma") tidak dipetakan.
 */
export function petaPutusan(
  gabung: readonly (readonly string[])[],
  bukanPeserta: readonly { id: string; nama_kunci: string }[],
): Map<string, string> {
  const perKunci = new Map<string, Set<string>>();
  for (const o of bukanPeserta) perKunci.set(o.nama_kunci, (perKunci.get(o.nama_kunci) ?? new Set()).add(o.id));
  const peta = new Map<string, string>();
  for (const grup of gabung) {
    const kunci = [...new Set(grup.map(namaKunci).filter(Boolean))];
    const ids = new Set(kunci.flatMap((k) => [...(perKunci.get(k) ?? [])]));
    if (ids.size !== 1) continue;
    const id = [...ids][0];
    for (const k of kunci) if (k.includes(" ")) peta.set(k, id); // satu kata: putusannya tentang pengajar, bukan murid senama
  }
  return peta;
}

/**
 * WA untuk orang peserta baru. `calon` = SEMUA orang dalam lingkup (termasuk
 * yang sudah punya baris `orang`), supaya nomor bersama terdeteksi.
 *  - nomor dinormalkan lib/wa.ts; tak sah → dibuang;
 *  - nomor yang dipakai >1 orang dalam lingkup (HP orang tua untuk beberapa
 *    anak) → tidak diberikan ke siapa pun: WA adalah kunci cocok situs daftar
 *    dan impor, memberikannya ke satu anak berarti orang tuanya kelak dikenali
 *    sebagai anak itu;
 *  - nomor di `terpakai` (WA `orang` lain, nomor akun pengajar) → dibuang;
 *  - sisanya: nomor sah pertama milik orang itu.
 */
export function pilihWaPeserta(
  calon: readonly { kunci: string; hp: readonly (string | null | undefined)[] }[],
  terpakai: ReadonlySet<string>,
): { wa: Map<string, string>; dibagi: Set<string> } {
  const pemilik = new Map<string, Set<string>>();
  const perOrang = new Map<string, string[]>();
  for (const c of calon) {
    const nomor = [...new Set(c.hp.map((h) => normalizePhone(h)).filter((h): h is string => !!h))];
    perOrang.set(c.kunci, [...(perOrang.get(c.kunci) ?? []), ...nomor]);
    for (const n of nomor) pemilik.set(n, (pemilik.get(n) ?? new Set()).add(c.kunci));
  }
  const dibagi = new Set([...pemilik].filter(([, s]) => s.size > 1).map(([n]) => n));
  const wa = new Map<string, string>();
  for (const [kunci, nomor] of perOrang) {
    const n = nomor.find((x) => !dibagi.has(x) && !terpakai.has(x));
    if (n) wa.set(kunci, n);
  }
  return { wa, dibagi };
}

// ── Sinkron ──────────────────────────────────────────────────────────────

/** Cukup `execute` — getDb() atau transaksi yang sedang berjalan. */
type Eksekutor = { execute: ReturnType<typeof getDb>["execute"] };

type OrangBaru = {
  id: string;
  nama: string;
  nama_kunci: string;
  gender: Gender;
  wa: string | null;
  program_teks: string;
  kode_qr: string;
};
type TautanBaru = { orang_id: string; sumber: "tilawah" | "maahir"; peran: "peserta" | "anggota"; id_upstream: string; nama_upstream: string; metode: string };

export type HasilSinkronPeserta = Awaited<ReturnType<typeof sinkronPeserta>>;

/**
 * `db` diisi transaksi bila pemanggil memegang kunci advisory (sinkron
 * otomatis). Tanpa `db`, penulisan dibungkus transaksinya sendiri.
 * `tulis: false` = uji kering: rencana dan hitungan saja.
 */
export async function sinkronPeserta(opts: { tulis: boolean; db?: Eksekutor }) {
  const db: Eksekutor = opts.db ?? getDb();
  const q = async <T,>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];

  // Berurutan, bukan Promise.all: di dalam transaksi hanya ada satu koneksi.
  const murid = await q<{ uid: number; name: string | null; phone: string | null; gender: number | null; halaqah: string | null; program: string }>(sql`
      select s.tilawah_user_id uid, s.name, s.phone, s.gender, h.name halaqah, p.name program
      from students_sync s
      join programs p on p.id = s.program_id
      join halaqah_sync h on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
      where p.data_source_type = 'tilawah_api' and h.type in ('offline', 'hybrid')
        and ${pesertaAktif("s")} and ${bukanKelasDemo("h.name")} and ${bukanAkunSampah("s.name")}
      order by s.tilawah_user_id, p.created_at desc`);
  const anggota = await q<{ id: string; nama: string | null; pid: string | null; kelas_gender: string | null; peserta_gender: string | null }>(sql`
      select a.maahir_id id, a.raw->>'name' nama, nullif(a.raw->>'peserta_id', '') pid,
        k.raw->>'gender' kelas_gender, ps.raw->>'gender' peserta_gender
      from maahir_sync a
      left join maahir_sync k on k.program_id = a.program_id and k.entity = 'program-kelas' and k.maahir_id = a.raw->>'program_kelas_id'
      left join maahir_sync ps on ps.program_id = a.program_id and ps.entity = 'peserta' and ps.maahir_id = a.raw->>'peserta_id'
      where a.entity = 'anggota' and ${bukanKelasDemo("k.raw->>'name'")} and ${bukanAkunSampah("a.raw->>'name'")}
      order by a.raw->>'created_at', a.maahir_id`);
  const tautan = await q<{ id: string; peran: string; sumber: string; id_upstream: string; aktif: boolean; orang_id: string }>(sql`
      select t.id::text id, t.sumber, t.peran, t.id_upstream, t.aktif, coalesce(o.gabung_ke_id, o.id)::text orang_id
      from orang_tautan t join orang o on o.id = t.orang_id
      where t.sumber = 'tilawah' or (t.sumber = 'maahir' and t.peran = 'anggota')`);
  // Nomor yang tak boleh jatuh ke murid: WA orang mana pun + nomor akun pengajar
    // (anak yang memakai HP ayahnya yang mengajar).
  const nomorLain = await q<{ nomor: string }>(sql`
      select wa nomor from orang where wa is not null
      union select phone from guru_sync where phone is not null
      union select guru_phone from halaqah_sync where guru_phone is not null`);
  const kodeAda = await q<{ kode_qr: string }>(sql`select kode_qr from orang`);
  // Maahir melatih pengajar & pengurus: anggota yang nama lengkapnya persis sama
  // (≥ 2 kata, gender sama, tepat satu orang) adalah orang yang sama — jangan
  // dibuatkan kartu kedua. Murid tilawah TIDAK dicocokkan nama (namespace lain).
  const bukanPeserta = await q<{ id: string; nama_kunci: string; gender: string }>(sql`
      select id::text, nama_kunci, gender from orang where gabung_ke_id is null and kategori <> 'peserta'`);
  const perNamaPersis = new Map<string, string[]>();
  for (const o of bukanPeserta) {
    const k = `${o.nama_kunci}|${o.gender}`;
    perNamaPersis.set(k, [...(perNamaPersis.get(k) ?? []), o.id]);
  }
  const perPutusan = petaPutusan(KEPUTUSAN_IDENTITAS.gabung, bukanPeserta);
  const lewatPutusan = (nama: string[]) => nama.map((n) => perPutusan.get(namaKunci(n))).find(Boolean);

  // Tautan yang ada, per kunci.
  const tautanPeserta = new Map<string, { id: string; aktif: boolean; orangId: string }>(); // "tilawah:<uid>" | "maahir:<anggota>"
  const pengajarTilawah = new Map<string, string>(); // id tilawah → orang (akun yang sama)
  for (const t of tautan) {
    if (t.sumber === "tilawah" && t.peran === "peserta") tautanPeserta.set(`tilawah:${t.id_upstream}`, { id: t.id, aktif: t.aktif, orangId: t.orang_id });
    else if (t.sumber === "maahir") tautanPeserta.set(`maahir:${t.id_upstream}`, { id: t.id, aktif: t.aktif, orangId: t.orang_id });
    else if (t.sumber === "tilawah" && !pengajarTilawah.has(t.id_upstream)) pengajarTilawah.set(t.id_upstream, t.orang_id);
  }
  const terpakai = new Set(nomorLain.map((r) => normalizePhone(r.nomor)).filter((n): n is string => !!n));
  const kodeTerpakai = new Set(kodeAda.map((r) => r.kode_qr.toUpperCase()));
  const kodeBaru = () => {
    for (;;) {
      const k = buatKode();
      if (!kodeTerpakai.has(k)) {
        kodeTerpakai.add(k);
        return k;
      }
    }
  };

  const orangBaru: OrangBaru[] = [];
  const tautanBaru: TautanBaru[] = [];
  const dalamLingkup = new Set<string>();
  const lewati: string[] = [];
  const stat = {
    tilawah: { lingkup: 0, orangBaru: 0, pakaiPengajar: 0, pakaiPutusan: 0, tautanBaru: 0, tautanAda: 0 },
    maahir: { anggota: anggota.length, orang: 0, orangBaru: 0, tertautNama: 0, tertautPutusan: 0, tautanBaru: 0, tautanAda: 0 },
    waDiisi: 0,
    waBersama: 0,
    diaktifkan: 0,
    dinonaktifkan: 0,
  };

  // ── tilawah: satu orang per tilawah_user_id
  const perUid = new Map<number, { nama: string[]; hp: (string | null)[]; gender: (Gender | null)[]; program: string }>();
  for (const m of murid) {
    const u = perUid.get(m.uid) ?? { nama: [], hp: [], gender: [], program: m.program };
    if (m.name) u.nama.push(m.name);
    u.hp.push(m.phone);
    u.gender.push(genderTilawah(m.gender, m.halaqah));
    perUid.set(m.uid, u);
  }
  stat.tilawah.lingkup = perUid.size;
  const { wa: waTilawah, dibagi } = pilihWaPeserta(
    [...perUid].map(([uid, u]) => ({ kunci: String(uid), hp: u.hp })),
    terpakai,
  );
  stat.waBersama = dibagi.size;

  for (const [uid, u] of perUid) {
    const kunci = `tilawah:${uid}`;
    dalamLingkup.add(kunci);
    if (tautanPeserta.has(kunci)) {
      stat.tilawah.tautanAda++;
      continue;
    }
    const nama = pilihNamaTampil(u.nama) || `Peserta ${uid}`;
    // Akun tilawah yang sama sudah tertaut sebagai pengajar → orang yang sama.
    const orangPengajar = pengajarTilawah.get(String(uid)) ?? pengajarTilawah.get(String(canonicalGuruId(uid)));
    if (orangPengajar) {
      tautanBaru.push({ orang_id: orangPengajar, sumber: "tilawah", peran: "peserta", id_upstream: String(uid), nama_upstream: nama, metode: "akun" });
      stat.tilawah.pakaiPengajar++;
      stat.tilawah.tautanBaru++;
      continue;
    }
    // Ejaan lain yang sudah diputus manusia sebagai pengajar yang sama.
    const orangPutusan = lewatPutusan(u.nama);
    if (orangPutusan) {
      tautanBaru.push({ orang_id: orangPutusan, sumber: "tilawah", peran: "peserta", id_upstream: String(uid), nama_upstream: nama, metode: "manual" });
      stat.tilawah.pakaiPutusan++;
      stat.tilawah.tautanBaru++;
      continue;
    }
    const gender = genderKelompok(u.gender);
    if (!gender) {
      lewati.push(`tilawah ${uid}\t${nama}\tgender tak diketahui/bentrok`);
      continue;
    }
    const wa = waTilawah.get(String(uid)) ?? null;
    if (wa) {
      terpakai.add(wa);
      stat.waDiisi++;
    }
    const id = crypto.randomUUID();
    orangBaru.push({ id, nama, nama_kunci: namaKunci(nama), gender, wa, program_teks: `Peserta ${u.program}`, kode_qr: kodeBaru() });
    tautanBaru.push({ orang_id: id, sumber: "tilawah", peran: "peserta", id_upstream: String(uid), nama_upstream: nama, metode: "baru" });
    stat.tilawah.orangBaru++;
    stat.tilawah.tautanBaru++;
  }

  // ── Maahir: baris anggota → manusia
  const { orang: kelompok, ambigu } = kelompokkanAnggota(
    anggota.map((a) => ({
      id: a.id,
      nama: a.nama ?? "",
      pesertaId: a.pid,
      gender: genderMaahir(a.kelas_gender) ?? genderMaahir(a.peserta_gender),
    })),
  );
  stat.maahir.orang = kelompok.length;
  for (const k of kelompok) {
    for (const a of k) dalamLingkup.add(`maahir:${a.id}`);
    const belum = k.filter((a) => !tautanPeserta.has(`maahir:${a.id}`));
    stat.maahir.tautanAda += k.length - belum.length;
    if (belum.length === 0) continue;
    const nama = pilihNamaTampil(k.map((a) => a.nama)) || "Anggota Maahir";
    // Orang yang sudah dipegang kursi lain di kelompok ini (yang paling sering, bila lebih dari satu).
    const hitung = new Map<string, number>();
    for (const a of k) {
      const o = tautanPeserta.get(`maahir:${a.id}`)?.orangId;
      if (o) hitung.set(o, (hitung.get(o) ?? 0) + 1);
    }
    let orangId = [...hitung].sort((x, y) => y[1] - x[1])[0]?.[0];
    let metode = "akun";
    if (!orangId) {
      const g = genderKelompok(k.map((a) => a.gender));
      const kunci = namaKunci(nama);
      const cocok = g && kunci.split(" ").length >= 2 ? (perNamaPersis.get(`${kunci}|${g}`) ?? []) : [];
      if (cocok.length === 1) {
        orangId = cocok[0];
        metode = "nama";
        stat.maahir.tertautNama++;
      }
    }
    if (!orangId) {
      const viaPutusan = lewatPutusan(k.map((a) => a.nama));
      if (viaPutusan) {
        orangId = viaPutusan;
        metode = "manual";
        stat.maahir.tertautPutusan++;
      }
    }
    if (!orangId) {
      const gender = genderKelompok(k.map((a) => a.gender));
      if (!gender) {
        lewati.push(`maahir ${k.map((a) => a.id).join(",")}\t${nama}\tgender kelas tak diketahui/bentrok`);
        continue;
      }
      orangId = crypto.randomUUID();
      metode = "baru";
      orangBaru.push({ id: orangId, nama, nama_kunci: namaKunci(nama), gender, wa: null, program_teks: "Peserta Maahir", kode_qr: kodeBaru() });
      stat.maahir.orangBaru++;
    }
    for (const a of belum) {
      tautanBaru.push({ orang_id: orangId, sumber: "maahir", peran: "anggota", id_upstream: a.id, nama_upstream: a.nama || nama, metode });
      stat.maahir.tautanBaru++;
    }
  }

  // ── aktif mengikuti lingkup. Sumber yang kosong sama sekali (mirror belum/gagal
  // sinkron) tidak menonaktifkan apa pun — lebih baik basi daripada semua mati.
  const adaSumber = { tilawah: murid.length > 0, maahir: anggota.length > 0 };
  const aktifkan: string[] = [];
  const nonaktifkan: string[] = [];
  for (const [kunci, t] of tautanPeserta) {
    const masuk = dalamLingkup.has(kunci);
    if (masuk && !t.aktif) aktifkan.push(t.id);
    else if (!masuk && t.aktif && adaSumber[kunci.startsWith("tilawah:") ? "tilawah" : "maahir"]) nonaktifkan.push(t.id);
  }
  stat.diaktifkan = aktifkan.length;
  stat.dinonaktifkan = nonaktifkan.length;

  const tulisan: ReturnType<typeof sql>[] = [];
  if (orangBaru.length) {
    // on conflict do nothing: WA yang baru saja dipakai situs daftar di antara
    // baca dan tulis melewatkan orang itu saja; tautannya menyusul di jalan berikutnya.
    tulisan.push(sql`
      insert into orang (id, nama, nama_kunci, gender, wa, program_teks, kategori, kode_qr, sumber, perlu_review)
      select id, nama, nama_kunci, gender, wa, program_teks, 'peserta', kode_qr, 'sinkron_peserta', false
      from jsonb_to_recordset(${JSON.stringify(orangBaru)}::jsonb)
        as x(id uuid, nama text, nama_kunci text, gender text, wa text, program_teks text, kode_qr text)
      on conflict do nothing`);
  }
  if (tautanBaru.length) {
    tulisan.push(sql`
      insert into orang_tautan (orang_id, sumber, peran, id_upstream, program_slug, nama_upstream, aktif, metode)
      select x.orang_id, x.sumber, x.peran, x.id_upstream, '', x.nama_upstream, true, x.metode
      from jsonb_to_recordset(${JSON.stringify(tautanBaru)}::jsonb)
        as x(orang_id uuid, sumber text, peran text, id_upstream text, nama_upstream text, metode text)
      where exists (select 1 from orang o where o.id = x.orang_id)
      on conflict do nothing`);
  }
  const setAktif = (ids: string[], aktif: boolean) =>
    sql`update orang_tautan set aktif = ${aktif}, updated_at = now()
      where id in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::uuid)`;
  if (aktifkan.length) tulisan.push(setAktif(aktifkan, true));
  if (nonaktifkan.length) tulisan.push(setAktif(nonaktifkan, false));

  if (opts.tulis && tulisan.length) {
    if (opts.db) {
      for (const s of tulisan) await opts.db.execute(s);
    } else {
      await getDb().transaction(async (tx) => {
        for (const s of tulisan) await tx.execute(s);
      });
    }
  }

  return { stat, lewati, ambigu, pernyataan: tulisan.length, orangBaru, tautanBaru };
}
