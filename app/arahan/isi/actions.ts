"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { directives, programTasks } from "@/lib/db/schema";
import { isSenin, PROGRAM_PEKANAN } from "@/lib/arahan/program";

/**
 * Tulis-tulis untuk /arahan/isi.
 *
 * Rute ini terbuka: tidak ada sesi staf, tidak ada password halaman. Artinya
 * siapa pun yang bisa membuka URL-nya bisa menulis, dan tidak ada satu pun
 * tulisan di sini yang bisa diatribusikan ke orang tertentu. Konsekuensinya
 * dipegang dua arah:
 *
 *   - Tabel `directives` hanya menyimpan label peran/tim ("Tim Program"),
 *     bukan data pribadi. Jangan pernah menambahkan kolom nomor HP, email,
 *     atau nama murid ke sini.
 *   - Penghapusan permanen tidak disediakan. "Selesai" memindahkan baris keluar
 *     dari papan tanpa membuangnya, supaya satu orang iseng tidak bisa
 *     menghilangkan riwayat arahan.
 *
 * Pembatas laju di bawah adalah penghitung in-memory per proses: reset tiap
 * deploy, tidak dibagi antar instance. Itu memperlambat skrip, bukan menghentikan
 * penyerang yang niat. Cukup untuk papan dinding; jangan dipakai ulang untuk
 * apa pun yang memegang PII.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRITES = 40;
const writes = new Map<string, { count: number; resetAt: number }>();

async function rateLimited(): Promise<boolean> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = writes.get(ip);
  if (!entry || now > entry.resetAt) {
    writes.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_WRITES;
}

export type FormState = { ok: boolean; error?: string; message?: string };

const MAX_TITLE = 160;
const MAX_TEXT = 1200;
const MAX_STAKEHOLDERS = 8;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function parseStakeholders(raw: string): string[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const s = String(item).trim().slice(0, 80);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length === MAX_STAKEHOLDERS) break;
  }
  return out;
}

/** `YYYY-MM-DD`, dan benar-benar tanggal — bukan "2026-13-45". */
function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

type Parsed = {
  title: string;
  source: string;
  pic: string;
  stakeholders: string[];
  requestedAt: string;
  checkpoint: string | null;
};

function parseForm(fd: FormData): { ok: true; value: Parsed } | { ok: false; error: string } {
  const title = str(fd, "title").slice(0, MAX_TITLE);
  // Sumber "Lainnya" membawa teks bebasnya di field terpisah supaya pilihan
  // preset tetap konsisten dan bisa difilter nanti.
  const sourcePick = str(fd, "source");
  const sourceOther = str(fd, "sourceOther").slice(0, 80);
  const source = sourcePick === "Lainnya" ? sourceOther : sourcePick;
  const pic = str(fd, "pic").slice(0, 80);
  const stakeholders = parseStakeholders(str(fd, "stakeholders"));
  const requestedAt = str(fd, "requestedAt");
  const checkpointRaw = str(fd, "checkpoint").slice(0, MAX_TEXT);

  if (!title) return { ok: false, error: "Arahan / tugas wajib diisi." };
  if (!source) return { ok: false, error: "Sumber permintaan wajib diisi." };
  if (!pic) return { ok: false, error: "PIC wajib diisi." };
  if (stakeholders.length === 0) return { ok: false, error: "Isi minimal satu stakeholder." };
  if (!validDate(requestedAt)) return { ok: false, error: "Tanggal permintaan tidak valid." };

  return {
    ok: true,
    value: { title, source, pic, stakeholders, requestedAt, checkpoint: checkpointRaw || null },
  };
}

function refresh() {
  revalidatePath("/arahan");
  revalidatePath("/arahan/isi");
}

export async function createDirective(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await rateLimited()) {
    return { ok: false, error: "Terlalu banyak perubahan. Coba lagi beberapa menit." };
  }
  const parsed = parseForm(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const v = parsed.value;

  const db = getDb();
  await db.insert(directives).values({
    title: v.title,
    source: v.source,
    pic: v.pic,
    stakeholders: v.stakeholders,
    requestedAt: v.requestedAt,
    checkpoint: v.checkpoint,
    // Checkpoint yang ditulis bersamaan dengan arahannya memang baru hari ini;
    // arahan tanpa checkpoint tidak boleh mengklaim pernah diperbarui.
    checkpointUpdatedAt: v.checkpoint ? new Date() : null,
  });

  refresh();
  return { ok: true, message: "Arahan tersimpan dan sudah muncul di papan." };
}

