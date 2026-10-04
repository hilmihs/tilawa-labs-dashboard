"use client";

import { useActionState, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, Mic, Plus, Repeat } from "lucide-react";
import { isian, kartu, labelMikro, tombolUtama } from "@/components/lintas/brand";
import { SERI_BARU, labelSeri } from "@/lib/hadir/target-input";
import { cn } from "@/lib/utils";
import { buatAcara, type BuatAcaraState } from "./actions";
import { PilihSeri, PilihTarget, type OpsiGolongan, type TargetAwal } from "./PilihTarget";

function slugDari(nama: string): string {
  return nama
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const BLN = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const labelIsian = "flex flex-col gap-1.5 text-12 font-medium text-neutral-700 dark:text-neutral-300";

/** Satu langkah bernomor: bulatan di kiri, isi di kanan. */
function Langkah({ no, redup, children }: { no: number; redup?: boolean; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 border-b border-border px-4 py-5 sm:px-[22px]">
      <span
        aria-hidden
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-12 font-semibold",
          redup ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" : "bg-primary text-primary-foreground",
        )}
      >
        {no}
      </span>
      <div className="flex min-w-0 flex-col gap-3.5 pt-1">{children}</div>
    </div>
  );
}

/**
 * Formulir buat kajian. Yang di depan hanya yang benar-benar ditanyakan tiap
 * kali (nama, tanggal, jam, pemateri, tema, seri, siapa yang hadir); URL,
 * toleransi terlambat dan lokasi dilipat ke "Pengaturan lanjutan" karena
 * nilainya hampir selalu default. Slug tetap ada tapi terisi sendiri dari nama.
 * Pratinjau di samping membaca state yang sama, jadi koordinator melihat kartu
 * kajiannya sebelum menyimpan.
 */
