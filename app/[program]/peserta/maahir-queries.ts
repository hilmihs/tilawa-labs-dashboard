/**
 * Data untuk cabang Maahir di `/[program]/peserta` — daftar orang lintas kelas.
 *
 * Kenapa berkas ini ada: `getPesertaDirectory()` membaca cermin tilawah
 * (`students_sync`), dan sync Maahir tidak pernah menulis ke sana — per 7 Sep
 * 2026 `students_sync` punya NOL baris untuk program `maahir`, jadi layarnya
 * selamanya menulis "Belum ada peserta tersinkron". Roster Maahir memang
 * tercermin, tapi di `maahir_sync`. Spesifikasi desain
 * (`docs/superpowers/specs/2026-09-03-maahir-dashboard-design.md`) sudah
 * memutuskan bahwa `/[program]/peserta` bercabang pada `dataSourceType` dan
 * bahwa layar inilah "satu-satunya layar yang tidak dari rekap".
 *
 * Semua bacaan SQL-nya sudah ada di `lib/maahir/entities.ts`; berkas ini hanya
 * merangkai lima entitas dan memilih state. Tidak ada satu pun angka rekap yang
 * diturunkan ulang di sini — lihat header `maahir-view-model.ts`.
 *
 * **`kehadiran` sengaja tidak dibaca.** Kolom `catatan`-nya ditandai sensitif
 * oleh `docs/API-PUBLIC.md` §7 (ia adalah ALASAN ketidakhadiran — "demam", "ibu
 * sakit"), dan `lib/maahir/entities.ts` memang tidak menyediakan pembacanya.
 * Angka kehadiran resmi sudah punya rumahnya di `/[program]/kehadiran`.
 *
 * Setiap cara "tidak ada baris" mendapat state-nya sendiri: scope ditolak /
 * belum ditarik / memang tidak ada orang adalah tiga hal berbeda yang tidak
 * boleh dirender sebagai tabel kosong yang sama.
 */
import {
  entityLastSync,
  isEntityForbidden,
  readAnggota,
  readKelas,
  readMusyrif,
  readPeserta,
  readProgramKelas,
  type MaahirEntityName,
} from "@/lib/maahir/entities";
import { buildMaahirRosterView, type MaahirRosterView } from "./maahir-view-model";

/**
 * Dua entitas yang MEMBENTUK daftarnya. Keduanya wajib: roster ini gabungan
 * `peserta` ∪ `anggota` tanpa `peserta_id`, jadi menarik salah satu saja
 * menghasilkan daftar yang pendek tanpa mengatakan kenapa.
 *
 * `kelas`, `musyrif`, dan `program-kelas` hanya menamai; kalau belum tertarik,
 * namanya jadi em dash dan barisnya tetap tampil.
 */
const ENTITAS_INDUK = ["peserta", "anggota"] as const satisfies readonly MaahirEntityName[];

export type MaahirRosterData =
  | { state: "scope-ditolak"; entitas: string[] }
  | { state: "belum-ditarik"; entitas: string[] }
  | {
      state: "siap";
      view: MaahirRosterView;
      /** `maahir_sync.synced_at` terbaru di antara entitas induk. */
      terakhirDitarik: Date | null;
    };

/** Kalimat satu baris per state — dipakai halaman sebagai `EmptyState`. */
export const PENJELASAN_STATE = {
  "scope-ditolak":
    "Kunci API Maahir yang dipakai dashboard dijawab 403 forbidden_scope untuk entitas roster, jadi daftarnya tidak pernah sampai ke sini. Ini bukan berarti tidak ada peserta — mintakan scope `maahir` pada kunci tersebut.",
  "belum-ditarik":
    "Entitas roster Maahir belum pernah tertarik satu kali pun ke maahir_sync, jadi tidak ada orang yang bisa ditampilkan — bukan nol orang. Jalankan sync Maahir lebih dulu.",
  kosong:
    "Cerminnya sudah ditarik, tapi tidak memuat satu pun baris peserta maupun anggota. Kosong di sini berarti tidak ada baris tercatat di upstream, bukan nol orang terdaftar.",
} as const;

/**
 * `entityLastSync()` mengaku `Promise<Date | null>`, tapi klien Postgres repo ini
 * menyerahkan `max(synced_at)` sebagai STRING — diverifikasi 8 Sep 2026:
 * `typeof` = "string", `instanceof Date` = false, isinya
 * `"2026-09-08 06:53:22.35523+00"`. Memanggil `.getTime()` di atasnya melempar
 * `TypeError`. Layar observasi tidak terkena karena ia meneruskan nilainya
 * langsung ke `<SyncStatus at>`, yang memang menerima string.
 *
 * Dinormalkan di sini, bukan di `lib/` yang bukan milik route ini. Tipe di
 * `lib/maahir/entities.ts` sebaiknya diperbaiki menjadi `Date | string | null`
 * (atau nilainya di-`new Date()` di sana) supaya jebakan ini tidak menunggu
 * pemanggil berikutnya.
 */
function keDate(v: Date | null): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v as unknown as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function loadMaahirRoster(): Promise<MaahirRosterData> {
  const [ditolak, capWaktu] = await Promise.all([
    Promise.all(ENTITAS_INDUK.map((e) => isEntityForbidden(e))),
    Promise.all(ENTITAS_INDUK.map((e) => entityLastSync(e))),
  ]);

  // Urutan pemeriksaan penting: 403 menjelaskan kenapa tarikannya tidak pernah
  // ada, jadi ia diperiksa sebelum "belum ditarik".
  const scopeDitolak = ENTITAS_INDUK.filter((_, i) => ditolak[i]);
  if (scopeDitolak.length > 0) return { state: "scope-ditolak", entitas: [...scopeDitolak] };

  const belumDitarik = ENTITAS_INDUK.filter((_, i) => capWaktu[i] === null);
  if (belumDitarik.length > 0) return { state: "belum-ditarik", entitas: [...belumDitarik] };

  const [peserta, anggota, kelas, musyrif, programKelas] = await Promise.all([
    readPeserta(),
    readAnggota(),
    readKelas(),
    readMusyrif(),
    readProgramKelas(),
  ]);

  const terisi = capWaktu.map(keDate).filter((d): d is Date => d != null);
  return {
    state: "siap",
    view: buildMaahirRosterView({ peserta, anggota, kelas, musyrif, programKelas }),
    terakhirDitarik:
      terisi.length === 0
        ? null
        : terisi.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b)),
  };
}
