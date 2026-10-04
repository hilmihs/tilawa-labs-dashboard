import { NextRequest, NextResponse } from "next/server";
import {
  requireProgramAccess,
  getAccessiblePrograms,
  getAllPrograms,
  getProgram,
} from "@/lib/programs/resolve";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertAgentAuth } from "@/app/api/agent/_auth";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { getMabniGuruAttendance } from "@/lib/confirmations/guru-attendance";
import {
  getParticipantReport,
  getTeacherReport,
  getHitsMonthlyReport,
  getExitedParticipants,
} from "@/lib/reports/queries";
import { resolveReportScope, resolveReportScopeForAgent, COMBINED } from "@/lib/reports/scope";
import {
  buildParticipantWorkbook,
  buildTeacherWorkbook,
  buildHitsMonthlyWorkbook,
  type MabniGuruAttendanceXlsxRow,
} from "@/lib/reports/xlsx";
import { getHkmDashboardData } from "@/app/[program]/hkm/queries";
import { buildHkmParticipantWorkbook, buildHkmMonthlyWorkbook } from "@/lib/reports/hkm-xlsx";
import { monthLabel } from "@/lib/insights/hkm";
import {
  getPesertaDirectory,
  getPengajarDirectory,
  type PesertaDirectory,
  type PengajarDirectory,
} from "@/lib/directory/queries";
import {
  getPengajarDirectorySemuaBatch,
  getPesertaDirectorySemuaBatch,
} from "@/lib/directory/semua-batch";
import {
  buildPesertaDirectoryWorkbook,
  buildPengajarDirectoryWorkbook,
} from "@/lib/reports/directory-xlsx";
import { getSilabus } from "@/lib/insights/silabus";
import { buildSilabusWorkbook } from "@/lib/reports/silabus-xlsx";
import { getKbaMonthly, KBA_SLUGS } from "@/lib/reports/kba-monthly";
import { buildKbaMonthlyWorkbook } from "@/lib/reports/kba-xlsx";
import { getHkmBulanan } from "@/lib/reports/hkm-bulanan";
import { buildHkmBulananWorkbook } from "@/lib/reports/hkm-bulanan-xlsx";
import { kosongSeluruhnya, loadMaahirBulanan } from "@/lib/reports/maahir-bulanan";
import { buildMaahirBulananWorkbook } from "@/lib/reports/maahir-bulanan-xlsx";
import { getProgramConfig } from "@/lib/programs/config";
import { bulanDari, hariIniWib } from "@/lib/ringkasan/hitung";
import { loadRingkasanBulan } from "@/lib/ringkasan/queries";
import { buildRingkasanWorkbook } from "@/lib/reports/ringkasan-xlsx";
import { getHasilUjianLaporan } from "@/lib/reports/hasil-ujian";
import { buildHasilUjianWorkbook } from "@/lib/reports/hasil-ujian-xlsx";

export const dynamic = "force-dynamic";

