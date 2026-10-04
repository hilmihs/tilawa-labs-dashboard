"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { KpiView, WorkbookItem } from "@/lib/scorecard/queries";
import {
  addItemAction,
  deleteItemAction,
  refreshNowAction,
  setLockAction,
  updateItemAction,
  type ActionResult,
} from "./actions";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  return { pending, error, run };
}

export function RefreshNow() {
  const { pending, error, run } = useAction();
  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {/* Menarik ulang dari sumbernya bisa memakan menit-menitan — `heavy`, dan
          karena itu berpasangan dengan konfirmasi (lihat components/ui/README). */}
      <Button
        variant="heavy"
        size="sm"
        onClick={() => {
          if (
            window.confirm(
              "Tarik ulang semua baris otomatis dari sumbernya?\n\n" +
                "Bisa memakan beberapa menit. Baris yang dikunci tidak ditimpa.",
            )
          ) {
            run(refreshNowAction);
          }
        }}
        disabled={pending}
        title="Tarik ulang baris otomatis dari sumbernya. Baris yang dikunci tidak ditimpa."
      >
        {pending ? "Menarik…" : "↻ Refresh otomatis"}
      </Button>
    </div>
  );
}

const num = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};

function ItemRow({ item, isPct, readOnly }: { item: WorkbookItem; isPct: boolean; readOnly: boolean }) {
  const { pending, error, run } = useAction();
  const [detail, setDetail] = useState(item.detail ?? "");
  const [kuantitas, setKuantitas] = useState(item.kuantitas == null ? "" : String(item.kuantitas));
  const [pembagi, setPembagi] = useState(item.pembagi == null ? "" : String(item.pembagi));
  const [status, setStatus] = useState<"achieved" | "outlook">(item.status);
  const isAuto = item.origin === "auto";

  const dirty =
    detail !== (item.detail ?? "") ||
    kuantitas !== (item.kuantitas == null ? "" : String(item.kuantitas)) ||
    pembagi !== (item.pembagi == null ? "" : String(item.pembagi)) ||
    status !== item.status;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-1.5 text-sm dark:border-neutral-800/60">
      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="deskripsi baris"
        disabled={readOnly || pending}
        className="min-w-[10rem] flex-1 rounded border border-neutral-200 bg-transparent px-2 py-1 dark:border-neutral-700"
      />
      <input
        value={kuantitas}
        onChange={(e) => setKuantitas(e.target.value)}
        inputMode="decimal"
        placeholder={isPct ? "pembilang" : "nilai"}
        disabled={readOnly || pending}
        className="w-24 rounded border border-neutral-200 bg-transparent px-2 py-1 text-right tabular-nums dark:border-neutral-700"
      />
      {isPct ? (
        <input
          value={pembagi}
          onChange={(e) => setPembagi(e.target.value)}
          inputMode="decimal"
          placeholder="pembagi"
          disabled={readOnly || pending}
          className="w-24 rounded border border-neutral-200 bg-transparent px-2 py-1 text-right tabular-nums dark:border-neutral-700"
        />
      ) : null}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as "achieved" | "outlook")}
        disabled={readOnly || pending}
        className="rounded border border-neutral-200 bg-transparent px-2 py-1 dark:border-neutral-700"
      >
        <option value="achieved">achieved</option>
        <option value="outlook">outlook</option>
      </select>

      {isAuto ? (
        <span
          className="rounded bg-blue-50 px-1.5 py-0.5 text-11 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
          title={
            item.refreshError
              ? `error: ${item.refreshError}`
              : `otomatis${item.autoValue != null ? ` = ${item.autoValue}` : ""}${item.locked ? " · terkunci" : ""}`
          }
        >
          {item.refreshError ? "auto⚠" : item.locked ? "auto🔒" : "auto"}
        </span>
      ) : null}

      {!readOnly ? (
        <>
          <button
            onClick={() =>
              run(() =>
                updateItemAction(item.id, {
                  detail,
                  kuantitas: num(kuantitas),
                  pembagi: isPct ? num(pembagi) : undefined,
                  status,
                }),
              )
            }
            disabled={pending || !dirty}
            className="rounded bg-neutral-800 px-2 py-1 text-11 text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-200 dark:text-neutral-900"
          >
            Simpan
          </button>
          {isAuto ? (
            <button
              onClick={() => run(() => setLockAction(item.id, !item.locked))}
              disabled={pending}
              className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
              title={item.locked ? "buka kunci → refresh boleh menimpa" : "kunci → refresh tidak menimpa"}
            >
              {item.locked ? "Buka kunci" : "Kunci"}
            </button>
          ) : null}
          <button
            onClick={() => {
              if (confirm("Hapus baris ini?")) run(() => deleteItemAction(item.id));
            }}
            disabled={pending}
            className="rounded px-2 py-1 text-xs text-danger hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Hapus
          </button>
        </>
      ) : null}
      {error ? <span className="w-full text-xs text-danger">{error}</span> : null}
    </div>
  );
}

