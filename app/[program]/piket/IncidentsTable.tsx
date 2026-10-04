"use client";

import { useState } from "react";
import {
  generateWarningLetter,
  getWarningLetterDownloadUrl,
  type LateIncidentListItem,
} from "./actions";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

export function IncidentsTable({ incidents }: { incidents: LateIncidentListItem[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generatedIds, setGeneratedIds] = useState<Set<string>>(
    new Set(incidents.filter((i) => i.sp_generated_at).map((i) => i.id)),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(id: string) {
    setBusyId(id);
    setError(null);
    const result = await generateWarningLetter(id);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGeneratedIds((prev) => new Set(prev).add(id));
  }

  async function handleDownload(id: string) {
    setBusyId(id);
    setError(null);
    const url = await getWarningLetterDownloadUrl(id);
    setBusyId(null);
    if (!url) {
      setError("Gagal membuat link download.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (incidents.length === 0) {
    return (
      <EmptyState
        title="Belum ada insiden tercatat"
        description="Keterlambatan yang dilaporkan lewat formulir di atas muncul di sini — beserta tombol untuk membuat surat peringatannya bila perizinannya “Tidak Izin”."
      />
    );
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="danger">{error}</Alert>}
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Tanggal</TH>
              <TH>Nama</TH>
              <TH>Jam</TH>
              <TH>Perizinan</TH>
              <TH>Alasan</TH>
              <TH>SP</TH>
            </TR>
          </THead>
          <TBody>
            {incidents.map((incident) => {
              const isGenerated = generatedIds.has(incident.id);
              const isBusy = busyId === incident.id;
              return (
                <TR key={incident.id}>
                  <TD className="whitespace-nowrap">{incident.occurred_at}</TD>
                  <TD>{incident.students?.full_name ?? "-"}</TD>
                  <TD>{incident.arrival_time ?? "-"}</TD>
                  <TD>{incident.perizinan}</TD>
                  <TD className="max-w-xs truncate" title={incident.alasan ?? ""}>
                    {incident.alasan ?? "-"}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {!incident.sp_required ? (
                      "-"
                    ) : isGenerated ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleDownload(incident.id)}
                      >
                        {isBusy ? "…" : "Unduh SP"}
                      </Button>
                    ) : (
                      // Membuat surat bukan aksi merusak, jadi bukan tombol
                      // merah; tapi juga bukan aksi utama layar (itu formulir
                      // lapor di atas) — jadi sekunder, bukan primer.
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        title="Buat berkas surat peringatan untuk insiden ini"
                        disabled={isBusy}
                        onClick={() => handleGenerate(incident.id)}
                      >
                        {isBusy ? "Membuat…" : "Buat SP"}
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
