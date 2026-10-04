"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, IdCard, ListPlus, Nfc, Search, UserPlus, X } from "lucide-react";
import { Inisial, isian, kartu, labelMikro, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { Badge } from "@/components/ui/badge";
import type { HasilIsiAwal, OrangDicari } from "@/lib/kerja/anggota";
import { cn } from "@/lib/utils";
import { aturAktifAksi, cabutNfcAksi, cariAksi, isiAwalAksi, pasangNfcAksi, pindahAksi, tambahAksi, tautkanAwalAksi } from "./actions";

export type BarisPengurus = {
  id: string; // kerja_anggota.id
  orangId: string;
  nama: string;
  gender: string;
  kodeQr: string;
  aktif: boolean;
  uidSamar: string | null;
};

type Pesan = { teks: string; galat: boolean } | null;

const ikon =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-card text-neutral-700 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35 dark:border-neutral-700 dark:text-neutral-200 [&_svg]:size-3.5";
const KATEGORI: Record<string, string> = { pengajar: "Pengajar", pengurus: "Pengurus", umum: "Umum" };

export function KelolaPengurus({ baris, belumAwal, totalAwal }: { baris: BarisPengurus[]; belumAwal: number; totalAwal: number }) {
  const [pesan, setPesan] = useState<Pesan>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [hasilAwal, setHasilAwal] = useState<HasilIsiAwal | null>(null);
  const [nfcUntuk, setNfcUntuk] = useState<string | null>(null);

  /**
   * Jalankan satu aksi; `kunci` menandai tombol yang sedang menunggu. Galat
   * `diBaris` ditampilkan pemanggil di barisnya sendiri, bukan di pesan umum.
   */
  const jalan: Jalan = async (kunci, f, berhasil, diBaris = false) => {
    setSibuk(kunci);
    try {
      const h = await f();
      if (h.ok) setPesan(berhasil ? { teks: berhasil, galat: false } : null);
      else setPesan(diBaris ? null : { teks: h.error, galat: true });
      return h;
    } catch {
      const h = { ok: false as const, error: "Gagal menyimpan. Periksa koneksi lalu coba lagi." };
      setPesan(diBaris ? null : { teks: h.error, galat: true });
      return h;
    } finally {
      setSibuk(null);
    }
  };

  async function isiAwal() {
    setSibuk("awal");
    try {
      const h = await isiAwalAksi();
      setHasilAwal(h);
      setPesan(null);
    } catch {
      setPesan({ teks: "Gagal mengisi daftar awal. Coba lagi.", galat: true });
    } finally {
      setSibuk(null);
    }
  }

  async function putuskan(indeks: number, orangId: string, nama: string) {
    const h = await jalan(`awal-${indeks}`, () => tautkanAwalAksi(indeks, orangId), `${nama} masuk daftar.`);
    if (h.ok) setHasilAwal((x) => (x ? { ...x, ambigu: x.ambigu.filter((a) => a.indeks !== indeks) } : x));
  }

  const ikhwan = baris.filter((b) => b.gender !== "P");
  const akhwat = baris.filter((b) => b.gender === "P");
  const sudahDiDaftar = new Set(baris.filter((b) => b.aktif).map((b) => b.orangId));

  return (
    <div className="flex flex-col gap-5">
      {(belumAwal > 0 || hasilAwal) && (
        <section className={cn(kartu, "flex flex-col gap-3 px-4 py-3.5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-14 font-semibold">Daftar awal dari logbook kertas</h2>
              <p className="mt-0.5 text-12 text-ink-muted">
                {belumAwal > 0
                  ? `${belumAwal} dari ${totalAwal} nama belum ada di daftar. Nama dicocokkan ke Daftar Individu; yang tak ditemukan dibuatkan orang baru (perlu review).`
                  : `Semua ${totalAwal} nama sudah ada di daftar.`}
              </p>
            </div>
            {belumAwal > 0 && (
              <button type="button" onClick={isiAwal} disabled={sibuk !== null} className={cn(tombolUtama, "h-auto min-h-9 shrink py-2 text-left")}>
                <ListPlus className="size-4" /> {sibuk === "awal" ? "Mengisi…" : `Isi daftar awal (${totalAwal} nama dari logbook kertas)`}
              </button>
            )}
          </div>

          {hasilAwal && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <p className="text-12 text-neutral-700 dark:text-neutral-300">
                <b>{hasilAwal.tertaut}</b> tertaut ke orang yang sudah ada · <b>{hasilAwal.dibuat}</b> dibuat baru ·{" "}
                <b>{hasilAwal.sudahAda}</b> sudah ada sebelumnya
                {hasilAwal.ambigu.length > 0 && (
                  <>
                    {" "}
                    · <b className="text-warn">{hasilAwal.ambigu.length}</b> perlu dipilih
                  </>
                )}
              </p>
              {hasilAwal.ambigu.map((a) => (
                <div key={a.indeks} className="rounded-[10px] border border-amber-200 bg-amber-50/60 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-14 font-semibold">“{a.nama}”</span>
                    <span className="text-12 text-ink-muted">
                      {a.gender === "P" ? "Akhwat" : "Ikhwan"} · {a.kandidat.length} kandidat — pilih orangnya
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {a.kandidat.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 basis-40 text-12 sm:text-14">
                          {c.nama}{" "}
                          <Badge tone={c.kategori === "pengurus" ? "teal" : "neutral"} className="ml-1 text-11">
                            {KATEGORI[c.kategori] ?? c.kategori}
                          </Badge>
                        </span>
                        <span className="font-mono text-11 text-ink-muted">{c.kodeQr}</span>
                        <button
                          type="button"
                          disabled={sibuk !== null}
                          onClick={() => putuskan(a.indeks, c.id, c.nama)}
                          className={cn(tombolGaris, "h-8")}
                        >
                          Pilih
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={sibuk !== null}
                    onClick={() => putuskan(a.indeks, "baru", a.nama)}
                    className="mt-2 text-12 font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Bukan salah satunya — buat orang baru “{a.nama}”
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <TambahOrang sudahDiDaftar={sudahDiDaftar} sibuk={sibuk} jalan={jalan} />

      {pesan && (
        <p role="status" className={cn("text-12", pesan.galat ? "text-danger" : "text-ok")}>
          {pesan.teks}
        </p>
      )}

      {baris.length === 0 ? (
        <p className={cn(kartu, "px-4 py-6 text-center text-14 text-ink-muted")}>Belum ada pengurus di daftar.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Kelompok judul="Ikhwan" baris={ikhwan} sibuk={sibuk} jalan={jalan} nfcUntuk={nfcUntuk} setNfcUntuk={setNfcUntuk} />
          <Kelompok judul="Akhwat" baris={akhwat} sibuk={sibuk} jalan={jalan} nfcUntuk={nfcUntuk} setNfcUntuk={setNfcUntuk} />
        </div>
      )}
    </div>
  );
}

type Hasil = { ok: true } | { ok: false; error: string };
type Jalan = (kunci: string, f: () => Promise<Hasil>, berhasil?: string, diBaris?: boolean) => Promise<Hasil>;

function TambahOrang({ sudahDiDaftar, sibuk, jalan }: { sudahDiDaftar: Set<string>; sibuk: string | null; jalan: Jalan }) {
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<OrangDicari[]>([]);
  const [mencari, setMencari] = useState(false);
  const nomor = useRef(0);

  // Cari setelah jeda ketik; jawaban lama yang datang belakangan dibuang.
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setHasil([]);
      return;
    }
    const n = ++nomor.current;
    const tunda = setTimeout(async () => {
      setMencari(true);
      try {
        const r = await cariAksi(t);
        if (n === nomor.current) setHasil(r);
      } finally {
        if (n === nomor.current) setMencari(false);
      }
    }, 250);
    return () => clearTimeout(tunda);
  }, [q]);

  return (
    <section className={cn(kartu, "px-4 py-3.5")}>
      <label htmlFor="cari-pengurus" className={labelMikro}>
        Tambah pengurus
      </label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          id="cari-pengurus"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama di Daftar Individu…"
          autoComplete="off"
          className={cn(isian, "pl-9")}
        />
      </div>
      {q.trim().length >= 2 && (
        <ul className="mt-2 divide-y divide-border">
          {hasil.length === 0 && (
            <li className="py-2 text-12 text-ink-muted">{mencari ? "Mencari…" : "Tidak ada yang cocok."}</li>
          )}
          {hasil.map((o) => {
            const ada = o.anggota || sudahDiDaftar.has(o.id);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                <Inisial nama={o.nama} gender={o.gender} className="size-8" />
                <div className="min-w-0 flex-1 basis-36">
                  <div className="truncate text-12 font-semibold sm:text-14">{o.nama}</div>
                  <div className="text-11 text-ink-muted">
                    {o.gender === "P" ? "Akhwat" : "Ikhwan"} · {KATEGORI[o.kategori] ?? o.kategori} · <span className="font-mono">{o.kodeQr}</span>
                  </div>
                </div>
                {ada ? (
                  <Badge tone="success" className="text-11">
                    sudah di daftar
                  </Badge>
                ) : (
                  <button
                    type="button"
                    disabled={sibuk !== null}
                    className={cn(tombolGaris, "h-8")}
                    onClick={async () => {
                      if ((await jalan(`tambah-${o.id}`, () => tambahAksi(o.id), `${o.nama} ditambahkan.`)).ok) setQ("");
                    }}
                  >
                    <UserPlus className="size-3.5" /> Tambah
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Kelompok({
  judul,
  baris,
  sibuk,
  jalan,
  nfcUntuk,
  setNfcUntuk,
}: {
  judul: string;
  baris: BarisPengurus[];
  sibuk: string | null;
  jalan: Jalan;
  nfcUntuk: string | null;
  setNfcUntuk: (id: string | null) => void;
}) {
  const aktif = baris.filter((b) => b.aktif).length;
  return (
    <section className={cn(kartu, "min-w-0 overflow-hidden")}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-14 font-semibold">{judul}</h2>
        <span className="text-12 tabular-nums text-ink-muted">
          {aktif} aktif{baris.length > aktif ? ` · ${baris.length - aktif} nonaktif` : ""}
        </span>
      </div>
      {baris.length === 0 ? (
        <p className="px-4 py-4 text-12 text-ink-muted">Belum ada.</p>
      ) : (
        <ul className="divide-y divide-border">
          {baris.map((b, i) => (
            <Baris
              key={b.id}
              b={b}
              no={i + 1}
              pertama={i === 0}
              terakhir={i === baris.length - 1}
              sibuk={sibuk}
              jalan={jalan}
              nfcBuka={nfcUntuk === b.orangId}
              setNfcUntuk={setNfcUntuk}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Baris({
  b,
  no,
  pertama,
  terakhir,
  sibuk,
  jalan,
  nfcBuka,
  setNfcUntuk,
}: {
  b: BarisPengurus;
  no: number;
  pertama: boolean;
  terakhir: boolean;
  sibuk: string | null;
  jalan: Jalan;
  nfcBuka: boolean;
  setNfcUntuk: (id: string | null) => void;
}) {
  const [uid, setUid] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const tunggu = sibuk !== null;

  async function pasang() {
    if (!uid.trim()) return;
    const h = await jalan(`nfc-${b.orangId}`, () => pasangNfcAksi(b.orangId, uid), `Chip terpasang di ${b.nama}.`, true);
    // Isian dikosongkan juga saat gagal: tap berikutnya dari pembaca mulai bersih.
    setUid("");
    setGalat(h.ok ? null : h.error);
    if (h.ok) setNfcUntuk(null);
  }

  async function cabut() {
    if (!window.confirm(`Cabut chip NFC ${b.nama}? Kartu lama tidak lagi dikenali lewat tap NFC (QR tetap berlaku).`)) return;
    await jalan(`nfc-${b.orangId}`, () => cabutNfcAksi(b.orangId), `Chip ${b.nama} dicabut.`);
  }

  return (
    <li className={cn("px-4 py-2.5", !b.aktif && "bg-neutral-50 dark:bg-neutral-900/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-5 shrink-0 text-right text-12 tabular-nums text-ink-muted">{no}</span>
        <Inisial nama={b.nama} gender={b.gender} className={cn("size-8", !b.aktif && "opacity-50")} />
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("text-12 font-semibold sm:text-14", !b.aktif && "text-ink-muted")}>{b.nama}</span>
            {!b.aktif && (
              <Badge tone="neutral" className="text-11">
                nonaktif
              </Badge>
            )}
          </div>
          <div className="mt-px flex flex-wrap items-center gap-x-2 gap-y-1 text-11 text-ink-muted">
            <span className="font-mono">{b.kodeQr}</span>
            {b.uidSamar ? (
              <Badge tone="teal" className="gap-1 text-11" title="Chip NFC terpasang">
                <Nfc className="size-3" /> <span className="font-mono">{b.uidSamar}</span>
              </Badge>
            ) : (
              <Badge tone="neutral" className="text-11">
                tanpa chip
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Naikkan"
            aria-label={`Naikkan ${b.nama}`}
            disabled={pertama || tunggu}
            className={ikon}
            onClick={() => jalan(`pindah-${b.id}`, () => pindahAksi(b.id, "naik"))}
          >
            <ChevronUp />
          </button>
          <button
            type="button"
            title="Turunkan"
            aria-label={`Turunkan ${b.nama}`}
            disabled={terakhir || tunggu}
            className={ikon}
            onClick={() => jalan(`pindah-${b.id}`, () => pindahAksi(b.id, "turun"))}
          >
            <ChevronDown />
          </button>
          <Link href={`/orang/kartu?ids=${b.orangId}`} title="Kartu" aria-label={`Kartu ${b.nama}`} className={ikon}>
            <IdCard />
          </Link>
          <button
            type="button"
            role="switch"
            aria-checked={b.aktif}
            aria-label={`${b.nama} ${b.aktif ? "aktif" : "nonaktif"} di logbook`}
            title={b.aktif ? "Aktif — ketuk untuk menonaktifkan" : "Nonaktif — ketuk untuk mengaktifkan"}
            disabled={tunggu}
            onClick={() => jalan(`aktif-${b.id}`, () => aturAktifAksi(b.id, !b.aktif))}
            className={cn(
              "relative ml-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              b.aktif ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-700",
            )}
          >
            <span className={cn("inline-block size-4 rounded-full bg-card shadow transition-transform", b.aktif ? "translate-x-[18px]" : "translate-x-0.5")} />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8">
        {nfcBuka ? (
          <form
            className="flex w-full flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              pasang();
            }}
          >
            <input
              autoFocus
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNfcUntuk(null);
              }}
              placeholder="Tempelkan kartu ke pembaca, atau ketik UID"
              aria-label={`UID chip NFC untuk ${b.nama}`}
              autoComplete="off"
              spellCheck={false}
              className={cn(isian, "h-9 min-w-0 flex-1 basis-48 font-mono text-12")}
            />
            <button type="submit" disabled={tunggu || !uid.trim()} className={cn(tombolUtama, "h-9 px-3 text-12")}>
              {sibuk === `nfc-${b.orangId}` ? "Menyimpan…" : "Pasang"}
            </button>
            <button type="button" onClick={() => setNfcUntuk(null)} className={cn(ikon, "size-9")} aria-label="Batal">
              <X />
            </button>
            {galat ? (
              <p role="alert" className="w-full text-12 text-danger">
                {galat}
              </p>
            ) : (
              <p className="w-full text-11 text-ink-muted">Pembaca USB mengetik UID lalu Enter sendiri. Chip lama orang ini otomatis dicabut.</p>
            )}
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled={tunggu}
              onClick={() => {
                setUid("");
                setGalat(null);
                setNfcUntuk(b.orangId);
              }}
              className="inline-flex items-center gap-1 text-12 font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
            >
              <Nfc className="size-3.5" /> {b.uidSamar ? "Ganti chip" : "Pasang chip NFC"}
            </button>
            {b.uidSamar && (
              <button
                type="button"
                disabled={tunggu}
                onClick={cabut}
                className="text-12 font-medium text-danger underline-offset-2 hover:underline disabled:opacity-50"
              >
                Cabut
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
