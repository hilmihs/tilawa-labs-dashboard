/**
 * Seed the programs into a fresh database (idempotent — upsert on slug).
 * Migrations create the tables but not these rows, so a fresh prod DB needs this
 * before the tilawah sync has anything to sync into.
 * Usage: pnpm tsx scripts/seed-programs.ts
 */
import "./env";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { programs } from "../lib/db/schema";

const SEG_LEVEL_GENDER = { primary: "level", secondary: "gender" } as const;

// Every HITS program shares the coordinator's monthly-report layout
// (reportFormat "hits" — see lib/programs/config.ts + lib/reports/queries.ts).
// `perubahan` (rekap badal + kualitas data pengajar) needs jadwal_sync, so it is
// on for the tilawah-backed HITS programs and stays off for berkah/HKM.
// `asesmen` puts /[program]/asesmen (al-Fatihah assessment, read live from the
// external API) in the HITS tab bar. The source is division-wide and has no
// program id, so this only chooses where the one link hangs — see the note on
// ProgramConfig.features in lib/programs/config.ts.
const HITS_BASE = {
  features: { piket: false, perubahan: true, asesmen: true },
  segmentation: SEG_LEVEL_GENDER,
  reportFormat: "hits",
} as const;

// HKM (Halaqah Al-Qur'an) monitoring config — data pulled from
// cms.example.com (Nafi'). See lib/insights/hkm/ + lib/sync/hkm-sync.ts.
const HKM_CONFIG = {
  hkm: {
    masterSource: "internal_filter", // HKM = internal=Yes ∩ imported master
    userFilter: { isInternal: 1 },
    pagesPerDay: 4,
    quranPages: 604,
    startDate: "2026-03-31",
    segmentation: { primary: "halaqah", secondary: "gender" },
  },
} as const;

/**
 * Rolling batches: mirror EVERY upstream batch of this program into its one row
 * (lib/sync/tilawah-sync.ts + lib/programs/batches.ts), so a batch opened in the
 * CMS attaches by itself instead of waiting for someone to re-pin and deploy.
 * `tilawahBatchId` stays as a single-batch fallback and is otherwise ignored.
 *
 * Safe ONLY for a program owning exactly one row here. The batch families
 * (hits-regular + -jan + -apr on upstream program 3, hits-safar + -jan on 7) are
 * several rows sharing one upstream program id; switching them on would make
 * every sibling mirror every batch, so each batch's halaqah — and its monthly
 * report — would be counted once per sibling. Those keep their pins, and a new
 * batch there arrives as a sibling row awaiting approval instead.
 */
const ROLLING = { syncAllBatches: true } as const;