function AddRow({ kpiId, isPct }: { kpiId: string; isPct: boolean }) {
  const { pending, error, run } = useAction();
  const [detail, setDetail] = useState("");
  const [kuantitas, setKuantitas] = useState("");
  const [pembagi, setPembagi] = useState("");
  const submit = () =>
    run(async () => {
      const r = await addItemAction(kpiId, {
        detail,
        kuantitas: num(kuantitas),
        pembagi: isPct ? num(pembagi) : undefined,
        status: "achieved",
      });
      if (r.ok) {
        setDetail("");
        setKuantitas("");
        setPembagi("");
      }
      return r;
    });
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 text-sm">
      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="+ baris baru: deskripsi"
        disabled={pending}
        className="min-w-[10rem] flex-1 rounded border border-dashed border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
      />
      <input
        value={kuantitas}
        onChange={(e) => setKuantitas(e.target.value)}
        inputMode="decimal"
        placeholder={isPct ? "pembilang" : "nilai"}
        disabled={pending}
        className="w-24 rounded border border-dashed border-neutral-300 bg-transparent px-2 py-1 text-right tabular-nums dark:border-neutral-700"
      />
      {isPct ? (
        <input
          value={pembagi}
          onChange={(e) => setPembagi(e.target.value)}
          inputMode="decimal"
          placeholder="pembagi"
          disabled={pending}
          className="w-24 rounded border border-dashed border-neutral-300 bg-transparent px-2 py-1 text-right tabular-nums dark:border-neutral-700"
        />
      ) : null}
      <button
        onClick={submit}
        disabled={pending || kuantitas.trim() === ""}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Tambah
      </button>
      {error ? <span className="w-full text-xs text-danger">{error}</span> : null}
    </div>
  );
}

export function KelolaTable({ kpis, readOnly }: { kpis: KpiView[]; readOnly: boolean }) {
  return (
    <div className="space-y-4">
      {kpis.map((k) => {
        const isPct = k.uom === "%";
        return (
          <section
            key={k.id}
            className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">
                {k.name}
                {k.oypCode ?? k.catCode ? (
                  <span className="ml-1 text-xs font-normal text-ink-faint">
                    {k.oypCode ?? k.catCode}
                  </span>
                ) : null}
                {!k.countsTowardCat ? (
                  <span className="ml-1 rounded bg-neutral-100 px-1 text-11 font-normal text-ink-muted dark:bg-neutral-800 dark:text-neutral-400">
                    di luar CAT
                  </span>
                ) : null}
              </h2>
              <span className="text-xs tabular-nums text-ink-muted">
                {k.uom ?? "#"} · target {k.target ?? "—"} · ach{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-200">
                  {k.ach ?? "—"}
                </span>
              </span>
            </header>
            <div>
              {k.items.map((it) => (
                <ItemRow key={it.id} item={it} isPct={isPct} readOnly={readOnly} />
              ))}
              {k.items.length === 0 ? (
                <p className="py-1 text-xs text-ink-faint">Belum ada baris.</p>
              ) : null}
            </div>
            {!readOnly ? <AddRow kpiId={k.id} isPct={isPct} /> : null}
          </section>
        );
      })}
    </div>
  );
}
