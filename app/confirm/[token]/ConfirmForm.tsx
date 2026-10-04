"use client";

import { useState, useTransition } from "react";
import { submitConfirmations, type SubmitResult } from "./actions";
import type { GapMeetingView } from "@/lib/confirmations/queries";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const REASONS: { code: string; label: string }[] = [
  { code: "izin", label: "Izin" },
  { code: "sakit", label: "Sakit" },
  { code: "badal", label: "Digantikan badal" },
  { code: "libur", label: "Libur / tanggal merah" },
  { code: "kegiatan", label: "Ada kegiatan lain" },
  { code: "lainnya", label: "Lainnya" },
];

export function ConfirmForm({
  token,
  meetings,
}: {
  token: string;
  meetings: GapMeetingView[];
}) {
  const [statusMap, setStatusMap] = useState<Record<number, string>>(() =>
    Object.fromEntries(meetings.map((m) => [m.jadwalId, m.status ?? ""])),
  );
  // Attestation checkbox per meeting — required before a "mengajar_kendala_sistem"
  // answer may be submitted (the meeting gets counted as taught, so the teacher
  // must affirm it). Pre-checked when they already confirmed that status before.
  const [attestMap, setAttestMap] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(
      meetings.map((m) => [m.jadwalId, m.status === "mengajar_kendala_sistem"]),
    ),
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitResult | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setResult(await submitConfirmations(token, fd));
    });
  }

  const answered = Object.values(statusMap).filter(Boolean).length;
  // Any "mengajar_kendala_sistem" answer whose attestation isn't checked blocks
  // submit — mirrors the server-side gate so the UI can't send an un-attested one.
  const attestMissing = meetings.some(
    (m) =>
      statusMap[m.jadwalId] === "mengajar_kendala_sistem" && !attestMap[m.jadwalId],
  );

  if (result?.ok) {
    return (
      <EmptyState
        tone="success"
        icon="🙏"
        title="Terima kasih"
        description={`Tersimpan ${result.saved} pertemuan. Jazaakumullahu khairan.`}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {result && !result.ok && <Alert variant="danger">{result.error}</Alert>}

      {meetings.map((m) => {
        const status = statusMap[m.jadwalId] ?? "";
        return (
          <Card key={m.jadwalId} className="p-4 shadow-none">
            <div className="font-medium">
              Pertemuan {m.order ?? "?"}{" "}
              <span className="text-neutral-500">· {fmtDate(m.date)}</span>
            </div>

            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`status_${m.jadwalId}`}
                  value="tidak_mengajar"
                  checked={status === "tidak_mengajar"}
                  onChange={() =>
                    setStatusMap((s) => ({ ...s, [m.jadwalId]: "tidak_mengajar" }))
                  }
                />
                Saya memang <b>tidak mengajar</b> di pertemuan ini
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`status_${m.jadwalId}`}
                  value="mengajar_belum_input"
                  checked={status === "mengajar_belum_input"}
                  onChange={() =>
                    setStatusMap((s) => ({ ...s, [m.jadwalId]: "mengajar_belum_input" }))
                  }
                />
                Saya <b>mengajar</b>, cuma belum input presensi
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`status_${m.jadwalId}`}
                  value="mengajar_kendala_sistem"
                  checked={status === "mengajar_kendala_sistem"}
                  onChange={() =>
                    setStatusMap((s) => ({
                      ...s,
                      [m.jadwalId]: "mengajar_kendala_sistem",
                    }))
                  }
                />
                Saya <b>mengajar</b>, tapi terkendala sistem (tak bisa lanjut 90 menit)
              </label>
            </div>

            {status === "mengajar_kendala_sistem" && (
              <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
                <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    name={`attest_${m.jadwalId}`}
                    checked={attestMap[m.jadwalId] ?? false}
                    onChange={(e) =>
                      setAttestMap((a) => ({ ...a, [m.jadwalId]: e.target.checked }))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    Saya menyatakan <b>benar-benar mengajar</b> pertemuan ini, namun
                    terkendala sistem sehingga tidak terekam.
                  </span>
                </label>
                <Input
                  type="text"
                  name={`kendalaText_${m.jadwalId}`}
                  defaultValue={m.reasonText ?? ""}
                  placeholder="Jelaskan kendala (opsional), mis. app error / tak bisa lanjut 90 menit"
                  maxLength={500}
                />
              </div>
            )}

            {status === "tidak_mengajar" && (
              <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
                <Select name={`reasonCode_${m.jadwalId}`} defaultValue={m.reasonCode ?? "izin"}>
                  {REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <Input
                  type="text"
                  name={`reasonText_${m.jadwalId}`}
                  defaultValue={m.reasonText ?? ""}
                  placeholder="Keterangan tambahan (opsional)"
                  maxLength={500}
                />
              </div>
            )}
          </Card>
        );
      })}

      <Button
        type="submit"
        variant="success"
        size="lg"
        className="w-full"
        disabled={pending || answered === 0 || attestMissing}
      >
        {pending ? "Menyimpan…" : `Kirim konfirmasi (${answered} pertemuan)`}
      </Button>
    </form>
  );
}
