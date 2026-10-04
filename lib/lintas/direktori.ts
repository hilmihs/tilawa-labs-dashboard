/**
 * Daftar di balik angka Beranda: klik "Peserta aktif" → /peserta, "Kelas" →
 * /kelas (permintaan pemilik 28 Sep 2026: "kita bisa akses seluruh peserta
 * ketika klik angka umum, nanti ada filter atau search"). "Pengajar" menaut ke
 * /pengajar (lib/pengajar/direktori.ts).
 *
 * Himpunan program dan aturannya SAMA dengan lib/insights/beranda.ts, supaya
 * jumlah baris = angka kartu yang diklik:
 * - program per baris Beranda (`susunBaris`), data dari `statsIds`-nya;
 * - peserta aktif = enrollment aktif, sudah berkelas, bukan kelas `[DEMO`;
 *   satu baris per orang = pasangan (data_source_type, id) — id tilawah dan
 *   mabni bukan id global;
 * - kelas = halaqah dengan ≥ 1 peserta aktif;
 * - Maahir dari grid `rekap/kehadiran` ter-cache (bulan ini, lalu bulan lalu).
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bukanAkunSampah, bukanKelasDemo, pesertaAktif } from "@/lib/enrollment";
import { getAccessiblePrograms, getAllPrograms } from "@/lib/programs/resolve";
import { susunBaris } from "@/lib/insights/beranda";
import { readKehadiran } from "@/lib/maahir/rekap";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import { rapikanBatch } from "@/lib/pengajar/direktori-view";
import { kelompokkanPeserta, type AkunPeserta } from "@/lib/peserta/identitas";
import { bacaRentangKelas, masihAktif, statusDariRentang, type PetaRentang, type StatusKelas } from "@/lib/kelas/status";
import { todayJakarta } from "@/lib/time/jakarta";
import type { SessionPayload } from "@/lib/auth/session";

export type Keanggotaan = {
  program: string;
  /** Slug program pemilik halaqah — untuk menaut ke rincian halaqahnya. */
  programSlug: string;
  batch: string | null;
  halaqah: string;
  halaqahId: number | null;
  pengajar: string | null;
  /** Persen hadir (hadir ÷ pertemuan terjadi), null = belum ada data. */
  hadir: number | null;
  status: StatusKelas;
  /** Pertemuan terakhir (ISO), untuk "selesai · 15 Sep". */
  akhir: string | null;
};

export type PesertaBaris = {
  kunci: string;
  nama: string;
  gender: "L" | "P" | null;
  hp: string | null;
  kelas: Keanggotaan[];
  /** Berjalan = masih punya kelas yang belum selesai; selesai = alumni batch yang ada di cermin. */
  status: "berjalan" | "selesai";
};

export type KelasBaris = {
  kunci: string;
  nama: string;
  program: string;
  programSlug: string;
  batch: string | null;
  halaqahId: number | null;
  pengajar: string | null;
  jenis: "L" | "P" | null;
  peserta: number;
  hadir: number | null;
  jadwal: string | null;
  tipe: string | null;
  status: StatusKelas;
  akhir: string | null;
};

const JENIS = (s: string | null | undefined): "L" | "P" | null =>
  !s ? null : /akhwat|perempuan/i.test(s) ? "P" : /ikhwan|laki/i.test(s) ? "L" : null;

async function lingkup(user: SessionPayload) {
  const [visible, all] = await Promise.all([getAccessiblePrograms(user), getAllPrograms()]);
  const baris = susunBaris(visible, all);
  const maahir = baris.filter((b) => b.programs.some((p) => p.dataSourceType === "maahir_api"));
  const cermin = baris.filter((b) => !maahir.includes(b));
  const namaBaris = new Map<string, string>();
  for (const b of cermin) for (const id of b.statsIds) if (!namaBaris.has(id)) namaBaris.set(id, b.name);
  const slugById = new Map(all.map((p) => [p.id, p.slug]));
  return { maahir, namaBaris, slugById };
}

async function barisCermin(namaBaris: Map<string, string>) {
  const ids = [...namaBaris.keys()];
  if (ids.length === 0) return [];
  const idArr = sql`array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]`;
  const res = await getDb().execute(sql`
    select s.program_id, p.data_source_type src, s.tilawah_user_id uid, s.name, s.phone, s.gender,
      s.attendance_rate, s.halaqah_id hid, h.id is not null h_ada, coalesce(h.nama_tampil, h.name) halaqah, h.name nama_asli,
      coalesce(h.pengajar, s.pengajar) pengajar, h.type, h.day, h.session, h.raw->'batch'->>'name' batch_nama,
      h.raw->'kelas'->'periode'->>'nama' periode, h.raw->'kelas'->>'gender' kelas_gender
    from students_sync s
    join programs p on p.id = s.program_id
    -- LEFT join, sama dengan Beranda: peserta aktif yang halaqahnya sudah
    -- terpangkas dari cermin tetap terhitung (kelasnya ditandai di tampilan).
    left join halaqah_sync h on h.program_id = s.program_id and h.tilawah_halaqah_id = s.halaqah_id
    where s.program_id = any(${idArr}) and s.halaqah_id is not null and ${pesertaAktif("s")}
      and ${bukanKelasDemo("h.name")} and ${bukanAkunSampah("s.name")}`);
  return res.rows as Record<string, unknown>[];
}

