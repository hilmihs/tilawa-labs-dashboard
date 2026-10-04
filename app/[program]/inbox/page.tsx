import { getInsights } from "@/lib/insights/queries";
import type { PresensiGapHalaqah } from "@/lib/insights/queries";
import { waLink } from "@/lib/wa";
import { getReminderHistory } from "@/lib/reminders/log";
import { WaReminderButton } from "./WaReminderButton";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncBar } from "../SyncBar";
import { getProgram } from "@/lib/programs/resolve";
import { HkmActionItems } from "../hkm/HkmActionItems";
import { HalaqahGapCard } from "./HalaqahGapCard";
import { buildGapViews, fmtDate, URGENT_UNTOUCHED_DAYS } from "./grouping";

export const metadata = { title: "Tindak Lanjut" };
export const dynamic = "force-dynamic";

/**
 * One WA nudge covering a halaqah's whole presensi backlog — the pertemuan never
 * touched and the pertemuan left half-filled. Deliberately a single message: the
 * teacher used to get one reminder from Laporan and another from Action Items
 * about the same halaqah.
 */
function gapMessage(p: PresensiGapHalaqah): string {
  const blocks: string[] = [];
  if (p.emptyMeetings.length > 0) {
    blocks.push(
      `Pertemuan yang belum diisi sama sekali:\n` +
        p.emptyMeetings.map((m) => `- Pertemuan ${m.order ?? "?"} (${fmtDate(m.date)})`).join("\n"),
    );
  }
  if (p.partialMeetings.length > 0) {
    blocks.push(
      `Pertemuan yang pesertanya belum lengkap:\n` +
        p.partialMeetings
          .map(
            (m) =>
              `- Pertemuan ${m.order ?? "?"} (${fmtDate(m.date)}): ${m.missingStudents.join(", ")}`,
          )
          .join("\n"),
    );
  }
  return (
    `Assalamu'alaikum Ustadz/ah ${p.pengajar ?? ""}, presensi halaqah ${p.halaqahName ?? ""} ` +
    `belum lengkap. Mohon dilengkapi melalui cms.tilawalabs.demo.\n\n` +
    `${blocks.join("\n\n")}\n\nJazaakumullahu khairan.`
  );
}

/**
 * What the coordinator is about to open — spelled out so the button is not a
 * blind send. The message itself is `gapMessage` and is unchanged; this only
 * describes it.
 */
function gapMessageSummary(p: PresensiGapHalaqah): string {
  const parts: string[] = [];
  if (p.emptyMeetings.length > 0) parts.push(`${p.emptyMeetings.length} pertemuan belum diisi`);
  if (p.partialMeetings.length > 0) {
    const names = new Set(p.partialMeetings.flatMap((m) => m.missingStudents));
    parts.push(
      `${p.partialMeetings.length} pertemuan belum lengkap (${names.size} nama peserta disebut)`,
    );
  }
  return parts.join(" + ");
}

/**
 * `id` supaya chip KPI di kepala halaman bisa mendarat di daftar yang dimaksud
 * — sebuah angka yang menuntut tindakan tapi tidak ke mana-mana bukan KPI.
 */
