/**
 * Demo data generator.
 *
 * Builds a coherent, synthetic world for the public demo: programmes, teachers,
 * halaqah, rosters, a schedule of meetings and the attendance against them. No
 * row derives from production — names come from fixed lists and every phone
 * number sits in the reserved 62899 range.
 *
 * Deterministic by design: one fixed PRNG seed, so the nightly reset reproduces
 * the same screens and yesterday's visitors leave no trace.
 *
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 *
 * ── The four traps this generator exists to get right ──────────────────────
 *
 * 1. `attendance_sync.status` is TEXT, not an integer. '1' and '2' count as
 *    present, '3' (izin) is excluded from the denominator entirely. Seeding
 *    integers leaves headcounts looking correct while every attendance
 *    percentage renders as a dash.
 *
 * 2. The joins run on upstream ids, never on the uuid primary keys:
 *      attendance_sync.halaqah_jadwal_id = jadwal_sync.tilawah_jadwal_id
 *      attendance_sync.halaqah_user_id   = students_sync.halaqah_user_id
 *      students_sync.halaqah_id          = halaqah_sync.tilawah_halaqah_id
 *    Get one wrong and the page still renders, just empty.
 *
 * 3. The batch-stray guard drops a halaqah unless its `tilawah_batch_id`
 *    matches the programme's, or either is null. Both are left null here;
 *    a mismatch empties the entire monthly report with no error.
 *
 * 4. The wall board reads today AND yesterday (its rotation embeds
 *    `/tv?hari=kemarin`), and its LIVE pill turns red unless a successful
 *    `sync_runs` row finished within the last forty minutes. So the schedule
 *    must cover both days and the run is stamped at generation time.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword } from '../lib/auth/password';

const PASSWORD = 'demo123';

/** Display names only. The slugs are left alone — see DEMO.md. */
const PROGRAM: { slug: string; nama: string }[] = [
  { slug: 'hits-regular', nama: 'Recitation Foundation — Evening' },
  { slug: 'hits-safar', nama: 'Recitation Foundation — Weekend' },
  { slug: 'hits-ortu-abk', nama: 'Recitation for Parents' },
  { slug: 'hits-nurul-iman', nama: 'Community Recitation Circle' },
  { slug: 'dpq', nama: 'Preparatory Qur\'an Class' },
  { slug: 'tahsin-keluarga', nama: 'Family Tahsin' },
];

const DEPAN_I = ['Adam','Bilal','Dawud','Faris','Hakim','Idris','Jamil','Karim','Luqman','Munir',
  'Nadir','Rafi','Sami','Tariq','Wasim','Yasin','Zahir','Amir','Basim','Hadi','Anas','Salim'];
const DEPAN_A = ['Aisha','Buthayna','Dalia','Farida','Hana','Inas','Jamila','Karima','Layla','Maryam',
  'Nadia','Rania','Salma','Thuraya','Wafa','Yusra','Zaynab','Amina','Bushra','Hiba','Asma','Rahma'];
const MARGA = ['Abdallah','Haddad','Jabari','Khalidi','Mansour','Najjar','Qureshi','Rahmani',
  'Siddiqui','Tamimi','Wahbi','Younes','Zaidan','Barakat','Fahmy','Darwish','Ghanem'];
const LEVEL = ['Dasar', 'Lanjutan'];
const TIPE = ['offline', 'online'];

let benih = 20261004;
const acak = () => ((benih = (benih * 1103515245 + 12345) % 2147483648) / 2147483648);
const antara = (lo: number, hi: number) => lo + Math.floor(acak() * (hi - lo + 1));
const pilih = <T,>(xs: readonly T[]): T => xs[Math.floor(acak() * xs.length)];

