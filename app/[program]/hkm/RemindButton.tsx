"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { triggerHkmReminders, type RemindActionResult } from "./reminder-actions";

export function RemindButton({ program, count }: { program: string; count: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RemindActionResult | null>(null);

  const send = () => {
    if (!confirm(`Kirim pengingat WhatsApp ke ${count} peserta at-risk?`)) return;
    start(async () => setResult(await triggerHkmReminders(program)));
  };

  return (
    <div className="flex items-center gap-2">
      {/* Kirim massal: tidak bisa ditarik kembali setelah pesan terkirim, jadi
          konfirmasi di `send()` wajib tetap ada. Bobotnya sekunder — bukan
          tombol utama layar, dan tidak boleh setara tombol export. */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={send}
        disabled={pending || count === 0}
        title={
          count === 0
            ? "Tidak ada peserta dengan nomor WA yang perlu diingatkan"
            : `Kirim pengingat WhatsApp ke ${count} peserta sekaligus — ada konfirmasi dulu`
        }
      >
        {pending ? "Mengirim…" : "Kirim pengingat WA"}
      </Button>
      {result && (
        <span className={`text-12 ${result.ok ? "text-ink-muted" : "text-danger"}`}>
          {result.ok ? result.message : result.error}
        </span>
      )}
    </div>
  );
}
