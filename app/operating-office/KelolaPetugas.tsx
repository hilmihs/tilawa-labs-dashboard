"use client";

import { useRef, useState } from "react";
import { Copy, MessageCircle, Pencil, RefreshCw, UserPlus } from "lucide-react";
import { isian, kartu, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { gantiTautan, simpanPetugas } from "./actions";

export type PetugasBaris = {
  id: string;
  namaArab: string;
  namaLatin: string;
  wa: string | null;
  jamMasuk: string;
  aktif: boolean;
  tautan: string;
};

type Form = { id?: string; namaArab: string; namaLatin: string; wa: string; jamMasuk: string; aktif: boolean };
const KOSONG: Form = { namaArab: "", namaLatin: "", wa: "", jamMasuk: "08:00", aktif: true };

function pesanWa(p: PetugasBaris): string {
  return `السلام عليكم ${p.namaArab}\nرابط تسجيل الحضور والانصراف في المكتب:\n${p.tautan}\nيرجى تشغيل الموقع (GPS) عند الضغط على الزر.`;
}

const ikon =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5";
const ikonNetral = cn(ikon, "border-neutral-300 bg-card text-neutral-700 hover:border-border-strong dark:border-neutral-700 dark:text-neutral-200");
const label = "flex flex-col gap-1.5 text-12 font-medium text-neutral-700 dark:text-neutral-300";

export function KelolaPetugas({ petugas }: { petugas: PetugasBaris[] }) {
  const [form, setForm] = useState<Form>(KOSONG);
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const latinRef = useRef<HTMLInputElement>(null);

  async function simpan() {
    setSibuk(true);
    const h = await simpanPetugas(form);
    setSibuk(false);
    setPesan(h.ok ? { teks: "Tersimpan.", galat: false } : { teks: h.error, galat: true });
    if (h.ok) setForm(KOSONG);
  }

  async function ganti(p: PetugasBaris) {
    if (!window.confirm(`Buat ulang tautan ${p.namaLatin}? Tautan lama langsung tidak berlaku.`)) return;
    const h = await gantiTautan(p.id);
    setPesan(h.ok ? { teks: `Tautan ${p.namaLatin} sudah diganti — kirim ulang ke beliau.`, galat: false } : { teks: h.error, galat: true });
  }

  function keForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Fokus setelah gulir mulai, supaya layar tidak melompat dua kali.
    setTimeout(() => latinRef.current?.focus({ preventScroll: true }), 300);
  }

  function ubah(p: PetugasBaris) {
    setForm({ id: p.id, namaArab: p.namaArab, namaLatin: p.namaLatin, wa: p.wa ?? "", jamMasuk: p.jamMasuk, aktif: p.aktif });
    setPesan(null);
    keForm();
  }

  function tambah() {
    setForm(KOSONG);
    setPesan(null);
    keForm();
  }

  const sedangDiubah = petugas.find((p) => p.id === form.id);

  return (
    <div className={cn(kartu, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <h3 className="text-14 font-semibold">Masyaikh &amp; tautan absen</h3>
          <p className="mt-0.5 text-12 text-ink-muted">Tautan pribadi, dikirim lewat WA. Tautan lama mati bila dibuat ulang.</p>
        </div>
        <button type="button" onClick={tambah} className={cn(tombolGaris, "h-8")}>
          <UserPlus className="size-3.5" /> Tambah
        </button>
      </div>

      <ul className="divide-y divide-border">
        {petugas.map((p) => (
          <li
            key={p.id}
            className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5", form.id === p.id && "bg-brand-gold-tint/60 dark:bg-neutral-800")}
          >
            <div className="min-w-0 flex-1 basis-44">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("text-12 font-semibold sm:text-14", !p.aktif && "text-ink-muted")}>{p.namaLatin}</span>
                <span dir="rtl" lang="ar" className="text-12 text-ink-muted sm:text-14">
                  {p.namaArab}
                </span>
                {!p.aktif && (
                  <Badge tone="neutral" className="text-11">
                    nonaktif
                  </Badge>
                )}
              </div>
              <div className="mt-px text-12 tabular-nums text-ink-muted">
                masuk {p.jamMasuk} · {p.wa ?? "tanpa nomor WA"}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                title="Salin tautan"
                aria-label={`Salin tautan ${p.namaLatin}`}
                className={ikonNetral}
                onClick={() =>
                  navigator.clipboard.writeText(p.tautan).then(() => setPesan({ teks: `Tautan ${p.namaLatin} disalin.`, galat: false }))
                }
              >
                <Copy />
              </button>
              {p.wa && (
                <a
                  title="Kirim WA"
                  aria-label={`Kirim tautan ke ${p.namaLatin} lewat WhatsApp`}
                  className={cn(
                    ikon,
                    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
                  )}
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/${p.wa.replace(/\D/g, "")}?text=${encodeURIComponent(pesanWa(p))}`}
                >
                  <MessageCircle />
                </a>
              )}
              <button type="button" title="Ubah" aria-label={`Ubah ${p.namaLatin}`} className={ikonNetral} onClick={() => ubah(p)}>
                <Pencil />
              </button>
              <button
                type="button"
                title="Buat ulang tautan — tautan lama langsung tidak berlaku"
                aria-label={`Buat ulang tautan ${p.namaLatin}`}
                className={cn(
                  ikon,
                  "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
                )}
                onClick={() => ganti(p)}
              >
                <RefreshCw />
              </button>
            </div>
          </li>
        ))}
        {petugas.length === 0 && <li className="px-4 py-4 text-sm text-ink-muted">Belum ada syaikh.</li>}
      </ul>

      {pesan && <p className={cn("border-t border-border px-4 py-2.5 text-sm", pesan.galat ? "text-danger" : "text-ok")}>{pesan.teks}</p>}

      <div ref={formRef} className="scroll-mt-24 border-t border-border bg-neutral-50 px-4 py-4 dark:bg-neutral-900/50">
        <div className="mb-3 flex items-center gap-1.5 text-14 font-semibold">
          {sedangDiubah ? (
            <>
              <Pencil className="size-4 text-ink-muted" /> Ubah: {sedangDiubah.namaLatin}
            </>
          ) : (
            <>
              <UserPlus className="size-4 text-ink-muted" /> Tambah syaikh
            </>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={label}>
            <label htmlFor="p-arab">Nama Arab</label>
            <input
              id="p-arab"
              dir="rtl"
              lang="ar"
              placeholder="الاسم بالعربية"
              value={form.namaArab}
              onChange={(e) => setForm({ ...form, namaArab: e.target.value })}
              className={isian}
            />
          </div>
          <div className={label}>
            <label htmlFor="p-latin">Nama Latin</label>
            <input
              id="p-latin"
              ref={latinRef}
              placeholder="mis. Syaikh Ahmad"
              value={form.namaLatin}
              onChange={(e) => setForm({ ...form, namaLatin: e.target.value })}
              className={isian}
            />
          </div>
          <div className={label}>
            <label htmlFor="p-wa">Nomor WA</label>
            <input
              id="p-wa"
              inputMode="tel"
              placeholder="+20 10 6768 2827"
              value={form.wa}
              onChange={(e) => setForm({ ...form, wa: e.target.value })}
              className={isian}
            />
            <span className="text-11 font-normal text-ink-muted">Dengan kode negara, mis. +20 10 6768 2827.</span>
          </div>
          <div className={label}>
            <label htmlFor="p-jam">Jadwal masuk</label>
            <input
              id="p-jam"
              type="time"
              value={form.jamMasuk}
              onChange={(e) => setForm({ ...form, jamMasuk: e.target.value })}
              className={cn(isian, "w-[140px]")}
            />
            <span className="text-11 font-normal text-ink-muted">Masuk sesudah jam ini ditandai terlambat (WIB).</span>
          </div>
          {form.id && (
            <label className="flex items-center gap-2 self-center text-14 sm:col-span-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand-forest)]"
                checked={form.aktif}
                onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
              />
              Aktif (muncul di daftar hari ini)
            </label>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={simpan} disabled={sibuk} className={tombolUtama}>
            {form.id ? "Simpan perubahan" : "Tambah syaikh"}
          </button>
          {form.id && (
            <button type="button" onClick={() => setForm(KOSONG)} className={cn(tombolGaris, "border-transparent bg-transparent")}>
              Batal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
