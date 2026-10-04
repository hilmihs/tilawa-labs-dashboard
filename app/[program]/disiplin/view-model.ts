/**
 * `rekap/hits-disiplin` → the per-program discipline screen.
 *
 * Three things this module exists to keep straight, all of them ways the screen
 * would otherwise lie:
 *
 * 1. **The route answers for ALL of HITS at once.** The 3 Sep 2026 capture holds
 *    148 pengajar spread over eight batches. A coordinator owns one batch, so
 *    rows are kept only when the teacher holds a halaqah in the pinned batch —
 *    otherwise every coordinator opens the same 148-row table.
 * 2. **The scores are NOT batch-scoped even after that filter.** Upstream
 *    aggregates every halaqah a teacher holds, and in the same capture 69 of the
 *    90 teachers kept for the Juni batch also teach in another batch. So the row
 *    that survives still counts meetings from elsewhere. `halaqahLuarBatch` is
 *    how the screen says that out loud instead of implying "batch ini saja".
 *    Incidents, debts and the coverage detail DO carry a `halaqahId`, so those
 *    are genuinely scoped here.
 * 3. **`noData` is not zero.** A teacher with nothing to score in the window has
 *    `pct* = null` and `rank = null`; upstream keeps them in a separate bucket so
 *    they do not rank last. Rendering them as 0% would report perfect failure for
 *    a teacher who simply had no meetings.
 *
 * Nothing here recomputes a business rule from raw entities (docs §9 forbids it).
 * The only derived flag is `bermasalah`, and only because the definition was
 * checked against upstream's own `counts.bermasalah`: `kmt + kbla + jkg +
 * tidakLatihan > 0` reproduces its 57/148 on the fixture exactly. `obsLengkap`
 * likewise reproduces upstream's 52 as `cakupan.persen === 100`.
 */
import type {
  MaahirDisiplinCakupan,
  MaahirDisiplinHutang,
  MaahirDisiplinInsiden,
  MaahirDisiplinJenis,
  MaahirDisiplinRanked,
  MaahirHitsDisiplinPayload,
} from "@/lib/maahir/types";

/** One teacher, narrowed to the program's batch as far as the payload allows. */
export type DisiplinRow = {
  pengajarId: string;
  /** "—" upstream when the halaqah has no teacher assigned; kept verbatim. */
  nama: string;
  gender: "ikhwan" | "akhwat";
  /** Upstream's rank — across ALL of HITS, not within this batch. Null in `noData`. */
  rank: number | null;
  halaqahDiBatch: number;
  /** Halaqah counted in the scores but held outside this batch. */
  halaqahLuarBatch: number;
  kbbs: number;
  nonLibur: number;
  kmt: number;
  kbla: number;
  jkg: number;
  tidakLatihan: number;
  onTimeBaik: number;
  onTimeTotal: number;
  stabilBaik: number;
  stabilTotal: number;
  hutangSaldo: number;
  pctKbbs: number | null;
  pctOnTime: number | null;
  pctStabil: number | null;
  /** Upstream's own coverage of the ketua-kelas daily report; covers ALL the
   *  teacher's halaqah, like the scores. */
  cakupan: { sudah: number; belum: number; total: number; persen: number | null } | null;
  /** Meetings in THIS batch whose daily report is still missing. */
  laporanBelum: { tanggal: string; halaqahName: string; pertemuanNo: number }[];
  /** Tabayyun cases on this batch's halaqah. */
  insiden: MaahirDisiplinInsiden[];
  /** Cases on the same teacher's halaqah in another batch — counted, not hidden. */
  insidenLuarBatch: number;
  hutang: MaahirDisiplinHutang[];
  /** Any KMT/KBLA/JKG/tidak-latihan in the window (upstream's `bermasalah`). */
  bermasalah: boolean;
};

export type DisiplinRingkas = {
  pengajar: number;
  bermasalah: number;
  obsLengkap: number;
  obsBelum: number;
  insidenTotal: number;
  /** Not yet decided — `pending` or `nunggu_alasan`; the coordinator's queue. */
  insidenTerbuka: number;
};

export type DisiplinView = {
  ranked: DisiplinRow[];
  noData: DisiplinRow[];
  ringkas: DisiplinRingkas;
  /** Teachers whose scores include halaqah outside this batch. */
  campuran: number;
};

const EMPTY_VIEW: DisiplinView = {
  ranked: [],
  noData: [],
  ringkas: {
    pengajar: 0,
    bermasalah: 0,
    obsLengkap: 0,
    obsBelum: 0,
    insidenTotal: 0,
    insidenTerbuka: 0,
  },
  campuran: 0,
};

