/**
 * Evaluasi Halaqah (Maahir) — nilai per sesi & rapot peserta, murni.
 *
 * Sumbernya modul Evaluasi Halaqah di Maahir (scope `evaluasi`), dicerminkan
 * mentah ke `maahir_sync` oleh lib/sync/maahir-sync.ts. Pengajar menilai
 * bacaan per sesi (QN / PB / ujian); angka `skor` dihitung Maahir dari jumlah
 * lahn, dashboard tidak menghitung ulang.
 *
 * Aturan yang dipegang di sini (docs/API-PUBLIC.md §3.4 repo Maahir):
 * - Hanya sesi `terkirim` yang final; nilai sesi `draft` masih bisa diubah
 *   pengajar. Tetap IKUT dihitung — di Sep 2026 dua pertiga peserta Juni hanya
 *   punya nilai di sesi draft, dan menyembunyikannya membuat mereka tampak
 *   belum dinilai — tapi selalu ditandai (`draft`, `pesertaFinal`) supaya angka
 *   sementara tidak terbaca final. Sesi `dihapus` tidak pernah dihitung.
 * - Rapot yang berlaku hanya `status = aktif`. `jenis_rapot` tidak pernah
 *   dicampur: `berkala_avg` berarti lain di tiap jenis.
 * - Lulus/tidak diambil dari kolom `lulus` rapot (ambang dibekukan saat terbit),
 *   bukan dibandingkan dengan angka 65 di sini.
 *
 * Id peserta berbentuk `<slug program>:<tilawah_user_id>` (atau `manual:…`
 * untuk peserta yang ditambah pengajar sendiri), halaqah `<slug>:<id halaqah>`.
 */

export type JenisSesi = "qn" | "pb" | "ujian";

export type EvalHalaqah = { id: string; nama: string | null; gender: string | null; pengajarId: string | null; ambangUjian: number | null };
export type EvalPengajar = { id: string; nama: string | null };
export type EvalPeserta = { id: string; nama: string | null; gender: string | null; halaqahId: string | null; aktif: boolean };
export type EvalSesi = {
  id: string;
  halaqahId: string;
  jenis: JenisSesi;
  nomor: number | null;
  tglJadwal: string | null;
  surat: string | null;
  status: "draft" | "terkirim";
  dihapus: boolean;
  updatedAt: string | null;
  /** Kapan pengajar membuat sesi — poros periode laporan (`tgl_jadwal` jarang terisi). */
  createdAt: string | null;
};
export type EvalNilai = { id: string; sesiId: string; pesertaId: string; hadir: boolean; skor: number | null; updatedAt: string | null };
export type EvalRapot = {
  id: string;
  halaqahId: string | null;
  pesertaId: string;
  jenis: string;
  nilaiAkhir: number | null;
  lulus: boolean | null;
  ambang: number | null;
  status: string;
  diterbitkanAt: string | null;
};

export type EvalMentah = {
  halaqah: EvalHalaqah[];
  pengajar: EvalPengajar[];
  peserta: EvalPeserta[];
  sesi: EvalSesi[];
  nilai: EvalNilai[];
  rapot: EvalRapot[];
};

/** Ringkasan satu jenis sesi untuk satu peserta. */
export type SkorJenis = {
  sesi: number;
  rata: number | null;
  terakhir: number | null;
  /** Berapa dari `sesi` yang masih draft (angka sementara). */
  draft: number;
};

export type RapotRingkas = { jenis: string; nilaiAkhir: number | null; lulus: boolean | null; ambang: number | null; diterbitkanAt: string | null };

export type PesertaNilai = {
  pesertaId: string;
  /** tilawah_user_id dari id `<slug>:<n>`; null untuk peserta `manual:`. */
  tilawahUserId: number | null;
  nama: string | null;
  gender: string | null;
  halaqahId: string | null;
  halaqah: string | null;
  pengajar: string | null;
  qn: SkorJenis;
  pb: SkorJenis;
  ujian: SkorJenis;
  /** Sesi (draft atau terkirim) yang mencatat peserta tidak hadir. */
  tidakHadir: number;
  /** Rapot aktif, satu per jenis_rapot. */
  rapot: RapotRingkas[];
  /** Nilai peserta ini pada sesi yang dibuat di dalam periode laporan (0 tanpa periode). */
  sesiDiPeriode: number;
};

