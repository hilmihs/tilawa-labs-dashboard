"use client";

import { useState, useTransition } from "react";
import { submitReschedule } from "./actions";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function RescheduleForm({
  halaqahId,
  jadwalId,
  defaultDate,
  onDone,
}: {
  halaqahId: number;
  jadwalId: number;
  defaultDate: string | null;
  onDone: (msg: string) => void;
}) {
  const [date, setDate] = useState(defaultDate ?? "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date || !startTime || !endTime) {
      setError("Tanggal & jam wajib diisi.");
      return;
    }
    if (!(endTime > startTime)) {
      setError("Jam selesai harus setelah jam mulai.");
      return;
    }
    startTransition(async () => {
      const res = await submitReschedule(halaqahId, jadwalId, { date, startTime, endTime, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(
        res.sent
          ? "Pengajuan reschedule terkirim ke koordinator. Menunggu persetujuan."
          : "Pengajuan tersimpan, tapi WA ke koordinator belum terkirim — hubungi koordinator manual.",
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormField label="Tanggal baru" htmlFor={`resched-date-${jadwalId}`}>
        <Input
          id={`resched-date-${jadwalId}`}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Jam mulai" htmlFor={`resched-start-${jadwalId}`}>
          <Input
            id={`resched-start-${jadwalId}`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </FormField>
        <FormField label="Jam selesai" htmlFor={`resched-end-${jadwalId}`}>
          <Input
            id={`resched-end-${jadwalId}`}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Alasan (opsional)" htmlFor={`resched-reason-${jadwalId}`}>
        <Textarea
          id={`resched-reason-${jadwalId}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>

      {error && <Alert variant="danger">{error}</Alert>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Mengirim..." : "Ajukan reschedule"}
      </Button>
    </form>
  );
}
