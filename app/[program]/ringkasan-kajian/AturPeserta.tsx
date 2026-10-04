"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RosterItem } from "@/lib/ringkasan/queries";
import { setPesertaAktif } from "./actions";

export function AturPeserta({ programSlug, roster }: { programSlug: string; roster: RosterItem[] }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState("");
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? roster.filter((r) => r.nama.toLowerCase().includes(q)) : roster;
  }, [roster, cari]);

  async function ubah(r: RosterItem) {
    setSibuk(r.tilawahUserId);
    setGalat(null);
    const res = await setPesertaAktif(programSlug, r.tilawahUserId, !r.aktif).catch(() => ({
      ok: false as const,
      error: "Koneksi terputus — muat ulang halaman.",
    }));
    setSibuk(null);
    if (!res.ok) setGalat(res.error);
    else router.refresh();
  }

  if (!buka) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setBuka(true)}>
        Atur peserta ({roster.filter((r) => r.aktif).length})
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-[10px] border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Peserta wajib setor ringkasan</div>
        <Button variant="ghost" size="sm" onClick={() => setBuka(false)}>
          Tutup
        </Button>
      </div>
      <Input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama…" />
      {galat && <Alert variant="danger">{galat}</Alert>}
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {tampil.map((r) => (
          <li key={r.tilawahUserId}>
            <label className="flex cursor-pointer items-center gap-3 py-2">
              <input
                type="checkbox"
                className="size-5"
                checked={r.aktif}
                disabled={sibuk === r.tilawahUserId}
                onChange={() => ubah(r)}
              />
              <span className="flex-1">
                <span className="block text-sm">{r.nama}</span>
                <span className="block text-xs text-muted-foreground">{r.halaqah ?? "—"}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Peserta baru wajib setor mulai hari ini. Mengeluarkan peserta tidak menghapus setoran lamanya.
      </p>
    </div>
  );
}