async function kelasMaahir() {
  const [bulanIni, bulanLalu] = rekapMonths();
  const read = (await readKehadiran(bulanIni)) ?? (await readKehadiran(bulanLalu));
  const kelas = Array.isArray(read?.payload) ? read.payload : [];
  return kelas.filter((k) => (k.anggota?.length ?? 0) > 0);
}

/** Status kelas satu baris cermin (lib/kelas/status.ts). */
function statusBaris(r: Record<string, unknown>, rentang: PetaRentang, hariIni: string): { status: StatusKelas; akhir: string | null } {
  const rg = rentang.kelas(String(r.program_id), r.hid == null ? null : Number(r.hid), String(r.src), (r.periode as string | null) ?? null);
  return { status: statusDariRentang(rg, hariIni), akhir: rg?.akhir ?? null };
}

const angka = (v: unknown): number | null => (v == null ? null : Math.round(Number(v) * 10) / 10);

export async function getDirektoriPeserta(user: SessionPayload): Promise<PesertaBaris[]> {
  const { maahir, namaBaris, slugById } = await lingkup(user);
  const [rows, mKelas, rentang] = await Promise.all([
    barisCermin(namaBaris),
    maahir.length ? kelasMaahir() : Promise.resolve([]),
    bacaRentangKelas([...namaBaris.keys()]),
  ]);
  const hariIni = todayJakarta();
  const per = new Map<string, PesertaBaris>();
  const akun: AkunPeserta[] = [];
  for (const r of rows) {
    const kunci = `${r.src}:${r.uid}`;
    akun.push({ kunci, sumber: "cermin", programSlug: slugById.get(String(r.program_id)) ?? "", nama: String(r.name ?? ""), hp: (r.phone as string | null) ?? null });
    let b = per.get(kunci);
    if (!b) {
      b = { kunci, nama: String(r.name ?? "-").trim(), gender: null, hp: null, kelas: [], status: "berjalan" };
      per.set(kunci, b);
    }
    // students_sync.gender sering kosong; nama halaqah / jenis kelas mabni jadi cadangan.
    b.gender ??= r.gender === 1 ? "L" : r.gender === 2 ? "P" : JENIS(String(r.nama_asli ?? "")) ?? JENIS(r.kelas_gender as string);
    b.hp ??= (r.phone as string | null) || null;
    b.kelas.push({
      program: namaBaris.get(String(r.program_id)) ?? "-",
      programSlug: slugById.get(String(r.program_id)) ?? "",
      batch: rapikanBatch((r.batch_nama as string | null) ?? (r.periode as string | null)),
      halaqah: r.h_ada ? String(r.halaqah ?? "-") : `Halaqah #${r.hid} (tidak ada di cermin)`,
      halaqahId: r.h_ada && r.hid != null ? Number(r.hid) : null,
      pengajar: (r.pengajar as string | null) ?? null,
      hadir: angka(r.attendance_rate),
      ...statusBaris(r, rentang, hariIni),
    });
  }
  const slugMaahir = maahir[0]?.slug ?? "";
  for (const k of mKelas) {
    for (const a of k.anggota ?? []) {
      const kunci = `maahir:${a.anggotaId}`;
      akun.push({ kunci, sumber: "maahir", programSlug: "maahir", nama: String(a.name ?? ""), hp: null });
      let b = per.get(kunci);
      if (!b) {
        b = { kunci, nama: String(a.name ?? "-").trim(), gender: JENIS(k.gender), hp: null, kelas: [], status: "berjalan" };
        per.set(kunci, b);
      }
      b.kelas.push({
        program: "Kelas Maahir",
        programSlug: slugMaahir,
        batch: null,
        halaqah: k.kelasName,
        halaqahId: null,
        pengajar: null,
        hadir: angka(a.persenHadir),
        status: "berjalan",
        akhir: null,
      });
    }
  }
  return gabungPerOrang([...per.values()], akun).sort((a, b) => urutNama.compare(a.nama, b.nama));
}

const urutNama = new Intl.Collator("id", { sensitivity: "base" });