/** Jakarta "today" as YYYY-MM-DD — the board and the reports both key off it. */
function hariIni(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const geser = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** The Friday that opens the current board week (the week runs Jumat→Kamis). */
function jumatPekanIni(d: Date): Date {
  return geser(d, -((d.getUTCDay() - 5 + 7) % 7));
}
function seninPekanIni(d: Date): Date {
  return geser(d, -((d.getUTCDay() + 6) % 7));
}

async function bulk(db: Client, tabel: string, kolom: string[], baris: unknown[][]): Promise<void> {
  if (!baris.length) return;
  // Chunked: a single statement with tens of thousands of parameters exceeds
  // what the wire protocol will carry.
  const perBatch = Math.max(1, Math.floor(60000 / kolom.length));
  for (let i = 0; i < baris.length; i += perBatch) {
    const bagian = baris.slice(i, i + perBatch);
    const nilai = bagian
      .map((r, k) => `(${r.map((_, j) => `$${k * kolom.length + j + 1}`).join(', ')})`)
      .join(', ');
    // Identifiers are quoted because at least one real column is a reserved
    // word: jadwal_sync."order".
    const kol = kolom.map((k) => `"${k}"`).join(', ');
    await db.query(`insert into ${tabel} (${kol}) values ${nilai}`, bagian.flat());
  }
}

export async function seedDemo(): Promise<Record<string, number>> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const hari0 = hariIni();
  const jumat = jumatPekanIni(hari0);
  const senin = seninPekanIni(hari0);

  for (const t of ['scorecard_workbook_items','scorecard_kpis','scorecard_periods',
                   'attendance_sync','jadwal_sync','students_sync','students','halaqah_sync',
                   'guru_sync','attendance_thresholds','sync_runs','news_items','tv_quotes',
                   'directives','program_tasks','staff_programs','staff','programs']) {
    await db.query(`delete from ${t}`);
  }

  // ── staff ────────────────────────────────────────────────────────────────
  const hash = await hashPassword(PASSWORD);
  const superId = randomUUID();
  const koorId = randomUUID();
  await bulk(db, 'staff', ['id','email','password_hash','name','role'], [
    [superId, 'super@tilawalabs.demo', hash, 'Demo Super Coordinator', 'super_coordinator'],
    [koorId, 'coordinator@tilawalabs.demo', hash, 'Demo Coordinator', 'coordinator'],
  ]);

  // ── programmes ───────────────────────────────────────────────────────────
  //
  // tilawah_batch_id is left null on both sides of the batch-stray guard; see
  // trap 3 at the top of this file.
  const prog: { id: string; slug: string; nama: string }[] = [];
  await bulk(db, 'programs', ['id','name','slug','data_source_type','config'],
    PROGRAM.map((p) => {
      const id = randomUUID();
      prog.push({ id, slug: p.slug, nama: p.nama });
      return [id, p.nama, p.slug, 'tilawah_api', JSON.stringify({
        segmentation: { primary: 'level', secondary: 'gender' },
        features: { piket: false, perubahan: true, surat: false, asesmen: false, ringkasan: false },
        reportFormat: 'hits',
      })];
    }));

  // The non-super coordinator only sees programmes granted to it; three of six
  // keeps the difference between the two roles visible in the demo.
  await bulk(db, 'staff_programs', ['staff_id','program_id'],
    prog.slice(0, 3).map((p) => [koorId, p.id]));

  await bulk(db, 'attendance_thresholds', ['program_id','period_type','pct_70','pct_30','pct_15'],
    prog.map((p) => [p.id, 'yaumiy', 70, 30, 15]));

  // ── teachers, halaqah, rosters ───────────────────────────────────────────
  let seqGuru = 1000, seqHalaqah = 2000, seqUser = 30000, seqEnrol = 40000;
  let seqJadwal = 50000, seqPresensi = 600000;

  const barisGuru: unknown[][] = [];
  const barisHalaqah: unknown[][] = [];
  const barisSiswaSync: unknown[][] = [];
  const barisSiswa: unknown[][] = [];
  const barisJadwal: unknown[][] = [];
  const barisHadir: unknown[][] = [];

  type Halaqah = { pid: string; hid: number; gender: 1 | 2; murid: number[] };
  /*
   * students_sync carries denormalised attendance columns that the sync would
   * normally compute upstream. /overview reads its headline percentage from
   * `attendance_rate` alone — leave it null and the hero renders "—" even
   * though every attendance row is present and correct.
   */
  const tally = new Map<number, { hadir: number; eff: number; rec: number }>();
  const semua: Halaqah[] = [];

  for (const p of prog) {
    for (let h = 0; h < 3; h += 1) {
      const gender: 1 | 2 = h % 2 === 0 ? 1 : 2;
      const ikhwan = gender === 1;
      const gid = seqGuru++;
      const namaGuru = `${pilih(ikhwan ? DEPAN_I : DEPAN_A)} ${pilih(MARGA)}`;
      barisGuru.push([randomUUID(), p.id, gid, namaGuru,
        `teacher${gid}@tilawalabs.demo`, `62899${String(100000 + gid).slice(-6)}`, ikhwan ? 1 : 2]);

      const hid = seqHalaqah++;
      barisHalaqah.push([randomUUID(), p.id, hid, null,
        `Halaqah ${String.fromCharCode(65 + h)} ${ikhwan ? 'Ikhwan' : 'Akhwat'}`,
        pilih(TIPE), pilih(['Senin','Selasa','Rabu','Kamis','Sabtu']), '16:00',
        LEVEL[h % LEVEL.length], namaGuru, `62899${String(100000 + gid).slice(-6)}`, gid]);

      const murid: number[] = [];
      for (let s = 0; s < 10; s += 1) {
        const uid = seqUser++;
        const eid = seqEnrol++;
        murid.push(eid);
        const nama = `${pilih(ikhwan ? DEPAN_I : DEPAN_A)} ${pilih(MARGA)}`;
        // A couple of withdrawals per programme so "Peserta Keluar" is non-zero
        // and its sheet appears in the workbook at all.
        const keluar = s === 9 && acak() < 0.5;
        barisSiswaSync.push([randomUUID(), p.id, uid, eid, nama,
          `62899${String(200000 + uid).slice(-6)}`, hid, namaGuru, gender,
          keluar ? 0 : 1,
          keluar ? 'mengundurkan diri' : 'aktif',
          iso(geser(hari0, -120)),
          keluar ? iso(geser(hari0, -antara(3, 20))) : iso(geser(hari0, -120))]);
        barisSiswa.push([randomUUID(), p.id, nama, uid]);
      }
      semua.push({ pid: p.id, hid, gender, murid });
    }
  }

  // ── schedule and attendance ──────────────────────────────────────────────
  //
  // Six weeks back through today. Today and yesterday are always included
  // because the wall board reads both (trap 4).
  for (const h of semua) {
    /*
     * `order` is the meeting's number within its halaqah. The per-meeting
     * heatmap strip — the one genuinely visual element on the halaqah table —
     * groups by (halaqah, order) and silently drops any meeting where it is
     * null. A seed without it renders a table of dashes and looks like a bug.
     */
    let urutan = 0;
    for (let d = 42; d >= 0; d -= 1) {
      const tanggal = geser(hari0, -d);
      /*
       * Every halaqah meets today and yesterday, not just the ones whose weekday
       * happens to match. The wall board's denominator is the whole programme
       * roster, not only the circles sitting that evening — so a day where a
       * third of them meet renders as 28% attendance and six programmes "below
       * target", which reads as a collapsing organisation rather than a demo.
       */
      const rutin = tanggal.getUTCDay() === (h.hid % 5) + 1 || tanggal.getUTCDay() === 6;
      if (!rutin && d > 1) continue;

      const jid = seqJadwal++;
      urutan += 1;
      // status 3/4 = held. Today is mostly taught, with one circle left open so
      // the "belum diisi" tile has a real number instead of a zero.
      const sudah = d === 0 ? acak() < 0.88 : acak() < 0.92;
      barisJadwal.push([randomUUID(), h.pid, h.hid, jid,
        `Pertemuan ${urutan}`, urutan, iso(tanggal), sudah ? 4 : 1,
        sudah ? 'Terlaksana' : 'Belum',
        // The Jadwal column reads the session time out of characters 12-16 of
        // these raw strings before falling back to halaqah_sync.day/session.
        JSON.stringify({
          start_session_date: `${iso(tanggal)} 16:00:00`,
          end_session_date: `${iso(tanggal)} 17:30:00`,
        })]);

      if (!sudah) continue;
      for (const eid of h.murid) {
        const r = acak();
        /*
         * Text, not integers — trap 1. The mix is tuned so the board sits in
         * healthy territory while two programmes still fall under the 70%
         * threshold, which is what makes the "perlu perhatian" tile meaningful
         * rather than either empty or all-red.
         */
        const lemah = h.hid % 7 === 0;
        const status = lemah
          ? (r < 0.58 ? '1' : r < 0.64 ? '2' : r < 0.72 ? '3' : '0')
          : (r < 0.88 ? '1' : r < 0.93 ? '2' : r < 0.96 ? '3' : '0');
        barisHadir.push([randomUUID(), h.pid, seqPresensi++, eid, jid, status]);

        const t = tally.get(eid) ?? { hadir: 0, eff: 0, rec: 0 };
        t.rec += 1;
        // '3' is izin: recorded, but out of the denominator entirely.
        if (status !== '3') t.eff += 1;
        if (status === '1' || status === '2') t.hadir += 1;
        tally.set(eid, t);
      }
    }
  }

  await bulk(db, 'guru_sync',
    ['id','program_id','tilawah_guru_id','name','email','phone','gender'], barisGuru);
  await bulk(db, 'halaqah_sync',
    ['id','program_id','tilawah_halaqah_id','tilawah_batch_id','name','type','day','session',
     'level','pengajar','guru_phone','guru_id'], barisHalaqah);
  for (const r of barisSiswaSync) {
    const t = tally.get(r[3] as number) ?? { hadir: 0, eff: 0, rec: 0 };
    const pct = t.eff ? Number(((t.hadir / t.eff) * 100).toFixed(2)) : null;
    r.push(t.hadir, t.eff, t.rec, pct, pct);
  }
  await bulk(db, 'students_sync',
    ['id','program_id','tilawah_user_id','halaqah_user_id','name','phone','halaqah_id','pengajar',
     'gender','enrollment_status_code','enrollment_status','enrollment_created_at',
     'enrollment_updated_at',
     'hadir_count','effective_meetings','recorded_meetings','attendance_rate','kehadiran_percentage'],
    barisSiswaSync);
  await bulk(db, 'students', ['id','program_id','full_name','tilawah_user_id'], barisSiswa);
  await bulk(db, 'jadwal_sync',
    ['id','program_id','tilawah_halaqah_id','tilawah_jadwal_id','name','order','schedule_date',
     'status','status_label','raw'],
    barisJadwal);
  await bulk(db, 'attendance_sync',
    ['id','program_id','tilawah_presensi_id','halaqah_user_id','halaqah_jadwal_id','status'],
    barisHadir);

  // ── wall board furniture ─────────────────────────────────────────────────
  //
  // The LIVE pill goes red when the last successful run is over forty minutes
  // old, which reads as broken on a screen meant to sit in a lobby.
  await bulk(db, 'sync_runs', ['id','program_id','run_type','status','started_at','finished_at'],
    prog.map((p) => [randomUUID(), p.id, 'tilawah', 'success',
      new Date(Date.now() - 6 * 60000).toISOString(), new Date(Date.now() - 5 * 60000).toISOString()]));

  await bulk(db, 'news_items',
    ['id','division','week_start','title','body','status','pinned','sort_order'], [
    [randomUUID(), 'program', iso(jumat), 'Attendance above target for a third week',
     'Every circle held its sessions and the evening group reached 92 per cent.', 'approved', true, 1],
    [randomUUID(), 'kajian', iso(jumat), 'Two new study circles opened',
     'Both are at capacity; a waiting list is being kept for next term.', 'approved', false, 2],
    [randomUUID(), 'kaderisasi', iso(jumat), 'Teacher assessment round closed',
     'Scores are published and the follow-up sessions are scheduled.', 'approved', false, 3],
    [randomUUID(), 'zakat', iso(jumat), 'Quarterly distribution completed',
     'Reports have gone out to the partner institutions.', 'approved', false, 4],
  ]);

  await bulk(db, 'tv_quotes', ['id','text','arabic','source','active','sort_order'], [
    [randomUUID(), 'The best of you are those who learn the Qur\'an and teach it.',
     'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ', 'Narrated by al-Bukhari', true, 1],
    [randomUUID(), 'Seeking knowledge is an obligation upon every Muslim.',
     'طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ', 'Narrated by Ibn Majah', true, 2],
  ]);

  // Ages spread deliberately: the board colours rows green / yellow / orange /
  // red by age, and hides the "overdue" badge entirely when nothing is past 30
  // days. Two rows are left deliberately silent so the stale dot appears.
  const arahan: [string, string, string, string[], number, string | null, number | null][] = [
    ['Publish the monthly attendance recap', 'Dewan', 'Tim Program', ['Dewan','Tim Program'], 3, 'Draft circulated for review.', 1],
    ['Confirm next term\'s teaching roster', 'Ketua Majelis', 'Tim Kaderisasi', ['Ketua Majelis','Tim Program'], 9, 'Two circles still unassigned.', 4],
    ['Replace the projector in the main hall', 'Internal', 'Tim Administrasi', ['Tim Administrasi'], 16, null, null],
    ['Review the assessment rubric', 'Dewan', 'Tim Program', ['Dewan'], 24, 'Waiting on the teachers\' feedback.', 12],
    ['Close out last term\'s participant records', 'Internal', 'Tim Administrasi', ['Tim Administrasi','Tim Program'], 41, null, null],
    ['Agree the lobby screen rotation', 'Ketua Majelis', 'Tim Program', ['Ketua Majelis'], 6, 'Agreed; rollout this week.', 2],
  ];
  await bulk(db, 'directives',
    ['id','title','source','pic','stakeholders','requested_at','checkpoint','checkpoint_updated_at','status'],
    arahan.map(([title, source, pic, st, umur, cp, upd]) => [
      randomUUID(), title, source, pic, JSON.stringify(st), iso(geser(hari0, -umur)), cp,
      upd === null ? null : new Date(hari0.getTime() - upd * 86400000).toISOString(), 'aktif',
    ]));

  await bulk(db, 'program_tasks', ['id','week_start','program','task','urutan'],
    ['Maahir','HITS','ALS','DPQ','Tashil','Sakan','Disabilitas','MLP','SGA'].map((nama, i) =>
      [randomUUID(), iso(senin), nama,
       pilih(['Finish the term report','Confirm the teaching roster','Review last month\'s attendance',
              'Close the open assessments','Prepare the parents\' briefing']), i + 1]));

  // ── scorecard ────────────────────────────────────────────────────────────
  //
  // The page needs only a period and one KPI per tab; workbook items are
  // optional and only exercise the computed-rollup path.
  const periodeId = randomUUID();
  const tahun = hari0.getUTCFullYear();
  await bulk(db, 'scorecard_periods',
    ['id','label','kind','year','seq','start_date','end_date','active'],
    [[periodeId, `Q4 ${tahun}`, 'quarter', tahun, 4,
      `${tahun}-10-01`, `${tahun}-12-31`, true]]);

  const KPI: [string, string, string, string, number, number][] = [
    ['cat','customer','Participant attendance','%',85,  Number((88 + acak() * 6).toFixed(1))],
    ['cat','ibp','Sessions held as scheduled','%',90,   Number((91 + acak() * 5).toFixed(1))],
    ['cat','learning','Teachers assessed this quarter','#',18, 16],
    ['cat','financial','Cost per participant hour','#',1, 1],
    ['hits','customer','Recitation circles running','#',12, 12],
    ['kba','ibp','Reports delivered on time','%',95, 97],
    ['maahir','learning','Teacher development sessions','#',6, 5],
    ['dpq','customer','Preparatory class retention','%',80, 84],
  ];
  await bulk(db, 'scorecard_kpis',
    ['id','period_id','perspective','subdivision','name','uom','target','ach_seed','sort_order'],
    KPI.map(([sub, persp, nama, uom, target, ach], i) =>
      [randomUUID(), periodeId, persp, sub, nama, uom, target, ach, (i + 1) * 10]));

  const hitung = {
    programmes: prog.length,
    teachers: barisGuru.length,
    halaqah: barisHalaqah.length,
    participants: barisSiswaSync.length,
    meetings: barisJadwal.length,
    attendance: barisHadir.length,
    directives: arahan.length,
    scorecardKpis: 8,
  };
  await db.end();
  return hitung;
}

if (process.argv[1]?.endsWith('seed-demo.ts')) {
  seedDemo()
    .then((h) => {
      console.log(Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n'));
      console.log(`\nsuper@tilawalabs.demo / coordinator@tilawalabs.demo — password "${PASSWORD}"`);
      process.exit(0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
