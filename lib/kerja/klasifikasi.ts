/**
 * Klasifikasi tap kartu — murni, tanpa DB (design "Kartu Kehadiran" §3,
 * docs/superpowers/specs/2026-09-29-kartu-kehadiran-design.md).
 *
 * Satu tap = satu kejadian fisik (orang X, jam T, di perangkat P). Artinya bisa
 * lebih dari satu: "hadir kerja sesi Pagi" DAN "datang mengajar halaqah H".
 * Fungsi ini hanya menyusun daftar arti beserta alasannya; yang menulis ke
 * kerja_hadir / tilawah adalah pemanggil, setelah memutuskan mana yang
 * dipercaya ('pasti') dan mana yang diantrekan untuk ditinjau ('perlu_tinjau').
 */
import { sesiDari } from "./sesi";
import { LABEL_SESI, type BatasSesi, type Sesi } from "./types";

// ── Parser jadwal halaqah_sync ────────────────────────────────────────────

const NAMA_HARI: Record<string, number> = { senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6, ahad: 7 };
const LABEL_HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Ahad"];
const RANGE = /^\s*(?:-|–|—|s\.?\s*d\.?|s\/d|sampai|hingga)\s*$/;

/**
 * Teks hari halaqah_sync.day → hari ISO (1 = Senin … 7 = Ahad), urut, unik.
 * Contoh: 'Senin, Rabu' → [1,3]; 'Senin–Jumat' → [1..5]; "Selasa & Jum'at" → [2,5];
 * 'Sabtu, Ahad' → [6,7]. Teks kosong / tak dikenal → [].
 *
 * Sengaja membaca teks, bukan raw.day.int_days: int_days tilawah berbasis 0
 * (Senin = 0) dan ada yang salah — "Selasa & Jum'at" tercatat [1] saja.
 */