/** Nama tampil: yang bukan HURUF BESAR semua, lalu yang terpanjang ("Muhammad Yasser…" > "M. YASSER…"). */
function namaTerbaik(nama: string[]): string {
  const skor = (n: string) => (n === n.toUpperCase() ? 0 : 1000) + n.replace(/\([^)]*\)/g, "").length;
  return [...nama].sort((a, b) => skor(b) - skor(a))[0];
}

/**
 * Satu baris per orang, bukan per akun — aturan gabung yang sama dengan angka
 * Beranda (lib/peserta/identitas.ts), supaya jumlah baris = angka kartunya.
 */
function gabungPerOrang(baris: PesertaBaris[], akun: AkunPeserta[]): PesertaBaris[] {
  const { orangDari } = kelompokkanPeserta(akun);
  const per = new Map<string, PesertaBaris[]>();
  for (const b of baris) {
    const k = orangDari.get(b.kunci) ?? b.kunci;
    per.set(k, [...(per.get(k) ?? []), b]);
  }
  return [...per.entries()].map(([kunci, grup]) => {
    const b: PesertaBaris =
      grup.length === 1
        ? grup[0]
        : {
            kunci,
            nama: namaTerbaik(grup.map((x) => x.nama)),
            gender: grup.find((x) => x.gender)?.gender ?? null,
            hp: grup.find((x) => x.hp)?.hp ?? null,
            kelas: grup.flatMap((x) => x.kelas),
            status: "berjalan",
          };
    // Kelas berjalan dulu, lalu yang baru selesai.
    b.kelas.sort((x, y) => Number(x.status === "selesai") - Number(y.status === "selesai") || (y.akhir ?? "").localeCompare(x.akhir ?? ""));
    b.status = masihAktif(b.kelas.map((k) => k.status)) ? "berjalan" : "selesai";
    return b;
  });
}

export async function getDirektoriKelas(user: SessionPayload): Promise<KelasBaris[]> {
  const { maahir, namaBaris, slugById } = await lingkup(user);
  const [rows, mKelas, rentang] = await Promise.all([
    barisCermin(namaBaris),
    maahir.length ? kelasMaahir() : Promise.resolve([]),
    bacaRentangKelas([...namaBaris.keys()]),
  ]);
  const hariIni = todayJakarta();
  const per = new Map<string, KelasBaris & { _rate: number[] }>();
  for (const r of rows) {
    // Kelas = halaqah yang ada di cermin (Beranda menghitung kelas dari halaqah_sync).
    if (!r.h_ada) continue;
    const kunci = `${r.program_id}:${r.hid}`;
    let k = per.get(kunci);
    if (!k) {
      const hari = (r.day as string | null) ?? null;
      const sesi = (r.session as string | null) ?? null;
      k = {
        kunci,
        nama: String(r.halaqah ?? "-"),
        program: namaBaris.get(String(r.program_id)) ?? "-",
        programSlug: slugById.get(String(r.program_id)) ?? "",
        batch: rapikanBatch((r.batch_nama as string | null) ?? (r.periode as string | null)),
        halaqahId: r.hid == null ? null : Number(r.hid),
        pengajar: (r.pengajar as string | null) ?? null,
        jenis: JENIS(String(r.nama_asli ?? "")) ?? JENIS(r.kelas_gender as string),
        peserta: 0,
        hadir: null,
        jadwal: [hari, sesi].filter(Boolean).join(" · ") || null,
        tipe: (r.type as string | null) ?? null,
        ...statusBaris(r, rentang, hariIni),
        _rate: [],
      };
      per.set(kunci, k);
    }
    k.peserta += 1;
    if (r.attendance_rate != null) k._rate.push(Number(r.attendance_rate));
  }
  const slugMaahir = maahir[0]?.slug ?? "";
  for (const m of mKelas) {
    const rates = (m.anggota ?? []).map((a) => a.persenHadir).filter((x): x is number => x != null);
    per.set(`maahir:${m.kelasId}`, {
      kunci: `maahir:${m.kelasId}`,
      nama: m.kelasName,
      program: "Kelas Maahir",
      programSlug: slugMaahir,
      batch: null,
      halaqahId: null,
      pengajar: null,
      jenis: JENIS(m.gender),
      peserta: m.anggota?.length ?? 0,
      hadir: null,
      jadwal: m.jadwalHari?.length ? m.jadwalHari.join(", ") : null,
      tipe: null,
      status: "berjalan",
      akhir: null,
      _rate: rates,
    });
  }
  return [...per.values()]
    .map(({ _rate, ...k }) => ({
      ...k,
      hadir: _rate.length ? Math.round((_rate.reduce((a, b) => a + b, 0) / _rate.length) * 10) / 10 : null,
    }))
    .sort((a, b) => a.program.localeCompare(b.program) || a.nama.localeCompare(b.nama, "id", { numeric: true }));
}
