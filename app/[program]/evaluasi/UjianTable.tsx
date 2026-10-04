import { Badge } from "@/components/ui/badge";
import { Numeric, Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatTanggal, type UjianRingkas } from "@/lib/insights/evaluasi/view-model";

/** Rata-rata lahn; null = belum ada satu pun nilai, ditulis apa adanya supaya
 *  tidak terbaca sebagai "rata-rata 0 kesalahan". */
function Rata({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-faint">—</span>;
  return <span className={value >= 5 ? "text-danger" : undefined}>{value.toLocaleString("id-ID")}</span>;
}

/**
 * Rekap per pertemuan ujian — dipakai untuk melihat halaqah mana yang ujiannya
 * sudah lewat tapi belum dinilai sama sekali. Tanpa state, jadi tetap komponen
 * server; barisnya puluhan, tidak perlu diurutkan di klien.
 */
export function UjianTable({ rows }: { rows: UjianRingkas[] }) {
  return (
    <TableWrap maxHeight="60vh">
      <Table>
        <THead sticky>
          <TR>
            <TH>Ujian</TH>
            <TH>Halaqah</TH>
            <TH>Pengajar</TH>
            <TH>Tanggal</TH>
            <TH numeric>Peserta</TH>
            <TH numeric>Sudah ada hasil</TH>
            <TH numeric>Lulus</TH>
            <TH numeric>Rata² jaliy</TH>
            <TH numeric>Rata² khofiy</TH>
            <TH>Keadaan</TH>
          </TR>
        </THead>
        <TBody zebra>
          {rows.map((u) => {
            const adaHasil = u.lulus + u.tidak;
            const tunggak = u.sudahLewat && adaHasil === 0 && u.peserta > 0;
            return (
              <TR key={u.jadwalId}>
                <TD className="font-medium">{u.nama ?? "—"}</TD>
                <TD className="text-12 text-ink-muted">{u.halaqah ?? "—"}</TD>
                <TD className="text-12 text-ink-muted">{u.pengajar ?? "—"}</TD>
                <TD className="text-12 text-ink-muted">{formatTanggal(u.tanggal)}</TD>
                <TD numeric>{u.peserta}</TD>
                <TD numeric>
                  <Numeric value={adaHasil} fraction={`dari ${u.peserta}`} />
                </TD>
                <TD numeric>{u.lulus}</TD>
                <TD numeric>
                  <Rata value={u.rataJaliy} />
                </TD>
                <TD numeric>
                  <Rata value={u.rataKhofiy} />
                </TD>
                <TD>
                  {!u.sudahLewat ? (
                    <Badge tone="info">Belum berlangsung</Badge>
                  ) : u.peserta === 0 ? (
                    <Badge tone="neutral">Tanpa presensi</Badge>
                  ) : tunggak ? (
                    <Badge tone="warning">Belum dinilai</Badge>
                  ) : u.belum > 0 ? (
                    <Badge tone="warning">{u.belum} peserta tertinggal</Badge>
                  ) : (
                    <Badge tone="success">Lengkap</Badge>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableWrap>
  );
}
