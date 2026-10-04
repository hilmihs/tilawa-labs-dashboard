/**
 * Kelas tatap muka milik orang yang tap — sebagai pengajar (halaqah_sync lewat
 * orang_tautan 'pengajar') dan sebagai peserta (tilawah lewat tautan 'peserta',
 * Maahir lewat tautan 'anggota'). Hasilnya dipakai klasifikasiTap untuk arti
 * mengajar/belajar, lalu `tujuanKirim` menentukan ke mana arti itu dikirim.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bolehKirim, parseHari, siapkanKelas, type Arti, type KelasKonteks } from "./klasifikasi";

export type SasaranKirim = "tilawah_selesai" | "tilawah_presensi" | "maahir_kehadiran";

export type KelasTap = {
  peran: "mengajar" | "belajar";
  konteks: KelasKonteks;
  /** 'tilawah' = bisa ditulis balik; 'mabni' = hanya dicatat di sini; 'maahir' = lewat endpoint Maahir. */
  sumber: "tilawah" | "mabni" | "maahir";
  programId?: string;
  guruId?: number; // tilawah guru_id orang ini (mengajar)
  halaqahUserId?: number; // tilawah halaqah_user_id (belajar)
  programKelasId?: string; // Maahir
  anggotaId?: string; // Maahir
};

const MENIT_BAWAAN_KELAS = 90;

export async function muatKelasTap(orangId: string, tanggal: string): Promise<KelasTap[]> {
  const [ajar, ikut, maahir] = await Promise.all([kelasPengajar(orangId, tanggal), kelasPesertaTilawah(orangId, tanggal), kelasMaahir(orangId)]);
  return [...ajar, ...ikut, ...maahir];
}

const jadwalHariIni = (x: Record<string, unknown>) => (x.ada_jadwal ? ((x.jadwal as number | null) ?? null) : undefined);

/**
 * Kelas offline/hybrid yang diajar orang ini (guru utama di halaqah_sync).
 * Program dicocokkan juga pada data_source_type karena id guru tilawah dan
 * mabni bisa bertabrakan.
 */
async function kelasPengajar(orangId: string, tanggal: string): Promise<KelasTap[]> {
  const r = await getDb().execute(sql`
    select h.id, coalesce(h.nama_tampil, h.name) as nama, h.type, h.day, h.session, p.id as program_id, p.data_source_type, h.guru_id,
      (select j.tilawah_jadwal_id from jadwal_sync j
        where j.program_id = h.program_id and j.tilawah_halaqah_id = h.tilawah_halaqah_id and j.schedule_date = ${tanggal}::date limit 1) as jadwal,
      exists(select 1 from jadwal_sync j where j.program_id = h.program_id and j.tilawah_halaqah_id = h.tilawah_halaqah_id) as ada_jadwal
    from orang_tautan t
    join programs p on p.slug = t.program_slug and p.data_source_type = t.sumber || '_api'
    join halaqah_sync h on h.program_id = p.id and h.guru_id::text = t.id_upstream
    where t.orang_id = ${orangId} and t.aktif and t.peran = 'pengajar' and h.type in ('offline', 'hybrid')`);
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    peran: "mengajar" as const,
    sumber: x.data_source_type === "tilawah_api" ? ("tilawah" as const) : ("mabni" as const),
    programId: String(x.program_id),
    guruId: x.guru_id == null ? undefined : Number(x.guru_id),
    konteks: siapkanKelas({
      halaqahId: String(x.id),
      nama: (x.nama as string | null) ?? null,
      type: (x.type as string | null) ?? null,
      day: (x.day as string | null) ?? null,
      session: (x.session as string | null) ?? null,
      // Program tanpa jadwal per pertemuan (mis. Mabni): jangan dianggap libur.
      jadwalHariIni: jadwalHariIni(x),
    }),
  }));
}

/** Kelas tilawah offline yang diikuti orang ini sebagai murid (tautan 'peserta' = tilawah_user_id). */
async function kelasPesertaTilawah(orangId: string, tanggal: string): Promise<KelasTap[]> {
  const r = await getDb().execute(sql`
    select h.id, coalesce(h.nama_tampil, h.name) as nama, h.type, h.day, h.session, p.id as program_id, s.halaqah_user_id,
      (select j.tilawah_jadwal_id from jadwal_sync j
        where j.program_id = h.program_id and j.tilawah_halaqah_id = h.tilawah_halaqah_id and j.schedule_date = ${tanggal}::date limit 1) as jadwal,
      exists(select 1 from jadwal_sync j where j.program_id = h.program_id and j.tilawah_halaqah_id = h.tilawah_halaqah_id) as ada_jadwal
    from orang_tautan t
    join students_sync s on s.tilawah_user_id::text = t.id_upstream
    join programs p on p.id = s.program_id and p.data_source_type = 'tilawah_api'
    join halaqah_sync h on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
    where t.orang_id = ${orangId} and t.aktif and t.sumber = 'tilawah' and t.peran = 'peserta'
      and h.type in ('offline', 'hybrid') and coalesce(s.enrollment_status_code, 1) <> 0`);
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    peran: "belajar" as const,
    sumber: "tilawah" as const,
    programId: String(x.program_id),
    halaqahUserId: x.halaqah_user_id == null ? undefined : Number(x.halaqah_user_id),
    konteks: siapkanKelas({
      halaqahId: String(x.id),
      nama: (x.nama as string | null) ?? null,
      type: (x.type as string | null) ?? null,
      day: (x.day as string | null) ?? null,
      session: (x.session as string | null) ?? null,
      jadwalHariIni: jadwalHariIni(x),
    }),
  }));
}