export type HalaqahEval = {
  halaqahId: string;
  halaqah: string | null;
  pengajar: string | null;
  peserta: number;
  pesertaBernilai: number;
  /** Peserta yang punya nilai pada sesi terkirim (final). */
  pesertaFinal: number;
  sesiTerkirim: Record<JenisSesi, number>;
  sesiDraft: number;
  rapotAktif: number;
  rapotLulus: number;
  rataSkor: number | null;
  /** Sesi (draft/terkirim) halaqah ini yang dibuat di dalam periode laporan. */
  sesiDiPeriode: number;
};

export type EvalRingkas = {
  halaqah: number;
  peserta: number;
  pesertaBernilai: number;
  pesertaFinal: number;
  sesiTerkirim: number;
  sesiDraft: number;
  nilaiTercatat: number;
  /** Bagian dari `nilaiTercatat` yang berasal dari sesi draft. */
  nilaiDraft: number;
  rapotAktif: number;
  rapotLulus: number;
  rataSkor: number | null;
  /** `updated_at` nilai/sesi terbaru yang terbaca — seberapa segar datanya. */
  terakhirDinilai: string | null;
  /** Aktivitas di periode laporan; semuanya 0 bila tanpa periode. */
  sesiDiPeriode: number;
  pesertaDiPeriode: number;
  rapotTerbitDiPeriode: number;
};

export type EvalHasil = { peserta: PesertaNilai[]; halaqah: HalaqahEval[]; ringkas: EvalRingkas };

const JENIS: JenisSesi[] = ["qn", "pb", "ujian"];

