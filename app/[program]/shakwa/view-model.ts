/**
 * Pure mapping from the stored `rekap/shakwa` payload to what the screen draws.
 * No DB, no React — so the fixture test can hold it to the real response shape.
 *
 * Two rules this module exists to keep:
 *
 * 1. Headline counters are upstream's, never ours. `total` and `belumDitangani`
 *    come straight from the payload; `statusBuckets()` only re-labels the
 *    `perStatus` rows. If we summed `items` ourselves we would silently disagree
 *    with the koordinator's own screen the day upstream changes what counts as
 *    "ditangani" (docs §9 forbids recomputing the rekap layer).
 * 2. Nothing is truncated here. `isi` and `catatanKoordinator` are handed over
 *    whole; folding long text is the client component's job and always leaves a
 *    way to read the rest.
 */
import type {
  MaahirShakwaItem,
  MaahirShakwaPayload,
  MaahirShakwaStatus,
} from "@/lib/maahir/types";
import type { StatusTone } from "@/lib/ui/status";

/** A ticket nobody has touched is the alarming one, hence `danger` for `submitted`. */
export const SHAKWA_STATUS_TONE: Record<MaahirShakwaStatus, StatusTone> = {
  submitted: "danger",
  in_review: "warning",
  resolved: "success",
  closed: "neutral",
};

/** Statuses that still need someone to act. Mirrors upstream's `belumDitangani`,
 *  but only ever used to flag a ROW — the headline count stays upstream's. */
const STATUS_TERBUKA: readonly MaahirShakwaStatus[] = ["submitted", "in_review"];

export function belumDitangani(item: Pick<MaahirShakwaItem, "status">): boolean {
  return STATUS_TERBUKA.includes(item.status);
}

export type ShakwaBucket = {
  key: string;
  label: string;
  jumlah: number;
  /** 0–100, share of `total`. 0 when there are no tickets at all. */
  persen: number;
  tone?: StatusTone;
};

const persenOf = (jumlah: number, total: number) =>
  total > 0 ? Math.round((jumlah / total) * 1000) / 10 : 0;

/**
 * Kategori breakdown, biggest first. Upstream only emits the categories that
 * actually occurred in the window, so an absent kategori means "tidak ada tiket",
 * not zero — we do not pad the list with the other six kategori.
 */
export function kategoriBuckets(payload: MaahirShakwaPayload): ShakwaBucket[] {
  return [...(payload.perKategori ?? [])]
    .map((k) => ({
      key: k.kategori,
      label: k.label,
      jumlah: k.jumlah,
      persen: persenOf(k.jumlah, payload.total),
    }))
    .sort((a, b) => b.jumlah - a.jumlah || a.label.localeCompare(b.label, "id"));
}

/**
 * Status breakdown in upstream's own order (Baru → Diproses → Selesai → Ditutup),
 * zeros included. The order is the workflow, so sorting by size would hide that a
 * stage is empty.
 */
export function statusBuckets(payload: MaahirShakwaPayload): ShakwaBucket[] {
  return (payload.perStatus ?? []).map((s) => ({
    key: s.status,
    label: s.label,
    jumlah: s.jumlah,
    persen: persenOf(s.jumlah, payload.total),
    tone: SHAKWA_STATUS_TONE[s.status] ?? "neutral",
  }));
}

export function pelaporLabel(item: Pick<MaahirShakwaItem, "pelaporType">): string {
  return item.pelaporType === "pengajar" ? "Pengajar" : "Peserta";
}

export function genderLabel(item: Pick<MaahirShakwaItem, "gender">): string {
  return item.gender === "akhwat" ? "Akhwat" : "Ikhwan";
}

/**
 * `jawaban` is a free-form per-kategori answer map whose keys vary by kategori
 * (`sudah_info_koordinator`, …). Rather than enumerate keys we cannot know, the
 * snake_case key is turned into a sentence and shown as-is — a new key upstream
 * adds shows up on the screen instead of disappearing.
 */
export function jawabanEntries(
  item: Pick<MaahirShakwaItem, "jawaban">,
): { key: string; label: string; value: string }[] {
  const jawaban = item.jawaban ?? {};
  return Object.entries(jawaban)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([key, value]) => ({
      key,
      label: humanizeKey(key),
      value: String(value),
    }));
}

function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every kategori present in the window, for the filter control. */
export function kategoriOptions(
  payload: MaahirShakwaPayload,
): { value: string; label: string }[] {
  return kategoriBuckets(payload).map((b) => ({ value: b.key, label: b.label }));
}

export type ShakwaStatusFilter = "semua" | "belum" | "selesai";

/** Row filter for the ticket list. Never mutates, never re-counts the headline. */
export function filterTickets(
  items: MaahirShakwaItem[],
  filter: { status: ShakwaStatusFilter; kategori: string | "semua" },
): MaahirShakwaItem[] {
  return items.filter((it) => {
    if (filter.kategori !== "semua" && it.kategori !== filter.kategori) return false;
    if (filter.status === "belum") return belumDitangani(it);
    if (filter.status === "selesai") return !belumDitangani(it);
    return true;
  });
}

/**
 * Tickets newest first, with the untouched ones on top: this screen exists to
 * work a queue, so `submitted` outranks a `resolved` ticket filed later.
 */
export function sortTickets(items: MaahirShakwaItem[]): MaahirShakwaItem[] {
  return [...items].sort((a, b) => {
    const ab = belumDitangani(a) ? 0 : 1;
    const bb = belumDitangani(b) ? 0 : 1;
    if (ab !== bb) return ab - bb;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/**
 * "27 Agu 2026 · 15:48 WIB" from an ISO timestamp. Formatted with an explicit
 * Asia/Jakarta offset instead of `toLocaleString`, so the server (UTC) and the
 * browser print the same string and React does not flag a hydration mismatch.
 */
export function waktuWib(iso: string | null | undefined, withTime = true): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 7 * 60 * 60 * 1000);
  const tanggal = `${d.getUTCDate()} ${BULAN_PENDEK[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!withTime) return tanggal;
  const jam = String(d.getUTCHours()).padStart(2, "0");
  const menit = String(d.getUTCMinutes()).padStart(2, "0");
  return `${tanggal} · ${jam}:${menit} WIB`;
}

/** "3 Sep 2026 · 09:12 WIB (2 jam lalu)" — the "terakhir ditarik" stamp. Data can
 *  be old (a failed pull keeps the previous row), so the age is always visible. */
export function fetchedAtLabel(fetchedAt: Date, now: Date = new Date()): string {
  const waktu = waktuWib(fetchedAt.toISOString()) ?? "-";
  const menit = Math.floor((now.getTime() - fetchedAt.getTime()) / 60000);
  if (menit < 1) return `${waktu} (barusan)`;
  if (menit < 60) return `${waktu} (${menit} menit lalu)`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${waktu} (${jam} jam lalu)`;
  return `${waktu} (${Math.floor(jam / 24)} hari lalu)`;
}
