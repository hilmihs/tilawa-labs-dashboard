/**
 * Sync the Madrasah Nusantara (mabni) data from the Mabni school API into the
 * same read-model the tilawah attendance dashboard uses, so no UI change is
 * needed. Mapping:
 *   kelas  → halaqah_sync (level = jenjang, type/day/session from the class +
 *            its jadwal pattern; guru from /jadwal, full name)
 *   guru   → guru_sync
 *   sesi   → jadwal_sync   (one meeting per session-occurrence seen in absensi)
 *   siswa  → students_sync + students roster (gender from the class, parents
 *            from /siswa)
 *   absensi→ attendance_sync (status hadir/terlambat/izin/alpha → 1/2/3/0)
 *   hafalan→ mabni_hafalan_sync
 * Attendance rate is recomputed with the SAME rule as tilawah-sync (Telat counts
 * as hadir; Izin excluded from numerator and denominator).
 *
 * The dimensions used to be reconstructed from the objects embedded in each
 * absensi row, which meant gender and pengajar were guessed with a regex over
 * the class NAME (giving nicknames like "Zahid & Afif") and a class with no
 * attendance yet did not exist at all. Each dimension now comes from its own
 * endpoint; absensi is only the fact table.
 */
import { sinkronOrangSetelahSync } from "@/lib/orang/sinkron-otomatis";
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { perbaruiNamaTampil } from "@/lib/insights/nama-tampil-halaqah";
import {
  programs,
  halaqahSync,
  jadwalSync,
  attendanceSync,
  studentsSync,
  students,
  syncRuns,
  guruSync,
  mabniHafalanSync,
  mabniNilaiSync,
  guruAttendanceSync,
} from "@/lib/db/schema";
import {
  fetchAllAbsensi,
  fetchAllGuruAbsensi,
  fetchGuru,
  fetchHafalan,
  fetchJadwal,
  fetchKelas,
  fetchNilai,
  fetchSiswa,
  type MabniJadwal,
  type MabniKelas,
  type MabniNilai,
} from "@/lib/integrations/mabni/client";

export type MabniSyncResult = {
  ok: boolean;
  programSlug: string;
  error?: string;
  halaqahCount?: number;
  jadwalCount?: number;
  studentCount?: number;
  attendanceCount?: number;
  guruCount?: number;
  hafalanCount?: number;
  nilaiCount?: number;
  guruAttendanceCount?: number;
};

/** `siswa: {id}` or a flat `siswa_id` — upstream's shape is not yet known. */
function nilaiSiswaId(n: MabniNilai): number | null {
  const nested = (n.siswa as { id?: unknown } | undefined)?.id;
  const flat = n.siswa_id;
  const v = typeof nested === "number" ? nested : typeof flat === "number" ? flat : null;
  return v;
}

const STATUS_INT: Record<string, string> = { hadir: "1", terlambat: "2", izin: "3", alpha: "0" };

/** Upstream `gender` is a word; the read-model stores tilawah's 1=Ikhwan/2=Akhwat. */
function genderCode(gender: string | null | undefined): number | null {
  if (!gender) return null;
  const g = gender.toLowerCase();
  if (g === "ikhwan") return 1;
  if (g === "akhwat") return 2;
  return null;
}

const HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Ahad"];

/** [2,5] → "Selasa & Jumat"; the full working week collapses to "Senin–Jumat". */
function formatHari(hari: number[] | null | undefined): string | null {
  const days = (hari ?? []).filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === 0) return null;
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (consecutive && days.length >= 3) return `${HARI[days[0]]}–${HARI[days[days.length - 1]]}`;
  return days.map((d) => HARI[d]).join(" & ");
}

/** "16:00–19:30", or just the start when the end is missing. */
function formatSession(jam: string | null, jamSelesai: string | null): string | null {
  if (!jam) return null;
  return jamSelesai ? `${jam}–${jamSelesai}` : jam;
}

