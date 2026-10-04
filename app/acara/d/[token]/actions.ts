"use server";

import { catatAksesToken, resolveDivisiToken } from "@/lib/acara/access";
import {
  getJobdeskById,
  getTugasById,
  insertBarangDivisi,
  insertTugasDivisi,
  listTugasDivisi,
  setStatusTugasDivisi,
} from "@/lib/acara/queries";
import {
  BARANG_KRITERIA,
  BARANG_PERUNTUKAN,
  BARANG_SUMBER,
  TUGAS_PRIORITAS,
  type TugasStatus,
} from "@/lib/acara/types";
import { bolehUbahStatusTugas, parseAngkaId } from "@/lib/acara/view-model";

/**
 * Jalur tulis pemegang token divisi. Setiap action: verifikasi token ulang →
 * pastikan baris yang disentuh milik divisi token (di WHERE query, bukan hanya
 * di sini) → tulis → catat ke acara_log → balas ok. Log berada di luar try
 * tulis dan tidak melempar: audit yang gagal tidak boleh mengubah tulisan
 * yang sudah sukses menjadi "coba lagi" (baris dobel). Tidak ada
 * revalidatePath: halaman force-dynamic, klien memanggil router.refresh().
 *
 * Yang SENGAJA tidak ada di berkas ini: mengubah status_approval barang,
 * menyentuh divisi lain, membaca nomor WA. Pemegang token hanya mengajukan.
 */

export type AksiResult = { ok: true } | { ok: false; error: string };

const ERR_TOKEN = "Tautan tidak valid atau sudah kedaluwarsa. Hubungi koordinator.";
const ERR_SIMPAN = "Gagal menyimpan. Coba lagi sebentar.";
const MAX_TEKS = 300;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function teks(v: unknown, max = MAX_TEKS): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** YYYY-MM-DD yang benar-benar ada di kalender — "2026-02-31" lolos regex tapi bukan tanggal. */
function tanggal(v: unknown): string | null {
  if (typeof v !== "string" || !DATE_RE.test(v)) return null;
  return new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null;
}

function pilihan<T extends readonly string[]>(v: unknown, opsi: T): T[number] | null {
  return typeof v === "string" && (opsi as readonly string[]).includes(v) ? (v as T[number]) : null;
}

export async function tandaiTugas(token: string, tugasId: string, selesai: boolean): Promise<AksiResult> {
  const akses = await resolveDivisiToken(token);
  if (!akses) return { ok: false, error: ERR_TOKEN };
  const sebelum = await getTugasById(tugasId);
  if (!sebelum || sebelum.acaraId !== akses.acara.id || sebelum.divisiId !== akses.divisi.id) return { ok: false, error: "Tugas tidak ditemukan." };
  if (!bolehUbahStatusTugas(sebelum.status)) return { ok: false, error: "Status tugas ini dikunci koordinator." };
  // Papan divisi cuma punya satu saklar: selesai ↔ belum. "Buka kembali"
  // sengaja diratakan ke "berjalan" (bukan dipulihkan ke belum_mulai /
  // perlu_tinjau) — sekali disentuh berarti sudah dikerjakan, dan panitia
  // tidak perlu memilih di antara enam status dari HP.
  const status: TugasStatus = selesai ? "selesai" : "berjalan";
  try {
    const row = await setStatusTugasDivisi(akses.acara.id, tugasId, akses.divisi.id, status, selesai ? new Date() : null);
    if (!row) return { ok: false, error: "Tugas tidak ditemukan." };
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: ERR_SIMPAN };
  }
  await catatAksesToken(akses, "ubah", {
    tabel: "acara_tugas", id: tugasId, dari: { status: sebelum.status }, ke: { status },
  });
  return { ok: true };
}

export async function tambahTugas(
  token: string,
  input: { judul: unknown; tenggat: unknown; prioritas: unknown },
): Promise<AksiResult> {
  const akses = await resolveDivisiToken(token);
  if (!akses) return { ok: false, error: ERR_TOKEN };
  const judul = teks(input.judul);
  if (!judul) return { ok: false, error: "Judul tugas wajib diisi." };
  const tenggat = tanggal(input.tenggat);
  const prioritas = pilihan(input.prioritas, TUGAS_PRIORITAS) ?? "sedang";
  let rowId: string;
  try {
    const row = await insertTugasDivisi({
      acaraId: akses.acara.id, divisiId: akses.divisi.id, judul, tenggat, prioritas, dariJobdeskId: null,
    });
    rowId = row.id;
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: ERR_SIMPAN };
  }
  await catatAksesToken(akses, "ubah", { tabel: "acara_tugas", id: rowId, ke: { judul, tenggat } });
  return { ok: true };
}

/** Satu poin jobdesk → satu tugas, dengan jejak dari_jobdesk_id. */
export async function jadikanTugas(token: string, jobdeskId: string): Promise<AksiResult> {
  const akses = await resolveDivisiToken(token);
  if (!akses) return { ok: false, error: ERR_TOKEN };
  const jd = await getJobdeskById(jobdeskId);
  if (!jd || jd.divisiId !== akses.divisi.id) return { ok: false, error: "Jobdesk tidak ditemukan." };
  // Satu poin jobdesk hanya boleh jadi satu tugas. Tombolnya memang hilang di
  // UI setelah dibuat, tapi dua orang di tautan yang sama bisa menekan bersamaan,
  // dan modul ini belum punya jalur hapus — duplikat akan menetap.
  const sudahAda = (await listTugasDivisi(akses.acara.id, akses.divisi.id)).some((t) => t.dariJobdeskId === jd.id);
  if (sudahAda) return { ok: false, error: "Poin jobdesk ini sudah menjadi tugas." };
  let rowId: string;
  try {
    const row = await insertTugasDivisi({
      acaraId: akses.acara.id, divisiId: akses.divisi.id, judul: jd.isi.slice(0, MAX_TEKS),
      tenggat: null, prioritas: "sedang", dariJobdeskId: jd.id,
    });
    rowId = row.id;
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: ERR_SIMPAN };
  }
  await catatAksesToken(akses, "ubah", { tabel: "acara_tugas", id: rowId, ke: { dariJobdeskId: jd.id } });
  return { ok: true };
}

export async function ajukanBarang(
  token: string,
  input: {
    nama: unknown; jumlah: unknown; satuan: unknown; hargaSatuan: unknown;
    kriteria: unknown; sumber: unknown; peruntukan: unknown; pertanyaan: unknown;
  },
): Promise<AksiResult> {
  const akses = await resolveDivisiToken(token);
  if (!akses) return { ok: false, error: ERR_TOKEN };
  const nama = teks(input.nama);
  if (!nama) return { ok: false, error: "Nama barang wajib diisi." };
  let rowId: string;
  try {
    const row = await insertBarangDivisi({
      acaraId: akses.acara.id,
      divisiId: akses.divisi.id,
      nama,
      jumlah: parseAngkaId(input.jumlah),
      satuan: teks(input.satuan, 30),
      hargaSatuan: parseAngkaId(input.hargaSatuan),
      kriteria: pilihan(input.kriteria, BARANG_KRITERIA),
      sumber: pilihan(input.sumber, BARANG_SUMBER),
      peruntukan: pilihan(input.peruntukan, BARANG_PERUNTUKAN) ?? "divisi",
      pertanyaan: teks(input.pertanyaan),
    });
    rowId = row.id;
  } catch (e) {
    console.error("acara action gagal", e);
    return { ok: false, error: ERR_SIMPAN };
  }
  await catatAksesToken(akses, "ubah", { tabel: "acara_barang", id: rowId, ke: { nama } });
  return { ok: true };
}
