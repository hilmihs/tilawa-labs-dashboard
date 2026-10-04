/**
 * Saringan & halaman untuk /peserta dan /kelas — murni, supaya bisa diuji.
 * Parameter URL tidak dipercaya: semuanya dibaca lewat `baca*`.
 */
import type { KelasBaris, PesertaBaris } from "./direktori";

export const AMBANG_HADIR = 70;
export const PER_HALAMAN = 100;

type SP = Record<string, string | string[] | undefined>;
const satu = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
};
const kunci = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Tab status. Tanpa nilai = berjalan (bawaan, sama dengan angka Beranda). */
export type TabStatus = "selesai" | "semua";
export type SaringPeserta = { q?: string; program?: string; g?: "L" | "P"; hadir?: "rendah" | "kosong"; status?: TabStatus; hal: number };
export type SaringKelas = { q?: string; program?: string; g?: "L" | "P"; hadir?: "rendah"; urut?: "peserta" | "hadir"; status?: TabStatus; hal?: number };

const halDari = (v: string | undefined) => {
  const n = Number(v ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
};
const bacaTab = (v: string | undefined): TabStatus | undefined => (v === "selesai" || v === "semua" ? v : undefined);

/** Cocok dengan tab: berjalan (bawaan) = belum selesai; selesai; semua. */
export function cocokTab(status: string, tab: TabStatus | undefined): boolean {
  if (tab === "semua") return true;
  return tab === "selesai" ? status === "selesai" : status !== "selesai";
}

export function bacaSaringPeserta(sp: SP): SaringPeserta {
  const g = satu(sp, "g");
  const hadir = satu(sp, "hadir");
  const hal = Number(satu(sp, "hal") ?? 1);
  return {
    q: satu(sp, "q")?.slice(0, 80),
    program: satu(sp, "program")?.slice(0, 120),
    g: g === "L" || g === "P" ? g : undefined,
    hadir: hadir === "rendah" || hadir === "kosong" ? hadir : undefined,
    status: bacaTab(satu(sp, "status")),
    hal: Number.isInteger(hal) && hal > 0 ? hal : 1,
  };
}

export function bacaSaringKelas(sp: SP): SaringKelas {
  const g = satu(sp, "g");
  const urut = satu(sp, "urut");
  return {
    q: satu(sp, "q")?.slice(0, 80),
    program: satu(sp, "program")?.slice(0, 120),
    g: g === "L" || g === "P" ? g : undefined,
    hadir: satu(sp, "hadir") === "rendah" ? "rendah" : undefined,
    urut: urut === "peserta" || urut === "hadir" ? urut : undefined,
    status: bacaTab(satu(sp, "status")),
    hal: halDari(satu(sp, "hal")),
  };
}

/** Persen hadir terendah di antara kelas-kelasnya — yang paling perlu perhatian. */
export const hadirTerendah = (r: PesertaBaris): number | null => {
  const v = r.kelas.map((k) => k.hadir).filter((x): x is number => x != null);
  return v.length ? Math.min(...v) : null;
};

/** Semua saringan peserta KECUALI kehadiran — untuk menghitung chip kehadiran. */
export function saringPesertaDasar(rows: PesertaBaris[], s: SaringPeserta): PesertaBaris[] {
  const q = s.q ? kunci(s.q) : null;
  const digit = (s.q ?? "").replace(/\D/g, "").replace(/^(62|0)/, "");
  return rows.filter(
    (r) =>
      (!q ||
        kunci(r.nama).includes(q) ||
        (digit.length >= 4 && (r.hp ?? "").replace(/\D/g, "").includes(digit)) ||
        r.kelas.some((k) => kunci(k.halaqah).includes(q) || kunci(k.pengajar ?? "").includes(q))) &&
      (!s.program || r.kelas.some((k) => k.program === s.program)) &&
      (!s.g || r.gender === s.g) &&
      cocokTab(r.status, s.status),
  );
}

export function saringPeserta(rows: PesertaBaris[], s: SaringPeserta): PesertaBaris[] {
  return saringPesertaDasar(rows, s).filter((r) => {
    if (!s.hadir) return true;
    const h = hadirTerendah(r);
    return s.hadir === "kosong" ? h == null : h != null && h < AMBANG_HADIR;
  });
}

export function saringKelas(rows: KelasBaris[], s: SaringKelas): KelasBaris[] {
  const q = s.q ? kunci(s.q) : null;
  const out = rows.filter(
    (r) =>
      (!q || kunci(r.nama).includes(q) || kunci(r.pengajar ?? "").includes(q)) &&
      (!s.program || r.program === s.program) &&
      (!s.g || r.jenis === s.g) &&
      (!s.hadir || (r.hadir != null && r.hadir < AMBANG_HADIR)) &&
      cocokTab(r.status, s.status),
  );
  if (s.urut === "peserta") return [...out].sort((a, b) => b.peserta - a.peserta);
  if (s.urut === "hadir") return [...out].sort((a, b) => (a.hadir ?? 101) - (b.hadir ?? 101));
  return out;
}

export function halaman<T>(rows: T[], hal: number): { isi: T[]; hal: number; jumlahHal: number } {
  const jumlahHal = Math.max(1, Math.ceil(rows.length / PER_HALAMAN));
  const h = Math.min(hal, jumlahHal);
  return { isi: rows.slice((h - 1) * PER_HALAMAN, h * PER_HALAMAN), hal: h, jumlahHal };
}

/** Query string dari objek saringan, dengan sebagian nilai ditimpa. */
export function qs(s: Record<string, string | number | undefined>, ubah: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...s, ...ubah })) if (v !== undefined && v !== "" && !(k === "hal" && v === 1)) p.set(k, String(v));
  const t = p.toString();
  return t ? `?${t}` : "";
}
