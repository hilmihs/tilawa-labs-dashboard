"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import type { NewsRow, QuoteRow } from "@/lib/news/service";
import {
  addQuoteAction,
  deleteQuoteAction,
  moveNewsAction,
  reviewNewsAction,
  setPinnedAction,
  setQuoteActiveAction,
} from "./actions";

type Msg = { kind: "ok" | "err"; text: string } | null;

/** How many kabar the board actually shows — mirrors MAX_ITEMS in lib/tv/news.ts. */
const ON_AIR = 6;

export function KurasiBoard({ items, quotes }: { items: NewsRow[]; quotes: QuoteRow[] }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  function flash(m: Msg) {
    setMsg(m);
    if (m) setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 6000);
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string } | { ok: true; data: unknown }>, okText: string) {
    start(async () => {
      const res = await fn();
      flash(res.ok ? { kind: "ok", text: okText } : { kind: "err", text: res.error });
    });
  }

  const waiting = items.filter((i) => i.status === "submitted");
  const approved = items.filter((i) => i.status === "approved");
  const rejected = items.filter((i) => i.status === "rejected");

  return (
    <div className="space-y-8">
      {msg && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Section title={`Menunggu persetujuan (${waiting.length})`}>
        {waiting.length === 0 ? (
          <EmptyState title="Antrean kosong" description="Tidak ada kabar baru pekan ini." />
        ) : (
          waiting.map((row) => (
            <Row key={row.id} row={row} disabled={pending}>
              <Button
                variant="success"
                size="sm"
                disabled={pending}
                onClick={() => run(() => reviewNewsAction(row.id, "approve"), "Kabar tayang di layar.")}
              >
                Setujui
              </Button>
              <RejectButton
                disabled={pending}
                onReject={(note) => run(() => reviewNewsAction(row.id, "reject", note), "Kabar ditolak.")}
              />
            </Row>
          ))
        )}
      </Section>

      <Section
        title={`Tayang di layar (${approved.length})`}
        hint={
          approved.length > ON_AIR
            ? `Layar hanya memuat ${ON_AIR} teratas — ${approved.length - ON_AIR} tidak terlihat.`
            : undefined
        }
      >
        {approved.length === 0 ? (
          <EmptyState title="Layar belum punya kabar pekan ini" description="Layar akan menampilkan kabar pekan lalu sampai ada yang disetujui." />
        ) : (
          approved.map((row, i) => (
            <Row key={row.id} row={row} disabled={pending} rank={i + 1} dim={i >= ON_AIR}>
              <Button
                variant="ghost"
                size="icon"
                title="Naikkan"
                disabled={pending || i === 0}
                onClick={() => run(() => moveNewsAction(row.id, "up"), "Urutan diubah.")}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Turunkan"
                disabled={pending || i === approved.length - 1}
                onClick={() => run(() => moveNewsAction(row.id, "down"), "Urutan diubah.")}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={row.pinned ? "Lepas sematan" : "Sematkan di atas"}
                disabled={pending}
                onClick={() => run(() => setPinnedAction(row.id, !row.pinned), row.pinned ? "Sematan dilepas." : "Kabar disematkan.")}
              >
                {row.pinned ? <PinOff /> : <Pin />}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => reviewNewsAction(row.id, "unpublish"), "Kabar diturunkan dari layar.")}
              >
                Turunkan
              </Button>
            </Row>
          ))
        )}
      </Section>

      {rejected.length > 0 && (
        <Section title={`Ditolak (${rejected.length})`}>
          {rejected.map((row) => (
            <Row key={row.id} row={row} disabled={pending} dim>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => reviewNewsAction(row.id, "approve"), "Kabar tayang di layar.")}
              >
                Setujui
              </Button>
            </Row>
          ))}
        </Section>
      )}

      <QuotePanel quotes={quotes} disabled={pending} run={run} />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">{title}</h2>
        {hint && <p className="text-xs text-amber-600 dark:text-amber-400">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  row,
  rank,
  dim,
  children,
}: {
  row: NewsRow;
  rank?: number;
  dim?: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 ${
        dim ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {rank != null && <span className="text-xs tabular-nums text-neutral-400">#{rank}</span>}
        <Badge tone="info">{row.divisionLabel}</Badge>
        {row.pinned && <Badge tone="indigo">Disematkan</Badge>}
        <span className="text-xs text-neutral-500">
          {row.submittedByName ?? "—"}
          {row.programSlug ? ` · ${row.programSlug}` : ""}
        </span>
      </div>
      <p className="font-medium">{row.title}</p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{row.body}</p>
      {row.reviewNote && (
        <p className="text-xs text-neutral-500">Catatan: {row.reviewNote}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
    </div>
  );
}

function RejectButton({ disabled, onReject }: { disabled: boolean; onReject: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Tolak
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Input
        value={note}
        placeholder="Alasan singkat (dilihat penulis)"
        className="max-w-xs"
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled}
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={disabled}
        onClick={() => {
          onReject(note);
          setOpen(false);
          setNote("");
        }}
      >
        Kirim penolakan
      </Button>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(false)}>
        Batal
      </Button>
    </div>
  );
}

function QuotePanel({
  quotes,
  disabled,
  run,
}: {
  quotes: QuoteRow[];
  disabled: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string } | { ok: true; data: unknown }>, okText: string) => void;
}) {
  const [text, setText] = useState("");
  const [arabic, setArabic] = useState("");
  const [source, setSource] = useState("");

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
        Quote di kepala layar ({quotes.filter((q) => q.active).length} aktif)
      </h2>

      <form
        className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addQuoteAction({ text, arabic, source }), "Quote ditambahkan.");
          setText("");
          setArabic("");
          setSource("");
        }}
      >
        <FormField label="Terjemahan / kalimat" htmlFor="quote-text">
          <Textarea
            id="quote-text"
            rows={2}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Teks Arab (opsional)" htmlFor="quote-arabic">
            <Input
              id="quote-arabic"
              dir="rtl"
              value={arabic}
              onChange={(e) => setArabic(e.target.value)}
              disabled={disabled}
            />
          </FormField>
          <FormField label="Sumber (opsional)" htmlFor="quote-source">
            <Input
              id="quote-source"
              value={source}
              placeholder="HR. Bukhari"
              onChange={(e) => setSource(e.target.value)}
              disabled={disabled}
            />
          </FormField>
        </div>
        <Button type="submit" size="sm" disabled={disabled || text.trim().length < 8}>
          Tambah quote
        </Button>
      </form>

      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {quotes.map((q) => (
          <div key={q.id} className={`flex flex-wrap items-center gap-3 p-3 ${q.active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              {q.arabic && (
                <p dir="rtl" className="text-base leading-relaxed">
                  {q.arabic}
                </p>
              )}
              <p className="text-sm">{q.text}</p>
              {q.source && <p className="text-xs text-neutral-500">{q.source}</p>}
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => run(() => setQuoteActiveAction(q.id, !q.active), q.active ? "Quote dinonaktifkan." : "Quote diaktifkan.")}
            >
              {q.active ? "Nonaktifkan" : "Aktifkan"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => run(() => deleteQuoteAction(q.id), "Quote dihapus.")}
            >
              Hapus
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
