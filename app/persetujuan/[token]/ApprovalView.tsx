"use client";

import { useState, useTransition } from "react";
import { approve, reject, type DecisionResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu keputusan",
  approved: "Disetujui (sedang diterapkan)",
  applied: "Sudah diterapkan",
  rejected: "Ditolak",
  failed: "Gagal diterapkan",
};

export function ApprovalView({
  token,
  status,
  requestType,
  guruName,
  halaqahId,
  jadwalId,
  summary,
  reason,
}: {
  token: string;
  status: string;
  requestType: string;
  guruName: string | null;
  halaqahId: number;
  jadwalId: number;
  summary: string;
  reason: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DecisionResult | null>(null);
  const decided = status === "applied" || status === "rejected";
  const settled = decided || result?.ok;

  function act(kind: "approve" | "reject") {
    startTransition(async () => {
      setResult(await (kind === "approve" ? approve(token) : reject(token)));
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <dl className="space-y-2 text-sm">
          <Row label="Jenis" value={requestType === "badal" ? "Badal (ganti guru)" : "Reschedule"} />
          <Row label="Pengaju" value={guruName ?? "-"} />
          <Row label="Halaqah" value={`#${halaqahId}`} />
          <Row label="Pertemuan" value={`jadwal #${jadwalId}`} />
          <Row label="Perubahan" value={summary} />
          {reason && <Row label="Alasan" value={reason} />}
          <Row label="Status" value={STATUS_LABEL[status] ?? status} />
        </dl>
      </div>

      {result && !result.ok && <Alert variant="danger">{result.error}</Alert>}
      {result?.ok && result.status === "applied" && (
        <Alert variant="success">Perubahan disetujui & diterapkan ke sistem. {result.note ?? ""}</Alert>
      )}
      {result?.ok && result.status === "rejected" && (
        <Alert variant="warning">Pengajuan ditolak. {result.note ?? ""}</Alert>
      )}

      {decided && !result && (
        <Alert variant={status === "applied" ? "success" : "warning"}>
          Pengajuan ini sudah {status === "applied" ? "diterapkan" : "ditolak"}.
        </Alert>
      )}

      {!settled && (
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="success" disabled={pending} onClick={() => act("approve")}>
            {pending ? "Memproses..." : "Setujui"}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => act("reject")}>
            Tolak
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