function rata(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** `hits-regular:1727` → 1727; `manual:…` atau bentuk lain → null. */
export function tilawahUserIdDari(pesertaId: string): number | null {
  const m = /^[a-z0-9-]+:(\d+)$/.exec(pesertaId);
  if (!m || pesertaId.startsWith("manual:")) return null;
  return Number(m[1]);
}

/**
 * Batas periode laporan, tanggal kalender WIB inklusif (YYYY-MM-DD).
 *
 * `sampai` membatasi POSISI: sesi yang dibuat sesudahnya dan rapot yang terbit
 * sesudahnya tidak dihitung. `dari`+`sampai` menentukan AKTIVITAS: sesi yang
 * dibuat di dalam rentang. Mirror hanya menyimpan keadaan terakhir, jadi nilai
 * yang diubah pengajar sesudah `sampai` tetap terbaca dengan angka barunya.
 */
export type OpsiPeriode = { dari?: string; sampai?: string };

/** Instan ISO → tanggal kalender WIB (YYYY-MM-DD). */
export function tanggalWib(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function dalamPeriode(iso: string | null, dari?: string, sampai?: string): boolean {
  if (!iso || !dari || !sampai) return false;
  const t = tanggalWib(iso);
  return t >= dari && t <= sampai;
}

/** Tanpa tanggal = tetap dihitung: lebih baik ikut daripada hilang diam-diam. */
function belumLewat(iso: string | null, sampai?: string): boolean {
  return !sampai || !iso || tanggalWib(iso) <= sampai;
}

/** Urutan sesi dalam satu jenis: tanggal jadwal bila ada, lalu nomor. */
function urutSesi(a: EvalSesi, b: EvalSesi): number {
  const ta = a.tglJadwal ?? "";
  const tb = b.tglJadwal ?? "";
  if (ta !== tb) return ta.localeCompare(tb);
  return (a.nomor ?? 0) - (b.nomor ?? 0);
}

/**
 * Gabungkan mentah menjadi baris per peserta. Peserta yang tampil hanya yang
 * SUDAH punya data nilai: ≥1 skor pada sesi (draft atau terkirim), atau rapot aktif.
 * Peserta tanpa nilai dihitung di ringkasan (`peserta`), tidak dijadikan baris.
 */
export function susunEvaluasi(mentah: EvalMentah, opsi: OpsiPeriode = {}): EvalHasil {
  const m: EvalMentah = {
    ...mentah,
    sesi: mentah.sesi.filter((s) => belumLewat(s.createdAt, opsi.sampai)),
    rapot: mentah.rapot.filter((r) => belumLewat(r.diterbitkanAt, opsi.sampai)),
  };
  const halaqahById = new Map(m.halaqah.map((h) => [h.id, h]));
  const pengajarById = new Map(m.pengajar.map((p) => [p.id, p]));
  const pesertaById = new Map(m.peserta.map((p) => [p.id, p]));
  const sesiById = new Map(m.sesi.map((s) => [s.id, s]));

  const namaPengajar = (halaqahId: string | null) => {
    const h = halaqahId ? halaqahById.get(halaqahId) : undefined;
    return h?.pengajarId ? pengajarById.get(h.pengajarId)?.nama ?? null : null;
  };

  const sesiHidup = m.sesi.filter((s) => !s.dihapus);
  const sesiFinal = sesiHidup.filter((s) => s.status === "terkirim");
  const urutan = new Map([...sesiHidup].sort(urutSesi).map((s, i) => [s.id, i]));
  const diPeriode = new Set(sesiHidup.filter((s) => dalamPeriode(s.createdAt, opsi.dari, opsi.sampai)).map((s) => s.id));

  type Kumpul = {
    skor: Record<JenisSesi, { urut: number; skor: number; draft: boolean }[]>;
    tidakHadir: number;
    diPeriode: number;
    halaqahId: string | null;
  };
  const perPeserta = new Map<string, Kumpul>();
  const ambil = (id: string, halaqahId: string | null): Kumpul => {
    let k = perPeserta.get(id);
    if (!k) {
      k = { skor: { qn: [], pb: [], ujian: [] }, tidakHadir: 0, diPeriode: 0, halaqahId };
      perPeserta.set(id, k);
    }
    return k;
  };

  let terakhir: string | null = null;
  let nilaiTercatat = 0;
  let nilaiDraft = 0;
  for (const n of m.nilai) {
    const s = sesiById.get(n.sesiId);
    if (!s || s.dihapus) continue;
    if (n.updatedAt && (!terakhir || n.updatedAt > terakhir)) terakhir = n.updatedAt;
    const k = ambil(n.pesertaId, pesertaById.get(n.pesertaId)?.halaqahId ?? s.halaqahId);
    if (!n.hadir) {
      k.tidakHadir++;
      continue;
    }
    if (n.skor == null) continue;
    const draft = s.status !== "terkirim";
    k.skor[s.jenis]?.push({ urut: urutan.get(s.id) ?? 0, skor: n.skor, draft });
    nilaiTercatat++;
    if (draft) nilaiDraft++;
    if (diPeriode.has(s.id)) k.diPeriode++;
  }

  const rapotAktif = m.rapot.filter((r) => r.status === "aktif");
  const rapotPerPeserta = new Map<string, EvalRapot[]>();
  for (const r of rapotAktif) {
    const list = rapotPerPeserta.get(r.pesertaId) ?? [];
    list.push(r);
    rapotPerPeserta.set(r.pesertaId, list);
    ambil(r.pesertaId, pesertaById.get(r.pesertaId)?.halaqahId ?? r.halaqahId);
  }

  const peserta: PesertaNilai[] = [];
  for (const [id, k] of perPeserta) {
    const rapot = (rapotPerPeserta.get(id) ?? [])
      .sort((a, b) => a.jenis.localeCompare(b.jenis))
      .map((r) => ({ jenis: r.jenis, nilaiAkhir: r.nilaiAkhir, lulus: r.lulus, ambang: r.ambang, diterbitkanAt: r.diterbitkanAt }));
    const adaSkor = JENIS.some((j) => k.skor[j].length > 0);
    if (!adaSkor && rapot.length === 0) continue; // hanya absen, belum ada angka
    const skorJenis = (j: JenisSesi): SkorJenis => {
      const list = [...k.skor[j]].sort((a, b) => a.urut - b.urut);
      return {
        sesi: list.length,
        rata: rata(list.map((x) => x.skor)),
        terakhir: list.length ? list[list.length - 1].skor : null,
        draft: list.filter((x) => x.draft).length,
      };
    };
    const p = pesertaById.get(id);
    const h = k.halaqahId ? halaqahById.get(k.halaqahId) : undefined;
    peserta.push({
      pesertaId: id,
      tilawahUserId: tilawahUserIdDari(id),
      nama: p?.nama ?? null,
      gender: p?.gender ?? null,
      halaqahId: k.halaqahId,
      halaqah: h?.nama ?? null,
      pengajar: namaPengajar(k.halaqahId),
      qn: skorJenis("qn"),
      pb: skorJenis("pb"),
      ujian: skorJenis("ujian"),
      tidakHadir: k.tidakHadir,
      rapot,
      sesiDiPeriode: k.diPeriode,
    });
  }
  peserta.sort((a, b) => (a.halaqah ?? "").localeCompare(b.halaqah ?? "") || (a.nama ?? "").localeCompare(b.nama ?? ""));

  // ── per halaqah ──
  const halaqah: HalaqahEval[] = m.halaqah.map((h) => {
    const sesiH = m.sesi.filter((s) => s.halaqahId === h.id && !s.dihapus);
    const sesiTerkirim = { qn: 0, pb: 0, ujian: 0 } as Record<JenisSesi, number>;
    for (const s of sesiH) if (s.status === "terkirim" && sesiTerkirim[s.jenis] !== undefined) sesiTerkirim[s.jenis]++;
    const barisH = peserta.filter((p) => p.halaqahId === h.id);
    const rapotH = rapotAktif.filter((r) => (pesertaById.get(r.pesertaId)?.halaqahId ?? r.halaqahId) === h.id);
    const skorH = barisH.flatMap((p) => JENIS.flatMap((j) => (p[j].rata == null ? [] : [p[j].rata as number])));
    return {
      halaqahId: h.id,
      halaqah: h.nama,
      pengajar: namaPengajar(h.id),
      peserta: m.peserta.filter((p) => p.halaqahId === h.id && p.aktif).length,
      pesertaBernilai: barisH.length,
      pesertaFinal: barisH.filter(adaFinal).length,
      sesiTerkirim,
      sesiDraft: sesiH.filter((s) => s.status === "draft").length,
      rapotAktif: rapotH.length,
      rapotLulus: rapotH.filter((r) => r.lulus === true).length,
      rataSkor: rata(skorH),
      sesiDiPeriode: sesiH.filter((s) => diPeriode.has(s.id)).length,
    };
  });
  halaqah.sort((a, b) => (a.halaqah ?? "").localeCompare(b.halaqah ?? "", "id", { numeric: true }));

  for (const s of m.sesi) if (s.updatedAt && (!terakhir || s.updatedAt > terakhir)) terakhir = s.updatedAt;

  const semuaSkor = peserta.flatMap((p) => JENIS.flatMap((j) => (p[j].rata == null ? [] : [p[j].rata as number])));
  return {
    peserta,
    halaqah,
    ringkas: {
      halaqah: m.halaqah.length,
      peserta: m.peserta.filter((p) => p.aktif).length,
      pesertaBernilai: peserta.length,
      pesertaFinal: peserta.filter(adaFinal).length,
      sesiTerkirim: sesiFinal.length,
      sesiDraft: sesiHidup.length - sesiFinal.length,
      nilaiTercatat,
      nilaiDraft,
      rapotAktif: rapotAktif.length,
      rapotLulus: rapotAktif.filter((r) => r.lulus === true).length,
      rataSkor: rata(semuaSkor),
      terakhirDinilai: terakhir,
      sesiDiPeriode: diPeriode.size,
      pesertaDiPeriode: peserta.filter((p) => p.sesiDiPeriode > 0).length,
      rapotTerbitDiPeriode: rapotAktif.filter((r) => dalamPeriode(r.diterbitkanAt, opsi.dari, opsi.sampai)).length,
    },
  };
}

/** Punya angka final: ≥1 skor dari sesi terkirim, atau rapot aktif. */
export function adaFinal(p: PesertaNilai): boolean {
  return p.rapot.length > 0 || JENIS.some((j) => p[j].sesi > p[j].draft);
}

/** Semua angka sesinya masih dari draft (dan belum ada rapot). */
export function hanyaDraft(p: PesertaNilai): boolean {
  return !adaFinal(p);
}

export const JENIS_RAPOT_LABEL: Record<string, string> = {
  qn: "QN",
  pb: "PB",
  ujian_qn: "Ujian QN",
  ujian_pb: "Ujian PB",
  berkala: "Berkala",
  ujian: "Ujian",
};