const PROGRAMS = [
  { slug: "dpq", name: "DPQ", dataSourceType: "tilawah_api", tilawahProgramId: 6, tilawahBatchId: 5, berkahBusinessUnitId: null, config: { features: { piket: false }, segmentation: SEG_LEVEL_GENDER, ...ROLLING } },
  // `features.surat` turns on /hkm/surat (surat penerimaan + peringatan 1/2/3);
  // its peserta roster is read from the paired presensiSlug program.
  { slug: "hkm", name: "HKM (Halaqah Al-Qur'an)", dataSourceType: "berkah_api", tilawahProgramId: null, tilawahBatchId: null, berkahBusinessUnitId: null, config: { ...HKM_CONFIG, presensiSlug: "hkm-presensi", features: { piket: false, perubahan: false, surat: true } } },
  { slug: "hits-nurul-iman", name: "Halaqah Tahsin Reguler Masjid Nurul Iman", dataSourceType: "tilawah_api", tilawahProgramId: 8, tilawahBatchId: 8, berkahBusinessUnitId: null, config: { ...HITS_BASE, ...ROLLING } },
  { slug: "hits-ortu-abk", name: "HITS untuk Orangtua ABK", dataSourceType: "tilawah_api", tilawahProgramId: 5, tilawahBatchId: 4, berkahBusinessUnitId: null, config: { ...HITS_BASE, features: { ...HITS_BASE.features, ringkasan: true }, ...ROLLING } },
  // Halaqah Tahfizh Masjid Nurul Iman — tilawah prog 13, batch 22 "2026".
  // Program TERPISAH dari HITS Masjid Nurul Iman (prog 8): masjid yang sama,
  // pengajar yang beririsan, tapi halaqah dan pertemuannya sendiri (TAHFIZH
  // NURIM 01/02/03, 48 pertemuan tiap halaqah). Karena belum pernah dipantek,
  // ketiganya tak masuk laporan bulanan mana pun DAN tak muncul di rekap
  // pengajar — sembilan pertemuan per halaqah di jendela 16 Jul–15 Agu 2026
  // hilang dari tagihan Amina Anisa Hidayat, Atikah Azzahwa, dan Azka Wafa Wulandari.
  // reportFormat "hits" karena koordinatornya membaca laporan yang sama.
  { slug: "tahfizh-nurul-iman", name: "Halaqah Tahfizh Masjid Nurul Iman", dataSourceType: "tilawah_api", tilawahProgramId: 13, tilawahBatchId: 22, berkahBusinessUnitId: null, config: { ...HITS_BASE, ...ROLLING } },
  // Tahsin Keluarga — tilawah prog 14, batch 25 "2026" (dibuat di CMS 27 Agu
  // 2026). Datang lewat deteksi otomatis, disetujui dari
  // scripts/approve-tahsin-keluarga.ts; dipantek di sini supaya config-nya tidak
  // bergantung pada satu baris config hasil approval. Empat halaqah keluarga
  // (Halaqah Ayah, Keluarga Akhwat, Cemara Pagi, Cemara Malam) — jam sesinya
  // dirapikan lewat scripts/tahsin-keluarga-lengkapi.ts.
  //
  // `teacherRecapExclude`: Halaqah Ayah (959) tidak masuk rekap pengajar maupun
  // sheet Honor — kelasnya lima pagi sepekan di dalam satu keluarga dan tidak
  // dibayar per pertemuan, jadi barisnya justru jadi yang terbesar di program
  // ini. Yang dikecualikan HALAQAH-nya, bukan pengajarnya: ustadz yang sama
  // memegang halaqah berbayar di program lain dan baris itu harus tetap ada.
  // Angka peserta & kehadiran Halaqah Ayah tetap dihitung di laporan bulanan.
  { slug: "tahsin-keluarga", name: "Tahsin Keluarga", dataSourceType: "tilawah_api", tilawahProgramId: 14, tilawahBatchId: 25, berkahBusinessUnitId: null, config: { ...HITS_BASE, ...ROLLING, teacherRecapExclude: [959] } },
  // Al-Arabiyyah Lis Syabab — tilawah prog 15, batch 31 "2026" (19 Sep–31 Des
  // 2026), dibuat lewat API 17 Sep 2026 (scripts/arabiyyah-*.ts): dua halaqah
  // Ikhwan (#981, Sidqi) & Akhwat (#982, Tasmiah), Sabtu–Ahad 08.00–11.00.
  // Format laporan HITS supaya ikut rekap pengajar; asesmen al-Fatihah mati —
  // ini kelas bahasa Arab, bukan tilawah.
  { slug: "al-arabiyyah", name: "Al-Arabiyyah Lis Syabab", dataSourceType: "tilawah_api", tilawahProgramId: 15, tilawahBatchId: 31, berkahBusinessUnitId: null, config: { ...HITS_BASE, features: { ...HITS_BASE.features, asesmen: false }, ...ROLLING } },
  // Batch families: sibling slugs sharing config.batch.family render one nav
  // entry + a batch switcher (see lib/programs/families.ts). `order` desc =
  // newest first; the highest-order slug is the family default in the nav.
  { slug: "hits-regular", name: "HITS Reguler (Batch Juni 2026)", dataSourceType: "tilawah_api", tilawahProgramId: 3, tilawahBatchId: 1, berkahBusinessUnitId: null, config: { ...HITS_BASE, batch: { family: "hits-regular", label: "Juni 2026", order: 3 } } },
  { slug: "hits-safar", name: "HITS Safar", dataSourceType: "tilawah_api", tilawahProgramId: 7, tilawahBatchId: 7, berkahBusinessUnitId: null, config: { ...HITS_BASE, batch: { family: "hits-safar", label: "Juli 2026", order: 2 } } },
  { slug: "hits-safar-jan", name: "HITS Safar (Batch Januari 2026)", dataSourceType: "tilawah_api", tilawahProgramId: 7, tilawahBatchId: 6, berkahBusinessUnitId: null, config: { ...HITS_BASE, batch: { family: "hits-safar", label: "Januari 2026", order: 1 } } },
  // HITS Reguler prog 3: batch 1 Juni (hits-regular), 21 Januari, 23 April.
  // Batch Januari (#11) & April (#13) lama DIHAPUS di upstream lalu dibuat ulang
  // dengan id baru #21 "Januari_2026" (2026-08-11) & #23 "April_2026"
  // (2026-08-14). Presensi yang hilang dipulihkan ke batch baru ini lewat
  // scripts/recover-batch-presensi.ts.
  { slug: "hits-regular-jan", name: "HITS Reguler (Batch Januari 2026)", dataSourceType: "tilawah_api", tilawahProgramId: 3, tilawahBatchId: 21, berkahBusinessUnitId: null, config: { ...HITS_BASE, batch: { family: "hits-regular", label: "Januari 2026", order: 1 } } },
  { slug: "hits-regular-apr", name: "HITS Reguler (Batch April 2026)", dataSourceType: "tilawah_api", tilawahProgramId: 3, tilawahBatchId: 23, berkahBusinessUnitId: null, config: { ...HITS_BASE, batch: { family: "hits-regular", label: "April 2026", order: 2 } } },
  // Tahsin Al-Fatihah Mustahik (LAZ) — tilawah prog 9, batch 10 = "LAZ #40".
  // syncAllBatches: LAZ spins up a new batch every 1-2 weeks; sync every batch so
  // a fresh one attaches automatically instead of staying pinned (tilawahBatchId
  // is ignored while this is on, kept only as a single-batch fallback).
  { slug: "tafm-laz", name: "Tahsin Al-Fatihah Mustahik (LAZ)", dataSourceType: "tilawah_api", tilawahProgramId: 9, tilawahBatchId: 10, berkahBusinessUnitId: null, config: { features: { piket: false }, segmentation: SEG_LEVEL_GENDER, batch: { family: "tafm-laz", label: "LAZ #40", order: 2 }, ...ROLLING } },
  // HKM presensi = Halaqah Keluarga Tilawa Labs (tilawah prog 10, batch 12). Setoran
  // stays on the berkah-backed `hkm`; these two get merged into one HKM (presensi
  // + setoran tabs) in a later phase.
  // Was seeded syncPaused after upstream prog 10 / batch 12 was corrupted on
  // 2026-07-29 (its 17 "HKM N Ikhwan/Akhwat" halaqah replaced by Tahsin LAZ
  // duplicates). Upstream restored batch 12 on 2026-07-27 and the 17 real
  // halaqah are back, so the freeze is lifted — pausing is now an operator
  // action from /admin/programs, not seed data.
  { slug: "hkm-presensi", name: "HKM — Presensi (Halaqah Keluarga Tilawa Labs)", dataSourceType: "tilawah_api", tilawahProgramId: 10, tilawahBatchId: 12, berkahBusinessUnitId: null, config: { features: { piket: false }, segmentation: SEG_LEVEL_GENDER, ...ROLLING } },
  // Ruang Belajar Islam — tilawah prog 12, batch 18 "2026" (30 Jul–31 Des 2026).
  // 11 halaqah split over two levels ("Kadis (Kelas Dasar Islam) - Level 1" and
  // "RBI (Ruang Belajar Islam) - Level 2"), so level × gender segmentation fits.
  // Not a HITS program → keeps the default report layout, but it is jadwal_sync
  // backed like the other tilawah programs, so `perubahan` is on.
  { slug: "rbi", name: "Ruang Belajar Islam (RBI)", dataSourceType: "tilawah_api", tilawahProgramId: 12, tilawahBatchId: 18, berkahBusinessUnitId: null, config: { features: { piket: false, perubahan: true }, segmentation: SEG_LEVEL_GENDER, ...ROLLING } },
  { slug: "mabni", name: "Madrasah Nusantara", dataSourceType: "mabni_api", tilawahProgramId: null, tilawahBatchId: null, berkahBusinessUnitId: null, config: { features: { piket: true }, segmentation: { primary: "marhalah", secondary: "gender" } } },
  // Maahir is ingest-only (v1 has no UI of its own), so its config is empty —
  // `syncPaused` on the existing row survives the merge above. It used to be
  // created by hand with scripts/add-maahir-program.ts, which meant a database
  // that had never had that script run (dashboard.edu, until 9 Sep 2026) had no
  // program for the Maahir sync to attach to, and /api/cron/sync-maahir
  // answered 500 forever.
  { slug: "maahir", name: "Kelas Maahir", dataSourceType: "maahir_api", tilawahProgramId: null, tilawahBatchId: null, berkahBusinessUnitId: null, config: {} },
] as const;