export async function runAllMabniSyncs(): Promise<MabniSyncResult[]> {
  const db = getDb();
  const rows = await db.select().from(programs).where(eq(programs.dataSourceType, "mabni_api"));
  const out: MabniSyncResult[] = [];
  // config.syncPaused freezes a program's synced data — same contract the
  // tilawah runner honours, so the admin toggle means one thing everywhere.
  for (const p of rows) {
    if ((p.config as { syncPaused?: boolean } | null)?.syncPaused) continue;
    out.push(await runMabniSyncForProgram(p));
  }
  await sinkronOrangSetelahSync("mabni");
  return out;
}

export async function runMabniSyncForSlug(slug: string): Promise<MabniSyncResult | null> {
  const db = getDb();
  const [p] = await db.select().from(programs).where(eq(programs.slug, slug));
  if (!p) return null;
  if (p.dataSourceType !== "mabni_api") {
    return { ok: false, programSlug: slug, error: `program ${slug} is not mabni_api` };
  }
  const hasil = await runMabniSyncForProgram(p);
  await sinkronOrangSetelahSync(`mabni ${slug}`);
  return hasil;
}

async function runMabniSyncForProgram(program: typeof programs.$inferSelect): Promise<MabniSyncResult> {
  const db = getDb();
  const [runRow] = await db
    .insert(syncRuns)
    .values({ programId: program.id, runType: "mabni_full", status: "running" })
    .returning({ id: syncRuns.id });

  try {
    const [rows, kelasRows, siswaRows, guruRows, jadwalRows, hafalanRows, nilaiRows, guruAbsensiRows] =
      await Promise.all([
        fetchAllAbsensi({ dari: "2024-01-01" }),
        fetchKelas(),
        fetchSiswa(),
        fetchGuru(),
        fetchJadwal(),
        fetchHafalan(),
        fetchNilai(),
        fetchAllGuruAbsensi({ dari: "2024-01-01" }),
      ]);

    const kelasMap = new Map<number, MabniKelas>(kelasRows.map((k) => [k.id, k]));
    // One jadwal (recurring pattern) per kelas; it is also the only place the
    // API names a teacher for a class.
    const jadwalByKelas = new Map<number, MabniJadwal>();
    for (const j of jadwalRows) {
      if (j.kelas?.id != null) jadwalByKelas.set(j.kelas.id, j);
    }

    // Session occurrences exist only inside absensi — upstream has no /sesi.
    const sesiMap = new Map<number, { kelasId: number; tanggal: string; jam: string | null; jamSelesai: string | null }>();
    for (const r of rows) {
      sesiMap.set(r.sesi.id, { kelasId: r.kelas.id, tanggal: r.tanggal, jam: r.sesi?.jam ?? null, jamSelesai: r.sesi?.jam_selesai ?? null });
    }

    // The roster is /siswa, not "whoever appears in an absensi row", so a newly
    // enrolled student with no attendance yet is still a peserta.
    const siswaMap = new Map<number, { nama: string; kelasId: number | null; marhalah: string | null; ayah: string | null; ibu: string | null }>();
    for (const s of siswaRows) {
      const kelasId = s.kelas?.id ?? null;
      siswaMap.set(s.id, {
        nama: s.nama,
        kelasId,
        marhalah: (kelasId != null ? kelasMap.get(kelasId)?.jenjang?.nama : null) ?? null,
        ayah: s.nama_ayah ?? null,
        ibu: s.nama_ibu ?? null,
      });
    }
    // Anyone with attendance but missing from /siswa still has to exist, or the
    // attendance recompute would have nothing to write onto.
    for (const r of rows) {
      if (siswaMap.has(r.siswa.id)) continue;
      siswaMap.set(r.siswa.id, {
        nama: r.siswa.nama,
        kelasId: r.kelas.id,
        marhalah: r.jenjang?.nama ?? null,
        ayah: null,
        ibu: null,
      });
    }

    // guru_sync — the full names. The class name only carries nicknames, and a
    // class can be taught by more than one guru, so the roster is stored whole
    // and the per-class main teacher comes from the jadwal below.
    let guruCount = 0;
    for (const g of guruRows) {
      const set = {
        tilawahBatchId: null,
        name: g.nama,
        email: g.email ?? null,
        phone: null, // upstream exposes no phone for mabni teachers
        syncedAt: new Date(),
      };
      await db
        .insert(guruSync)
        .values({ programId: program.id, tilawahGuruId: g.id, ...set })
        .onConflictDoUpdate({ target: [guruSync.programId, guruSync.tilawahGuruId], set });
      guruCount += 1;
    }

    // Which gurus are attached to each class. `/jadwal` names only ONE teacher
    // per class while several classes are taught by a pair, and the API gives
    // this per class only — hence one call each (15 classes, cheap).
    const gurusByKelas = new Map<number, { id: number; nama: string; nickname: string | null }[]>();
    for (const k of kelasRows) {
      const list = await fetchGuru(k.id);
      gurusByKelas.set(
        k.id,
        list.map((g) => ({ id: g.id, nama: g.nama, nickname: g.nickname ?? null })),
      );
    }

    // halaqah_sync (one per kelas, from /kelas — classes with no attendance yet
    // included). `raw` keeps the class, its jadwal pattern and its guru list so
    // the dashboard can work out which dates a class was supposed to meet and
    // who else teaches it.
    let halaqahCount = 0;
    for (const k of kelasRows) {
      const jadwal = jadwalByKelas.get(k.id) ?? null;
      const set = {
        tilawahBatchId: k.periode?.id ?? null,
        name: k.nama,
        type: k.tipe ?? null,
        day: formatHari(jadwal?.hari ?? k.hari),
        session: formatSession(jadwal?.jam ?? null, jadwal?.jam_selesai ?? null),
        level: k.jenjang?.nama ?? null,
        guruId: jadwal?.guru?.id ?? null,
        pengajar: jadwal?.guru?.nama ?? null,
        guruPhone: null,
        raw: { kelas: k, jadwal, gurus: gurusByKelas.get(k.id) ?? [] },
        syncedAt: new Date(),
      };
      await db
        .insert(halaqahSync)
        .values({ programId: program.id, tilawahHalaqahId: k.id, ...set })
        .onConflictDoUpdate({ target: [halaqahSync.programId, halaqahSync.tilawahHalaqahId], set });
      halaqahCount += 1;
    }

    // Nama tampil dihitung SETELAH seluruh kelas tersimpan: penomoran butuh
    // himpunan lengkapnya, dan satu kelas baru menggeser nomor saudaranya.
    await perbaruiNamaTampil(program.slug);

    // jadwal_sync (one per sesi) — order by (tanggal, jam) within a kelas
    const sesiByKelas = new Map<number, number[]>();
    for (const [sesiId, s] of sesiMap) {
      (sesiByKelas.get(s.kelasId) ?? sesiByKelas.set(s.kelasId, []).get(s.kelasId)!).push(sesiId);
    }
    let jadwalCount = 0;
    for (const [, ids] of sesiByKelas) {
      ids.sort((a, b) => {
        const A = sesiMap.get(a)!, B = sesiMap.get(b)!;
        return A.tanggal.localeCompare(B.tanggal) || (A.jam ?? "").localeCompare(B.jam ?? "");
      });
      for (let i = 0; i < ids.length; i++) {
        const sesiId = ids[i];
        const s = sesiMap.get(sesiId)!;
        const set = {
          tilawahHalaqahId: s.kelasId,
          name: s.jam ? `${s.jam}${s.jamSelesai ? `–${s.jamSelesai}` : ""}` : String(i + 1),
          order: i + 1,
          scheduleDate: s.tanggal,
          guruId: null,
          status: 4, // attendance exists → treat as held
          statusLabel: "Selesai",
          raw: s,
          syncedAt: new Date(),
        };
        await db
          .insert(jadwalSync)
          .values({ programId: program.id, tilawahJadwalId: sesiId, ...set })
          .onConflictDoUpdate({ target: [jadwalSync.programId, jadwalSync.tilawahJadwalId], set });
        jadwalCount += 1;
      }
    }

    // attendance_sync (one per absensi row)
    let attendanceCount = 0;
    for (const r of rows) {
      const status = STATUS_INT[r.status] ?? "0";
      const set = {
        halaqahUserId: r.siswa.id,
        halaqahJadwalId: r.sesi.id,
        status,
        notes: r.keterangan ?? null,
        lahnJaliy: null,
        lahnKhofiy: null,
        taskSubmissionDate: null,
        raw: r as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      };
      await db
        .insert(attendanceSync)
        .values({ programId: program.id, tilawahPresensiId: r.id, ...set })
        .onConflictDoUpdate({ target: [attendanceSync.programId, attendanceSync.tilawahPresensiId], set });
      attendanceCount += 1;
    }

    // students_sync + students roster (one per siswa)
    let studentCount = 0;
    for (const [siswaId, s] of siswaMap) {
      const k = s.kelasId != null ? kelasMap.get(s.kelasId) : undefined;
      // Classes are gender-segregated upstream and /siswa carries no gender, so
      // the class's own `gender` field is the student's.
      const gender = genderCode(k?.gender);
      const pengajar = (s.kelasId != null ? jadwalByKelas.get(s.kelasId)?.guru?.nama : null) ?? null;
      const ssSet = {
        halaqahUserId: siswaId,
        name: s.nama,
        userCode: null,
        phone: null,
        halaqahId: s.kelasId,
        pengajar,
        gender,
        enrollmentStatusCode: 1,
        enrollmentStatus: null,
        raw: s,
        syncedAt: new Date(),
      };
      await db
        .insert(studentsSync)
        .values({ programId: program.id, tilawahUserId: siswaId, ...ssSet })
        .onConflictDoUpdate({ target: [studentsSync.programId, studentsSync.tilawahUserId], set: ssSet });
      studentCount += 1;
    }

    const kelasIds = [...kelasMap.keys()];
    const sesiIds = [...sesiMap.keys()];
    const siswaIds = [...siswaMap.keys()];
    const absensiIds = rows.map((r) => r.id);

    // Roster (`students`): reconcile FIRST — stamp tilawah_user_id onto existing
    // roster rows (which carry piket/late-incident history) matched by name, so
    // we don't create duplicates. Rows already stamped with an id that is NOT a
    // Mabni siswa id — e.g. left over from an earlier tilawah-sourced import —
    // must be adopted too: matching only NULLs would leave them for the prune
    // below to delete, cascading away their late_incidents and warning_letters.
    // Whatever still has no upstream counterpart is demoted to manual roster
    // rather than deleted. THEN upsert (matched rows update; genuinely new siswa
    // insert). Never blind-insert — that duplicates the imported roster.
    if (siswaIds.length) {
      const nameToId = new Map([...siswaMap].map(([id, s]) => [s.nama.trim().toLowerCase(), id]));
      const adoptable = await db
        .select({ id: students.id, fullName: students.fullName, tilawahUserId: students.tilawahUserId })
        .from(students)
        .where(
          and(
            eq(students.programId, program.id),
            or(isNull(students.tilawahUserId), notInArray(students.tilawahUserId, siswaIds)),
          ),
        );
      // (program_id, tilawah_user_id) is unique — never re-stamp onto an id some
      // other row in this program already holds.
      const taken = new Set(
        (
          await db
            .select({ tilawahUserId: students.tilawahUserId })
            .from(students)
            .where(and(eq(students.programId, program.id), inArray(students.tilawahUserId, siswaIds)))
        ).map((r) => r.tilawahUserId),
      );
      for (const st of adoptable) {
        const id = nameToId.get(st.fullName.trim().toLowerCase());
        if (id != null && !taken.has(id)) {
          await db.update(students).set({ tilawahUserId: id }).where(eq(students.id, st.id));
          taken.add(id);
        } else if (st.tilawahUserId != null) {
          await db.update(students).set({ tilawahUserId: null }).where(eq(students.id, st.id));
        }
      }
    }
    for (const [siswaId, s] of siswaMap) {
      await db
        .insert(students)
        .values({
          programId: program.id,
          tilawahUserId: siswaId,
          fullName: s.nama,
          marhalah: s.marhalah,
          fatherName: s.ayah,
          motherName: s.ibu,
        })
        .onConflictDoUpdate({
          target: [students.programId, students.tilawahUserId],
          // Parent names FILL a gap, never overwrite: the roster xlsx import is
          // the richer source and upstream leaves these null for some siswa.
          set: {
            fullName: s.nama,
            marhalah: s.marhalah,
            fatherName: sql`coalesce(${students.fatherName}, excluded.father_name)`,
            motherName: sql`coalesce(${students.motherName}, excluded.mother_name)`,
          },
        });
    }

    // mabni_hafalan_sync (one per setoran record)
    let hafalanCount = 0;
    for (const h of hafalanRows) {
      const set = {
        siswaId: h.siswa?.id ?? null,
        sesiId: h.sesi?.id ?? null,
        sesiTanggal: h.sesi?.tanggal ?? null,
        metrikId: h.metrik?.id ?? null,
        metrik: h.metrik?.nama ?? null,
        surat: h.surat ?? null,
        status: h.status ?? null,
        keterangan: h.keterangan ?? null,
        raw: h as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      };
      await db
        .insert(mabniHafalanSync)
        .values({ programId: program.id, mabniHafalanId: h.id, ...set })
        .onConflictDoUpdate({ target: [mabniHafalanSync.programId, mabniHafalanSync.mabniHafalanId], set });
      hafalanCount += 1;
    }

    // mabni_nilai_sync — carried through verbatim; upstream is still empty and
    // its field names are unknown, so nothing is mapped into columns yet.
    let nilaiCount = 0;
    for (const n of nilaiRows) {
      const set = {
        siswaId: nilaiSiswaId(n),
        raw: n as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      };
      await db
        .insert(mabniNilaiSync)
        .values({ programId: program.id, mabniNilaiId: n.id, ...set })
        .onConflictDoUpdate({ target: [mabniNilaiSync.programId, mabniNilaiSync.mabniNilaiId], set });
      nilaiCount += 1;
    }

    // guru_attendance_sync (one per /absensi-guru row = one guru-day). A separate
    // axis from `taught`: real teacher check-ins, not meetings held.
    let guruAttendanceCount = 0;
    for (const a of guruAbsensiRows) {
      const set = {
        guruId: a.guru?.id ?? null,
        tanggal: a.tanggal ?? null,
        status: a.status ?? null,
        jamMasuk: a.jam_masuk ?? null,
        sudahIzin: a.sudah_izin ?? null,
        keterangan: a.keterangan ?? null,
        raw: a as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      };
      await db
        .insert(guruAttendanceSync)
        .values({ programId: program.id, mabniAbsensiGuruId: a.id, ...set })
        .onConflictDoUpdate({ target: [guruAttendanceSync.programId, guruAttendanceSync.mabniAbsensiGuruId], set });
      guruAttendanceCount += 1;
    }

    // Prune rows no longer present upstream (full backfill each run). Guarded by
    // non-empty id sets so a transient empty pull can't wipe the program. Only
    // API-sourced students (tilawah_user_id set) are pruned — manual roster kept,
    // and the reconcile step above has already demoted every unmatched roster row
    // to manual so this cannot cascade into late_incidents / warning_letters.
    if (kelasIds.length)
      await db.execute(sql`delete from halaqah_sync where program_id = ${program.id} and tilawah_halaqah_id not in (${sql.join(kelasIds, sql`, `)})`);
    if (sesiIds.length)
      await db.execute(sql`delete from jadwal_sync where program_id = ${program.id} and tilawah_jadwal_id not in (${sql.join(sesiIds, sql`, `)})`);
    if (absensiIds.length)
      await db.execute(sql`delete from attendance_sync where program_id = ${program.id} and tilawah_presensi_id not in (${sql.join(absensiIds, sql`, `)})`);
    if (siswaIds.length) {
      await db.execute(sql`delete from students_sync where program_id = ${program.id} and tilawah_user_id not in (${sql.join(siswaIds, sql`, `)})`);
      await db.execute(sql`delete from students where program_id = ${program.id} and tilawah_user_id is not null and tilawah_user_id not in (${sql.join(siswaIds, sql`, `)})`);
    }
    if (guruRows.length)
      await db.execute(sql`delete from guru_sync where program_id = ${program.id} and tilawah_guru_id not in (${sql.join(guruRows.map((g) => g.id), sql`, `)})`);
    if (hafalanRows.length)
      await db.execute(sql`delete from mabni_hafalan_sync where program_id = ${program.id} and mabni_hafalan_id not in (${sql.join(hafalanRows.map((h) => h.id), sql`, `)})`);
    if (nilaiRows.length)
      await db.execute(sql`delete from mabni_nilai_sync where program_id = ${program.id} and mabni_nilai_id not in (${sql.join(nilaiRows.map((n) => n.id), sql`, `)})`);
    if (guruAbsensiRows.length)
      await db.execute(sql`delete from guru_attendance_sync where program_id = ${program.id} and mabni_absensi_guru_id not in (${sql.join(guruAbsensiRows.map((a) => a.id), sql`, `)})`);

    // Recompute date-relative attendance (same rule as tilawah-sync).
    await db.execute(sql`
      update students_sync ss set
        hadir_count = agg.hadir,
        effective_meetings = agg.effective,
        recorded_meetings = agg.recorded,
        izin_count = agg.izin,
        attendance_rate = case when agg.effective > 0
          then round(100.0 * agg.hadir / agg.effective, 1) else null end
      from (
        select halaqah_user_id,
          count(*) filter (where status in ('1','2'))     as hadir,
          count(*) filter (where status in ('0','1','2')) as effective,
          count(*)                                        as recorded,
          count(*) filter (where status = '3')            as izin
        from attendance_sync
        where program_id = ${program.id} and halaqah_user_id is not null
        group by halaqah_user_id
      ) agg
      where ss.program_id = ${program.id} and ss.halaqah_user_id = agg.halaqah_user_id
    `);

    await db.update(syncRuns).set({ status: "success", finishedAt: new Date() }).where(eq(syncRuns.id, runRow.id));
    return {
      ok: true,
      programSlug: program.slug,
      halaqahCount,
      jadwalCount,
      studentCount,
      attendanceCount,
      guruCount,
      hafalanCount,
      nilaiCount,
      guruAttendanceCount,
    };
  } catch (err) {
    const error = describeError(err);
    await db.update(syncRuns).set({ status: "failed", error, finishedAt: new Date() }).where(eq(syncRuns.id, runRow.id));
    return { ok: false, programSlug: program.slug, error };
  }
}

/**
 * A network failure reaches us as `TypeError: fetch failed` and nothing else —
 * the reason lives on `err.cause`, which the plain `.message` throws away. Rows
 * in sync_runs reading only "fetch failed" cannot distinguish DNS failure from a
 * refused connection from a timeout, and that is the entire diagnosis. Unwrap it.
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "mabni sync failed";
  const cause = err.cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return `${err.message} (${code ? `${code}: ` : ""}${cause.message})`;
  }
  return err.message;
}
