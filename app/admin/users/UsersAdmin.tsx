"use client";

import { useState, useTransition } from "react";
import type { Role } from "@/lib/auth/session";
import type { StaffRow, SyncSource } from "@/lib/admin/service";
import { DIVISIONS, DIVISION_LABEL, type Division } from "@/lib/tv/divisions";
import { EmptyState } from "@/components/ui/empty-state";
import type { DivisionGrant } from "@/lib/news/service";
import {
  createStaffAction,
  setRoleAction,
  resetPasswordAction,
  grantAction,
  revokeAction,
  setDivisionAction,
  syncAction,
} from "./actions";

type Program = { slug: string; name: string };
type Msg = { kind: "ok" | "err"; text: string } | null;
type DivisionRole = "contributor" | "curator" | null;

export function UsersAdmin({
  staff,
  programs,
  divisionGrants,
}: {
  staff: StaffRow[];
  programs: Program[];
  divisionGrants: DivisionGrant[];
}) {
  const [msg, setMsg] = useState<Msg>(null);
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

      <SyncPanel disabled={pending} flash={flash} start={start} />

      <MasterImportPanel programs={programs} disabled={pending} flash={flash} start={start} />

      <CreateForm
        programs={programs}
        disabled={pending}
        onSubmit={(input) =>
          start(async () => {
            const res = await createStaffAction(input);
            flash(
              res.ok
                ? { kind: "ok", text: `Akun dibuat: ${res.data.email}` }
                : { kind: "err", text: res.error },
            );
          })
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-muted">
          Akun ({staff.length})
        </h2>
        {staff.length === 0 ? (
          <EmptyState
            title="Belum ada akun staf"
            description="Akun yang dibuat lewat formulir di atas muncul di sini beserta role, akses program, dan divisi kabarnya."
          />
        ) : (
        <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {staff.map((s) => (
            <StaffCard
              key={s.id}
              row={s}
              programs={programs}
              divisions={divisionsOf(divisionGrants, s.id)}
              disabled={pending}
              onDivision={(division, role) =>
                start(async () => {
                  const res = await setDivisionAction({ email: s.email, division, role });
                  flash(
                    res.ok
                      ? {
                          kind: "ok",
                          text: role
                            ? `${s.email} → ${DIVISION_LABEL[division]} (${role})`
                            : `${s.email} keluar dari ${DIVISION_LABEL[division]}`,
                        }
                      : { kind: "err", text: res.error },
                  );
                })
              }
              onRole={(role) =>
                start(async () => {
                  const res = await setRoleAction({ email: s.email, role });
                  flash(
                    res.ok
                      ? { kind: "ok", text: `Role ${s.email} → ${role}` }
                      : { kind: "err", text: res.error },
                  );
                })
              }
              onResetPassword={(password, done) =>
                start(async () => {
                  const res = await resetPasswordAction({ email: s.email, password });
                  if (res.ok) done();
                  flash(
                    res.ok
                      ? { kind: "ok", text: `Password ${s.email} direset.` }
                      : { kind: "err", text: res.error },
                  );
                })
              }
              onToggle={(slug, granted) =>
                start(async () => {
                  const res = granted
                    ? await revokeAction({ email: s.email, slugs: [slug] })
                    : await grantAction({ email: s.email, slugs: [slug] });
                  flash(
                    res.ok
                      ? { kind: "ok", text: `${granted ? "Revoke" : "Grant"} ${slug} → ${s.email}` }
                      : { kind: "err", text: res.error },
                  );
                })
              }
            />
          ))}
        </div>
        )}
      </section>
    </div>
  );
}

/** The division roles one staff member holds, keyed by division. */
function divisionsOf(grants: DivisionGrant[], staffId: string): Partial<Record<Division, DivisionRole>> {
  const out: Partial<Record<Division, DivisionRole>> = {};
  for (const g of grants) {
    if (g.staffId !== staffId) continue;
    out[g.division as Division] = g.role === "curator" ? "curator" : "contributor";
  }
  return out;
}

