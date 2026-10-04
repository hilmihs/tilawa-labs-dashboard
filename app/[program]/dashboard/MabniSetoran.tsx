import { getMabniSetoran, getMabniNilai, currentMonth } from "@/lib/insights/mabni";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { SyncBar } from "../SyncBar";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const ID_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const fmtDate = (iso: string | null) => (iso ? ID_DATE.format(new Date(`${iso}T00:00:00`)) : "—");

/**
 * Setoran (hafalan) activity for the month.
 *
 * Deliberately framed as ACTIVITY, not achievement: upstream leaves every
 * record at status "dalam_proses" and both ayat columns null, writing the range
 * free-form inside `surat`. Counting juz or pages off that string would be a
 * guess dressed up as a number, so this reports how often each class and each
 * student submitted, and who has not submitted at all.
 */
export async function MabniSetoran({ program, month }: { program: string; month?: string }) {
  const m = month ?? currentMonth();
  const [data, nilai, lastSync] = await Promise.all([
    getMabniSetoran(program, m),
    getMabniNilai(program),
    getLastSync(program),
  ]);
  if (!data) return null;
  const sync = lastSyncLabel(lastSync);

  const belum = data.students.filter((s) => s.setorCount === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-[-0.01em]">Aktivitas Setoran</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Dari boarding.tilawalabs.demo · bulan {m}. Menghitung <b>frekuensi setoran</b>, bukan
            capaian hafalan.
          </p>
        </div>
        <SyncBar program={program} label={sync.text} tone={sync.tone} />
      </div>

      <Alert variant="info">
        Upstream belum mengisi <code>ayat_dari</code>/<code>ayat_sampai</code> dan semua setoran
        masih berstatus <code>dalam_proses</code> — rentang ayat ditulis bebas di dalam kolom surat.
        Jadi capaian hafalan (juz/halaman) belum bisa dihitung dari data ini; lihat{" "}
        <code>the integration notes</code>.
      </Alert>

      {data.totalSetoran === 0 ? (
        <EmptyState
          title="Belum ada setoran bulan ini"
          description={`Tidak ada baris hafalan bertanggal di bulan ${m}. Coba pilih bulan lain atau jalankan sync.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Setoran tercatat" value={data.totalSetoran} />
            <StatTile
              label="Siswa setor"
              value={`${data.activeStudents}/${data.totalStudents}`}
              hint={belum.length > 0 ? `${belum.length} belum setor` : undefined}
            />
            {data.byMetrik.slice(0, 2).map((m2) => (
              <StatTile key={m2.metrik} label={m2.metrik} value={m2.count} />
            ))}
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-500">Per kelas · yang paling sepi di atas</h2>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Kelas</TH>
                    <TH>Pengajar</TH>
                    <TH className="text-right">Setoran</TH>
                    <TH className="text-right">Siswa setor</TH>
                    <TH>Komposisi</TH>
                    <TH className="text-right">Terakhir</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.classes.map((c) => (
                    <TR key={c.halaqahId}>
                      <TD className="font-medium">{c.halaqah ?? "—"}</TD>
                      <TD className="text-neutral-500">{c.pengajar ?? "—"}</TD>
                      <TD className="text-right tabular-nums">
                        {c.setorCount === 0 ? <span className="text-amber-600">0</span> : c.setorCount}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {c.activeStudents}/{c.studentCount}
                      </TD>
                      <TD className="text-xs text-neutral-500">
                        {c.byMetrik.length === 0
                          ? "—"
                          : c.byMetrik.map((b) => `${b.metrik} ${b.count}`).join(" · ")}
                      </TD>
                      <TD className="text-right text-neutral-500">{fmtDate(c.lastDate)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-500">
              Per siswa · {belum.length} siswa belum setor bulan ini
            </h2>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Nama</TH>
                    <TH>Kelas</TH>
                    <TH className="text-right">Setoran</TH>
                    <TH className="text-right">Terakhir</TH>
                    <TH>Setoran terakhir</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.students.map((s) => (
                    <TR key={s.siswaId}>
                      <TD className="font-medium">{s.name ?? "—"}</TD>
                      <TD className="text-neutral-500">{s.halaqah ?? "(tanpa kelas)"}</TD>
                      <TD className="text-right tabular-nums">
                        {s.setorCount === 0 ? <span className="text-amber-600">0</span> : s.setorCount}
                      </TD>
                      <TD className="text-right text-neutral-500">{fmtDate(s.lastDate)}</TD>
                      <TD className="text-xs text-neutral-500">
                        {s.lastSurat ? `${s.lastSurat}${s.lastMetrik ? ` · ${s.lastMetrik}` : ""}` : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </section>
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">Nilai ujian</h2>
        {!nilai || nilai.total === 0 ? (
          <Alert variant="info">
            Belum ada data nilai. Endpoint <code>/nilai</code> sudah hidup dan ikut ditarik tiap
            sync, tapi upstream masih mengembalikan 0 baris — jadi tidak ada yang bisa ditampilkan
            (dan nama kolomnya pun belum bisa diketahui). Tabel ini terisi sendiri begitu the boarding team
            mulai mengisi nilainya; tidak perlu perubahan kode.
          </Alert>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              Kolom mengikuti field yang dikirim API apa adanya, {nilai.total} baris terbaru.
            </p>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    {nilai.columns.map((c) => (
                      <TH key={c}>{c}</TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {nilai.rows.map((row, i) => (
                    <TR key={i}>
                      {nilai.columns.map((c) => (
                        <TD key={c}>{row[c] ?? "—"}</TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </>
        )}
      </section>
    </div>
  );
}
