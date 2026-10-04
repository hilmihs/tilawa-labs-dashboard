"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { DIVISION_LABEL, type Division } from "@/lib/tv/divisions";
import type { NewsRow, NewsStatus } from "@/lib/news/service";
import { deleteNewsAction, submitNewsAction, updateNewsAction } from "./actions";

type Program = { slug: string; name: string };
type Msg = { kind: "ok" | "err"; text: string } | null;

const TITLE_MAX = 90;
const BODY_MAX = 260;

const STATUS_LABEL: Record<NewsStatus, { text: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  draft: { text: "Draf", tone: "neutral" },
  submitted: { text: "Menunggu kurator", tone: "warning" },
  approved: { text: "Tayang", tone: "success" },
  rejected: { text: "Ditolak", tone: "danger" },
};

export function BeritaForm({
  weekStart,
  weekLabel,
  divisions,
  programs,
  mine,
}: {
  weekStart: string;
  weekLabel: string;
  divisions: Division[];
  programs: Program[];
  mine: NewsRow[];
}) {
  const [msg, setMsg] = useState<Msg>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flash(m: Msg) {
    setMsg(m);
    if (m) setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 6000);
  }

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

      <Editor
        key={editing ?? "new"}
        weekStart={weekStart}
        weekLabel={weekLabel}
        divisions={divisions}
        programs={programs}
        existing={editing ? mine.find((m) => m.id === editing) ?? null : null}
        disabled={pending}
        onCancel={() => setEditing(null)}
        onSubmit={(input, done) =>
          start(async () => {
            const res = editing ? await updateNewsAction(editing, input) : await submitNewsAction(input);
            if (res.ok) {
              done();
              setEditing(null);
            }
            flash(
              res.ok
                ? { kind: "ok", text: editing ? "Kabar diperbarui." : "Kabar terkirim ke kurator." }
                : { kind: "err", text: res.error },
            );
          })
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          Kiriman saya pekan ini ({mine.length})
        </h2>
        {mine.length === 0 ? (
          <EmptyState
            title="Belum ada kabar"
            description="Tulis satu kabar baik dari divisi Anda untuk pekan ini."
          />
        ) : (
          <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {mine.map((row) => {
              const status = STATUS_LABEL[row.status];
              return (
                <div key={row.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{row.divisionLabel}</Badge>
                    <Badge tone={status.tone}>{status.text}</Badge>
                    {row.pinned && <Badge tone="indigo">Disematkan</Badge>}
                  </div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{row.body}</p>
                  {row.status === "rejected" && row.reviewNote && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Catatan kurator: {row.reviewNote}
                    </p>
                  )}
                  {row.status !== "approved" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => setEditing(row.id)}
                      >
                        Ubah
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await deleteNewsAction(row.id);
                            flash(
                              res.ok
                                ? { kind: "ok", text: "Kabar dihapus." }
                                : { kind: "err", text: res.error },
                            );
                          })
                        }
                      >
                        Hapus
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Editor({
  weekStart,
  weekLabel,
  divisions,
  programs,
  existing,
  disabled,
  onSubmit,
  onCancel,
}: {
  weekStart: string;
  weekLabel: string;
  divisions: Division[];
  programs: Program[];
  existing: NewsRow | null;
  disabled: boolean;
  onSubmit: (
    input: { division: string; weekStart: string; title: string; body: string; programSlug: string | null },
    done: () => void,
  ) => void;
  onCancel: () => void;
}) {
  const [division, setDivision] = useState<string>(existing?.division ?? divisions[0] ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [programSlug, setProgramSlug] = useState(existing?.programSlug ?? "");

  function reset() {
    setTitle("");
    setBody("");
    setProgramSlug("");
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          { division, weekStart, title, body, programSlug: programSlug || null },
          reset,
        );
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          {existing ? "Ubah kabar" : "Tulis kabar"} · pekan {weekLabel}
        </h2>
        {existing && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>
            Batal
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Divisi" htmlFor="division">
          <Select
            id="division"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            disabled={disabled || divisions.length <= 1}
          >
            {divisions.map((d) => (
              <option key={d} value={d}>
                {DIVISION_LABEL[d]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Program (opsional)" htmlFor="program">
          <Select
            id="program"
            value={programSlug}
            onChange={(e) => setProgramSlug(e.target.value)}
            disabled={disabled}
          >
            <option value="">—</option>
            {programs.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField
        label="Judul"
        htmlFor="title"
        hint={`${title.length}/${TITLE_MAX} — dibaca dari 4–6 meter, tulis sependek mungkin`}
      >
        <Input
          id="title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          disabled={disabled}
          placeholder="Wisuda 40 peserta HITS Dasar"
        />
      </FormField>

      <FormField label="Isi kabar" htmlFor="body" hint={`${body.length}/${BODY_MAX}`}>
        <Textarea
          id="body"
          value={body}
          rows={3}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled}
          placeholder="Satu–dua kalimat. Tanpa nama peserta, tanpa nomor HP."
        />
      </FormField>

      <Button type="submit" disabled={disabled || !division}>
        {existing ? "Simpan perubahan" : "Kirim ke kurator"}
      </Button>
    </form>
  );
}