async function main() {
  const db = getDb();
  for (const p of PROGRAMS) {
    const seeded = JSON.stringify(p.config);
    // This runs on EVERY deploy, so the upsert must not clobber runtime state an
    // operator set from /admin/programs. `syncPaused` is the one such key: it is
    // an incident switch, not seed data, so whatever the row already carries
    // wins over the seed. Everything else in config is seed-owned and replaced.
    // Keys the ROW owns, not the seed: whatever is already there wins.
    //
    // `syncPaused` is an incident switch. `maahirHitsBatchId` is the Maahir
    // batch pin written once by scripts/pin-maahir-batches.ts — the seed has no
    // idea what it should be, because the uuids belong to Maahir and are looked
    // up by batch name at pin time.
    //
    // Before this, the seed replaced `config` wholesale and silently dropped the
    // pin. That matters because deploy runs `db:migrate && pnpm seed:programs`
    // on every push to main (deploy/docker-compose.yml), so **every production
    // deploy unpinned all seven HITS programs** and blanked Disiplin, Matrix,
    // Observasi and Inspeksi until someone re-ran the pin script. Caught on
    // 8 Sep 2026 when a local reseed did exactly that mid-session.
    //
    // Written as a merge over the surviving subset rather than another `case`
    // so adding the next row-owned key is one string, not another branch.
    const config = sql`
      ${seeded}::jsonb || coalesce(
        (select jsonb_object_agg(k, v)
           from jsonb_each(coalesce(${programs.config}, '{}'::jsonb)) as e(k, v)
          where k in ('syncPaused', 'maahirHitsBatchId')),
        '{}'::jsonb)`;
    await db
      .insert(programs)
      .values({
        slug: p.slug,
        name: p.name,
        dataSourceType: p.dataSourceType,
        tilawahProgramId: p.tilawahProgramId,
        tilawahBatchId: p.tilawahBatchId,
        berkahBusinessUnitId: p.berkahBusinessUnitId,
        config: p.config,
      })
      .onConflictDoUpdate({
        target: programs.slug,
        set: {
          name: p.name,
          dataSourceType: p.dataSourceType,
          tilawahProgramId: p.tilawahProgramId,
          tilawahBatchId: p.tilawahBatchId,
          berkahBusinessUnitId: p.berkahBusinessUnitId,
          config,
        },
      });
    console.log(`seeded ${p.slug}`);
  }
  console.log(`done — ${PROGRAMS.length} programs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
