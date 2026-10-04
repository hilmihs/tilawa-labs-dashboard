"use client";

import { useRef, useState, useTransition } from "react";
import { searchGuru, submitBadal } from "./actions";
import type { GuruOption } from "@/lib/guru-portal/queries";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function BadalForm({
  halaqahId,
  jadwalId,
  onDone,
}: {
  halaqahId: number;
  jadwalId: number;
  onDone: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuruOption[]>([]);
  const [selected, setSelected] = useState<GuruOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchGuru(halaqahId, value);
      setResults(r);
      setSearching(false);
    }, 250);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Pilih guru pengganti dulu.");
      return;
    }
    startTransition(async () => {
      const res = await submitBadal(halaqahId, jadwalId, { newGuruId: selected.id, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(
        res.sent
          ? "Pengajuan badal terkirim ke koordinator. Menunggu persetujuan."
          : "Pengajuan tersimpan, tapi WA ke koordinator belum terkirim — hubungi koordinator manual.",
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <div className="mb-1 text-sm font-medium">Guru pengganti (badal)</div>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="font-medium">{selected.name}</div>
            <Button type="button" variant="link" size="sm" onClick={() => setSelected(null)}>
              Ganti
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Ketik nama guru..."
            />
            {searching && <div className="mt-1 text-xs text-neutral-400">Mencari...</div>}
            {query.trim().length >= 2 && results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                {results.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(g);
                        setResults([]);
                        setQuery("");
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {g.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <div className="mt-1 text-xs text-neutral-400">Tidak ada guru cocok.</div>
            )}
          </div>
        )}
      </div>

      <FormField label="Alasan (opsional)" htmlFor={`badal-reason-${jadwalId}`}>
        <Textarea
          id={`badal-reason-${jadwalId}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>

      {error && <Alert variant="danger">{error}</Alert>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Mengirim..." : "Ajukan badal"}
      </Button>
    </form>
  );
}
