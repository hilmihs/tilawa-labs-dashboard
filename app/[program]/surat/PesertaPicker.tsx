"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import type { SuratCandidate } from "@/lib/hkm/surat-queries";

export type PickerProps = {
  candidates: SuratCandidate[];
  /** Keys of the currently selected recipients, in selection order. */
  selectedKeys: string[];
  labelFor: (key: string) => string;
  onToggle: (candidate: SuratCandidate) => void;
  onToggleMany: (candidates: SuratCandidate[], select: boolean) => void;
  onAddManual: () => void;
  onRemoveKey: (key: string) => void;
  keyOf: (candidate: SuratCandidate) => string;
};

export function PesertaPicker({
  candidates,
  selectedKeys,
  labelFor,
  onToggle,
  onToggleMany,
  onAddManual,
  onRemoveKey,
  keyOf,
}: PickerProps) {
  const [q, setQ] = useState("");
  const [halaqah, setHalaqah] = useState("");

  const halaqahOptions = useMemo(
    () => Array.from(new Set(candidates.map((c) => c.halaqahNameRaw).filter(Boolean))).sort() as string[],
    [candidates],
  );

  // The whole roster is already in memory (~200 rows), so filtering is local —
  // no debounce and no server round-trip per keystroke.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => {
      if (halaqah && c.halaqahNameRaw !== halaqah) return false;
      if (!needle) return true;
      return (
        c.nama.toLowerCase().includes(needle) ||
        c.namaRaw.toLowerCase().includes(needle) ||
        (c.halaqahNameRaw ?? "").toLowerCase().includes(needle)
      );
    });
  }, [candidates, q, halaqah]);

  const selected = new Set(selectedKeys);
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(keyOf(c)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama peserta…"
          className="w-56"
          aria-label="Cari peserta"
        />
        <Select
          value={halaqah}
          onChange={(e) => setHalaqah(e.target.value)}
          className="w-52"
          aria-label="Filter halaqah"
        >
          <option value="">Semua halaqah</option>
          {halaqahOptions.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onToggleMany(visible, !allVisibleSelected)}
          disabled={visible.length === 0}
        >
          {allVisibleSelected ? "Batalkan pilihan" : `Pilih semua (${visible.length})`}
        </Button>
        <Button type="button" variant="ghost" onClick={onAddManual}>
          + Ketik nama manual
        </Button>
      </div>

      {selectedKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedKeys.map((key) => (
            <Badge key={key} tone="info" className="gap-1">
              {labelFor(key)}
              <button
                type="button"
                onClick={() => onRemoveKey(key)}
                className="ml-1 opacity-60 hover:opacity-100"
                aria-label={`Hapus ${labelFor(key)}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Daftar roster bisa ratusan baris di dalam kotak setinggi 320px —
          kepalanya harus ikut menempel supaya kolomnya tidak hilang. */}
      <TableWrap maxHeight={320}>
        <Table>
          <THead sticky>
            <TR>
              <TH className="w-10"> </TH>
              <TH>Nama</TH>
              <TH>Halaqah</TH>
              <TH numeric>Alpa</TH>
              <TH numeric>Telat</TH>
            </TR>
          </THead>
          <TBody>
            {visible.map((c) => {
              const key = keyOf(c);
              const checked = selected.has(key);
              return (
                <TR key={key}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(c)}
                      aria-label={`Pilih ${c.nama}`}
                      className="h-4 w-4 accent-neutral-900 dark:accent-neutral-100"
                    />
                  </TD>
                  <TD>{c.nama}</TD>
                  <TD className="text-ink-muted">{c.halaqahNameRaw ?? "-"}</TD>
                  <TD numeric>{c.alfa || "-"}</TD>
                  <TD numeric>{c.telat || "-"}</TD>
                </TR>
              );
            })}
            {visible.length === 0 && (
              <TR>
                <TD colSpan={5} className="text-center text-ink-muted">
                  Tidak ada peserta yang cocok.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
