import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { HalaqahEval } from "@/lib/insights/evaluasi/maahir-view-model";

/**
 * Rekap per halaqah — melihat halaqah mana yang belum mengirim satu sesi pun,
 * atau masih menumpuk sesi draft. Komponen server; barisnya puluhan.
 */
export function HalaqahMaahirTable({ rows, tampilPeriode = false }: { rows: HalaqahEval[]; tampilPeriode?: boolean }) {
  return (
    <TableWrap maxHeight="60vh">
      <Table>
        <THead sticky>
          <TR>
            <TH>Halaqah</TH>
            <TH>Pengajar</TH>
            <TH numeric>Peserta</TH>
            <TH numeric>Bernilai (final)</TH>
            <TH numeric>Sesi QN</TH>
            <TH numeric>Sesi PB</TH>
            <TH numeric>Ujian</TH>
            {tampilPeriode && <TH numeric>Sesi di periode</TH>}
            <TH numeric>Draft</TH>
            <TH numeric>Rapot (lulus)</TH>
            <TH numeric>Rata² skor</TH>
          </TR>
        </THead>
        <TBody zebra>
          {rows.map((h) => {
            return (
              <TR key={h.halaqahId}>
                <TD className="font-medium">{h.halaqah ?? h.halaqahId}</TD>
                <TD className="text-12 text-ink-muted">{h.pengajar ?? "—"}</TD>
                <TD numeric>{h.peserta}</TD>
                <TD numeric className={h.pesertaBernilai === 0 ? "text-ink-faint" : undefined}>
                  {h.pesertaBernilai}
                  {h.pesertaBernilai > 0 && <span className="ml-1 text-11 text-ink-faint">({h.pesertaFinal})</span>}
                </TD>
                <TD numeric>{h.sesiTerkirim.qn || <span className="text-ink-faint">0</span>}</TD>
                <TD numeric>{h.sesiTerkirim.pb || <span className="text-ink-faint">0</span>}</TD>
                <TD numeric>{h.sesiTerkirim.ujian || <span className="text-ink-faint">0</span>}</TD>
                {tampilPeriode && <TD numeric>{h.sesiDiPeriode || <span className="text-ink-faint">0</span>}</TD>}
                <TD numeric>{h.sesiDraft ? <span className="text-warn">{h.sesiDraft}</span> : <span className="text-ink-faint">0</span>}</TD>
                <TD numeric>{h.rapotAktif ? `${h.rapotAktif} (${h.rapotLulus})` : <span className="text-ink-faint">—</span>}</TD>
                <TD numeric>{h.rataSkor == null ? <span className="text-ink-faint">—</span> : h.rataSkor.toLocaleString("id-ID")}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableWrap>
  );
}