/**
 * Kelas Maahir orang ini (tautan 'anggota' = anggota.id di mirror maahir_sync).
 * jadwal_hari kosong = kelas harian; pertemuan hari itu dicek oleh Maahir sendiri
 * saat kehadiran dikirim (hasil 'tanpa_pertemuan' bila tak ada).
 */
async function kelasMaahir(orangId: string): Promise<KelasTap[]> {
  const r = await getDb().execute(sql`
    select a.maahir_id as anggota_id, k.maahir_id as program_kelas_id, k.raw->>'name' as nama,
      k.raw->'jadwal_hari' as hari, k.raw->>'waktu_mulai' as mulai, k.raw->>'waktu_selesai' as selesai
    from orang_tautan t
    join maahir_sync a on a.entity = 'anggota' and a.maahir_id = t.id_upstream
    join maahir_sync k on k.entity = 'program-kelas' and k.maahir_id = a.raw->>'program_kelas_id'
    where t.orang_id = ${orangId} and t.aktif and t.sumber = 'maahir' and t.peran = 'anggota'`);
  return (r.rows as Record<string, unknown>[]).map((x) => {
    const hari = Array.isArray(x.hari) ? (x.hari as string[]) : [];
    const mulai = (x.mulai as string | null)?.slice(0, 5);
    const selesai = (x.selesai as string | null)?.slice(0, 5);
    const k: KelasKonteks = {
      ...siapkanKelas({
        halaqahId: `maahir:${String(x.program_kelas_id)}`,
        nama: `Maahir · ${((x.nama as string | null) ?? "kelas").replace(/^Maahir\s+/i, "")}`,
        type: "offline",
        day: hari.join(", "),
        session: mulai ? `${mulai} - ${selesai ?? mulai}` : null,
      }),
    };
    if (hari.length === 0) k.hari = [1, 2, 3, 4, 5, 6, 7];
    else k.hari = parseHari(hari.join(", "));
    return { peran: "belajar" as const, sumber: "maahir" as const, konteks: k, programKelasId: String(x.program_kelas_id), anggotaId: String(x.anggota_id) };
  });
}

/**
 * Ke mana satu arti kelas dikirim — murni. `null` = hanya dicatat di sini
 * (kelas Mabni, arti yang perlu ditinjau, atau data kurang).
 */
export function tujuanKirim(
  a: Arti,
  kelas: KelasTap | undefined,
  tanggal: string,
): { sasaran: SasaranKirim; ref: Record<string, unknown>; kirimSetelah: Date | null } | null {
  if (!kelas || !bolehKirim(a)) return null;
  if (a.jenis === "mengajar" && kelas.sumber === "tilawah" && a.jadwalId != null && kelas.guruId != null) {
    // Tilawah mencap class_end dengan jam server saat status → Selesai, jadi kirim sesudah kelas usai.
    const jam = kelas.konteks.jam;
    const akhir = jam ? (jam.selesai ?? jam.mulai + MENIT_BAWAAN_KELAS) : null;
    const kirimSetelah = akhir == null ? null : new Date(`${tanggal}T${String(Math.floor(akhir / 60)).padStart(2, "0")}:${String(akhir % 60).padStart(2, "0")}:00+07:00`);
    return { sasaran: "tilawah_selesai", ref: { kunci: kelas.konteks.halaqahId, jadwalId: a.jadwalId, guruId: kelas.guruId, programId: kelas.programId }, kirimSetelah };
  }
  if (a.jenis === "belajar" && kelas.sumber === "tilawah" && a.jadwalId != null && kelas.halaqahUserId != null) {
    return { sasaran: "tilawah_presensi", ref: { kunci: kelas.konteks.halaqahId, jadwalId: a.jadwalId, halaqahUserId: kelas.halaqahUserId, programId: kelas.programId }, kirimSetelah: null };
  }
  if (a.jenis === "belajar" && kelas.sumber === "maahir" && kelas.programKelasId && kelas.anggotaId) {
    return { sasaran: "maahir_kehadiran", ref: { kunci: kelas.konteks.halaqahId, programKelasId: kelas.programKelasId, anggotaId: kelas.anggotaId, tanggal }, kirimSetelah: null };
  }
  return null;
}