export function parseHari(day: string | null | undefined): number[] {
  if (!day) return [];
  const s = day
    .toLowerCase()
    .replace(/jum['’`]?at/g, "jumat")
    .replace(/minggu/g, "ahad");
  if (/(setiap|tiap)\s+hari/.test(s)) return [1, 2, 3, 4, 5, 6, 7];

  const temu = [...s.matchAll(/senin|selasa|rabu|kamis|jumat|sabtu|ahad/g)];
  const hasil = new Set<number>();
  for (let i = 0; i < temu.length; i++) {
    const a = NAMA_HARI[temu[i][0]];
    hasil.add(a);
    const b = temu[i + 1];
    if (!b) continue;
    const antara = s.slice(temu[i].index! + temu[i][0].length, b.index);
    if (!RANGE.test(antara)) continue;
    // Rentang inklusif, boleh melewati Ahad (mis. 'Sabtu–Senin' → 6,7,1).
    const z = NAMA_HARI[b[0]];
    for (let h = a; h !== z; h = (h % 7) + 1) hasil.add(h);
    hasil.add(z);
  }
  return [...hasil].sort((x, y) => x - y);
}

/**
 * Teks sesi halaqah_sync.session → menit sejak 00:00 WIB.
 * '20:00 - 21:30' → {1200, 1290}; '15:50–19:00'; '16:00–18.00'; '16:00' → selesai null.
 * null bila tak bisa dipakai: kosong, tak terbaca, atau placeholder tilawah
 * '00:00 - 00:45' (tak ada kelas tatap muka tengah malam — itu isian bawaan).
 */
export function parseSesi(session: string | null | undefined): { mulai: number; selesai: number | null } | null {
  if (!session) return null;
  const m = session
    .trim()
    .match(/^(\d{1,2})[:.](\d{2})(?:\s*(?:-|–|—|s\.?\s*d\.?|s\/d|sampai)\s*(\d{1,2})[:.](\d{2}))?(?:\s*wib)?\s*$/i);
  if (!m) return null;
  const jam = (h: string, mm: string) => {
    const hh = Number(h);
    const mi = Number(mm);
    return hh < 24 && mi < 60 ? hh * 60 + mi : NaN;
  };
  const mulai = jam(m[1], m[2]);
  if (!Number.isFinite(mulai) || mulai === 0) return null;
  let selesai: number | null = m[3] ? jam(m[3], m[4]) : null;
  if (selesai !== null && (!Number.isFinite(selesai) || selesai <= mulai)) selesai = null;
  return { mulai, selesai };
}

// ── Tipe masukan/keluaran ────────────────────────────────────────────────

/** Perangkat 'gerbang' = kiosk umum di pintu; {kelas} = perangkat yang diikat ke satu halaqah. */
export type ModePerangkat = "gerbang" | { kelas: string };

export type TapKlasifikasi = {
  orangId: string;
  waktu: Date;
  /** Kantor/lokasi tempat perangkat berada; null bila tak diketahui (mis. HP pengajar). */
  kantorId: string | null;
  perangkat: ModePerangkat;
};

export type KelasKonteks = {
  /** Kunci halaqah yang dipakai pemanggil (halaqah_sync.id atau 'tilawah:123'); sama dengan ModePerangkat.kelas. */
  halaqahId: string;
  nama: string;
  tipe: string | null; // 'online' | 'offline' | 'hybrid'
  /** Hari ISO 1–7, dari parseHari. */
  hari: number[];
  /** Dari parseSesi; null = jam tidak bisa dipakai. */
  jam: { mulai: number; selesai: number | null } | null;
  /** Lokasi kelas bila diketahui (belum ada di data upstream; diisi manual kelak). */
  kantorId?: string | null;
  /**
   * tilawah_jadwal_id pertemuan pada tanggal tap (jadwal_sync.schedule_date).
   * undefined = jadwal tidak dimuat; null = dimuat dan tidak ada pertemuan hari itu.
   */
  jadwalHariIni?: number | null;
};

export type KonteksTap = {
  /** Keanggotaan logbook aktif (kerja_anggota) + batas sesi kantornya; null = bukan anggota. */
  kerja: { kantorId: string; batas: BatasSesi } | null;
  /** Halaqah yang diajar orang ini (sebagai guru utama). Online ikut dikirim pun tak apa — diabaikan. */
  mengajar: KelasKonteks[];
  /** Halaqah yang diikuti orang ini sebagai peserta. */
  belajar: KelasKonteks[];
  /** Orang ini pengajar di program mana pun (orang_tautan peran pengajar) — untuk badal. */
  adalahPengajar?: boolean;
};

export type JenisArti = "kerja" | "mengajar" | "badal_mungkin" | "belajar" | "tak_terpetakan";
export type Yakin = "pasti" | "perlu_tinjau";
export type Arti = {
  jenis: JenisArti;
  sesi?: Sesi;
  halaqahId?: string;
  jadwalId?: number;
  alasan: string;
  yakin: Yakin;
  /** Terlambat tapi kelas masih berjalan (hari & lokasi meyakinkan) — tetap hadir. */
  telat?: boolean;
  /** Lebih dari satu kelas cocok — jangan dikirim ke mana pun sebelum ditinjau. */
  ganda?: boolean;
};

/** Jendela datang: dari 30 menit sebelum mulai sampai 15 menit sesudahnya. */
export const JENDELA_SEBELUM = 30;
export const JENDELA_SESUDAH = 15;
/** Batas jam pada perangkat kelas bila halaqah tak punya jam selesai. */
const DURASI_BAWAAN = 120;

/** Susun KelasKonteks dari baris halaqah_sync mentah. */
export function siapkanKelas(r: {
  halaqahId: string;
  nama: string | null;
  type: string | null;
  day: string | null;
  session: string | null;
  kantorId?: string | null;
  jadwalHariIni?: number | null;
}): KelasKonteks {
  return {
    halaqahId: r.halaqahId,
    nama: r.nama ?? r.halaqahId,
    tipe: r.type,
    hari: parseHari(r.day),
    jam: parseSesi(r.session),
    kantorId: r.kantorId,
    jadwalHariIni: r.jadwalHariIni,
  };
}

// ── Klasifikasi ──────────────────────────────────────────────────────────

const jj = (menit: number) => `${String(Math.floor(menit / 60)).padStart(2, "0")}.${String(menit % 60).padStart(2, "0")}`;

/** Jam dinding & hari ISO di WIB. */
function wib(at: Date): { menit: number; hari: number } {
  const d = new Date(at.getTime() + 7 * 3_600_000);
  const dow = d.getUTCDay(); // 0 = Ahad
  return { menit: d.getUTCHours() * 60 + d.getUTCMinutes(), hari: dow === 0 ? 7 : dow };
}

/** Kelas tatap muka? Online tak pernah dicocokkan lewat jam. */
const tatapMuka = (k: KelasKonteks) => k.tipe !== "online";

type Hari = { cocok: boolean; kuat: boolean; ket: string };
/**
 * Apakah kelas ini berlangsung pada hari tap. Jadwal tilawah (schedule_date) lebih
 * kuat dari pola hari: pertemuan pengganti tetap cocok, hari libur tidak.
 */
function cekHari(k: KelasKonteks, hari: number): Hari {
  const polaCocok = k.hari.includes(hari);
  if (k.jadwalHariIni != null) return { cocok: true, kuat: true, ket: polaCocok ? "" : "pertemuan di luar hari biasanya, ada di jadwal tilawah" };
  if (k.jadwalHariIni === null && polaCocok) return { cocok: true, kuat: false, ket: "tilawah tidak mencatat pertemuan hari ini" };
  if (k.hari.length === 0 && k.jadwalHariIni === undefined) return { cocok: true, kuat: false, ket: "hari kelas tidak tercatat" };
  return { cocok: polaCocok, kuat: polaCocok, ket: "" };
}

const denganJadwal = (a: Arti, k: KelasKonteks): Arti => (k.jadwalHariIni != null ? { ...a, jadwalId: k.jadwalHariIni } : a);

/** Lokasi kelas diketahui dan berbeda dengan lokasi perangkat? */
const beda = (k: KelasKonteks, tap: TapKlasifikasi) => !!k.kantorId && !!tap.kantorId && k.kantorId !== tap.kantorId;

type Peran = "mengajar" | "belajar";
const KATA: Record<Peran, string> = { mengajar: "mengajar", belajar: "hadir belajar" };

/**
 * Cocokkan tap gerbang dengan jam kelas. Kembalikan arti bila cocok (tepat
 * waktu = pasti; terlambat tapi kelas masih berjalan = perlu_tinjau), atau
 * catatan tinjau bila jam kelas tak bisa dipakai.
 */
function cocokJam(k: KelasKonteks, peran: Peran, tap: TapKlasifikasi, t: { menit: number; hari: number }): Arti | null {
  const h = cekHari(k, t.hari);
  if (!h.cocok) return null;
  if (!k.jam) {
    return denganJadwal(
      {
        jenis: "tak_terpetakan",
        halaqahId: k.halaqahId,
        alasan: `${k.nama}: kelas hari ini tapi jam kelas tidak tercatat, tidak bisa dicocokkan lewat jam — pakai perangkat kelas atau perbaiki jam di sumber`,
        yakin: "perlu_tinjau",
      },
      k,
    );
  }
  const selisih = t.menit - k.jam.mulai; // + = sesudah mulai
  const jamKelas = `${jj(k.jam.mulai)}${k.jam.selesai !== null ? `–${jj(k.jam.selesai)}` : ""}`;
  const dasar = { jenis: peran, halaqahId: k.halaqahId } as const;
  const lokasi = beda(k, tap) ? " — tap di lokasi lain dari lokasi kelas" : "";
  const ket = h.ket ? ` — ${h.ket}` : "";

  if (selisih >= -JENDELA_SEBELUM && selisih <= JENDELA_SESUDAH) {
    const kapan = selisih < 0 ? `${-selisih} menit sebelum` : selisih === 0 ? "tepat saat" : `${selisih} menit sesudah`;
    return denganJadwal(
      {
        ...dasar,
        alasan: `${KATA[peran]} ${k.nama} (${jamKelas}): tap ${kapan} kelas mulai${ket}${lokasi}`,
        yakin: h.kuat && !lokasi ? "pasti" : "perlu_tinjau",
      },
      k,
    );
  }
  if (k.jam.selesai !== null && selisih > JENDELA_SESUDAH && t.menit < k.jam.selesai) {
    return denganJadwal(
      {
        ...dasar,
        alasan: `${KATA[peran]} ${k.nama} (${jamKelas}): terlambat ${selisih} menit, kelas masih berjalan${ket}${lokasi}`,
        yakin: "perlu_tinjau",
        ...(h.kuat && !lokasi ? { telat: true } : {}),
      },
      k,
    );
  }
  return null;
}

/**
 * Arti kelas yang boleh langsung dikirim ke sistem program: pasti, atau hanya
 * terlambat (pemilik 29 Sep 2026: telat tidak ditandai — tetap hadir). Yang
 * ganda atau janggal (hari/lokasi) menunggu tinjauan.
 */
export function bolehKirim(a: Arti): boolean {
  return !a.ganda && (a.yakin === "pasti" || a.telat === true);
}

/** Tap di perangkat yang diikat ke kelas k milik orang ini. */
function lewatPerangkat(k: KelasKonteks, peran: Peran, t: { menit: number; hari: number }): Arti {
  const h = cekHari(k, t.hari);
  const alasan: string[] = [];
  if (!h.cocok) alasan.push(`hari ini bukan hari kelas (${k.hari.map((x) => LABEL_HARI[x]).join(", ") || "hari tak tercatat"})`);
  else if (!h.kuat) alasan.push(h.ket);
  if (k.jam) {
    const akhir = k.jam.selesai ?? k.jam.mulai + DURASI_BAWAAN;
    if (t.menit < k.jam.mulai - JENDELA_SEBELUM || t.menit > akhir) alasan.push(`jam tap ${jj(t.menit)} jauh dari jam kelas ${jj(k.jam.mulai)}`);
  }
  return denganJadwal(
    {
      jenis: peran,
      halaqahId: k.halaqahId,
      alasan: `${KATA[peran]} ${k.nama}: tap di perangkat kelas ini${alasan.length ? ` — ${alasan.join("; ")}` : ""}`,
      yakin: alasan.length ? "perlu_tinjau" : "pasti",
    },
    k,
  );
}

/**
 * Semua arti satu tap. Urutan: kerja, mengajar/badal, belajar, tak_terpetakan.
 * Selalu mengembalikan minimal satu arti — bila tak ada yang cocok, satu
 * 'tak_terpetakan' dengan alasan kenapa.
 */
export function klasifikasiTap(tap: TapKlasifikasi, ktx: KonteksTap): Arti[] {
  const t = wib(tap.waktu);
  const kerja: Arti[] = [];
  const ajar: Arti[] = [];
  const ikut: Arti[] = [];
  const catatan: Arti[] = [];
  const mengapa: string[] = [];

  // 1. Kerja: anggota logbook, di kantornya, dalam jam sesi. Mode perangkat tidak
  //    menentukan — tap di perangkat kelas yang ada di kantor tetap bisa kerja.
  if (ktx.kerja) {
    const sesi = sesiDari(tap.waktu, ktx.kerja.batas);
    if (tap.kantorId !== ktx.kerja.kantorId) mengapa.push("anggota logbook, tapi tap bukan di kantornya");
    else if (!sesi) mengapa.push(`anggota logbook, tapi jam ${jj(t.menit)} di luar semua sesi`);
    else kerja.push({ jenis: "kerja", sesi, alasan: `hadir kerja sesi ${LABEL_SESI[sesi]}: anggota logbook, tap ${jj(t.menit)} di kantornya`, yakin: "pasti" });
  } else {
    mengapa.push("bukan anggota logbook kerja");
  }

  const ajarTatap = ktx.mengajar.filter(tatapMuka);
  const ikutTatap = ktx.belajar.filter(tatapMuka);

  if (tap.perangkat !== "gerbang") {
    // 2a. Perangkat kelas: keanggotaan kelas yang menentukan, jam hanya menguatkan.
    const id = tap.perangkat.kelas;
    const guru = ktx.mengajar.find((k) => k.halaqahId === id);
    const murid = ktx.belajar.find((k) => k.halaqahId === id);
    if (guru) ajar.push(lewatPerangkat(guru, "mengajar", t));
    if (murid) ikut.push(lewatPerangkat(murid, "belajar", t));
    if (!guru && !murid) {
      if (ktx.adalahPengajar || ktx.mengajar.length > 0) {
        ajar.push({
          jenis: "badal_mungkin",
          halaqahId: id,
          alasan: "pengajar tap di perangkat kelas yang bukan kelasnya — mungkin menggantikan (badal); konfirmasi ke koordinator",
          yakin: "perlu_tinjau",
        });
      } else {
        mengapa.push("tap di perangkat kelas, tapi bukan pengajar atau peserta kelas itu");
      }
    }
  } else {
    // 2b. Gerbang: cocokkan jam dengan semua kelas tatap muka orang ini.
    for (const k of ajarTatap) {
      const a = cocokJam(k, "mengajar", tap, t);
      if (a) (a.jenis === "tak_terpetakan" ? catatan : ajar).push(a);
    }
    for (const k of ikutTatap) {
      const a = cocokJam(k, "belajar", tap, t);
      if (a) (a.jenis === "tak_terpetakan" ? catatan : ikut).push(a);
    }
    // Lebih dari satu kelas cocok (data ganda / jadwal tumpang) → jangan tebak.
    for (const kumpulan of [ajar, ikut]) {
      if (kumpulan.length > 1)
        for (const a of kumpulan) {
          a.ganda = true;
          if (a.yakin === "pasti") { a.yakin = "perlu_tinjau"; a.alasan += " — lebih dari satu kelas cocok"; }
        }
    }
    if (ktx.mengajar.length + ktx.belajar.length > 0 && ajarTatap.length + ikutTatap.length === 0) mengapa.push("semua kelasnya online");
    else if (ajarTatap.length + ikutTatap.length > 0 && ajar.length + ikut.length === 0 && catatan.length === 0) mengapa.push("tidak ada kelas tatap mukanya yang mulai sekitar jam ini");
  }

  const hasil = [...kerja, ...ajar, ...ikut, ...catatan];
  if (hasil.length === 0) {
    hasil.push({ jenis: "tak_terpetakan", alasan: mengapa.join("; ") || "tidak ada yang cocok", yakin: "perlu_tinjau" });
  }
  return hasil;
}
