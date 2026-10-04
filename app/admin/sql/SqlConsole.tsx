"use client";

import { useState, useTransition } from "react";
import { runReadOnlyQuery, type SqlResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const EXAMPLES = [
  "select slug, name from programs order by slug",
  "select tilawah_halaqah_id, name, pengajar, guru_phone from halaqah_sync order by name limit 50",
  "select halaqah_id, count(*) peserta from students_sync group by halaqah_id order by peserta desc",
];

export function SqlConsole() {
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      setResult(await runReadOnlyQuery(query));
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
          }}
          spellCheck={false}
          rows={6}
          className="rounded-xl bg-neutral-50 p-3 font-mono dark:bg-neutral-900"
          placeholder="SELECT ... (read-only, satu statement)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="default" onClick={run} disabled={pending}>
            {pending ? "Menjalankan…" : "Jalankan (⌘/Ctrl+Enter)"}
          </Button>
          {EXAMPLES.map((ex, i) => (
            <Button
              key={i}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQuery(ex)}
            >
              contoh {i + 1}
            </Button>
          ))}
        </div>
      </div>

      {result && !result.ok && <Alert variant="danger">{result.error}</Alert>}

      {result && result.ok && (
        <div className="space-y-2">
          <div className="text-12 text-ink-muted">
            {result.rowCount} baris
            {result.truncated && ` (ditampilkan ${result.rows.length} pertama)`}
          </div>
          {result.rows.length === 0 ? (
            <EmptyState
              title="Query berhasil, tidak ada baris"
              description="Query jalan tanpa error tetapi tidak mengembalikan baris. Longgarkan filter WHERE-nya, atau cek nama tabelnya."
            />
          ) : (
            <TableWrap maxHeight="60vh">
              {/* Kepala tabel menempel: hasil query bisa ratusan baris. */}
              <Table>
                <THead sticky>
                  <TR>
                    {result.columns.map((c) => (
                      <TH key={c} className="whitespace-nowrap">
                        {c}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody zebra>
                  {result.rows.map((row, i) => (
                    <TR key={i}>
                      {result.columns.map((c) => (
                        <TD key={c} className="align-top font-mono text-xs whitespace-pre-wrap">
                          {row[c] ?? <span className="text-ink-faint">null</span>}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </div>
      )}
    </div>
  );
}
