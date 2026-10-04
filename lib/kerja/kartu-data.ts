/**
 * Data Kartu Kehadiran untuk halaman cetak /orang/kartu. Semua orang dimuat
 * dengan beberapa query sekaligus (bukan getOrangCv per orang — CV menarik
 * kegiatan & badal yang tak dipakai kartu). Tampilannya di ./kartu-view.ts.
 */
import { sql } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/lib/db/client";
import { bukanAkunSampah, bukanKelasDemo, pesertaAktif } from "@/lib/enrollment";
import { urlQr } from "@/lib/hadir/kode";
import { jakartaDate } from "@/lib/time/jakarta";
import {
  isiKartu,
  namaKelasMaahir,
  peranKartu,
  pilihHalaqahUtama,
  pilihKelasPeserta,
  PROGRAM_MAAHIR,
  type CalonHalaqah,
  type KelasPeserta,
  type PeranKartu,
  type Rumpun,
} from "./kartu-view";
import { listAnggota } from "./queries";

export type DataKartu = {
  orangId: string;
  nama: string;
  gender: string;
  kodeQr: string;
  peran: PeranKartu;
  rumpun: Rumpun;
  /** Sudah diringkas untuk kartu; null = baris program tak ditampilkan. */
  program: string | null;
  halaqah: string | null;
  /** UID NFC ternormal (hex tanpa pemisah); null = belum ada chip. */
  uid: string | null;
  url: string;
  /** SVG QR hitam-putih, quiet zone 4 modul, koreksi galat M. */
  qrSvg: string;
};

/**
 * Siapa yang dicetak:
 *  - `ids` — id orang / kode QR;
 *  - `kelompok: "pengurus"` — semua anggota logbook aktif;
 *  - `kelompok: "peserta"` + `program` (slug program tilawah) atau `halaqah`
 *    (halaqah_sync.id) — peserta kelas tatap muka yang sudah punya tautan
 *    (lib/orang/sinkron-peserta.ts);
 *  - `kelompok: "maahir"` + `kelas` (program_kelas_id) — anggota satu kelas Maahir.
 * Peserta/Maahir tanpa `program`/`halaqah`/`kelas` sengaja kosong: ratusan kartu
 * sekaligus bukan yang dimaksud siapa pun.
 */
export type PilihanKartu = {
  ids?: string[];
  kelompok?: "pengurus" | "peserta" | "maahir";
  program?: string;
  halaqah?: string;
  kelas?: string;
};

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_SLUG = /^[a-z0-9-]{1,120}$/;

