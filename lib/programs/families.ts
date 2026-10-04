import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getAllPrograms } from "@/lib/programs/resolve";
import { defaultBatchScope } from "@/lib/programs/batches";

/**
 * Batch families: sibling program slugs that represent different batches of the
 * same real program (e.g. hits-regular / hits-regular-jan / hits-regular-apr).
 * Each carries `config.batch = { family, label, order }`. The dashboard shows a
 * batch switcher across a family's members; the nav shows one entry per family.
 *
 * This is the lightweight multi-batch view — no schema/sync change; each batch
 * stays its own program row, the UI just groups them.
 */
export type BatchConfig = { family: string; label: string; order: number };
export type BatchSibling = {
  slug: string;
  label: string;
  order: number;
  current: boolean;
  /** Halaqah in this batch's default scope; only filled when asked for (see getBatchSiblings). */
  halaqahCount?: number;
};

/**
 * Nama keluarga untuk topbar & switcher: "HITS Reguler (Batch Juni 2026)" →
 * "HITS Reguler". Hanya akhiran "(Batch …)" yang dibuang, jadi "(RBI)" aman.
 */
export function familyDisplayName(name: string): string {
  return name.replace(/\s*\(\s*batch[^)]*\)\s*$/i, "").trim();
}

/**
 * Daftar program untuk pemilih di topbar: satu entri per keluarga batch, diberi
 * nama keluarga. Entri keluarga menunjuk anggota yang sedang dibuka (supaya
 * `<select>` tetap sinkron dengan URL), atau anggota terbaru bila keluarga itu
 * tidak sedang dibuka. Batch-nya dipilih lewat pil di halaman, bukan di sini.
 */
export function collapseFamilies<P extends { slug: string; name: string; config: unknown }>(
  programs: P[],
  currentSlug: string,
): { slug: string; name: string }[] {
  const out: { slug: string; name: string }[] = [];
  const seen = new Map<string, number>(); // family → index in out
  for (const p of programs) {
    const b = batchConfig(p.config);
    if (!b) {
      out.push({ slug: p.slug, name: p.name });
      continue;
    }
    const members = programs
      .map((q) => ({ q, b: batchConfig(q.config) }))
      .filter((x) => x.b?.family === b.family);
    const current = members.find((x) => x.q.slug === currentSlug);
    const newest = members.reduce((a, x) => (x.b!.order > a.b!.order ? x : a), members[0]);
    const pick = (current ?? newest).q;
    const entry = { slug: pick.slug, name: familyDisplayName(pick.name) };
    const at = seen.get(b.family);
    if (at == null) {
      seen.set(b.family, out.length);
      out.push(entry);
    } else {
      out[at] = entry;
    }
  }
  return out;
}

/** Read `config.batch` off a program row, or null when it belongs to no family. */
export function readBatchConfig(config: unknown): BatchConfig | null {
  return batchConfig(config);
}

function batchConfig(config: unknown): BatchConfig | null {
  const b = (config as { batch?: Partial<BatchConfig> } | null)?.batch;
  if (!b || typeof b.family !== "string") return null;
  return { family: b.family, label: b.label ?? b.family, order: Number(b.order ?? 0) };
}

/**
 * Sibling batches of `slug` (including itself), newest first. Empty when the
 * program has no batch family (→ no switcher). A single-member family also
 * returns one entry; callers render the switcher only when length > 1.
 */
export async function getBatchSiblings(
  slug: string,
  opts: { halaqahCount?: boolean } = {},
): Promise<BatchSibling[]> {
  const all = await getAllPrograms();
  const me = all.find((p) => p.slug === slug);
  const fam = batchConfig(me?.config)?.family;
  if (!fam) return [];
  const members = all
    .map((p) => ({ p, b: batchConfig(p.config) }))
    .filter((x): x is { p: (typeof all)[number]; b: BatchConfig } => x.b?.family === fam)
    .sort((a, b) => b.b.order - a.b.order);
  // Cacah halaqah per batch, memakai lingkup default yang sama dengan
  // getHalaqahList (pin batch program, atau semua bila syncAllBatches) supaya
  // angka di pil sama dengan angka di kartu dan tabel.
  const counts = opts.halaqahCount
    ? await Promise.all(
        members.map(async (x) => {
          const scope = defaultBatchScope(x.p);
          const rows = await getDb().execute(sql`
            select count(*)::int as n from halaqah_sync
            where program_id = ${x.p.id}
              ${scope == null ? sql`` : sql`and (tilawah_batch_id is null or tilawah_batch_id = ${scope})`}
          `);
          return Number(rows.rows[0]?.n ?? 0);
        }),
      )
    : null;
  return members.map((x, i) => ({
    slug: x.p.slug,
    label: x.b.label,
    order: x.b.order,
    current: x.p.slug === slug,
    ...(counts ? { halaqahCount: counts[i] } : {}),
  }));
}

/** The default (newest) slug for a family, or null if the family is unknown. */
export async function familyDefaultSlug(family: string): Promise<string | null> {
  const all = await getAllPrograms();
  const members = all
    .map((p) => ({ slug: p.slug, b: batchConfig(p.config) }))
    .filter((x) => x.b?.family === family)
    .sort((a, b) => (b.b!.order ?? 0) - (a.b!.order ?? 0));
  return members[0]?.slug ?? null;
}