export async function updateDirective(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await rateLimited()) {
    return { ok: false, error: "Terlalu banyak perubahan. Coba lagi beberapa menit." };
  }
  const id = str(fd, "id");
  if (!id) return { ok: false, error: "Arahan yang mau diubah tidak dikenali." };

  const parsed = parseForm(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const v = parsed.value;

  const db = getDb();
  const [existing] = await db
    .select({ checkpoint: directives.checkpoint, stamp: directives.checkpointUpdatedAt })
    .from(directives)
    .where(and(eq(directives.id, id), eq(directives.status, "aktif")))
    .limit(1);
  if (!existing) return { ok: false, error: "Arahan tidak ditemukan atau sudah selesai." };

  // Stempel checkpoint HANYA bergerak kalau teksnya benar-benar berubah.
  // Membetulkan ejaan PIC tidak boleh membuat arahan yang bisu sebulan terlihat
  // baru diperbarui kemarin — itu tepat sinyal yang dicari papan ini.
  const changed = (existing.checkpoint ?? "") !== (v.checkpoint ?? "");
  const stamp = changed ? new Date() : existing.stamp;

  await db
    .update(directives)
    .set({
      title: v.title,
      source: v.source,
      pic: v.pic,
      stakeholders: v.stakeholders,
      requestedAt: v.requestedAt,
      checkpoint: v.checkpoint,
      checkpointUpdatedAt: v.checkpoint ? stamp : null,
      updatedAt: new Date(),
    })
    .where(eq(directives.id, id));

  refresh();
  return {
    ok: true,
    message: changed ? "Checkpoint diperbarui." : "Perubahan tersimpan.",
  };
}

export async function completeDirective(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await rateLimited()) {
    return { ok: false, error: "Terlalu banyak perubahan. Coba lagi beberapa menit." };
  }
  const id = str(fd, "id");
  if (!id) return { ok: false, error: "Arahan tidak dikenali." };

  const db = getDb();
  const res = await db
    .update(directives)
    .set({ status: "selesai", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(directives.id, id), eq(directives.status, "aktif")))
    .returning({ id: directives.id });
  if (res.length === 0) return { ok: false, error: "Arahan tidak ditemukan atau sudah selesai." };

  refresh();
  return { ok: true, message: "Arahan ditandai selesai dan turun dari papan." };
}

/** Kebalikan completeDirective — untuk salah tekan, bukan untuk membuka ulang arahan lama. */
export async function reopenDirective(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await rateLimited()) {
    return { ok: false, error: "Terlalu banyak perubahan. Coba lagi beberapa menit." };
  }
  const id = str(fd, "id");
  if (!id) return { ok: false, error: "Arahan tidak dikenali." };

  const db = getDb();
  await db
    .update(directives)
    .set({ status: "aktif", completedAt: sql`null`, updatedAt: new Date() })
    .where(eq(directives.id, id));

  refresh();
  return { ok: true, message: "Arahan dikembalikan ke papan." };
}

/**
 * Simpan fokus program satu pekan sekaligus. Field `task:<program>` yang kosong
 * menghapus baris program itu untuk pekan tersebut — begitulah cara mengosongkan
 * satu program tanpa tombol hapus tersendiri.
 */
export async function saveProgramWeek(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await rateLimited()) {
    return { ok: false, error: "Terlalu banyak perubahan. Coba lagi beberapa menit." };
  }
  const weekStart = str(fd, "weekStart");
  if (!isSenin(weekStart)) return { ok: false, error: "Pekan tidak valid." };

  const db = getDb();
  let terisi = 0;
  await db.transaction(async (tx) => {
    for (const [i, program] of PROGRAM_PEKANAN.entries()) {
      const task = str(fd, `task:${program}`).slice(0, MAX_TITLE);
      if (!task) {
        await tx
          .delete(programTasks)
          .where(and(eq(programTasks.weekStart, weekStart), eq(programTasks.program, program)));
        continue;
      }
      terisi += 1;
      await tx
        .insert(programTasks)
        .values({ weekStart, program, task, urutan: i })
        .onConflictDoUpdate({
          target: [programTasks.weekStart, programTasks.program],
          set: { task, urutan: i, updatedAt: new Date() },
        });
    }
  });

  refresh();
  return {
    ok: true,
    message: terisi > 0 ? `Fokus ${terisi} program tersimpan.` : "Pekan ini dikosongkan.",
  };
}