/** Jakarta-local date for the export filename (server may run in UTC). */
function todayJakarta(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ program: string; type: string }> },
) {
  const { program, type } = await params;

  // Two credentials. `Bearer AGENT_TOKEN` (read-only machine, spans every
  // program) is checked first and never touches the session; everything else
  // falls through to the cookie path the browser download buttons use.
  //
  // NOTE: since /api/reports is now excluded from the middleware matcher, THIS
  // is the only gate on the route. Any new handler added here must keep it.
  const agent = assertAgentAuth(req);

  let programRow: Awaited<ReturnType<typeof requireProgramAccess>>["program"] | null = null;
  if (agent) {
    programRow = await getProgram(program);
    if (!programRow) {
      return NextResponse.json({ error: "program tidak ditemukan" }, { status: 404 });
    }
  } else {
    try {
      ({ program: programRow } = await requireProgramAccess(program));
    } catch (e) {
      const reason = e instanceof Error ? e.message : "";
      const status = reason === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: reason || "forbidden" }, { status });
    }
  }

  const url = new URL(req.url);

  // Directory exports (peserta / pengajar) are a full snapshot of the program,
  // not a period recap — no start/end params.
  if (type === "peserta-list" || type === "pengajar-list") {
    const isPeserta = type === "peserta-list";
    // `?batch=semua` = gabungan seluruh batch sekeluarga, sama seperti halamannya.
    const semuaBatch = url.searchParams.get("batch") === "semua";
    const dir = isPeserta
      ? semuaBatch
        ? await getPesertaDirectorySemuaBatch(program)
        : await getPesertaDirectory(program)
      : semuaBatch
        ? await getPengajarDirectorySemuaBatch(program)
        : await getPengajarDirectory(program);
    if (!dir) return NextResponse.json({ error: "program tidak ditemukan" }, { status: 404 });
    const wb = isPeserta
      ? buildPesertaDirectoryWorkbook(dir as PesertaDirectory)
      : buildPengajarDirectoryWorkbook(dir as PengajarDirectory);
    const buf = await wb.xlsx.writeBuffer();
    const fn = `${isPeserta ? "Daftar-Peserta" : "Daftar-Pengajar"}_${program}${semuaBatch ? "_semua-batch" : ""}_${todayJakarta()}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  }

  // Daily "ringkasan kajian" checklist export — one sheet per month, defaults to
  // the current WIB month. Gated by config.features.ringkasan (per-program flag).
  if (type === "ringkasan-kajian") {
    if (!programRow || !getProgramConfig(programRow).features.ringkasan) {
      return NextResponse.json({ error: "fitur tidak aktif di program ini" }, { status: 404 });
    }
    const hariIni = hariIniWib();
    const q = url.searchParams.get("bulan");
    const bulan = q && /^\d{4}-\d{2}$/.test(q) ? q : bulanDari(hariIni);
    const baris = await loadRingkasanBulan(programRow.id, bulan);
    const wb = buildRingkasanWorkbook(programRow.name, bulan, baris, hariIni);
    const buf = await wb.xlsx.writeBuffer();
    const fn = `Ringkasan-Kajian_${program}_${bulan}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  }

  // Syllabus — derived from the CMS meeting titles, so it has no period either.
  if (type === "silabus") {
    const data = await getSilabus(program);
    if (!data) return NextResponse.json({ error: "program tidak ditemukan" }, { status: 404 });
    const wb = buildSilabusWorkbook(data, programRow?.name ?? program);
    const buf = await wb.xlsx.writeBuffer();
    const fn = `Silabus_${program}_${todayJakarta()}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  }

  // Monthly HKM recap — needs a `month` (YYYY-MM); defaults to current.
  if (type === "hkm-monthly") {
    const month = url.searchParams.get("month") ?? undefined;
    const data = await getHkmDashboardData(program, { mode: "bulanan", month });
    if (!data) return NextResponse.json({ error: "program HKM tidak ditemukan" }, { status: 404 });
    const wb = buildHkmMonthlyWorkbook(data.participants, {
      programName: program,
      month: data.month,
      monthLabel: monthLabel(data.month),
      monthTargetPages: data.monthTargetPages,
    });
    const buf = await wb.xlsx.writeBuffer();
    const fn = `HKM-Bulanan_${program}_${data.month}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  }

  // Coordinator's combined HKM sheet: setoran (this program, berkah) + presensi
  // (config.presensiSlug, tilawah) for one calendar month. `month` (YYYY-MM)
  // defaults to the newest month the dashboard offers.
  if (type === "hkm-bulanan-gabungan") {
    const month = url.searchParams.get("month") ?? undefined;
    const data = await getHkmBulanan(program, month, { agent: Boolean(agent) });
    if (!data) return NextResponse.json({ error: "program HKM tidak ditemukan" }, { status: 404 });
    const wb = buildHkmBulananWorkbook(data);
    const buf = await wb.xlsx.writeBuffer();
    const fn = `Laporan-Bulanan-HKM_${program}_${data.month}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  }

  // Maahir monthly workbook. Read-only over the cached `rekap/*` rows; nothing
  // is fetched from the Maahir API here (`pnpm sync:maahir` fills them).
  // `bulan` (YYYY-MM, alias `month`) defaults to the current WIB month.
  if (type === "maahir-bulanan") {
    // Only a Maahir-native program has `rekap/*` rows at all — lib/maahir/rekap.ts
    // scopes every read to `dataSourceType = 'maahir_api'`. For any other program
    // the reads would all come back null and the caller would get a book of empty
    // sheets that says nothing about THEIR program. Refuse instead.
    if (programRow?.dataSourceType !== "maahir_api") {
      return NextResponse.json(
        { error: "laporan bulanan Maahir hanya untuk program Maahir (data_source_type = maahir_api)" },
        { status: 404 },
      );
    }

    const bulan =
      url.searchParams.get("bulan") ?? url.searchParams.get("month") ?? todayJakarta().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) {
      return NextResponse.json({ error: "bulan (YYYY-MM) tidak valid" }, { status: 400 });
    }

    const data = await loadMaahirBulanan(bulan);

    /**
     * `null` is not zero. When nothing was pulled for this month every sheet
     * would be blank, and a blank cell circulated as a report reads as "nobody
     * attended". The CLI may print that book because it also prints WHY next to
     * it; a download button cannot, so the reason goes in the error instead.
     *
     * `kosongSeluruhnya()` is NOT the test here. `rekap/sp` is cumulative — one
     * row answers every month — so a month that was never synced still comes
     * back "not entirely empty", and the export would ship as a 2025-01 report
     * whose only real numbers are today's SP count. The month is only reportable
     * when a route that actually carries the 28→27 window was pulled for it.
     */
    const PERIODE_ROUTES: readonly string[] = [
      "rekap/laporan-maahir",
      "rekap/kehadiran",
      "rekap/tibyan",
    ];
    const adaPeriode = data.sumber.some(
      (s) => s.status === "ada" && PERIODE_ROUTES.includes(s.route),
    );
    if (!adaPeriode || !data.periode) {
      return NextResponse.json(
        {
          error: `rekap Maahir untuk ${bulan} belum ditarik — laporan tidak dibuat`,
          hint:
            "jalankan sinkronisasi Maahir dulu; sheet kosong akan terbaca sebagai nol, bukan 'belum ada data'" +
            (kosongSeluruhnya(data) ? "" : " (rekap/sp bersifat kumulatif, bukan bukti bulan ini tertarik)"),
          sumber: data.sumber.map((s) => ({ route: s.route, status: s.status })),
        },
        { status: 404 },
      );
    }

    const wb = buildMaahirBulananWorkbook(data);
    const buf = await wb.xlsx.writeBuffer();
    /**
     * The period in the filename comes from `meta` via `data.periode` — Maahir's
     * month is 28→27, so naming the file after `bulan` alone ("2026-08") would
     * hand the reader a calendar month that was never measured. The guard above
     * already refused every case where that label is unknown. Slugged to ASCII
     * because Content-Disposition is a latin-1 header and the label carries an
     * en dash: "28 Jul – 27 Agu 2026" → "28-Jul-27-Agu-2026".
     */
    const periode = data.periode.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
    const fn = `Laporan-Bulanan-Maahir_${program}_${periode}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  }

  // HKM reports derive their own period (program config start → today), so they
  // don't require start/end params. Handle them before the tilawah-report guard.
  if (type === "hkm-participant" || type === "hkm-belum-target") {
    const data = await getHkmDashboardData(program);
    if (!data) return NextResponse.json({ error: "program HKM tidak ditemukan" }, { status: 404 });
    const meta = {
      programName: program,
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      targetPages: data.target.targetPages,
    };
    const wb = buildHkmParticipantWorkbook(data.participants, meta, type === "hkm-belum-target");
    const buf = await wb.xlsx.writeBuffer();
    const fn = `${type === "hkm-belum-target" ? "HKM-Belum-Target" : "HKM-Peserta"}_${program}_${data.period.endDate}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  }

  /**
   * Every dateless type has already returned above, so anything still here must
   * be one of the three dated ones — or a typo. Reject the typo BEFORE checking
   * start/end: the other order answers `?type=hkm-montly` with "start & end
   * wajib", which points at the wrong thing entirely. The caller then supplies
   * dates and only then learns the type was misspelled. Two round trips, and
   * the first message sends them the wrong way.
   */
  const unknownType = () =>
    NextResponse.json(
      {
        error:
          "type harus hits-bulanan|kba-bulanan|participant|teacher|peserta-list|pengajar-list|silabus|" +
          "hkm-monthly|hkm-bulanan-gabungan|hkm-participant|hkm-belum-target|maahir-bulanan|hasil-ujian",
        hint: "start & end (YYYY-MM-DD) hanya wajib untuk hits-bulanan, kba-bulanan, participant, teacher, hasil-ujian",
      },
      { status: 400 },
    );

  const DATED_TYPES: readonly string[] = ["hits-bulanan", "kba-bulanan", "participant", "teacher", "hasil-ujian"];
  if (!DATED_TYPES.includes(type)) return unknownType();

  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start & end (YYYY-MM-DD) wajib" }, { status: 400 });
  }

  // Same scope selector as the UI: absent = this batch, "all" = the whole family
  // (intersected with the caller's grants for a session; every batch for the
  // agent token, which spans all programs anyway).
  const batch = url.searchParams.get("batch") ?? undefined;
  const scopeFor = (slug: string) =>
    agent ? resolveReportScopeForAgent(slug, batch) : resolveReportScope(slug, batch);

  /**
   * The filename suffix must come from the RESOLVED scope, not the raw param.
   * Computing it from `?batch=all` up front produced files named
   * "…_semua-batch_…" containing exactly one batch — which already happened to
   * any coordinator granted one batch of a two-batch family who clicked "Semua
   * batch". A filename that lies about its contents is worse than an error.
   */
  const suffixFor = (combined: boolean) => (combined ? "semua-batch" : program);

  /** Asked for every batch but only got one → say so, never narrow in silence. */
  const combinedMismatch = () =>
    NextResponse.json(
      { error: "batch=all diminta tapi program ini hanya punya satu batch" },
      { status: 400 },
    );

  let workbook, filename;
  if (type === "hits-bulanan") {
    const scope = await scopeFor(program);
    if (!scope) return NextResponse.json({ error: "program tidak ditemukan" }, { status: 404 });
    if (batch === COMBINED && !scope.combined) return combinedMismatch();
    const rep = await getHitsMonthlyReport(scope, start, end);
    workbook = buildHitsMonthlyWorkbook(rep, await getExitedParticipants(scope, start, end));
    filename = `Laporan-Bulanan_${suffixFor(scope.combined)}_${start}_${end}.xlsx`;
  } else if (type === "kba-bulanan") {
    // Cross-program like `teacher`: the recap covers every kolaborasi program at
    // once, so the caller's reach — not the slug in the URL — decides which
    // blocks carry figures. A program outside that reach still prints its block,
    // marked unreadable, instead of vanishing from the recap.
    let slugs: string[];
    if (agent) {
      slugs = (await getAllPrograms()).map((p) => p.slug);
    } else {
      const user = await getCurrentUser();
      slugs = user ? (await getAccessiblePrograms(user)).map((p) => p.slug) : [];
    }
    const data = await getKbaMonthly(start, end, {
      agent: Boolean(agent),
      allowedSlugs: slugs.filter((s) => KBA_SLUGS.includes(s)),
    });
    workbook = buildKbaMonthlyWorkbook(data);
    filename = `Laporan-Bulanan-Kolaborasi_${start}_${end}.xlsx`;
  } else if (type === "hasil-ujian") {
    const scope = await scopeFor(program);
    if (!scope) return NextResponse.json({ error: "program tidak ditemukan" }, { status: 404 });
    if (batch === COMBINED && !scope.combined) return combinedMismatch();
    workbook = buildHasilUjianWorkbook(await getHasilUjianLaporan(scope, start, end));
    filename = `Hasil-Ujian_${suffixFor(scope.combined)}_${start}_${end}.xlsx`;
  } else if (type === "participant") {
    const scope = await scopeFor(program);
    if (!scope) return NextResponse.json({ error: "program tidak ditemukan" }, { status: 404 });
    if (batch === COMBINED && !scope.combined) return combinedMismatch();
    const rep = await getParticipantReport(scope, start, end);
    workbook = buildParticipantWorkbook(rep, await getExitedParticipants(scope, start, end));
    filename = `Laporan-Peserta_${suffixFor(scope.combined)}_${start}_${end}.xlsx`;
  } else if (type === "teacher") {
    // Cross-program: every program the caller can access. For the agent that is
    // all of them — the old `user ? … : []` produced ids=[], and getTeacherReport
    // early-returns on an empty list, so a bearer caller got a perfectly valid,
    // downloadable, COMPLETELY EMPTY workbook. Not an error. Not a 403.
    let ids: string[];
    if (agent) {
      ids = (await getAllPrograms()).map((p) => p.id);
    } else {
      const user = await getCurrentUser();
      ids = user ? (await getAccessiblePrograms(user)).map((p) => p.id) : [];
    }
    const rep = await getTeacherReport(start, end, ids);
    // Mabni is the only source with real teacher check-ins (/absensi-guru). If the
    // caller's scope includes it, append the attendance sheet; else it stays off.
    const db = getDb();
    const mabni = ids.length
      ? ((
          await db.execute(
            sql`select id from programs where slug = 'mabni' and id in (${sql.join(ids, sql`, `)}) limit 1`,
          )
        ).rows[0]?.id as string | undefined)
      : undefined;
    let mabniAttendance: MabniGuruAttendanceXlsxRow[] = [];
    if (mabni) {
      const counts = await getMabniGuruAttendance(mabni, start, end);
      const names = (
        await db.execute(sql`select tilawah_guru_id, name from guru_sync where program_id = ${mabni}`)
      ).rows as { tilawah_guru_id: number; name: string }[];
      const nameById = new Map(names.map((g) => [Number(g.tilawah_guru_id), g.name]));
      mabniAttendance = [...counts].map(([guruId, c]) => ({
        nama: nameById.get(guruId) ?? `Guru #${guruId}`,
        hadir: c.hadir,
        telat: c.telat,
        izin: c.izin,
      }));
    }
    workbook = buildTeacherWorkbook(rep, mabniAttendance);
    filename = `Rekap-Pengajar_${start}_${end}.xlsx`;
  } else {
    // Unreachable: DATED_TYPES was checked above. Kept so `workbook`/`filename`
    // stay definitely assigned, and so a new dated type added to that list
    // without a branch here fails loudly instead of falling through.
    return unknownType();
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
