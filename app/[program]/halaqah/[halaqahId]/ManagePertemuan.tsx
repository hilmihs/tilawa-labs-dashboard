"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { addPertemuan, deletePertemuan } from "./actions";
import type { Meeting } from "@/lib/insights/halaqah";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export function ManagePertemuan({
  program,
  halaqahId,
  meetings,
}: {
  program: string;
  halaqahId: number;
  meetings: Meeting[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const nextOrder = (meetings.reduce((m, x) => Math.max(m, x.order ?? 0), 0) || 0) + 1;
  const [f, setF] = useState({
    name: "Pertemuan",
    order: String(nextOrder),
    date: "",
    start: "08:00",
    end: "09:00",
  });

  async function onDelete(jadwalId: number, date: string | null) {
    if (!confirm(`Hapus pertemuan ${date ?? jadwalId} dari tilawah? Tindakan ini menulis ke sistem live.`)) return;
    setBusy(jadwalId);
    setMsg(null);
    const r = await deletePertemuan(program, halaqahId, jadwalId);
    setBusy(null);
    setMsg({ ok: r.ok, text: r.ok ? "Pertemuan dihapus." : r.error });
    if (r.ok) router.refresh();
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!f.date) {
      setMsg({ ok: false, text: "Tanggal wajib." });
      return;
    }
    if (f.end <= f.start) {
      setMsg({ ok: false, text: "Jam selesai harus setelah jam mulai." });
      return;
    }
    setBusy("add");
    setMsg(null);
    const r = await addPertemuan(program, {
      tilawahHalaqahId: halaqahId,
      name: f.name,
      order: Number(f.order),
      scheduleDate: f.date,
      startTime: f.start,
      endTime: f.end,
    });
    setBusy(null);
    setMsg({ ok: r.ok, text: r.ok ? "Pertemuan ditambahkan." : r.error });
    if (r.ok) router.refresh();
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span>Kelola pertemuan — menulis langsung ke tilawah</span>
        {open ? (
          <ChevronUp className="size-4 text-ink-faint" />
        ) : (
          <ChevronDown className="size-4 text-ink-faint" />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-200 p-4 dark:border-neutral-800">
          {msg && <Alert variant={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}

          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
            <label className="text-12 text-ink-muted">
              Nama
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="block w-auto" />
            </label>
            <label className="text-12 text-ink-muted">
              Urutan
              <Input value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} className="block w-16" />
            </label>
            <label className="text-12 text-ink-muted">
              Tanggal
              <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="block w-auto" />
            </label>
            <label className="text-12 text-ink-muted">
              Mulai
              <Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className="block w-auto" />
            </label>
            <label className="text-12 text-ink-muted">
              Selesai
              <Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className="block w-auto" />
            </label>
            <Button type="submit" disabled={busy === "add"}>
              {busy === "add" ? "Menyimpan…" : "+ Tambah pertemuan"}
            </Button>
          </form>

          <TableWrap maxHeight={288} className="rounded-lg">
            <Table>
              <THead sticky>
                <TR>
                  <TH>#</TH>
                  <TH>Tanggal</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Aksi</TH>
                </TR>
              </THead>
              <TBody>
                {meetings.map((m) => (
                  <TR key={m.jadwalId}>
                    <TD className="py-1.5 text-ink-muted">{m.order ?? "-"}</TD>
                    <TD className="py-1.5">{m.date ?? "-"}</TD>
                    <TD className="py-1.5 text-ink-muted">{m.statusLabel ?? "-"}</TD>
                    <TD className="py-1.5 text-right">
                      {/* Hapus menulis ke sistem live dan tidak bisa dibatalkan
                          — tetap merah, dan konfirmasinya di `onDelete` wajib
                          ada sebelum apa pun dikirim. */}
                      <Button
                        variant="destructive"
                        size="sm"
                        title="Hapus pertemuan ini dari tilawah — permanen, ada konfirmasi dulu"
                        onClick={() => onDelete(m.jadwalId, m.date)}
                        disabled={busy === m.jadwalId}
                      >
                        {busy === m.jadwalId ? (
                          "…"
                        ) : (
                          <>
                            <Trash2 />
                            Hapus
                          </>
                        )}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </div>
      )}
    </section>
  );
}
