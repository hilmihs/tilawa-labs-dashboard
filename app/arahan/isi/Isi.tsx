"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toRow, type Directive } from "@/lib/arahan/board";
import {
  geserPekan,
  labelPekan,
  PROGRAM_PEKANAN,
  type ProgramWeek,
} from "@/lib/arahan/program";
import { LAYAR_NAV, navLabel } from "@/components/shell/sections";
import {
  completeDirective,
  createDirective,
  saveProgramWeek,
  updateDirective,
  type FormState,
} from "./actions";

/**
 * Pengisian arahan untuk Task Board.
 *
 * Satu halaman dengan dua muka: menambah arahan baru, dan memperbarui checkpoint
 * arahan yang sudah jalan. Yang kedua justru yang paling sering dipakai — papan
 * ini hidup dari checkpoint yang segar, bukan dari daftar yang panjang — jadi
 * "Ubah" dibuat sedekat mungkin: satu ketukan dari daftar, form yang sama,
 * kursor tidak perlu mencari.
 */

const SUMBER = ["Dewan", "Board Chair", "Internal", "Lainnya"] as const;
const STAKEHOLDER_UMUM = ["Board Chair", "Dewan", "Tim Program", "Tim Administrasi"];

const KOSONG: FormState = { ok: false };

export function Isi({
  directives,
  today,
  serverNow,
  initialTab,
  programWeek,
  pekanLalu,
  pekanIni,
}: {
  directives: Directive[];
  today: string;
  serverNow: number;
  initialTab: "tambah" | "program";
  programWeek: ProgramWeek;
  pekanLalu: ProgramWeek;
  pekanIni: string;
}) {
  const [tab, setTab] = useState<"tambah" | "daftar" | "program">(initialTab);
  const [editing, setEditing] = useState<Directive | null>(null);

  const rows = useMemo(
    () =>
      directives
        .map((d) => toRow(d, serverNow))
        .sort((a, b) => b.age - a.age),
    [directives, serverNow],
  );

  // Baris yang sedang diubah dibaca ulang dari props tiap render: sesudah aksi
  // selesai dan router.refresh() membawa data baru, form harus menampilkan yang
  // baru tersimpan, bukan salinan basi yang ikut tertahan di state.
  const current = editing ? (directives.find((d) => d.id === editing.id) ?? editing) : null;

  if (current) {
    return (
      <main className="isi">
        <div className="isi-wrap">
          <IsiNav />
          <header className="isi-head">
            <h1>Ubah Arahan</h1>
            <p>Perbarui checkpoint atau perbaiki detailnya.</p>
          </header>
          <ArahanForm
            key={current.id}
            mode="ubah"
            initial={current}
            today={today}
            onDone={() => setEditing(null)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="isi">
      <div className="isi-wrap">
        <IsiNav />
        <header className="isi-head">
          <h1>Task Board</h1>
          <p>Board Directives · terisi otomatis ke papan TV</p>
        </header>

        <div className="isi-tabs" role="tablist" aria-label="Mode pengisian">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tambah"}
            className="isi-tab"
            onClick={() => setTab("tambah")}
          >
            Tambah
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "daftar"}
            className="isi-tab"
            onClick={() => setTab("daftar")}
          >
            Arahan Aktif ({rows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "program"}
            className="isi-tab"
            onClick={() => setTab("program")}
          >
            Program
          </button>
        </div>

        {tab === "program" ? (
          <ProgramForm
            key={programWeek.weekStart}
            week={programWeek}
            pekanLalu={pekanLalu}
            pekanIni={pekanIni}
          />
        ) : tab === "tambah" ? (
          <ArahanForm mode="tambah" initial={null} today={today} />
        ) : rows.length === 0 ? (
          <div className="isi-empty">
            Belum ada arahan aktif. Tambahkan lewat tab Tambah dan papan akan langsung
            memperbaruinya.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r) => {
              const d = directives.find((x) => x.id === r.id)!;
              return (
                <div className="isi-card" key={r.id}>
                  <div className="isi-bar" style={{ background: r.color }} />
                  <div className="isi-card-body">
                    <div className="isi-card-title">{r.title}</div>
                    <div className="isi-card-meta">
                      {r.pic} · diminta {r.date}
                    </div>
                    <div className="isi-card-cp">{r.checkpoint}</div>
                    <div className="isi-card-cp" style={{ color: r.updColor }}>
                      {r.stale ? "● " : ""}
                      {r.upd}
                    </div>
                  </div>
                  <div className="isi-card-side">
                    <div className="isi-age" style={{ color: r.color }}>
                      {r.age} <span>hari</span>
                    </div>
                    <button type="button" className="isi-edit" onClick={() => setEditing(d)}>
                      Ubah
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="isi-foot">
          <span>Halaman ini terbuka untuk semua yang punya tautannya.</span>
          <Link href="/arahan">Lihat papan →</Link>
        </footer>
      </div>
    </main>
  );
}

/**
 * Jalan keluar untuk form ini.
 *
 * Papannya (/arahan) memakai pil melayang yang nyaris tak terlihat karena ia
 * menempel di TV; halaman ini kebalikannya — dibuka dari HP, dibaca dari atas ke
 * bawah — jadi navigasinya ikut alur baca, di dalam kolom yang sama, bukan
 * melayang menutupi judul. Sumber tautannya sama: LAYAR_NAV.
 */
function IsiNav() {
  const siblings = LAYAR_NAV.filter((item) => item.href !== "/arahan/isi");
  return (
    <nav className="isi-nav" aria-label="Navigasi layar">
      <Link href="/" className="isi-nav-home">
        ← Dashboard
      </Link>
      {siblings.map((item) => (
        <Link key={item.href} href={item.href}>
          {navLabel(item)}
        </Link>
      ))}
    </nav>
  );
}

function ArahanForm({
  mode,
  initial,
  today,
  onDone,
}: {
  mode: "tambah" | "ubah";
  initial: Directive | null;
  today: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormState>(KOSONG);
  const [pending, startTransition] = useTransition();

  const presetSource = initial && (SUMBER as readonly string[]).includes(initial.source);
  const [source, setSource] = useState(
    initial ? (presetSource ? initial.source : "Lainnya") : "Dewan",
  );
  const [sourceOther, setSourceOther] = useState(initial && !presetSource ? initial.source : "");
  const [tags, setTags] = useState<string[]>(initial?.stakeholders ?? []);
  const [draftTag, setDraftTag] = useState("");

  const addTag = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setTags((t) => (t.some((x) => x.toLowerCase() === v.toLowerCase()) ? t : [...t, v]));
    setDraftTag("");
  };

  // Aksinya dipanggil langsung di dalam transition, bukan lewat useActionState,
  // supaya "apa yang terjadi sesudah simpan berhasil" bisa ditulis di satu tempat
  // di sini — bukan sebagai efek yang mengintip hasil aksi dan menembakkan
  // setState susulan setiap kali hasilnya berubah.
  //
  // Pada mode tambah form dikosongkan: orang biasanya memasukkan beberapa arahan
  // berturut-turut sesudah rapat, dan field yang masih terisi bikin ragu apakah
  // yang tadi benar-benar tersimpan.
  const submit = (fd: FormData) => {
    startTransition(async () => {
      const res = await (mode === "tambah" ? createDirective : updateDirective)(KOSONG, fd);
      setState(res);
      if (!res.ok) return;
      router.refresh();
      if (mode === "tambah") {
        formRef.current?.reset();
        setTags([]);
        setDraftTag("");
        setSource("Dewan");
        setSourceOther("");
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {state.error && <div className="isi-note isi-note-err">{state.error}</div>}
      {state.ok && state.message && <div className="isi-note isi-note-ok">{state.message}</div>}

      <form ref={formRef} action={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <div className="isi-field">
          <label className="isi-label" htmlFor="title">
            Arahan / Tugas <span className="req">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={160}
            autoComplete="off"
            defaultValue={initial?.title ?? ""}
            placeholder="Rekap Program Belum Berjalan"
          />
        </div>

        <div className="isi-field">
          <label className="isi-label" htmlFor="source">
            Sumber Permintaan <span className="req">*</span>
          </label>
          <select
            id="source"
            name="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {SUMBER.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {source === "Lainnya" && (
            <input
              name="sourceOther"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
              value={sourceOther}
              onChange={(e) => setSourceOther(e.target.value)}
              placeholder="Tulis sumbernya, mis. Ustadz Hamid"
            />
          )}
        </div>

        <div className="isi-field">
          <label className="isi-label" htmlFor="pic">
            PIC <span className="req">*</span>
          </label>
          <input
            id="pic"
            name="pic"
            type="text"
            required
            maxLength={80}
            autoComplete="off"
            defaultValue={initial?.pic ?? ""}
            placeholder="Tim Kaderisasi"
          />
          <div className="isi-hint">Nama tim atau peran, bukan data pribadi.</div>
        </div>

        <div className="isi-field">
          <span className="isi-label">
            Stakeholder <span className="req">*</span>
          </span>
          <input type="hidden" name="stakeholders" value={JSON.stringify(tags)} />
          <div className="isi-chips">
            {tags.map((t) => (
              <span className="isi-chip" key={t}>
                {t}
                <button
                  type="button"
                  aria-label={`Hapus ${t}`}
                  onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={draftTag}
            autoComplete="off"
            onChange={(e) => setDraftTag(e.target.value)}
            onKeyDown={(e) => {
              // Enter menambah chip, bukan mengirim form — kalau tidak, orang
              // yang mengetik stakeholder kedua malah menyimpan arahannya.
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(draftTag);
              }
            }}
            onBlur={() => addTag(draftTag)}
            placeholder="Ketik lalu Enter…"
          />
          <div className="isi-chips">
            {STAKEHOLDER_UMUM.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())).map(
              (s) => (
                <button key={s} type="button" className="isi-suggest" onClick={() => addTag(s)}>
                  + {s}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="isi-field">
          <label className="isi-label" htmlFor="requestedAt">
            Tanggal Permintaan <span className="req">*</span>
          </label>
          <input
            id="requestedAt"
            name="requestedAt"
            type="date"
            required
            defaultValue={initial?.requestedAt ?? today}
          />
          <div className="isi-hint">Default hari ini. Usia arahan dihitung dari tanggal ini.</div>
        </div>

        <div className="isi-field">
          <label className="isi-label" htmlFor="checkpoint">
            Checkpoint Progres <span className="opt">· opsional</span>
          </label>
          <textarea
            id="checkpoint"
            name="checkpoint"
            maxLength={1200}
            defaultValue={initial?.checkpoint ?? ""}
            placeholder="Tulis apa yang sudah dan belum terjadi. Contoh: “Format rekap disiapkan: rencana, kendala, rekomendasi, timeline.”"
          />
          <div className="isi-hint">
            Tanggal “diperbarui” di papan hanya bergerak kalau teks ini berubah.
          </div>
        </div>

        <button type="submit" className="isi-btn" disabled={pending}>
          {pending ? "Menyimpan…" : mode === "tambah" ? "Simpan" : "Simpan Perubahan"}
        </button>
      </form>

      {initial && (
        <>
          <SelesaiButton id={initial.id} onDone={onDone} />
          <button type="button" className="isi-btn isi-btn-ghost" onClick={onDone}>
            Kembali ke daftar
          </button>
        </>
      )}
    </div>
  );
}

function SelesaiButton({ id, onDone }: { id: string; onDone?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const selesaikan = (fd: FormData) => {
    startTransition(async () => {
      const res = await completeDirective(KOSONG, fd);
      if (!res.ok) {
        setError(res.error ?? "Gagal menandai selesai.");
        return;
      }
      router.refresh();
      onDone?.();
    });
  };

  if (!confirming) {
    return (
      <button type="button" className="isi-btn isi-btn-danger" onClick={() => setConfirming(true)}>
        Tandai selesai
      </button>
    );
  }

  return (
    <form action={selesaikan} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="id" value={id} />
      <div className="isi-note isi-note-err">
        {error ?? "Arahan ini akan turun dari papan. Datanya tetap tersimpan dan bisa dikembalikan."}
      </div>
      <button type="submit" className="isi-btn isi-btn-danger" disabled={pending}>
        {pending ? "Memproses…" : "Ya, tandai selesai"}
      </button>
      <button type="button" className="isi-btn isi-btn-ghost" onClick={() => setConfirming(false)}>
        Batal
      </button>
    </form>
  );
}

/**
 * Fokus pekanan semua program dalam satu form — diisi sekali sesudah rapat
 * pekanan, persis seperti papan tulisnya. Pindah pekan lewat URL (?pekan=),
 * supaya tautan pekan tertentu bisa dibagikan dan data selalu dibaca ulang
 * dari server.
 */
function ProgramForm({
  week,
  pekanLalu,
  pekanIni,
}: {
  week: ProgramWeek;
  pekanLalu: ProgramWeek;
  pekanIni: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(KOSONG);
  const [pending, startTransition] = useTransition();

  const isi = (list: ProgramWeek, program: string) =>
    list.tasks.find((t) => t.program.toLowerCase() === program.toLowerCase())?.task ?? "";

  const submit = (fd: FormData) => {
    startTransition(async () => {
      const res = await saveProgramWeek(KOSONG, fd);
      setState(res);
      if (res.ok) router.refresh();
    });
  };

  const href = (senin: string) => `/arahan/isi?pekan=${senin}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="isi-week">
        <Link className="isi-week-nav" href={href(geserPekan(week.weekStart, -1))} aria-label="Pekan sebelumnya">
          ‹
        </Link>
        <div className="isi-week-label">
          <strong>{labelPekan(week.weekStart)}</strong>
          <span>
            {week.weekStart === pekanIni
              ? "Pekan berjalan · tampil di papan"
              : week.weekStart < pekanIni
                ? "Pekan lalu"
                : "Pekan mendatang"}
          </span>
        </div>
        <Link className="isi-week-nav" href={href(geserPekan(week.weekStart, 1))} aria-label="Pekan berikutnya">
          ›
        </Link>
      </div>

      <form action={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <input type="hidden" name="weekStart" value={week.weekStart} />
        {PROGRAM_PEKANAN.map((program, i) => {
          const lalu = isi(pekanLalu, program);
          return (
            <div className="isi-field" key={program}>
              <label className="isi-label" htmlFor={`task-${program}`}>
                {i + 1}. {program}
              </label>
              <input
                id={`task-${program}`}
                name={`task:${program}`}
                type="text"
                maxLength={160}
                autoComplete="off"
                defaultValue={isi(week, program)}
                placeholder={lalu ? `Pekan lalu: ${lalu}` : "Fokus pekan ini"}
              />
            </div>
          );
        })}
        <div className="isi-hint">Kosongkan kolom untuk menghapus program itu dari pekan ini.</div>
        {/* Pesan hasil di dekat tombol, bukan di atas form: sesudah menggulir
            sembilan kolom di HP, bagian atas sudah jauh di luar layar. */}
        {state.error && <div className="isi-note isi-note-err">{state.error}</div>}
        {state.ok && state.message && <div className="isi-note isi-note-ok">{state.message}</div>}
        <button type="submit" className="isi-btn" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan Pekan Ini"}
        </button>
      </form>
    </div>
  );
}
