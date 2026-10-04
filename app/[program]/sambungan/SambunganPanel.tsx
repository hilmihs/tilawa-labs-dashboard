"use client";

import { Fragment, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { NafiAccount } from "@/lib/hkm/nafi-accounts";
import type { SambunganRow, SambunganSebab } from "./queries";
import { aktifkanLewatEmail, cariAkun, sambungkanAkun, syncSekarang } from "./actions";

/**
 * Satu baris = satu peserta yang setorannya belum terhitung, dengan satu tombol
 * yang jelas. Penjelasan sebabnya ditulis untuk koordinator, bukan untuk yang
 * paham API: "akunnya belum diaktifkan", bukan "is_internal=0".
 *
 * Aksi menulis ke sistem lain (the partner system) lalu menarik ulang data, jadi bisa makan
 * belasan detik. Tombol dikunci selama proses dan hasilnya selalu dilaporkan —
 * tidak ada aksi yang selesai diam-diam.
 */

const SEBAB: Record<SambunganSebab, { label: string; tone: "warning" | "danger" | "neutral"; jelas: string }> = {
  tak_tertarik: {
    label: "Akun belum diaktifkan",
    tone: "danger",
    jelas: "Akunnya ada, tapi belum ditandai sebagai peserta internal — setorannya tidak ikut tertarik.",
  },
  tanpa_akun: {
    label: "Belum ada akun",
    tone: "warning",
    jelas: "Belum ketahuan akun the partner system-nya. Cari lewat nama, email, atau nomor HP, lalu sambungkan.",
  },
  belum_setor: {
    label: "Belum setoran",
    tone: "neutral",
    jelas: "Sambungannya sudah benar — memang belum ada catatan tilawah. Ini bukan masalah teknis.",
  },
};

type Pesan = { ok: boolean; text: string } | null;

export function SambunganPanel({
  programSlug,
  rows,
  totalPeserta,
  totalTerhitung,
}: {
  programSlug: string;
  rows: SambunganRow[];
  totalPeserta: number;
  totalTerhitung: number;
}) {
  const [pending, start] = useTransition();
  const [pesan, setPesan] = useState<Pesan>(null);
  /** Baris yang panel pencariannya sedang dibuka. */
  const [cariUntuk, setCariUntuk] = useState<SambunganRow | null>(null);
  const [query, setQuery] = useState("");
  const [kandidat, setKandidat] = useState<NafiAccount[] | null>(null);

  const bukaCari = (row: SambunganRow) => {
    setCariUntuk(row);
    setQuery(row.email ?? row.nama);
    setKandidat(null);
    setPesan(null);
  };

  const jalankanCari = () =>
    start(async () => {
      const res = await cariAkun(programSlug, query);
      if (!res.ok) {
        setKandidat([]);
        setPesan({ ok: false, text: res.error });
        return;
      }
      setKandidat(res.data);
      setPesan({ ok: true, text: res.message });
    });

  const sambung = (row: SambunganRow, akun: NafiAccount) =>
    start(async () => {
      const res = await sambungkanAkun(programSlug, {
        participantId: row.participantId,
        email: akun.email ?? "",
        berkahUserId: akun.id,
      });
      setPesan(res.ok ? { ok: true, text: `${row.nama}: ${res.message}` } : { ok: false, text: res.error });
      if (res.ok) {
        setCariUntuk(null);
        setKandidat(null);
      }
    });

  const aktifkan = (row: SambunganRow) =>
    start(async () => {
      const res = row.email
        ? await aktifkanLewatEmail(programSlug, { email: row.email })
        : { ok: false as const, error: "Baris ini belum punya email — pakai Cari akun." };
      setPesan(res.ok ? { ok: true, text: `${row.nama}: ${res.message}` } : { ok: false, text: res.error });
    });

  const tarikData = () =>
    start(async () => {
      const res = await syncSekarang(programSlug);
      setPesan(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{totalTerhitung}</span> dari {totalPeserta} peserta setorannya sudah
          terhitung. {rows.length > 0 && <>Sisanya {rows.length} baris di bawah ini.</>}
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={tarikData} disabled={pending}>
          {pending ? "Memproses…" : "Tarik data sekarang"}
        </Button>
      </div>

      {pesan && <Alert variant={pesan.ok ? "success" : "danger"}>{pesan.text}</Alert>}

      {rows.length === 0 ? (
        <EmptyState
          title="Semua peserta sudah tersambung"
          description="Tidak ada sambungan yang perlu dibereskan."
          tone="success"
        />
      ) : (
        <TableWrap>
          <Table>
            <THead sticky>
              <TR>
                <TH>Peserta</TH>
                <TH>Halaqah</TH>
                <TH>Keterangan</TH>
                <TH>Akun Nafi&apos;</TH>
                <TH className="text-right">Tindakan</TH>
              </TR>
            </THead>
            <TBody zebra>
              {rows.map((row) => {
                const sebab = SEBAB[row.sebab];
                const terbuka = cariUntuk?.participantId === row.participantId;
                return (
                  <Fragment key={row.participantId}>
                    <TR>
                      <TD className="font-medium">
                        {row.nama}
                        {row.pengajar && <div className="text-11 text-ink-faint">{row.pengajar}</div>}
                      </TD>
                      <TD className="text-ink-muted">{row.halaqah ?? "—"}</TD>
                      <TD>
                        <Badge tone={sebab.tone}>{sebab.label}</Badge>
                        <div className="mt-1 max-w-[38ch] text-11 text-ink-faint">{sebab.jelas}</div>
                      </TD>
                      <TD className="text-ink-muted">
                        {row.email ?? <span className="text-ink-faint">belum ada</span>}
                        {row.hariSetoran > 0 && (
                          <div className="text-11 text-ink-faint">
                            {row.hariSetoran} hari setoran · terakhir {row.terakhirSetor}
                          </div>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          {row.sebab === "tak_tertarik" && (
                            <Button type="button" size="sm" onClick={() => aktifkan(row)} disabled={pending}>
                              Aktifkan
                            </Button>
                          )}
                          {row.sebab !== "belum_setor" && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => (terbuka ? setCariUntuk(null) : bukaCari(row))}
                              disabled={pending}
                            >
                              {terbuka ? "Tutup" : "Cari akun"}
                            </Button>
                          )}
                          {row.phone && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={`https://wa.me/${row.phone}?text=${encodeURIComponent(pesanWa(row))}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                WA
                              </a>
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>

                    {terbuka && (
                      <TR>
                        <TD colSpan={5} className="bg-neutral-50 dark:bg-neutral-900/50">
                          <div className="space-y-3 py-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Nama, email, atau nomor HP"
                                className="max-w-sm"
                                onKeyDown={(e) => e.key === "Enter" && jalankanCari()}
                              />
                              <Button type="button" size="sm" onClick={jalankanCari} disabled={pending}>
                                {pending ? "Mencari…" : "Cari di the partner system"}
                              </Button>
                            </div>

                            {kandidat && kandidat.length === 0 && (
                              <p className="text-12 text-ink-muted">
                                Tidak ada yang cocok. Coba nomor HP-nya, atau potongan namanya saja.
                              </p>
                            )}

                            {kandidat && kandidat.length > 0 && (
                              <ul className="space-y-2">
                                {kandidat.map((a) => (
                                  <li
                                    key={a.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-strong px-3 py-2"
                                  >
                                    <div className="text-12">
                                      <div className="font-medium">{a.nama ?? "(tanpa nama)"}</div>
                                      <div className="text-ink-muted">
                                        {a.email ?? "tanpa email"}
                                        {a.phone ? ` · ${a.phone}` : ""}
                                        {a.totalKhatam != null ? ` · ${a.totalKhatam}× khatam` : ""}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {!a.internal && (
                                        <span className="text-11 text-warn">akan diaktifkan juga</span>
                                      )}
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => sambung(row, a)}
                                        disabled={pending || !a.email}
                                        title={a.email ? undefined : "Akun ini tidak punya email, tidak bisa disambungkan"}
                                      >
                                        Sambungkan
                                      </Button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <p className="text-11 text-ink-faint">
                              Menyambungkan sekaligus mengaktifkan akunnya dan menarik ulang datanya — perlu belasan
                              detik. Bisa dikembalikan lewat halaman ini juga.
                            </p>
                          </div>
                        </TD>
                      </TR>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}

function pesanWa(row: SambunganRow): string {
  return [
    `Assalamu'alaikum ${row.nama},`,
    "",
    row.sebab === "tanpa_akun"
      ? "Mohon izin, setoran tilawah antum/anti belum tercatat di aplikasi the partner system. Boleh dibantu info email yang dipakai mendaftar di aplikasi the partner system? Insya Allah kami sambungkan agar setorannya terhitung."
      : "Mohon izin, setoran tilawah antum/anti belum tercatat di laporan HKM. Boleh dicek apakah setorannya sudah diinput lewat aplikasi the partner system?",
    "",
    "Jazakumullahu khairan 🙏",
  ].join("\n");
}
