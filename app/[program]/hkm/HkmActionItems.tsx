import Link from "next/link";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SyncBar } from "../SyncBar";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { getHkmDashboardData, type HkmParticipantRow } from "./queries";
import { RemindButton } from "./RemindButton";
import { monthLabel } from "@/lib/insights/hkm";
import { waLink } from "@/lib/wa";
import { getTeacherPhone, canonicalPengajar } from "@/lib/hkm/teacher-phones";

/**
 * HKM follow-up worklist (the "Action Items" tab for berkah programs): who needs
 * a nudge, who hasn't started, and which data needs fixing. Reuses the dashboard
 * query — at-risk + reconciliation are mode-independent.
 */
export async function HkmActionItems({ program }: { program: string }) {
  const [data, lastSync] = await Promise.all([
    getHkmDashboardData(program, { mode: "kumulatif" }),
    getLastSync(program),
  ]);
  const sync = lastSyncLabel(lastSync);
  if (!data) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-6 py-8">
        <EmptyState
          title="Program ini bukan sumber HKM CMS"
          description="Tindak lanjut HKM hanya tersedia untuk program ber-dataSourceType “berkah_api”."
        />
      </main>
    );
  }

  const belumMulai = data.participants.filter((r) => r.category === "Belum Sama Sekali");
  const withPhone = data.atRisk.filter((r) => r.phone).length;
  const rc = data.reconciliation;
  const teachers = buildTeacherGroups(data.participants, data.month);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Tindak Lanjut — HKM</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Tindak lanjut: peserta perlu perhatian, belum mulai, dan data yang perlu dibereskan.
          </p>
        </div>
        <SyncBar program={program} label={sync.text} tone={sync.tone} />
      </div>

      {/* Layar ini memang daftar pekerjaan, jadi angka yang nol berarti tidak
          ada pekerjaan — dan tidak perlu kotak sendiri untuk mengatakannya. */}
      <KpiStrip
        hero={{ label: "Peserta perlu perhatian", value: data.atRisk.length, invert: true }}
        support={[{ label: "Bisa dikirim WA", value: withPhone }]}
        issues={[
          { label: "belum mulai tilawah", value: belumMulai.length, tone: "danger" },
          {
            label: "data perlu dibereskan",
            value: rc.unmatchedPulled.length + rc.noEmailMasters.length,
            tone: "warning",
          },
        ]}
        allClearText="Aman — tidak ada tindak lanjut yang menunggu"
      />

      {/* At-risk + bulk WA */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-ink-muted">Perlu perhatian ({data.atRisk.length})</h2>
          <RemindButton program={program} count={withPhone} />
        </div>
        {data.atRisk.length === 0 ? (
          <EmptyState
            tone="success"
            title="Tidak ada peserta yang perlu perhatian"
            description="Peserta yang tertinggal dari target atau lama tidak setor akan muncul di sini."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Nama</TH>
                  <TH>Halaqah</TH>
                  <TH className="text-right">Juz</TH>
                  <TH>Alasan</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {data.atRisk.map((r) => (
                  <TR key={r.participantId}>
                    <TD className="font-medium">
                      <Link href={`/${program}/hkm/${r.participantId}`} className="hover:underline">
                        {r.nama}
                      </Link>
                    </TD>
                    <TD className="text-ink-muted">{r.halaqah ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{r.cumulativeJuz}</TD>
                    <TD className="text-ink-muted">{r.riskReasons.join("; ")}</TD>
                    <TD className="text-right">
                      {r.phone && (
                        <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="text-ok hover:underline">
                          WA
                        </a>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </section>

      {/* Reminder pengajar — per-halaqah progress */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink-muted">
          Pengingat pengajar ({teachers.length}) — progres halaqah {monthLabel(data.month)}
        </h2>
        <details className="text-12 text-ink-muted">
          <summary className="cursor-pointer font-medium">Kenapa ada tanda ⚠ di tombol WA?</summary>
          <p className="mt-1.5">
            Nomor WA pengajar masih placeholder. Tombol WA membuka pesan siap-kirim; kalau nomornya
            belum diisi (⚠), WhatsApp terbuka tanpa kontak — pilih manual. Isi nomornya di{" "}
            <code>lib/hkm/teacher-phones.ts</code>.
          </p>
        </details>
        <TableWrap maxHeight="70vh">
          <Table>
            <THead sticky>
              <TR>
                <TH>Pengajar</TH>
                <TH>Halaqah</TH>
                <TH className="text-right">Peserta</TH>
                <TH className="text-right">Tercapai</TH>
                <TH numeric>Belum tercapai</TH>
                <TH className="text-right">Rata² capaian</TH>
                <TH numeric>Kirim WA</TH>
              </TR>
            </THead>
            {/* Tujuh kolom: zebra menjaga baris tetap terbaca. */}
            <TBody zebra>
              {teachers.map((t) => (
                <TR key={t.pengajar}>
                  <TD className="font-medium">{t.pengajar}</TD>
                  <TD className="text-ink-muted">{t.halaqah}</TD>
                  <TD className="text-right tabular-nums">{t.count}</TD>
                  <TD className="text-right tabular-nums text-ok">{t.tercapai}</TD>
                  <TD className="text-right tabular-nums">
                    {t.underperform > 0 ? <span className="text-warn">{t.underperform}</span> : "0"}
                  </TD>
                  <TD className="text-right tabular-nums">{t.avgCapaian}%</TD>
                  <TD className="text-right">
                    <a
                      href={t.waHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ok hover:underline"
                      title={t.hasPhone ? "Kirim reminder WA" : "Nomor belum diisi — pilih kontak manual"}
                    >
                      WA{t.hasPhone ? "" : " ⚠"}
                    </a>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </section>

      {/* Belum mulai */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink-muted">Belum mulai tilawah ({belumMulai.length})</h2>
        {belumMulai.length === 0 ? (
          <EmptyState
            tone="success"
            title="Semua peserta sudah mulai tilawah"
            description="Peserta yang belum punya satu pun setoran akan muncul di sini."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Nama</TH>
                  <TH>Halaqah</TH>
                  <TH>Pengajar</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {belumMulai.map((r) => (
                  <TR key={r.participantId}>
                    <TD className="font-medium">{r.nama}</TD>
                    <TD className="text-ink-muted">{r.halaqah ?? "—"}</TD>
                    <TD className="text-ink-muted">{r.pengajar ?? "—"}</TD>
                    <TD className="text-right">
                      {r.phone && (
                        <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="text-ok hover:underline">
                          WA
                        </a>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </section>

      {/* Data quality */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink-muted">Kualitas data</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <ReconCard title={`Internal tak terdaftar (${rc.unmatchedPulled.length})`} items={rc.unmatchedPulled.map((u) => u.name ?? u.email ?? "?")} />
          <ReconCard title={`Master tanpa email (${rc.noEmailMasters.length})`} items={rc.noEmailMasters.map((m) => `${m.nama} · ${m.halaqah ?? "?"}`)} />
          <ReconCard title={`Master tanpa data (${rc.noDataMasters.length})`} items={rc.noDataMasters.map((m) => `${m.nama} · ${m.halaqah ?? "?"}`)} />
        </div>
      </section>
    </main>
  );
}

type TeacherGroup = {
  pengajar: string;
  halaqah: string;
  count: number;
  tercapai: number;
  underperform: number;
  avgCapaian: number;
  waHref: string;
  hasPhone: boolean;
};

/**
 * Group participants by pengajar × halaqah (one reminder per halaqah — a teacher
 * holding several halaqah gets a separate row/message for each). The name is
 * canonicalized (folds "Al Fajar"→"Fajar") only for phone lookup + display.
 */
function buildTeacherGroups(rows: HkmParticipantRow[], month: string): TeacherGroup[] {
  const groups = new Map<string, HkmParticipantRow[]>();
  for (const r of rows) {
    const key = `${canonicalPengajar(r.pengajar)}||${r.halaqah ?? "—"}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const out: TeacherGroup[] = [];
  for (const [key, arr] of groups) {
    const [pengajar, halaqah] = key.split("||");
    const tercapai = arr.filter((a) => a.mCategory === "Tercapai").length;
    const underperform = arr.length - tercapai;
    const avgCapaian = arr.length ? Math.round((arr.reduce((s, a) => s + a.mCapaian, 0) / arr.length) * 10) / 10 : 0;
    const under = arr
      .filter((a) => a.mCategory !== "Tercapai")
      .sort((a, b) => b.mTarget - b.mRealisasi - (a.mTarget - a.mRealisasi));

    const msg = teacherReminderMessage(pengajar, halaqah, month, { count: arr.length, tercapai, underperform, avgCapaian }, under);
    const phone = getTeacherPhone(pengajar);
    const waHref = waLink(phone, msg) ?? `https://wa.me/?text=${encodeURIComponent(msg)}`;

    out.push({ pengajar, halaqah, count: arr.length, tercapai, underperform, avgCapaian, waHref, hasPhone: !!phone });
  }
  return out.sort((a, b) => b.underperform - a.underperform || a.pengajar.localeCompare(b.pengajar));
}

function teacherReminderMessage(
  pengajar: string,
  halaqah: string,
  month: string,
  s: { count: number; tercapai: number; underperform: number; avgCapaian: number },
  under: HkmParticipantRow[],
): string {
  const lines = [
    `Assalamu'alaikum Ustadz/ah ${pengajar} 🌙`,
    "",
    `Ringkasan tilawah halaqah ${halaqah} — ${monthLabel(month)}:`,
    `• ${s.count} peserta · ${s.tercapai} capai target · ${s.underperform} belum`,
    `• Rata² capaian: ${s.avgCapaian}%`,
  ];
  if (under.length > 0) {
    lines.push("", "Peserta yang perlu didorong:");
    for (const u of under) lines.push(`- ${u.nama} (${u.mRealisasi}/${u.mTarget} hal)`);
  }
  lines.push("", "Jazaakumullahu khairan atas bimbingannya 🙏");
  return lines.join("\n");
}

function ReconCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-card p-4 dark:border-neutral-800">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-ink-faint">—</div>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-ink-muted">
          {items.slice(0, 100).map((it, i) => (
            <li key={i}>{it}</li>
          ))}
          {items.length > 100 && <li className="text-ink-faint">…dan {items.length - 100} lagi</li>}
        </ul>
      )}
    </div>
  );
}