/** "a, b ,c" → daftar unik, urutan dipertahankan. Menerima id orang maupun kode QR. */
export function uraiIds(raw: string | string[] | undefined): string[] {
  const s = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return [...new Set(s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];
}

const arrUuid = (ids: readonly string[]) => sql`array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]`;
const arrTeks = (xs: readonly string[]) => sql`array[${sql.join(xs.map((i) => sql`${i}`), sql`, `)}]::text[]`;

/** id/kode → id orang kanonik (duplikat yang sudah digabung menunjuk ke induknya), urutan masukan. */
async function resolusiIds(masukan: readonly string[]): Promise<string[]> {
  if (masukan.length === 0) return [];
  const db = getDb();
  const uuid = masukan.filter((x) => RE_UUID.test(x)).map((x) => x.toLowerCase());
  const kode = masukan.filter((x) => !RE_UUID.test(x)).map((x) => x.toUpperCase());
  const rows = await db.execute(sql`
    select o.id::text id, upper(o.kode_qr) kode, coalesce(o.gabung_ke_id, o.id)::text kanon
    from orang o
    where ${uuid.length ? sql`o.id = any(${arrUuid(uuid)})` : sql`false`}
       or ${kode.length ? sql`upper(o.kode_qr) = any(${arrTeks(kode)})` : sql`false`}`);
  const peta = new Map<string, string>();
  for (const r of rows.rows) {
    peta.set(String(r.id), String(r.kanon));
    peta.set(String(r.kode), String(r.kanon));
  }
  const hasil: string[] = [];
  for (const x of masukan) {
    const k = peta.get(RE_UUID.test(x) ? x.toLowerCase() : x.toUpperCase());
    if (k && !hasil.includes(k)) hasil.push(k);
  }
  return hasil;
}

/**
 * Orang kanonik peserta satu halaqah / program tilawah / kelas Maahir, urut
 * kelas → Ikhwan dulu → nama. Hanya yang sudah punya tautan peserta.
 */
async function idsKelompok(p: PilihanKartu): Promise<string[]> {
  const db = getDb();
  if (p.kelompok === "peserta") {
    const hid = p.halaqah && RE_UUID.test(p.halaqah) ? p.halaqah.toLowerCase() : null;
    const slug = !hid && p.program && RE_SLUG.test(p.program) ? p.program : null;
    if (!hid && !slug) return [];
    const rows = await db.execute(sql`
      select coalesce(o.gabung_ke_id, o.id)::text id
      from halaqah_sync h
      join programs p on p.id = h.program_id and p.data_source_type = 'tilawah_api'
      join students_sync s on s.program_id = h.program_id and s.halaqah_id = h.tilawah_halaqah_id
      join orang_tautan t on t.sumber = 'tilawah' and t.peran = 'peserta' and t.id_upstream = s.tilawah_user_id::text
      join orang o on o.id = t.orang_id
      where ${hid ? sql`h.id = ${hid}::uuid` : sql`p.slug = ${slug} and h.type in ('offline', 'hybrid')`}
        and ${pesertaAktif("s")} and ${bukanKelasDemo("h.name")} and ${bukanAkunSampah("s.name")}
      group by 1
      order by min(coalesce(h.nama_tampil, h.name)), min(o.gender), min(o.nama)`);
    return rows.rows.map((r) => String(r.id));
  }
  if (p.kelompok === "maahir") {
    const kelas = p.kelas && RE_UUID.test(p.kelas) ? p.kelas.toLowerCase() : null;
    if (!kelas) return [];
    const rows = await db.execute(sql`
      select coalesce(o.gabung_ke_id, o.id)::text id
      from maahir_sync a
      join orang_tautan t on t.sumber = 'maahir' and t.peran = 'anggota' and t.id_upstream = a.maahir_id
      join orang o on o.id = t.orang_id
      where a.entity = 'anggota' and a.raw->>'program_kelas_id' = ${kelas}
      group by 1
      order by min(o.gender), min(o.nama)`);
    return rows.rows.map((r) => String(r.id));
  }
  return [];
}

export async function muatKartu(pilihan: PilihanKartu, base: string): Promise<DataKartu[]> {
  const ids =
    pilihan.kelompok === "pengurus"
      ? (await listAnggota()).map((a) => a.orangId) // Ikhwan dulu, lalu Akhwat, lalu urutan
      : pilihan.kelompok === "peserta" || pilihan.kelompok === "maahir"
        ? await idsKelompok(pilihan)
        : await resolusiIds(pilihan.ids ?? []);
  if (ids.length === 0) return [];
  // Orang yang ikut beberapa kelas: kartu menulis kelas yang sedang dicetak.
  const utamakan =
    pilihan.kelompok === "peserta"
      ? pilihan.halaqah
        ? { kunci: pilihan.halaqah.toLowerCase() }
        : { programSlug: pilihan.program }
      : pilihan.kelompok === "maahir"
        ? { kunci: pilihan.kelas?.toLowerCase() }
        : undefined;
  const db = getDb();
  const arr = arrUuid(ids);

  const [orangRows, anggotaRows, tautanRows, halaqahRows, nfcRows, ikutTilawahRows, ikutMaahirRows] = await Promise.all([
    db.execute(sql`
      select o.id::text id, o.nama, o.gender, o.kode_qr, o.kategori, o.program_teks
      from orang o where o.id = any(${arr})`),
    db.execute(sql`select distinct orang_id::text orang_id from kerja_anggota where aktif and orang_id = any(${arr})`),
    db.execute(sql`
      select t.orang_id::text orang_id, t.sumber, t.peran, t.program_slug, t.aktif, p.name program_nama
      from orang_tautan t
      left join programs p on p.slug = nullif(t.program_slug, '')
      where t.orang_id = any(${arr})
      order by t.aktif desc, t.updated_at desc`),
    // Halaqah yang dia pegang (pemilik), sama dengan cara CV: lewat akun
    // Tilawah/Mabni per program. Badal tidak dihitung sebagai halaqahnya.
    db.execute(sql`
      with akun as (
        select t.orang_id, t.program_slug, t.id_upstream::int guru_id
        from orang_tautan t
        where t.orang_id = any(${arr}) and t.aktif and t.sumber in ('tilawah', 'mabni') and t.program_slug <> ''
      )
      select a.orang_id::text orang_id, p.slug program_slug, p.name program_nama,
        coalesce(h.nama_tampil, h.name, '—') halaqah,
        count(j.id) filter (where j.status = 4)::int selesai,
        max(j.schedule_date)::text terakhir
      from akun a
      join programs p on p.slug = a.program_slug
      join halaqah_sync h on h.program_id = p.id and h.guru_id = a.guru_id
      left join jadwal_sync j on j.program_id = p.id and j.tilawah_halaqah_id = h.tilawah_halaqah_id
      group by a.orang_id, p.slug, p.name, h.tilawah_halaqah_id, coalesce(h.nama_tampil, h.name, '—')`),
    db.execute(sql`
      select distinct on (orang_id) orang_id::text orang_id, uid
      from kartu_nfc where aktif and orang_id = any(${arr})
      order by orang_id, created_at desc`),
    // Kelas tatap muka yang diikuti sebagai peserta (tautan dari lib/orang/sinkron-peserta.ts).
    db.execute(sql`
      select t.orang_id::text orang_id, h.id::text kunci, p.slug program_slug, p.name program_nama,
        coalesce(h.nama_tampil, h.name, '—') halaqah, j.selesai, j.terakhir
      from orang_tautan t
      join students_sync s on s.tilawah_user_id::text = t.id_upstream
      join programs p on p.id = s.program_id and p.data_source_type = 'tilawah_api'
      join halaqah_sync h on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
      cross join lateral (
        select count(*) filter (where j.status = 4)::int selesai, max(j.schedule_date)::text terakhir
        from jadwal_sync j where j.program_id = h.program_id and j.tilawah_halaqah_id = h.tilawah_halaqah_id
      ) j
      where t.orang_id = any(${arr}) and t.sumber = 'tilawah' and t.peran = 'peserta'
        and h.type in ('offline', 'hybrid') and ${pesertaAktif("s")} and ${bukanKelasDemo("h.name")}`),
    db.execute(sql`
      select t.orang_id::text orang_id, k.maahir_id kunci, k.raw->>'name' kelas
      from orang_tautan t
      join maahir_sync a on a.entity = 'anggota' and a.maahir_id = t.id_upstream
      join maahir_sync k on k.entity = 'program-kelas' and k.program_id = a.program_id and k.maahir_id = a.raw->>'program_kelas_id'
      where t.orang_id = any(${arr}) and t.sumber = 'maahir' and t.peran = 'anggota' and t.aktif`),
  ]);

  const anggota = new Set(anggotaRows.rows.map((r) => String(r.orang_id)));
  const tautan = new Map<string, { sumber: string; peran: string; programNama: string | null }[]>();
  for (const r of tautanRows.rows) {
    const k = String(r.orang_id);
    const l = tautan.get(k) ?? [];
    l.push({ sumber: String(r.sumber), peran: String(r.peran), programNama: (r.program_nama as string | null) ?? null });
    tautan.set(k, l);
  }
  const calon = new Map<string, CalonHalaqah[]>();
  for (const r of halaqahRows.rows) {
    const k = String(r.orang_id);
    const l = calon.get(k) ?? [];
    l.push({
      programSlug: String(r.program_slug),
      programNama: String(r.program_nama),
      halaqah: String(r.halaqah),
      selesai: Number(r.selesai),
      terakhir: (r.terakhir as string | null) ?? null,
    });
    calon.set(k, l);
  }
  const ikut = new Map<string, KelasPeserta[]>();
  const tambahIkut = (k: string, x: KelasPeserta) => ikut.set(k, [...(ikut.get(k) ?? []), x]);
  for (const r of ikutTilawahRows.rows) {
    tambahIkut(String(r.orang_id), {
      sumber: "tilawah",
      kunci: String(r.kunci),
      programSlug: String(r.program_slug),
      programNama: String(r.program_nama),
      halaqah: String(r.halaqah),
      selesai: Number(r.selesai),
      terakhir: (r.terakhir as string | null) ?? null,
    });
  }
  for (const r of ikutMaahirRows.rows) {
    tambahIkut(String(r.orang_id), {
      sumber: "maahir",
      kunci: String(r.kunci),
      programSlug: "maahir",
      programNama: PROGRAM_MAAHIR,
      halaqah: namaKelasMaahir(r.kelas as string | null) ?? "—",
      selesai: 0,
      terakhir: null,
    });
  }
  const uid = new Map(nfcRows.rows.map((r) => [String(r.orang_id), String(r.uid)]));
  const orangById = new Map(orangRows.rows.map((r) => [String(r.id), r]));
  const hariIni = jakartaDate();

  const kartu = ids.flatMap((id) => {
    const o = orangById.get(id);
    if (!o) return [];
    const t = tautan.get(id) ?? [];
    const peran = peranKartu({ anggotaAktif: anggota.has(id), kategori: String(o.kategori), peranTautan: t.map((x) => x.peran) });
    // Urutan sumber program ada di isiKartu: kelas yang diikuti (peserta) /
    // halaqah yang dipegang (pengajar) → program akun tertaut → program_teks → Maahir.
    const baris = isiKartu({
      peran,
      halaqahPegang: pilihHalaqahUtama(calon.get(id) ?? [], hariIni),
      kelasPeserta: pilihKelasPeserta(ikut.get(id) ?? [], hariIni, utamakan),
      tautanPeserta: t.some((x) => (x.sumber === "tilawah" && x.peran === "peserta") || (x.sumber === "maahir" && x.peran === "anggota")),
      programTautan: t.find((x) => x.programNama)?.programNama ?? null,
      programTeks: (o.program_teks as string | null) ?? null,
      sumber: t.map((x) => x.sumber),
    });
    const kode = String(o.kode_qr);
    return [
      {
        orangId: id,
        nama: String(o.nama),
        gender: String(o.gender),
        kodeQr: kode,
        peran,
        rumpun: baris.rumpun,
        program: baris.program,
        halaqah: baris.halaqah,
        uid: uid.get(id) ?? null,
        url: urlQr(base, kode),
      },
    ];
  });

  return Promise.all(
    kartu.map(async (k) => ({
      ...k,
      qrSvg: await QRCode.toString(k.url, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 4,
        color: { dark: "#000000", light: "#ffffff" },
      }),
    })),
  );
}