/** Click cycles: none → contributor → curator → none. */
function nextDivisionRole(current: DivisionRole): DivisionRole {
  if (!current) return "contributor";
  return current === "contributor" ? "curator" : null;
}

function SyncPanel({
  disabled,
  flash,
  start,
}: {
  disabled: boolean;
  flash: (m: Msg) => void;
  start: (cb: () => void) => void;
}) {
  function run(source: SyncSource, label: string) {
    start(async () => {
      const res = await syncAction({ source });
      if (!res.ok) {
        flash({ kind: "err", text: `Sync ${label} gagal: ${res.error}` });
        return;
      }
      if (res.data.skipped) {
        flash({ kind: "ok", text: `Sync ${label} dilewati — sync lain sedang jalan.` });
        return;
      }
      const items = res.data.items;
      const failed = items.filter((i) => !i.ok);
      flash(
        failed.length === 0
          ? { kind: "ok", text: `Sync ${label} selesai — ${items.length} program OK.` }
          : {
              kind: "err",
              text: `Sync ${label}: ${items.length - failed.length}/${items.length} OK, gagal: ${failed
                .map((f) => f.programSlug)
                .join(", ")}`,
            },
      );
    });
  }

  // Tarikan penuh dari sumber: mahal, dan bukan pekerjaan utama layar ini.
  // Ditulis sebagai tombol kecil yang tenang, bukan sederet tombol setara
  // tombol "Buat" akun di bawahnya.
  const btn =
    "rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:border-neutral-500 dark:border-neutral-700";

  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold text-ink-muted">
        Jalankan sync
      </h2>
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={disabled} onClick={() => run("hkm", "HKM")}>
          Sync HKM
        </button>
        <button className={btn} disabled={disabled} onClick={() => run("tilawah", "Tilawah")}>
          Sync Tilawah
        </button>
        <button className={btn} disabled={disabled} onClick={() => run("mabni", "Boarding")}>
          Sync Boarding
        </button>
        <button className={btn} disabled={disabled} onClick={() => run("all", "Semua")}>
          Sync Semua
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Tarik data dari sumber (sama seperti cron). Sinkron — tunggu sampai selesai; dilewati kalau
        sync lain sedang jalan.
      </p>
    </section>
  );
}

function MasterImportPanel({
  programs,
  disabled,
  flash,
  start,
}: {
  programs: Program[];
  disabled: boolean;
  flash: (m: Msg) => void;
  start: (cb: () => void) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [program, setProgram] = useState("hkm");

  const input =
    "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("program", program);
    start(async () => {
      try {
        const res = await fetch("/api/admin/import-hkm-master", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          flash({ kind: "err", text: `Import gagal: ${body.error ?? res.statusText}` });
          return;
        }
        const d = body.data;
        flash({
          kind: "ok",
          text: `Master "${d.programSlug}" diimpor — ${d.upserted} peserta (${d.withEmail} ada email, ${d.noEmail} tanpa email). Klik Sync HKM untuk tarik data.`,
        });
        setFile(null);
      } catch (err) {
        flash({ kind: "err", text: `Import gagal: ${err instanceof Error ? err.message : String(err)}` });
      }
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold text-ink-muted">Import master peserta</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={disabled}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:border-neutral-700 dark:file:bg-neutral-900"
        />
        <select className={input} value={program} onChange={(e) => setProgram(e.target.value)}>
          {programs.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.slug}
            </option>
          ))}
        </select>
        <button
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:border-neutral-500 dark:border-neutral-700"
          disabled={disabled || !file}
          onClick={upload}
        >
          Import
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Upload roster master (CSV/XLSX) — sumber halaqah/pengajar/gender. Menggantikan baris master
        lama program itu (idempoten). File berisi PII, tidak disimpan di git. Setelah import, klik
        <span className="font-medium"> Sync HKM</span>.
      </p>
    </section>
  );
}

