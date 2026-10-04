import Link from "next/link";
import { notFound } from "next/navigation";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { getHkmParticipantDetail } from "../queries";
import { Heatmap } from "../Heatmap";
import { TrendChart } from "../TrendChart";

export const dynamic = "force-dynamic";

export default async function HkmParticipantPage({
  params,
}: {
  params: Promise<{ program: string; participantId: string }>;
}) {
  const { program, participantId } = await params;
  const d = await getHkmParticipantDetail(program, participantId);
  if (!d) notFound();

  const trendData = d.trend.map((t) => ({ date: t.date, avgJuz: t.cumulativeJuz, participants: 1 }));

  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6">
      <div>
        <Link href={`/${program}/dashboard`} className="text-sm text-primary hover:underline">
          ← Kembali ke dashboard HKM
        </Link>
        <h1 className="mt-2 text-20 font-bold tracking-[-0.01em]">{d.nama}</h1>
        <p className="text-sm text-ink-muted">
          {d.halaqah ?? "—"}
          {d.pengajar ? ` · ${d.pengajar}` : ""} · {d.gender}
          {d.email ? ` · ${d.email}` : ""}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={d.atRisk ? "danger" : "success"}>{d.category}</Badge>
          {d.phone && (
            <a href={`https://wa.me/${d.phone}`} target="_blank" rel="noreferrer" className="text-sm text-ok hover:underline">
              WhatsApp
            </a>
          )}
        </div>
      </div>

      {d.atRisk && <Alert variant="warning">Perlu perhatian: {d.riskReasons.join("; ")}.</Alert>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Realisasi (juz)" value={d.cumulativeJuz} hint={`${d.cumulativePages} hal`} />
        <StatTile label="Target (juz)" value={d.targetJuz} hint={`${d.targetPages} hal`} />
        <StatTile
          label="Capaian target"
          value={`${d.targetPages > 0 ? Math.round((100 * d.cumulativePages) / d.targetPages) : 0}%`}
          valueClassName={d.cumulativePages >= d.targetPages ? "text-ok" : "text-warn"}
        />
        <StatTile label="Rata²/hari" value={d.avgPerDay} />
        <StatTile label="Khatam" value={d.apiTotalKhatam ?? d.khatamCount} />
        <StatTile label="Streak" value={d.streakDays} hint={`terpanjang ${d.longestStreak} · aktif ${d.activeDays} hari`} />
      </section>

      {d.target && (
        <Alert variant="info">
          Target khatam: {d.target.targetDone ?? 0}/{d.target.targetTotal ?? "?"} hal
          {d.target.targetRemaining != null ? ` · sisa ${d.target.targetRemaining} hal` : ""}
          {d.target.targetPerDay != null ? ` · ${d.target.targetPerDay} hal/hari` : ""}
          {d.target.statusLabel ? ` · ${d.target.statusLabel}` : ""}
        </Alert>
      )}

      {trendData.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-14 font-medium text-ink-muted">Tren kumulatif (juz)</h2>
          <TrendChart data={trendData} />
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <Heatmap title="Peta Juz" counts={d.juzCoverage} labelPrefix="Juz" />
        <Heatmap title="Peta Surah" counts={d.suraCoverage} labelPrefix="Surah" />
      </section>

      <section className="space-y-2">
        <h2 className="text-14 font-medium text-ink-muted">Riwayat tilawah ({d.history.length} hari)</h2>
        {d.history.length === 0 ? (
          <EmptyState
            title="Belum ada riwayat tilawah"
            description="Setiap hari setoran peserta ini akan tercatat di sini: surah, juz, halaman, dan totalnya."
          />
        ) : (
          <TableWrap maxHeight="70vh">
            <Table>
              <THead sticky>
                <TR>
                  <TH>Tanggal</TH>
                  <TH className="text-right">Surah</TH>
                  <TH className="text-right">Juz</TH>
                  <TH className="text-right">Halaman</TH>
                  <TH className="text-right">Total hal</TH>
                </TR>
              </THead>
              <TBody>
                {d.history.map((h, i) => (
                  <TR key={i}>
                    <TD className="tabular-nums">{h.date}</TD>
                    <TD className="text-right tabular-nums text-ink-muted">
                      {h.fromSura ?? "?"}–{h.toSura ?? "?"}
                    </TD>
                    <TD className="text-right tabular-nums text-ink-muted">
                      {h.fromJuz ?? "?"}–{h.toJuz ?? "?"}
                    </TD>
                    <TD className="text-right tabular-nums text-ink-muted">
                      {h.fromPage ?? "?"}–{h.toPage ?? "?"}
                    </TD>
                    <TD className="text-right font-medium tabular-nums">{h.totalPages ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </section>
    </main>
  );
}
