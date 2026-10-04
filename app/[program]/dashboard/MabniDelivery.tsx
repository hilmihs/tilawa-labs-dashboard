import { getMabniDelivery, currentMonth } from "@/lib/insights/mabni";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { SyncBar } from "../SyncBar";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const ID_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const fmtDate = (iso: string) => ID_DATE.format(new Date(`${iso}T00:00:00`));

/**
 * Class delivery for the month: which scheduled dates produced a session.
 *
 * This is NOT teacher attendance. The Mabni API exposes no teacher presence and
 * no per-meeting teacher, so the honest claim is "the class ran" (a session
 * with presensi exists on a date the recurring jadwal says it should have met).
 * The teacher column names who the class is assigned to, nothing more.
 */
export async function MabniDelivery({ program, month }: { program: string; month?: string }) {
  const m = month ?? currentMonth();
  const [data, lastSync] = await Promise.all([getMabniDelivery(program, m), getLastSync(program)]);
  if (!data) return null;
  const sync = lastSyncLabel(lastSync);
  const pct = data.totalExpected > 0 ? (100 * data.totalHeld) / data.totalExpected : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-[-0.01em]">Keterlaksanaan Kelas</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Pertemuan terjadwal vs yang benar-benar ada presensinya · bulan {m}, dihitung s/d{" "}
            {fmtDate(data.asOf)}.
          </p>
        </div>
        <SyncBar program={program} label={sync.text} tone={sync.tone} />
      </div>

      <Alert variant="warning">
        <b>Ini bukan presensi pengajar.</b> the boarding API belum menyediakan kehadiran guru maupun guru
        per pertemuan, jadi yang terukur di sini adalah <b>kelasnya jalan atau tidak</b> — pertemuan
        dianggap terlaksana kalau ada presensi murid pada tanggal itu. Kolom pengajar hanya menyebut
        siapa yang ditugaskan. Permintaan endpoint-nya ada di <code>the integration notes</code>
        ; begitu dibuka, blok ini diisi data asli.
      </Alert>

      {data.totalExpected === 0 ? (
        <EmptyState
          title="Belum ada pertemuan terjadwal di rentang ini"
          description="Pola jadwal kelas (hari + rentang tanggal) belum tersinkron, atau bulan ini memang belum berjalan."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Terlaksana" value={data.totalHeld} />
            <StatTile label="Terjadwal" value={data.totalExpected} />
            <StatTile
              label="Rasio"
              value={pct != null ? `${pct.toFixed(0)}%` : "—"}
              valueClassName={pct != null && pct < 80 ? "text-amber-600" : undefined}
            />
            <StatTile
              label="Pertemuan bolong"
              value={data.totalExpected - data.totalHeld}
              valueClassName={data.totalExpected - data.totalHeld > 0 ? "text-red-600" : undefined}
            />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-500">
              Per kelas · yang paling banyak bolong di atas
            </h2>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Kelas</TH>
                    <TH>Pengajar</TH>
                    <TH>Pendamping</TH>
                    <TH>Jadwal</TH>
                    <TH className="text-right">Terlaksana</TH>
                    <TH>Tanggal tanpa presensi</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.rows.map((r) => (
                    <TR key={r.halaqahId}>
                      <TD className="font-medium">{r.halaqah ?? "—"}</TD>
                      <TD>{r.pengajarUtama ?? "—"}</TD>
                      <TD className="text-neutral-500">
                        {r.pendamping.length > 0 ? r.pendamping.join(", ") : "—"}
                      </TD>
                      <TD className="text-neutral-500">{r.jadwal ?? "—"}</TD>
                      <TD className="text-right tabular-nums">
                        <span className={r.gaps.length > 0 ? "text-amber-600" : undefined}>
                          {r.held}
                        </span>
                        <span className="text-neutral-400">/{r.expected}</span>
                      </TD>
                      <TD className="text-xs text-neutral-500">
                        {r.gaps.length === 0 ? "—" : r.gaps.map(fmtDate).join(", ")}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </section>
        </>
      )}
    </div>
  );
}