export function BuatAcaraForm({ golongan, seriAda }: { golongan: OpsiGolongan[]; seriAda: string[] }) {
  const [state, action, pending] = useActionState<BuatAcaraState, FormData>(buatAcara, {});
  const [f, setF] = useState({ nama: "", tanggal: "", jam: "", pemateri: "", tema: "", lokasi: "" });
  const [slug, setSlug] = useState("");
  const [slugSunting, setSlugSunting] = useState(false);
  const [seri, setSeri] = useState({ pilih: "", nama: "" });
  const [target, setTarget] = useState<TargetAwal>({});
  const [lanjutan, setLanjutan] = useState(false);

  const ubah = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const d = f.tanggal ? new Date(`${f.tanggal}T00:00:00Z`) : null;
  const sah = d != null && !Number.isNaN(d.getTime());
  const kapan =
    (sah ? `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "Tanggal belum diisi") +
    (f.jam ? ` · ${f.jam} WIB` : "") +
    (f.lokasi ? ` · ${f.lokasi}` : "");
  const teksSeri =
    seri.pilih === ""
      ? "Tidak masuk kajian rutin"
      : seri.pilih === SERI_BARU
        ? seri.nama.trim()
          ? `Kajian rutin baru: ${seri.nama.trim()}`
          : "Kajian rutin baru"
        : labelSeri(seri.pilih);
  const nilai = Object.values(target);
  const jumlahWajib = nilai.filter((v) => v === "wajib").length;
  const jumlahUndang = nilai.filter((v) => v === "diundang").length;
  const siap = f.nama.trim().length >= 3 && sah;

  return (
    <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
      <form action={action} className={cn(kartu, "overflow-hidden rounded-2xl")}>
        <div className="border-b border-border px-4 py-[18px] sm:px-[22px]">
          <h2 className="text-16 font-semibold">Buat kajian baru</h2>
          <p className="mt-0.5 text-12 text-ink-muted">Empat langkah. Yang wajib hanya nama dan tanggal.</p>
        </div>

        {state.error && (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-12 text-danger sm:px-[22px] dark:border-red-900 dark:bg-red-950/40">
            {state.error}
          </p>
        )}

        <Langkah no={1}>
          <div className="text-14 font-semibold">Detail kajian</div>
          <label className={labelIsian}>
            Nama kajian
            <input
              name="nama"
              required
              minLength={3}
              value={f.nama}
              className={isian}
              placeholder="Kajian Rumah Belajar — pekan 7"
              onChange={(e) => {
                setF({ ...f, nama: e.target.value });
                if (!slugSunting) setSlug(slugDari(e.target.value));
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelIsian}>
              Tanggal
              <input name="tanggal" type="date" required value={f.tanggal} onChange={ubah("tanggal")} className={isian} />
            </label>
            <label className={labelIsian}>
              Jam mulai (WIB)
              <input name="jam_mulai" type="time" value={f.jam} onChange={ubah("jam")} className={isian} />
            </label>
            <label className={labelIsian}>
              Pemateri / ustadz
              <input name="pemateri" value={f.pemateri} onChange={ubah("pemateri")} className={isian} placeholder="Ustadz Abdullah Zaen" />
            </label>
            <label className={labelIsian}>
              Tema / kitab
              <input name="tema" value={f.tema} onChange={ubah("tema")} className={isian} placeholder="Kitab Tauhid bab 3" />
            </label>
          </div>
        </Langkah>

        <Langkah no={2}>
          <PilihSeri seriAda={seriAda} onChange={setSeri} />
        </Langkah>

        <Langkah no={3}>
          <PilihTarget golongan={golongan} onChange={setTarget} />
        </Langkah>

        <Langkah no={4} redup>
          <button
            type="button"
            onClick={() => setLanjutan(!lanjutan)}
            aria-expanded={lanjutan}
            className="-my-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-14 font-semibold">Pengaturan lanjutan</span>
            <span className="text-12 text-ink-muted">URL, toleransi terlambat, lokasi — biasanya cukup default</span>
            <ChevronDown className={cn("ml-auto size-4 text-ink-muted transition-transform", lanjutan && "rotate-180")} />
          </button>
          {/* Tetap dirender saat terlipat: slug wajib ikut terkirim. */}
          <div className={cn("grid gap-3 sm:grid-cols-3", !lanjutan && "hidden")}>
            <label className={labelIsian}>
              Alamat halaman
              <input
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlugSunting(true);
                  setSlug(e.target.value);
                }}
                className={cn(isian, "font-mono text-12")}
                placeholder="kajian-rumah-belajar-7"
              />
              <span className="text-11 font-normal text-ink-muted">Terisi sendiri dari nama.</span>
            </label>
            <label className={labelIsian}>
              Toleransi terlambat (menit)
              <input name="toleransi_menit" type="number" min={0} max={240} defaultValue={15} className={isian} />
            </label>
            <label className={labelIsian}>
              Lokasi
              <input name="lokasi" value={f.lokasi} onChange={ubah("lokasi")} className={isian} placeholder="Partner Mosque Matraman" />
            </label>
          </div>
        </Langkah>

        <div className="flex flex-wrap items-center gap-2.5 bg-neutral-50 px-4 py-4 sm:px-[22px] dark:bg-neutral-900/40">
          <button type="submit" disabled={pending} className={cn(tombolUtama, "h-10 px-[18px]")}>
            <Plus className="size-4" />
            {pending ? "Menyimpan…" : "Buat kajian"}
          </button>
          <span className="text-12 text-ink-muted">{siap ? "Siap dibuat." : "Isi nama kajian dan tanggal dulu."}</span>
        </div>
      </form>

      <aside className="flex flex-col gap-2.5">
        <div className={labelMikro}>Pratinjau</div>
        <div className={cn(kartu, "flex flex-col gap-3.5 rounded-2xl p-[18px]")}>
          <div className="flex items-start gap-3.5">
            <div className="flex h-[60px] w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-gold-tint text-brand-ink dark:bg-accent dark:text-accent-foreground">
              <span className="text-[10px] tracking-[0.09em]">{sah ? BLN[d.getUTCMonth()] : ""}</span>
              <span className="text-20 font-bold leading-none">{sah ? d.getUTCDate() : "–"}</span>
            </div>
            <div className="min-w-0">
              <div className={cn("text-16 font-semibold leading-snug text-pretty", !f.nama && "text-ink-faint")}>{f.nama || "Nama kajian"}</div>
              <div className="mt-1 text-12 text-ink-muted">{kapan}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-12 text-neutral-700 sm:text-14 dark:text-neutral-300">
            <div className="flex items-center gap-2">
              <Mic className="size-3.5 shrink-0 text-ink-faint" />
              <span className={cn(!f.pemateri && "text-ink-faint")}>{f.pemateri || "Pemateri belum diisi"}</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="size-3.5 shrink-0 text-ink-faint" />
              <span className={cn(!f.tema && "text-ink-faint")}>{f.tema || "Tema belum diisi"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Repeat className="size-3.5 shrink-0 text-ink-faint" />
              {teksSeri}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 border-t border-dashed border-border pt-3">
            <div className="rounded-[10px] bg-primary px-3 py-2.5 text-primary-foreground">
              <div className="text-11 opacity-75">Wajib</div>
              <div className="mt-0.5 text-20 font-bold tabular-nums">
                {jumlahWajib}
                <span className="text-12 font-normal opacity-75"> golongan</span>
              </div>
            </div>
            <div className="rounded-[10px] bg-blue-100 px-3 py-2.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <div className="text-11">Diundang</div>
              <div className="mt-0.5 text-20 font-bold tabular-nums">
                {jumlahUndang}
                <span className="text-12 font-normal"> golongan</span>
              </div>
            </div>
          </div>
          <div className="truncate rounded-lg border border-border bg-neutral-50 px-2.5 py-2 font-mono text-11 text-ink-muted dark:bg-neutral-900/40">
            /acara/{slug || "kajian-baru"}
          </div>
        </div>
      </aside>
    </section>
  );
}
