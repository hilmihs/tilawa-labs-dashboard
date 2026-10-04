import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getHalaqahDetail } from "@/lib/insights/halaqah";
import { getProgram } from "@/lib/programs/resolve";
import { genderLabel } from "@/lib/programs/config";
import { Button } from "@/components/ui/button";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { attendanceStatus, toneBadgeClass } from "@/lib/ui/status";
import { ManagePertemuan } from "./ManagePertemuan";
import { ObservasiHalaqah } from "./ObservasiHalaqah";
import { RincianKeterangan, reasonText } from "./RincianKeterangan";

export const dynamic = "force-dynamic";

const STATUS = attendanceStatus;
const cls = (status: number) => toneBadgeClass[STATUS[status].tone];

/** Cap the tooltip; the full text lives in the Rincian keterangan section. */
const TOOLTIP_MAX = 120;

/**
 * Truncate by code point, not by UTF-16 unit — the longest reasons contain
 * emoji, and `String.slice` can split a surrogate pair into a lone surrogate
 * that renders as a replacement character.
 */
function truncate(s: string): string {
  const chars = Array.from(s);
  return chars.length <= TOOLTIP_MAX ? s : chars.slice(0, TOOLTIP_MAX).join("") + "…";
}

function shortDate(d: string | null): string {
  if (!d) return "-";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export default async function HalaqahDetailPage({
  params,
}: {
  params: Promise<{ program: string; halaqahId: string }>;
}) {
  const { program, halaqahId } = await params;
  const [detail, programRow] = await Promise.all([
    getHalaqahDetail(program, Number(halaqahId)),
    getProgram(program),
  ]);
  if (!detail) notFound();

  return (
    // Halaman tabel: matriks presensi selebar jumlah pertemuan.
    <main className="mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6">
      <div>
        <Button asChild variant="link" className="h-auto gap-1 p-0 text-sm text-primary">
          <Link href={`/${program}/dashboard`}>
            <ArrowLeft />
            Kembali ke daftar halaqah
          </Link>
        </Button>
        <h1 className="mt-2 text-20 font-bold tracking-[-0.01em]">{detail.name ?? "Halaqah"}</h1>
        <p className="text-sm text-ink-muted">
          {detail.pengajar ?? "-"} · {detail.level ?? "-"} · {genderLabel(detail.gender)} ·{" "}
          {detail.students.length} peserta · {detail.meetings.length} pertemuan
          {detail.nonaktifCount > 0 && ` · ${detail.nonaktifCount} nonaktif disembunyikan`}
        </p>
        {/* A peserta with no enrollment id cannot be matched to any presensi, so
            the matrix has no row to draw. Saying so beats dropping them without
            a word — the silent drop is what hid the 25 Agu sync bug. */}
        {detail.tanpaEnrollmentCount > 0 && (
          <p className="mt-1 text-sm text-warn dark:text-amber-500">
            {detail.tanpaEnrollmentCount} peserta belum tersinkron (data enrollment kosong) — tunggu
            sinkronisasi penuh berikutnya, atau laporkan bila menetap.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 ${cls(1)}`}>H</span> Hadir
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 ${cls(2)}`}>T</span> Telat
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 ${cls(3)}`}>I</span> Izin/Sakit
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 ${cls(0)}`}>A</span> Alfa
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 ring-1 ring-inset ring-current/50 ${cls(3)}`}>I</span>{" "}
          ada keterangan
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-ink-faint dark:bg-neutral-800">·</span>{" "}
          belum dipresensi
        </span>
      </div>

      {/* Dua sumbu menempel sekaligus: kepala pertemuan di atas (butuh
          `maxHeight` sebagai scrollport) dan kolom nama di kiri. Sel pojok
          harus di atas keduanya, jadi z-nya dinaikkan. */}
      <TableWrap maxHeight="75vh">
        <Table className="w-auto">
          <THead sticky>
            <TR>
              <TH className="sticky left-0 z-20 bg-neutral-50 dark:bg-neutral-900">
                Santri
              </TH>
              <TH className="px-2 text-right">Hadir</TH>
              {detail.meetings.map((m, i) => (
                <TH
                  key={m.jadwalId}
                  className="px-1.5 text-center whitespace-nowrap"
                  // Materi first — the date alone rarely says what was taught.
                  title={[m.name, m.date].filter(Boolean).join(" · ")}
                >
                  <div className="text-11 text-ink-faint">P{m.order ?? i + 1}</div>
                  <div className="text-11">{shortDate(m.date)}</div>
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {detail.students.map((s) => {
              const row = detail.matrix[s.halaqahUserId] ?? {};
              return (
                <TR key={s.halaqahUserId}>
                  <TD className="sticky left-0 z-10 bg-white py-1.5 font-medium whitespace-nowrap border-neutral-200 dark:border-neutral-800 dark:bg-neutral-950">
                    {s.name ?? "-"}
                    <span className="ml-2 text-xs text-ink-faint tabular-nums">
                      {s.rate != null ? `${s.rate.toFixed(0)}%` : "—"}
                    </span>
                  </TD>
                  <TD className="px-2 py-1.5 text-right text-xs text-ink-muted tabular-nums border-neutral-200 dark:border-neutral-800">
                    {s.hadir ?? 0}/{s.effective ?? 0}
                  </TD>
                  {detail.meetings.map((m) => {
                    const att = row[m.jadwalId];
                    const cell = att ? STATUS[att.status] : null;
                    const reason = att ? reasonText(att) : null;
                    // The marker is an inset ring — a box-shadow, so it adds no
                    // inline width and the H/A/T/I letters stay aligned down the
                    // column. `inset` also keeps it from painting outside the
                    // pill, where the sticky first column has to occlude it.
                    const marked = cell != null && reason != null;
                    const tooltip = marked ? `${cell.name} — ${truncate(reason)}` : undefined;
                    return (
                      <TD key={m.jadwalId} className="px-1 py-1.5 text-center border-neutral-200 dark:border-neutral-800">
                        <span
                          title={tooltip}
                          className={`inline-block w-6 rounded py-0.5 text-xs ${
                            cell ? toneBadgeClass[cell.tone] : "text-neutral-300 dark:text-neutral-700"
                          }${marked ? " ring-1 ring-inset ring-current/50 cursor-help" : ""}`}
                        >
                          {cell ? cell.label : "·"}
                          {/* `title` is not reliably exposed to screen readers,
                              and `aria-label` on a generic span is name-prohibited
                              in ARIA 1.2. sr-only text is absolutely positioned,
                              so it cannot disturb the 24px centering. */}
                          {marked && <span className="sr-only">{`${cell.name} — ${reason}`}</span>}
                        </span>
                      </TD>
                    );
                  })}
                </TR>
              );
            })}
            {detail.students.length === 0 && (
              <TR>
                <TD className="py-6 text-ink-muted">Belum ada peserta di halaqah ini.</TD>
              </TR>
            )}
          </TBody>
        </Table>
      </TableWrap>

      {/* Catatan ketua kelas dari Maahir. Menyusul RincianKeterangan (yang
          berasal dari CMS tilawah) supaya urutannya: apa yang tercatat di
          presensi dulu, baru apa yang dilaporkan ketua kelas. Mengembalikan
          null diam-diam kalau program ini tanpa pin batch atau namanya tidak
          ketemu di sisi Maahir. */}
      <ObservasiHalaqah program={program} config={programRow?.config} halaqahNama={detail.name} />

      <RincianKeterangan
        meetings={detail.meetings}
        students={detail.students}
        matrix={detail.matrix}
      />

      <ManagePertemuan program={program} halaqahId={detail.halaqahId} meetings={detail.meetings} />
    </main>
  );
}
