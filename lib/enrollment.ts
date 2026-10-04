import { sql, type SQL } from "drizzle-orm";

/**
 * "Peserta aktif" as every read-side list must define it.
 *
 * `students_sync.enrollment_status_code` mirrors tilawah's enrollment pivot:
 * 1 = aktif, 0 = dinonaktifkan (with the coordinator's reason in
 * `enrollment_status`, e.g. "Keluar HKM — tidak lagi peserta halaqah"). A
 * deactivated peserta keeps their row and their Alfa forever, so any roster that
 * does not apply this ends up headed by ex-peserta at 0% — which is how this
 * predicate came to exist (HKM 6 & 12 Ikhwan, 25 Agu 2026).
 *
 * NULL counts as aktif on purpose. Two separate causes produce it, and both are
 * "unknown", not "keluar": programs whose pivot data has never synced (DPQ,
 * HITS Ortu-ABK), and rows a sync had blanked before the enrollment-preserving
 * fix landed. Treating NULL as keluar would empty those rosters outright.
 *
 * Deliberate non-users of this predicate — do NOT "fix" them to call it:
 *   - lib/insights/queries.ts `roster` (reminder "belum dipresensi") requires a
 *     strict `= 1`. Those names are read out to a teacher, so an unknown status
 *     costs them a search for someone who may have left; accuracy was chosen
 *     over coverage on 17 Agu 2026.
 *   - lib/reports/queries.ts needs the deactivated rows themselves — they ARE
 *     the "Peserta Keluar" figure.
 *   - lib/scorecard/metrics/tilawah.ts counts `peserta_aktif` as a metric and
 *     must not silently absorb unknown-status rows.
 *
 * @param alias table alias used in the query (`"s"`, `"ss"`), or none for a bare
 *   `from students_sync`. Always a literal written here in code — never user input.
 */
export function pesertaAktif(alias?: string): SQL {
  const col = sql.raw(`${alias ? `${alias}.` : ""}enrollment_status_code`);
  return sql`(${col} is null or ${col} = 1)`;
}

/**
 * Halaqah uji yang bukan kelas nyata — `[DEMO WALI] Kelas` (mabni id 35) beserta
 * akun `[DEMO WALI] Anak` di dalamnya. Tidak bisa dihapus dari sini (tak ada
 * jalur DELETE ke mabni), jadi setiap hitungan peserta/kelas membuangnya
 * (permintaan pemilik 28 Sep 2026: "tidak perlu masukkan dummy user, wali, dan
 * kelas").
 *
 * @param nameExpr kolom nama halaqah, mis. `"h.name"`. Literal di kode, bukan input.
 */
export function bukanKelasDemo(nameExpr: string): SQL {
  return sql`coalesce(${sql.raw(nameExpr)}, '') not ilike '[DEMO%'`;
}

/**
 * Akun peserta yang bukan orang — nama isian bawaan yang tertinggal di kelas
 * (mis. "Nama Murid", tilawah 2165 di HKM 3 IKHWAN). Tilawah tidak punya jalur
 * hapus user, dan `status: 0` hanya memblokir login (pendaftarannya tetap
 * aktif), jadi yang bisa dilakukan dashboard adalah tidak menghitungnya —
 * sama seperti `bukanKelasDemo` (keputusan pemilik 29 Sep 2026: "akun-akun
 * sampah boleh hapus"). Dibandingkan tanpa beda huruf besar dan spasi.
 */
export const NAMA_AKUN_SAMPAH: readonly string[] = ["nama murid", "nama peserta", "nama santri"];

/** @param nameExpr kolom nama peserta, mis. `"s.name"`. Literal di kode, bukan input. */
export function bukanAkunSampah(nameExpr: string): SQL {
  const daftar = sql.join(NAMA_AKUN_SAMPAH.map((n) => sql`${n}`), sql`, `);
  return sql`lower(btrim(regexp_replace(coalesce(${sql.raw(nameExpr)}, ''), '[[:space:]]+', ' ', 'g'))) not in (${daftar})`;
}