function Section({
  id,
  title,
  desc,
  children,
}: {
  id?: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-14 text-ink-muted">{desc}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function InboxPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program } = await params;

  // HKM (berkah-backed) programs get a tilawah follow-up worklist instead of the
  // presensi inbox.
  const programRow = await getProgram(program);
  if (programRow?.dataSourceType === "berkah_api") {
    return <HkmActionItems program={program} />;
  }

  // Reminder history keyed by halaqah — who has already been nudged, when, and
  // how often. Loaded alongside the insights so the list renders in one pass.
  const [data, lastSync, reminders] = await Promise.all([
    getInsights(program),
    getLastSync(program),
    programRow ? getReminderHistory(programRow.id) : Promise.resolve(new Map()),
  ]);
  const sync = lastSyncLabel(lastSync);

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-14 text-ink-muted">Program tidak ditemukan.</p>
      </main>
    );
  }

  // Regroup the (unchanged) backlog by cause and rank it by impact. `kritis`
  // halaqah are matched by name — halaqahHealth is aggregated by name and does
  // not carry the tilawah id.
  const kritisHalaqah = new Set(
    data.halaqahHealth.filter((h) => h.tier === "kritis" && h.halaqahName).map((h) => h.halaqahName!),
  );
  const gapViews = buildGapViews(data.presensiGaps, { today: new Date(), kritisHalaqah });
  const urgentHalaqah = gapViews.filter((v) => v.severity === "urgent").length;

  const empty =
    data.presensiGaps.length === 0 &&
    data.counts.atRisk === 0 &&
    data.counts.halaqahKritis === 0 &&
    data.topLahn.length === 0;
  const totalGapMeetings = data.counts.teacherGapMeetings + data.counts.partialMeetings;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Tindak Lanjut</h1>
          <p className="mt-1 text-14 text-ink-muted">
            Satu tindak lanjut per halaqah: pertemuan yang belum dimulai presensinya dan yang
            pesertanya belum lengkap digabung dalam satu reminder.
          </p>
        </div>
        <SyncBar program={program} label={sync.text} tone={sync.tone} />
      </div>

      {/*
       * Satu angka yang harus mencapai nol — itu isi halaman ini. Sengaja tanpa
       * `target`: ambang program adalah ambang KEHADIRAN (dipakai chip "halaqah
       * kritis" di bawah), sedangkan target tunggakan presensi adalah nol, dan
       * "target 0%" pada angka yang satuannya pertemuan hanya membingungkan.
       * `invert` membuat panah/angka dibaca "makin kecil makin baik".
       *
       * Pemecahannya (belum diisi vs belum lengkap) turun jadi support: itu
       * konteks untuk memahami tunggakan, bukan keputusan tersendiri.
       */}
      <KpiStrip
        hero={{
          label: "Presensi belum beres",
          value: totalGapMeetings,
          unit: "pertemuan",
          invert: true,
          href: "#presensi-belum-beres",
        }}
        support={[
          { label: "Halaqah tertunda", value: data.counts.presensiGapHalaqah },
          {
            label: "Belum diisi",
            value: data.counts.teacherGapMeetings,
            hint: "pertemuan",
          },
          {
            label: "Belum lengkap",
            value: data.counts.partialMeetings,
            hint: "pertemuan",
          },
        ]}
        issues={[
          {
            label: `halaqah mendesak (> ${URGENT_UNTOUCHED_DAYS} hari / kritis)`,
            value: urgentHalaqah,
            href: "#presensi-belum-beres",
            tone: "danger",
          },
          {
            label: "peserta belum pernah hadir",
            value: data.counts.atRisk,
            href: "#belum-pernah-hadir",
          },
          {
            label: `halaqah kritis (< ${Math.round(data.thresholdPct / 2)}%)`,
            value: data.counts.halaqahKritis,
            href: "#kondisi-halaqah",
            tone: "danger",
          },
        ]}
        allClearText="Tidak ada tindak lanjut — semua presensi beres."
      />

      {empty && (
        <EmptyState
          tone="success"
          icon="🎉"
          title="Tidak ada action item untuk program ini."
        />
      )}

      {gapViews.length > 0 && (
        <Section
          id="presensi-belum-beres"
          title="Presensi belum beres"
          desc={`Dikelompokkan per penyebab, bukan per pertemuan: peserta yang berulang kali tak tertandai jadi satu baris. Urutan mengikuti dampak (peserta × pertemuan). Merah hanya untuk pertemuan yang belum disentuh lebih dari ${URGENT_UNTOUCHED_DAYS} hari atau halaqah kritis${urgentHalaqah > 0 ? ` — ${urgentHalaqah} halaqah saat ini` : ""}. Satu tombol WA per halaqah mengirim seluruh daftarnya sekaligus.`}
        >
          <div className="space-y-3">
            {gapViews.slice(0, 50).map((view) => {
              const p = view.halaqah;
              return (
                <HalaqahGapCard
                  key={p.halaqahId}
                  view={view}
                  action={
                    <WaReminderButton
                      href={waLink(p.guruPhone, gapMessage(p))}
                      programSlug={program}
                      halaqahId={p.halaqahId}
                      pengajar={p.pengajar}
                      phone={p.guruPhone}
                      history={reminders.get(p.halaqahId) ?? null}
                      messageSummary={gapMessageSummary(p)}
                    />
                  }
                />
              );
            })}
            {gapViews.length > 50 && (
              <p className="text-12 text-ink-muted">
                Menampilkan 50 dari {gapViews.length} halaqah, yang berdampak terbesar dulu.
                Sisanya menyusul setelah yang ini dibereskan.
              </p>
            )}
          </div>
        </Section>
      )}

      {data.atRisk.length > 0 && (
        <Section
          id="belum-pernah-hadir"
          title="Peserta belum pernah hadir"
          desc="Kehadiran 0% — belum sekali pun tercatat hadir. Perlu ditindaklanjuti (mungkin salah data, mengundurkan diri, atau butuh dijemput)."
        >
          <TableWrap maxHeight="60vh">
            <Table>
              <THead sticky>
                <TR>
                  <TH>Nama</TH>
                  <TH>Halaqah</TH>
                  <TH>Pengajar</TH>
                </TR>
              </THead>
              <TBody>
                {data.atRisk.slice(0, 100).map((s, i) => (
                  <TR key={i}>
                    <TD>{s.name ?? "-"}</TD>
                    <TD>{s.halaqahName ?? "-"}</TD>
                    <TD className="text-ink-muted">{s.pengajar ?? "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Section>
      )}

      {data.halaqahHealth.length > 0 && (
        <Section
          id="kondisi-halaqah"
          title="Kondisi kehadiran per-halaqah"
          desc={`Rata-rata kehadiran tiap halaqah (ambang ${data.thresholdPct}%). Yang kritis butuh perhatian lebih.`}
        >
          <TableWrap maxHeight="60vh">
            <Table>
              <THead sticky>
                <TR>
                  <TH>Halaqah</TH>
                  <TH>Pengajar</TH>
                  <TH className="text-right">Peserta</TH>
                  <TH className="text-right">Rata² hadir</TH>
                  <TH>Kondisi</TH>
                </TR>
              </THead>
              <TBody>
                {data.halaqahHealth.slice(0, 60).map((h, i) => {
                  const tone =
                    h.tier === "kritis"
                      ? "danger"
                      : h.tier === "perhatian"
                        ? "warning"
                        : "success";
                  return (
                    <TR key={i}>
                      <TD>{h.halaqahName ?? "-"}</TD>
                      <TD>{h.pengajar ?? "-"}</TD>
                      <TD className="text-right tabular-nums">{h.studentCount}</TD>
                      <TD className="text-right tabular-nums">
                        {h.avgKehadiran != null ? `${h.avgKehadiran.toFixed(1)}%` : "—"}
                      </TD>
                      <TD>
                        <Badge tone={tone}>{h.tier}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </Section>
      )}

      {data.topLahn.length > 0 && (
        <Section
          title="Mutu bacaan — lahn terbanyak"
          desc="Peserta dengan catatan kesalahan tajwid (lahn jaliy + khofiy) terbanyak. Fokus pembinaan tahsin."
        >
          <TableWrap maxHeight="60vh">
            <Table>
              <THead sticky>
                <TR>
                  <TH>Nama</TH>
                  <TH>Halaqah</TH>
                  <TH className="text-right">Total lahn</TH>
                </TR>
              </THead>
              <TBody>
                {data.topLahn.map((s, i) => (
                  <TR key={i}>
                    <TD>{s.name ?? "-"}</TD>
                    <TD>{s.halaqahName ?? "-"}</TD>
                    <TD className="text-right font-medium tabular-nums">{s.totalLahn}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Section>
      )}
    </main>
  );
}
