/**
 * Satu orang Maahir, dari semua entitas yang menyebutnya → bagian-bagian siap
 * render untuk `/[program]/peserta/[orang]`.
 *
 * Modul MURNI: tanpa DB, tanpa `next/*`. Pembacaan ada di `queries.ts`.
 *
 * Aturan yang sama dengan roster (`../maahir-view-model.ts`) berlaku di sini:
 *
 * 1. **Angka resmi hanya dari rekap.** Persen kehadiran, level SP, capaian
 *    setoran — semuanya disalin dari `maahir_rekap`, tidak dihitung ulang dari
 *    baris mentah (`docs/API-PUBLIC.md` §9: sesi sakit keluar dari penyebut,
 *    pemutihan memaksa 100%, penyebut terpotong untuk yang masuk di tengah).
 *    Baris mentah di halaman ini adalah RIWAYAT — satu baris per kejadian.
 * 2. **Identitas tidak dikarang.** Kunci URL adalah id `peserta` atau id
 *    `anggota`. Enrolmen yang menunjuk `peserta_id` dialihkan ke halaman
 *    pesertanya; enrolmen lepas tetap berdiri sendiri — dua enrolmen bernama
 *    sama tidak digabung.
 * 3. **null = belum ada, bukan nol / bukan "tidak".**
 */
import type {
  MaahirAnggota,
  MaahirKehadiranEntity,
  MaahirLiburEntity,
  MaahirOrang,
  MaahirPemutihanEntity,
  MaahirPertemuanEntity,
  MaahirPeserta,
  MaahirProgramKelas,
  MaahirRekamanEntity,
  MaahirSetoranEntity,
} from "@/lib/maahir/entities";

// ── Identitas ──────────────────────────────────────────────────────────────

export type OrangResolusi =
  | { jenis: "peserta"; peserta: MaahirPeserta; anggota: MaahirAnggota[] }
  | { jenis: "anggota"; anggota: MaahirAnggota }
  /** Kunci adalah enrolmen milik seorang peserta — halaman yang benar adalah miliknya. */
  | { jenis: "alihkan"; pesertaId: string }
  | { jenis: "tidak-ada" };

export function resolveOrang(
  key: string,
  peserta: MaahirPeserta[],
  anggota: MaahirAnggota[],
): OrangResolusi {
  const p = peserta.find((x) => x.id === key);
  if (p) return { jenis: "peserta", peserta: p, anggota: anggota.filter((a) => a.peserta_id === p.id) };
  const a = anggota.find((x) => x.id === key);
  if (!a) return { jenis: "tidak-ada" };
  // Enrolmen yang menunjuk peserta yang TIDAK ada di cermin tetap dibuka sebagai
  // enrolmen — mengalihkan ke halaman yang akan 404 lebih buruk dari ini.
  if (a.peserta_id && peserta.some((x) => x.id === a.peserta_id)) {
    return { jenis: "alihkan", pesertaId: a.peserta_id };
  }
  return { jenis: "anggota", anggota: a };
}

// ── Label ──────────────────────────────────────────────────────────────────

export const STATUS_KEHADIRAN: Record<string, { label: string; kode: string }> = {
  hadir: { label: "Hadir", kode: "H" },
  terlambat: { label: "Terlambat", kode: "T" },
  izin: { label: "Izin", kode: "I" },
  sakit: { label: "Sakit", kode: "S" },
  tidak_ada_keterangan: { label: "Alpa", kode: "A" },
};

/** Status yang belum dikenal tetap tercetak apa adanya. */
export function labelStatusKehadiran(status: string | null): string {
  if (!status) return "—";
  return STATUS_KEHADIRAN[status]?.label ?? status;
}

export const STATUS_SETORAN: Record<string, string> = {
  draft: "Draf",
  submitted: "Dikirim, belum dicek",
  checked: "Sudah dicek",
};

export function labelStatusSetoran(status: string | null): string {
  if (!status) return "—";
  return STATUS_SETORAN[status] ?? status;
}

const JENIS_REKAMAN: Record<string, string> = {
  jazariyyah: "Jazariyyah",
  syawahid: "Syawahid",
  tuhfatul_athfal: "Tuhfatul Athfal",
};

export function labelJenisRekaman(jenis: string | null): string {
  if (!jenis) return "—";
  return JENIS_REKAMAN[jenis] ?? jenis.replace(/_/g, " ");
}

/** 538 → "8:58". null → "—" (durasi tidak tercatat, bukan nol detik). */
export function durasiLabel(detik: number | null): string {
  if (detik == null || !Number.isFinite(detik)) return "—";
  const s = Math.max(0, Math.round(detik));
  const jam = Math.floor(s / 3600);
  const menit = Math.floor((s % 3600) / 60);
  const sisa = String(s % 60).padStart(2, "0");
  return jam > 0 ? `${jam}:${String(menit).padStart(2, "0")}:${sisa}` : `${menit}:${sisa}`;
}