function toRow(
  r: MaahirDisiplinRanked,
  payload: MaahirHitsDisiplinPayload,
  batch: ReadonlySet<string>,
): DisiplinRow {
  const ids = Array.isArray(r.halaqahIds) ? r.halaqahIds : [];
  const diBatch = ids.filter((id) => batch.has(id)).length;
  const semua = payload.insidenByPengajar?.[r.pengajarId] ?? [];
  const insiden = semua.filter((i) => batch.has(i.halaqahId));
  const hutang = (payload.hutangByPengajar?.[r.pengajarId] ?? []).filter((h) =>
    batch.has(h.halaqahId),
  );
  const cakupan: MaahirDisiplinCakupan | undefined = payload.cakupanByPengajar?.[r.pengajarId];

  return {
    pengajarId: r.pengajarId,
    nama: r.pengajarNama,
    gender: r.gender,
    rank: r.rank,
    halaqahDiBatch: diBatch,
    // `halaqahCount` and `halaqahIds.length` agreed everywhere in the capture;
    // the ids are used because they are what the batch test is made of.
    halaqahLuarBatch: ids.length - diBatch,
    kbbs: r.kbbs,
    nonLibur: r.nonLibur,
    kmt: r.kmt,
    kbla: r.kbla,
    jkg: r.jkg,
    tidakLatihan: r.tidakLatihan,
    onTimeBaik: r.onTimeBaik,
    onTimeTotal: r.onTimeTotal,
    stabilBaik: r.stabilBaik,
    stabilTotal: r.stabilTotal,
    hutangSaldo: r.hutangSaldo,
    pctKbbs: r.pctKbbs,
    pctOnTime: r.pctOnTime,
    pctStabil: r.pctStabil,
    cakupan: cakupan
      ? {
          sudah: cakupan.sudah,
          belum: cakupan.belum,
          total: cakupan.total,
          persen: cakupan.persen,
        }
      : null,
    laporanBelum: (cakupan?.pertemuan ?? [])
      // `pragenerate` = the meeting predates the kaldik generation, so nobody
      // was ever asked to fill it — listing it as a miss would be an accusation.
      .filter((p) => p.status === "belum" && !p.libur && batch.has(p.halaqahId))
      .map((p) => ({
        tanggal: p.tanggal,
        halaqahName: p.halaqahName,
        pertemuanNo: p.pertemuanNo,
      })),
    insiden,
    insidenLuarBatch: semua.length - insiden.length,
    hutang,
    bermasalah: r.kmt + r.kbla + r.jkg + r.tidakLatihan > 0,
  };
}

/** True when the teacher holds at least one halaqah in the pinned batch. */
function diBatch(r: MaahirDisiplinRanked, batch: ReadonlySet<string>): boolean {
  return (r.halaqahIds ?? []).some((id) => batch.has(id));
}

export function isInsidenTerbuka(i: MaahirDisiplinInsiden): boolean {
  return i.status !== "diputus";
}

/**
 * Build the screen's rows for one batch.
 *
 * `halaqahBatch` is the set of `hits/halaqah` ids belonging to the program's
 * pinned batch(es). An EMPTY set yields an empty view on purpose: "we do not
 * know which halaqah are yours" must never fall back to "show everything", which
 * is how one coordinator would end up staring at all 148 HITS teachers.
 */
export function buildDisiplinView(
  payload: MaahirHitsDisiplinPayload | null | undefined,
  halaqahBatch: ReadonlySet<string>,
): DisiplinView {
  if (!payload || halaqahBatch.size === 0) return EMPTY_VIEW;

  const ranked = (payload.ranked ?? [])
    .filter((r) => diBatch(r, halaqahBatch))
    .map((r) => toRow(r, payload, halaqahBatch));
  const noData = (payload.noData ?? [])
    .filter((r) => diBatch(r, halaqahBatch))
    .map((r) => toRow(r, payload, halaqahBatch));

  const semua = [...ranked, ...noData];
  const insiden = semua.flatMap((r) => r.insiden);

  return {
    ranked,
    noData,
    ringkas: {
      pengajar: semua.length,
      bermasalah: semua.filter((r) => r.bermasalah).length,
      obsLengkap: semua.filter((r) => r.cakupan?.persen === 100).length,
      // Everything that is not 100% — including the teacher with no meetings at
      // all, whose `persen` is null. That matches upstream's obsBelum = total −
      // obsLengkap (96 = 148 − 52 on the fixture).
      obsBelum: semua.filter((r) => r.cakupan?.persen !== 100).length,
      insidenTotal: insiden.length,
      insidenTerbuka: insiden.filter(isInsidenTerbuka).length,
    },
    campuran: semua.filter((r) => r.halaqahLuarBatch > 0).length,
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

/**
 * What each violation code's `detail` string actually carries, read off the
 * capture. The API documents no expansion for the abbreviations themselves, so
 * nothing is invented here — the screen shows the code upstream uses plus what
 * its detail field is known to hold.
 */
export const PELANGGARAN_HINT: Record<MaahirDisiplinJenis, string> = {
  KMT: "detail berisi menit",
  KBLA: "detail berisi menit",
  JKG: 'detail berisi bentuk penggantian ("ganti hari", "dicicil 2×")',
  TIDAK_LATIHAN: "detail kosong",
  BADAL: "detail berisi nama pengganti",
};

export const INSIDEN_STATUS_LABEL: Record<MaahirDisiplinInsiden["status"], string> = {
  pending: "Menunggu tabayyun",
  nunggu_alasan: "Menunggu alasan pengajar",
  diputus: "Sudah diputus",
};

/** `d MMM` in Indonesian, from the ISO string — never through `new Date()`,
 *  which reads "2026-08-01" as UTC midnight and prints 31 Jul west of UTC. */
export function tanggalPendek(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const bulan = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${Number(m[3])} ${bulan[idx]}`;
}

/** `41/45` as `91%`; null stays an em dash at the call site. */
export function pctText(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct)}%`;
}
