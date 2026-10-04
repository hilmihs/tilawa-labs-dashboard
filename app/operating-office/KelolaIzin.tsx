import { Inisial, kartu } from "@/components/lintas/brand";
import { Badge } from "@/components/ui/badge";
import type { StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

export type BarisIzin = {
  id: string;
  petugas: string;
  /** Sudah diformat, mis. "Sel, 30 Sep – Rab, 1 Okt". */
  rentang: string;
  hari: number;
  alasan: string;
  catatan: string | null;
  status: string;
  dikabarkan: string;
};

// 'menunggu' / 'disetujui' / 'ditolak' hanya pada baris dari alur izin lama (sebelum 0048).
const LABEL: Record<string, string> = {
  dikabarkan: "Dikabarkan",
  dibatalkan: "Dibatalkan",
  menunggu: "Dikabarkan",
  disetujui: "Dikabarkan",
  ditolak: "Ditolak (alur lama)",
};

const TONE: Record<string, StatusTone> = {
  dikabarkan: "indigo",
  dibatalkan: "neutral",
  menunggu: "indigo",
  disetujui: "indigo",
  ditolak: "danger",
};

/** Kabar tidak hadir dari masyaikh — hanya dicatat, tidak ada yang perlu diputus. */
export function KelolaIzin({ izin }: { izin: BarisIzin[] }) {
  if (izin.length === 0) return <p className={cn(kartu, "p-4 text-sm text-ink-muted")}>Belum ada kabar tidak hadir.</p>;

  return (
    <ul className={cn(kartu, "divide-y divide-border overflow-hidden")}>
      {izin.map((i) => (
        <li key={i.id} className={cn("flex items-start gap-3 px-4 py-3", i.status === "dibatalkan" && "opacity-60")}>
          <Inisial nama={i.petugas} className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-14 font-semibold">{i.petugas}</span>
              <Badge tone={TONE[i.status] ?? "neutral"} className="text-11">
                {LABEL[i.status] ?? i.status}
              </Badge>
            </div>
            <div className="mt-0.5 text-12">
              <span className="font-semibold">{i.rentang}</span>
              {i.hari > 1 && <span className="text-ink-muted"> ({i.hari} hari)</span>}
              <span className="text-ink-muted"> · {i.alasan}</span>
            </div>
            {i.catatan && (
              <p dir="auto" className="mt-1 border-s-2 border-neutral-300 ps-2 text-12 text-ink-muted dark:border-neutral-700">
                {i.catatan}
              </p>
            )}
            <div className="mt-0.5 text-11 text-ink-muted">Dikabarkan {i.dikabarkan}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