/** "14:00:00" → "14.00". */
export function jamLabel(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}.${m[2]}` : t;
}

/** ISO timestamp → "6 Sep 2026 17.00" dalam WIB. null → "—". */
export function waktuWib(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ── Riwayat kehadiran (mentah) ─────────────────────────────────────────────

export type RiwayatKehadiranBaris = {
  id: string;
  /** `YYYY-MM-DD`; null bila pertemuannya tidak ada di cermin. */
  tanggal: string | null;
  kegiatan: string | null;
  programKelasNama: string | null;
  jam: string | null;
  status: string | null;
  mode: string | null;
  setoranHalaman: number | null;
  /** Sensitif (§7) — alasan tidak hadir. Hanya di layar ber-login. */
  catatan: string | null;
  diisiAt: string | null;
};

export function buildRiwayatKehadiran(
  kehadiran: MaahirKehadiranEntity[],
  pertemuan: MaahirPertemuanEntity[],
  programKelas: Pick<MaahirProgramKelas, "id" | "name">[],
): RiwayatKehadiranBaris[] {
  const pById = new Map(pertemuan.map((p) => [p.id, p]));
  const pkById = new Map(programKelas.map((pk) => [pk.id, pk.name]));
  return kehadiran
    .map((k) => {
      const p = k.pertemuan_id ? pById.get(k.pertemuan_id) : undefined;
      const mulai = jamLabel(p?.waktu_mulai ?? null);
      const selesai = jamLabel(p?.waktu_selesai ?? null);
      return {
        id: k.id,
        tanggal: p?.tanggal ?? null,
        kegiatan: p?.nama_kegiatan ?? null,
        programKelasNama: p?.program_kelas_id ? (pkById.get(p.program_kelas_id) ?? null) : null,
        jam: mulai && selesai ? `${mulai}–${selesai}` : (mulai ?? null),
        status: k.status,
        mode: k.mode,
        setoranHalaman: k.setoran_halaman,
        catatan: k.catatan && k.catatan.trim() !== "" ? k.catatan : null,
        diisiAt: k.diisi_at,
      };
    })
    .sort(
      (a, b) =>
        // Terbaru di atas; baris tanpa pertemuan di paling bawah.
        (b.tanggal ?? "").localeCompare(a.tanggal ?? "") ||
        (b.jam ?? "").localeCompare(a.jam ?? "") ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Cacah baris riwayat per status — PANJANG DAFTAR yang sedang dirender, untuk
 * chip saringan. Bukan persentase dan tidak boleh ditaruh di sebelah `%`:
 * sesi sakit dan pemutihan tidak diperlakukan di sini seperti di rekap.
 */
export function cacahPerStatus(rows: RiwayatKehadiranBaris[]): { status: string; n: number }[] {
  const n = new Map<string, number>();
  for (const r of rows) {
    const s = r.status ?? "(kosong)";
    n.set(s, (n.get(s) ?? 0) + 1);
  }
  const urutan = Object.keys(STATUS_KEHADIRAN);
  return [...n.entries()]
    .map(([status, jumlah]) => ({ status, n: jumlah }))
    .sort((a, b) => {
      const ia = urutan.indexOf(a.status);
      const ib = urutan.indexOf(b.status);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.status.localeCompare(b.status);
    });
}

// ── Setoran pekanan + rekaman ──────────────────────────────────────────────

export type RekamanBaris = {
  id: string;
  jenis: string | null;
  durasiDetik: number | null;
  nilai: string | null;
  recordedAt: string | null;
  checkedAt: string | null;
};

export type SetoranBaris = {
  id: string;
  weekStart: string | null;
  status: string | null;
  submittedAt: string | null;
  checkedAt: string | null;
  /** Nama musyrif pengecek; null = belum dicek ATAU musyrif-nya tak ada di cermin. */
  pengecek: string | null;
  rekaman: RekamanBaris[];
};

export function buildSetoran(
  setoran: MaahirSetoranEntity[],
  rekaman: MaahirRekamanEntity[],
  musyrif: Pick<MaahirOrang, "id" | "name">[],
): SetoranBaris[] {
  const mById = new Map(musyrif.map((m) => [m.id, m.name]));
  const perSetoran = new Map<string, RekamanBaris[]>();
  for (const r of rekaman) {
    if (!r.setoran_id) continue;
    const row: RekamanBaris = {
      id: r.id,
      jenis: r.jenis,
      durasiDetik: r.duration_seconds,
      nilai: r.nilai,
      recordedAt: r.recorded_at ?? r.created_at,
      checkedAt: r.checked_at,
    };
    const b = perSetoran.get(r.setoran_id);
    if (b) b.push(row);
    else perSetoran.set(r.setoran_id, [row]);
  }
  return setoran
    .map((s) => ({
      id: s.id,
      weekStart: s.week_start,
      status: s.status,
      submittedAt: s.submitted_at,
      checkedAt: s.checked_at,
      pengecek: s.checked_by_musyrif_id ? (mById.get(s.checked_by_musyrif_id) ?? null) : null,
      rekaman: (perSetoran.get(s.id) ?? []).sort(
        (a, b) =>
          labelJenisRekaman(a.jenis).localeCompare(labelJenisRekaman(b.jenis), "id") ||
          (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""),
      ),
    }))
    .sort((a, b) => (b.weekStart ?? "").localeCompare(a.weekStart ?? "") || a.id.localeCompare(b.id));
}

// ── Pemutihan & libur ──────────────────────────────────────────────────────

export function urutPemutihan(rows: MaahirPemutihanEntity[]): MaahirPemutihanEntity[] {
  return [...rows].sort(
    (a, b) =>
      (b.month ?? "").localeCompare(a.month ?? "") ||
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}

export type LiburBaris = {
  id: string;
  programKelasNama: string | null;
  mulai: string | null;
  selesai: string | null;
  keterangan: string | null;
};

export function buildLibur(
  libur: MaahirLiburEntity[],
  programKelas: Pick<MaahirProgramKelas, "id" | "name">[],
): LiburBaris[] {
  const pkById = new Map(programKelas.map((pk) => [pk.id, pk.name]));
  return libur
    .map((l) => ({
      id: l.id,
      programKelasNama: l.program_kelas_id ? (pkById.get(l.program_kelas_id) ?? null) : null,
      mulai: l.tanggal_mulai,
      selesai: l.tanggal_selesai,
      keterangan: l.keterangan,
    }))
    .sort((a, b) => (b.mulai ?? "").localeCompare(a.mulai ?? "") || a.id.localeCompare(b.id));
}
