import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { formatTanggalIndonesia } from "@/lib/pdf/date-id";
import { listRecentSurat } from "./actions";

function label(type: string, level: number | null): string {
  return type === "peringatan" ? `Surat Peringatan ${level ?? "?"}` : "Surat Penerimaan";
}

export async function RecentLetters({ programSlug }: { programSlug: string }) {
  const rows = await listRecentSurat(programSlug);
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Belum ada surat yang dibuat"
        description="Setiap berkas yang dibuat lewat formulir di atas tercatat di sini — tanggal, jenis, penerima, dan tautan unduhnya."
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR>
            <TH>Tanggal surat</TH>
            <TH>Jenis</TH>
            <TH numeric>Penerima</TH>
            <TH>Nama</TH>
            <TH className="text-right">Berkas</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD>{formatTanggalIndonesia(r.letterDate)}</TD>
              <TD>{label(r.letterType, r.level)}</TD>
              <TD numeric>{r.recipientCount}</TD>
              <TD className="text-ink-muted">
                {r.recipientNames.slice(0, 3).join(", ")}
                {r.recipientNames.length > 3 ? `, +${r.recipientNames.length - 3} lainnya` : ""}
              </TD>
              <TD className="text-right">
                <a
                  href={r.downloadUrl}
                  className="font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Unduh
                </a>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}