function CreateForm({
  programs,
  disabled,
  onSubmit,
}: {
  programs: Program[];
  disabled: boolean;
  onSubmit: (input: { email: string; password: string; name?: string; role?: Role }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("coordinator");

  const input =
    "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold text-ink-muted">Tambah akun</h2>
      <div className="flex flex-wrap gap-2">
        <input
          className={input}
          placeholder="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={input}
          placeholder="password (min 8)"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className={input}
          placeholder="nama (opsional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="coordinator">coordinator</option>
          <option value="super_coordinator">super_coordinator</option>
        </select>
        <button
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          disabled={disabled || !email || password.length < 8}
          onClick={() => {
            onSubmit({ email, password, name: name || undefined, role });
            setEmail("");
            setPassword("");
            setName("");
          }}
        >
          Buat
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Password di-hash bcrypt di server. Untuk grant program, buat akun dulu lalu centang di bawah.
      </p>
    </section>
  );
}

function StaffCard({
  row,
  programs,
  divisions,
  disabled,
  onRole,
  onResetPassword,
  onToggle,
  onDivision,
}: {
  row: StaffRow;
  programs: Program[];
  divisions: Partial<Record<Division, DivisionRole>>;
  disabled: boolean;
  onRole: (role: Role) => void;
  onResetPassword: (password: string, done: () => void) => void;
  onToggle: (slug: string, granted: boolean) => void;
  onDivision: (division: Division, role: DivisionRole) => void;
}) {
  const isSuper = row.role === "super_coordinator";
  const [password, setPassword] = useState("");
  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{row.email}</div>
          {row.name && <div className="text-xs text-ink-muted">{row.name}</div>}
        </div>
        <select
          className="ml-auto rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          value={row.role}
          disabled={disabled}
          onChange={(e) => onRole(e.target.value as Role)}
        >
          <option value="coordinator">coordinator</option>
          <option value="super_coordinator">super_coordinator</option>
        </select>
      </div>

      {/* Password shown as plain text on purpose — whoever resets it has to read
          the value back to pass it on to the account holder. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          placeholder="password baru (min 8)"
          type="text"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:border-neutral-500 dark:border-neutral-700"
          disabled={disabled || password.length < 8}
          onClick={() => onResetPassword(password, () => setPassword(""))}
        >
          Reset password
        </button>
      </div>
      {isSuper ? (
        <p className="text-xs text-ink-muted">
          super_coordinator melihat semua program (grant per-program diabaikan).
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {programs.map((p) => {
            const granted = row.programs.includes(p.slug);
            return (
              <button
                key={p.slug}
                disabled={disabled}
                onClick={() => onToggle(p.slug, granted)}
                title={p.name}
                className={`rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-50 ${
                  granted
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                    : "border-neutral-300 text-ink-muted dark:border-neutral-700"
                }`}
              >
                {granted ? "✓ " : "+ "}
                {p.slug}
              </button>
            );
          })}
        </div>
      )}

      {/* Divisi kabar /tv. Independent of program grants — a super_coordinator
          already curates every division, so the chips are informational there. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-muted">Kabar /tv:</span>
        {DIVISIONS.map((d) => {
          const role = divisions[d] ?? null;
          return (
            <button
              key={d}
              disabled={disabled}
              title={
                isSuper
                  ? "super_coordinator sudah jadi kurator semua divisi"
                  : "klik: kontributor → kurator → keluar"
              }
              onClick={() => onDivision(d, nextDivisionRole(role))}
              className={`rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-50 ${
                role === "curator"
                  ? "border-brand-bronze bg-brand-gold-tint text-brand-ink dark:border-brand-gold/50 dark:bg-brand-gold/15 dark:text-brand-gold"
                  : role === "contributor"
                    ? "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200"
                    : "border-neutral-300 text-ink-muted dark:border-neutral-700"
              }`}
            >
              {DIVISION_LABEL[d]}
              {role === "curator" ? " · kurator" : role === "contributor" ? " · kontributor" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
