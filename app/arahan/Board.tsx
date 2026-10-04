"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  BARIS_PAD_Y,
  buildBoard,
  formatJam,
  KOLOM_STAKEHOLDER,
  WARNA,
  TINGGI_UNTUK_BARIS,
  type BoardPage,
  type BoardRow,
  type Directive,
  type StakeholderTier,
} from "@/lib/arahan/board";
import { labelPekan, type ProgramTask, type ProgramWeek } from "@/lib/arahan/program";

/**
 * Papan Board Directives, digambar pada kanvas tetap 3840×2160 lalu diskalakan ke
 * layar apa pun. Kanvas tetap itu yang membuat 720p dan 4K menampilkan komposisi
 * yang persis sama — bukan layout responsif yang menyusun ulang dirinya dan
 * membuat angka usia 104 px kehilangan maksudnya di layar kecil.
 */

const CANVAS_W = 3840;
const CANVAS_H = 2160;
const MENIT_MS = 60_000;
const CURSOR_HIDE_MS = 3_000;
/** Lama satu halaman rotasi ditahan sebelum berganti. */
const ROTASI_MS = 30_000;
/**
 * Seberapa sering papan menarik ulang data dari server.
 *
 * 15 detik, bukan dua menit. Alurnya nyata: orang memasukkan arahan dari HP
 * sambil berdiri di depan TV, lalu menunggu. Dua menit membuat papan terasa
 * mati dan orangnya menekan refresh — padahal papan ini justru dipasang supaya
 * tidak ada yang perlu menyentuhnya. Ongkosnya satu query ringan ke tabel yang
 * isinya belasan baris.
 */
const REFRESH_MS = 15_000;

/**
 * Lebar kolom, total 3648 px = kanvas 3840 dikurangi padding 96 di dua sisi.
 *
 * Stakeholder dapat KOLOM_STAKEHOLDER (600) dan bukan 420 seperti desain awal,
 * karena isinya nama berpanggilan penuh: "Ustadz Abdul Muhsin" sendirian sudah
 * memakan hampir seluruh kolom 420. PIC naik ke 460 karena alasan yang sama —
 * "Ustadz Rahmat Hidayat" pecah jadi tiga baris di 420 dan terpotong. Tambahannya
 * diambil dari Arahan dan Checkpoint, dua kolom teks yang sama-sama sudah
 * dipangkas ke dua baris dan tidak kehilangan apa pun.
 */
const KOLOM = `120px 860px 460px ${KOLOM_STAKEHOLDER}px 340px 300px 968px`;

const JUDUL = "Task Board";
const SUBJUDUL = "Board Directives · Education Board";
const FOOTER_HINT = "Tambah atau perbarui arahan lewat /arahan/isi — cukup terhubung ke Wi-Fi kantor.";
const FOOTER_HINT_PROGRAM = "Isi fokus pekanan lewat /arahan/isi → tab Program.";

/** Kolom tabel program: nomor, nama program, fokus pekan ini. Total 3648 px. */
const KOLOM_PROGRAM = "140px 640px 2868px";
/** Baris program per halaman; papan tulis rapat berisi sembilan. */
const PROGRAM_PER_HALAMAN = 10;
const PROGRAM_TINGGI_MAKS = 190;
/** Sisa ruang di bawah tabel program supaya baris terakhir tidak menempel footer. */
const PROGRAM_JEDA_BAWAH = 48;

/**
 * Board Screen (/tv) yang ikut diputar sesudah fokus program, dengan data
 * KEMARIN: papan ini tayang siang hari, saat kelas malam ini belum berjalan dan
 * papan "hari ini" hanya berisi nol.
 */
const TV_SRC = "/tv?hari=kemarin";

/**
 * Satu halaman rotasi: halaman arahan Dewan (dari buildBoard), halaman fokus
 * program pekanan, lalu Board Screen — kemudian kembali ke awal.
 */
type Slide =
  | { kind: "arahan"; page: BoardPage }
  | { kind: "program"; weekStart: string; tasks: ProgramTask[]; offset: number }
  | { kind: "tv" };

/**
 * Jam dinding sebagai external store, bukan state yang di-set dari efek.
 *
 * Snapshot-nya nomor menit, bukan milidetik: papan hanya menampilkan sampai
 * satuan menit, jadi nilainya berubah tepat 60 kali sejam dan React hanya
 * me-render sebanyak itu — meski store-nya diperiksa tiap detik supaya
 * pergantian menitnya tidak telat sampai satu menit penuh.
 *
 * Snapshot server sengaja null: pemanggilnya jatuh ke instant kiriman server,
 * sehingga render pertama di klien identik dengan render server.
 */
function subscribeMinute(onChange: () => void) {
  const timer = setInterval(onChange, 1_000);
  return () => clearInterval(timer);
}
function getMinuteSnapshot(): number | null {
  return Math.floor(Date.now() / MENIT_MS);
}
function getServerSnapshot(): number | null {
  return null;
}

export function Board({
  directives,
  program,
  rotasi,
  serverNow,
}: {
  directives: Directive[];
  program: ProgramWeek | null;
  /** Mode rotasi: sesudah halaman arahan, putar fokus program lalu Board Screen. */
  rotasi: boolean;
  serverNow: number;
}) {
  const router = useRouter();
  const [scale, setScale] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pointerVisible, setPointerVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const minute = useSyncExternalStore<number | null>(
    subscribeMinute,
    getMinuteSnapshot,
    getServerSnapshot,
  );
  const now = minute === null ? serverNow : minute * MENIT_MS;

  const view = useMemo(() => buildBoard(directives, now), [directives, now]);
  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = view.pages.map((page) => ({ kind: "arahan", page }));
    if (!rotasi) return out;
    const tasks = program?.tasks ?? [];
    for (let i = 0; i < tasks.length; i += PROGRAM_PER_HALAMAN) {
      out.push({
        kind: "program",
        weekStart: program!.weekStart,
        tasks: tasks.slice(i, i + PROGRAM_PER_HALAMAN),
        offset: i,
      });
    }
    out.push({ kind: "tv" });
    return out;
  }, [view.pages, program, rotasi]);
  const pageCount = slides.length;

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Rotasi halaman. Timer dipasang ulang tiap kali jumlah halaman berubah.
  // Indeksnya sengaja tidak di-reset dari sini: setelah sebuah arahan ditandai
  // selesai, pageCount bisa mengecil di bawah indeks yang sedang tampil, dan itu
  // dibereskan saat render lewat modulo — bukan lewat setState di dalam efek,
  // yang hanya menambah satu putaran render tanpa mengubah hasilnya.
  useEffect(() => {
    if (pageCount <= 1) return;
    const timer = setInterval(() => setPageIndex((i) => (i + 1) % pageCount), ROTASI_MS);
    return () => clearInterval(timer);
  }, [pageCount]);

  // Papan ini hidup berhari-hari tanpa ada yang menyentuh keyboard; tanpa tarikan
  // berkala, arahan yang baru dimasukkan lewat form tidak akan pernah muncul.
  //
  // Tarikan tambahan saat tab kembali terlihat menutup satu lubang yang tidak
  // bisa ditutup timer: browser meredam interval di tab latar, jadi laptop yang
  // baru dibuka atau tab yang baru dipilih bisa menampilkan papan berjam-jam lalu
  // selama satu putaran penuh sebelum timernya sempat berdetak.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  // Kursor disembunyikan sampai ada yang menggerakkan mouse — panah putih yang
  // diam di tengah TV terlihat seperti layar yang hang.
  const wake = () => {
    setPointerVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPointerVisible(false), CURSOR_HIDE_MS);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const safeIndex = pageIndex % pageCount;
  const slide = slides[safeIndex];
  const kosong = view.total === 0;

  return (
    <div
      onMouseMove={wake}
      style={{
        position: "fixed",
        inset: 0,
        background: WARNA.latar,
        overflow: "hidden",
        display: "grid",
        placeContent: "center",
        cursor: pointerVisible ? "default" : "none",
      }}
    >
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          flex: "none",
          transform: `scale(${scale ?? 1})`,
          transformOrigin: "center",
          opacity: scale === null ? 0 : 1,
          background: WARNA.latar,
          padding: 96,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          color: WARNA.teks,
        }}
      >
        <Header
          subtitle={
            slide.kind !== "arahan"
              ? "Fokus Program Pekanan · Education Board"
              : (slide.page.subtitle ?? SUBJUDUL)
          }
          lateCount={view.lateCount}
          clock={formatJam(now)}
          dateText={view.dateText}
          pageText={`${safeIndex + 1} / ${pageCount}`}
          showPage={pageCount > 1}
        />

        <div style={{ height: 48, flex: "none" }} />

        {slide.kind === "tv" ? null : slide.kind === "program" ? (
          <div key={`program-${safeIndex}`} className="arahan-page" style={{ flex: "none" }}>
            <ProgramHeadRow label={labelPekan(slide.weekStart)} />
            {slide.tasks.map((t, i) => (
              <ProgramRow
                key={t.program}
                nomor={slide.offset + i + 1}
                task={t}
                index={i}
                height={Math.min(PROGRAM_TINGGI_MAKS, Math.floor((TINGGI_UNTUK_BARIS - PROGRAM_JEDA_BAWAH) / slide.tasks.length))}
              />
            ))}
          </div>
        ) : kosong ? (
          <EmptyState />
        ) : (
          <div key={`${slide.page.mode}-${safeIndex}`} className="arahan-page" style={{ flex: "none" }}>
            <HeadRow />
            {slide.page.rows.map((row, i) => (
              <Row
                key={row.id}
                row={row}
                index={i}
                height={view.heights[row.id]}
                tier={view.tier}
              />
            ))}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0 }} />

        <Footer
          hint={slide.kind === "arahan" ? FOOTER_HINT : FOOTER_HINT_PROGRAM}
          clock={formatJam(now)}
          total={view.total}
        />
      </div>

      {/* Hanya di mode rotasi. Selalu terpasang, hanya disembunyikan: memuat
          ulang /tv tiap putaran berarti layar kosong beberapa detik setiap kali
          gilirannya tiba. */}
      {rotasi && (
        <iframe
          src={TV_SRC}
          title="Board Screen"
          tabIndex={-1}
          style={{
            position: "fixed",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            background: WARNA.latar,
            visibility: slide.kind === "tv" ? "visible" : "hidden",
          }}
        />
      )}
    </div>
  );
}

function Header({
  subtitle,
  lateCount,
  clock,
  dateText,
  pageText,
  showPage,
}: {
  subtitle: string;
  lateCount: number;
  clock: string;
  dateText: string;
  pageText: string;
  showPage: boolean;
}) {
  return (
    <div
      style={{
        height: 160,
        flex: "none",
        boxSizing: "border-box",
        background: WARNA.panel,
        borderRadius: 32,
        padding: "0 56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.015em" }}>
          {JUDUL}
        </div>
        <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1, color: WARNA.redup }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
        {lateCount > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              boxSizing: "border-box",
              background: "rgba(248,113,113,0.12)",
              border: `2px solid ${WARNA.merah}`,
              borderRadius: 999,
              padding: "16px 32px",
            }}
          >
            <div style={{ width: 20, height: 20, flex: "none", borderRadius: 999, background: WARNA.merah }} />
            <div
              style={{
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: WARNA.merah,
                whiteSpace: "nowrap",
              }}
            >
              {lateCount} ARAHAN MENGENDAP
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {clock}
          </div>
          <div style={{ fontSize: 34, fontWeight: 400, lineHeight: 1, color: WARNA.redup }}>
            {dateText}
          </div>
        </div>
        {showPage && (
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: WARNA.redup,
              border: `2px solid ${WARNA.garis}`,
              borderRadius: 999,
              padding: "14px 34px",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {pageText}
          </div>
        )}
      </div>
    </div>
  );
}

function HeadRow() {
  const cell = { padding: "0 32px" } as const;
  return (
    <div
      style={{
        height: 88,
        boxSizing: "border-box",
        background: WARNA.panel,
        borderRadius: 24,
        display: "grid",
        gridTemplateColumns: KOLOM,
        alignItems: "center",
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: WARNA.redup,
      }}
    >
      <div />
      <div style={cell}>Arahan / Tugas</div>
      <div style={cell}>PIC</div>
      <div style={cell}>Stakeholder</div>
      <div style={cell}>Tanggal Permintaan</div>
      <div style={{ ...cell, textAlign: "right" }}>Usia</div>
      <div style={cell}>Checkpoint Progres</div>
    </div>
  );
}

function Row({
  row,
  index,
  height,
  tier,
}: {
  row: BoardRow;
  index: number;
  height: number;
  tier: StakeholderTier;
}) {
  // Baris mengendap dicat merah lemah dan diberi cincin, bukan sekadar teks
  // merah: dari seberang ruangan yang terbaca duluan adalah blok warnanya.
  const bg = row.late
    ? "rgba(248,113,113,0.10)"
    : index % 2 === 0
      ? WARNA.baris
      : "transparent";

  return (
    <div
      style={{
        // Tinggi datang dari buildBoard, bukan dihitung ulang di sini: angka yang
        // sama itulah yang dipakai memutuskan baris ini muat di halaman ini.
        height,
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: KOLOM,
        alignItems: "center",
        borderBottom: `2px solid ${WARNA.garis}`,
        background: bg,
        boxShadow: row.late ? "inset 0 0 0 2px rgba(248,113,113,0.45)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Pita warna ikut tinggi barisnya, supaya baris tinggi tidak terlihat
            seperti baris pendek yang kebetulan renggang. */}
        <div
          style={{
            width: 12,
            height: Math.max(72, height - BARIS_PAD_Y * 2),
            borderRadius: 6,
            background: row.color,
          }}
        />
      </div>

      <div
        style={{
          padding: "0 32px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: 50,
            fontWeight: 600,
            lineHeight: 1.02,
            letterSpacing: "-0.015em",
            textWrap: "pretty",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {row.title}
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 400,
            lineHeight: 1,
            color: WARNA.redup,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.source}
        </div>
      </div>

      <div
        style={{
          padding: "0 32px",
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            flex: "none",
            boxSizing: "border-box",
            borderRadius: 999,
            background: WARNA.panel,
            border: `2px solid ${WARNA.garis}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: WARNA.redup,
          }}
        >
          {row.ini}
        </div>
        {/* Dua baris, lalu potong. "Ustadz Rahmat Hidayat" pecah jadi tiga baris
            di kolom lama dan baris ketiganya tertimpa baris berikutnya. */}
        <div
          style={{
            fontSize: 42,
            fontWeight: 500,
            lineHeight: 1.1,
            textWrap: "pretty",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {row.pic}
        </div>
      </div>

      <div
        style={{
          padding: "0 16px",
          minWidth: 0,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          justifyContent: "flex-start",
          gap: tier.gap,
        }}
      >
        {/* Semuanya digambar, tanpa "+n". Barisnya sudah ditinggikan tepat
            sebanyak yang dibutuhkan chip-chip ini, jadi tidak ada yang tumpah
            dan tidak ada nama yang hilang. */}
        {row.stakeholders.map((s) => (
          <Chip key={s} tier={tier}>
            {s}
          </Chip>
        ))}
      </div>

      <div
        style={{
          padding: "0 32px",
          fontSize: 42,
          fontWeight: 400,
          color: WARNA.redup,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {row.date}
      </div>

      <div
        style={{
          padding: "0 32px",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "flex-end",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            fontVariantNumeric: "tabular-nums",
            color: row.color,
          }}
        >
          {row.age}
        </div>
        <div style={{ fontSize: 36, fontWeight: 500, color: WARNA.redup }}>hari</div>
      </div>

      <div
        style={{
          padding: "0 32px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 400,
            lineHeight: 1.1,
            textWrap: "pretty",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {row.checkpoint}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {row.stale && (
            <div style={{ width: 16, height: 16, flex: "none", borderRadius: 999, background: WARNA.jingga }} />
          )}
          <div
            style={{
              fontSize: 32,
              fontWeight: 400,
              lineHeight: 1,
              color: row.updColor,
              whiteSpace: "nowrap",
            }}
          >
            {row.upd}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, tier }: { children: React.ReactNode; tier: StakeholderTier }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        fontSize: tier.font,
        fontWeight: 500,
        lineHeight: 1,
        color: WARNA.redup,
        border: `2px solid ${WARNA.garis}`,
        borderRadius: 999,
        padding: `${tier.padY}px ${tier.padX}px`,
        // Nama tidak dipatahkan di tengah; kalau satu nama lebih lebar dari
        // kolomnya, dia yang dipotong, bukan tata letaknya yang rusak.
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: 1572,
        flex: "none",
        boxSizing: "border-box",
        background: WARNA.baris,
        border: `2px solid ${WARNA.garis}`,
        borderRadius: 32,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
      }}
    >
      <svg
        viewBox="0 0 48 48"
        style={{ width: 180, height: 180 }}
        fill="none"
        stroke={WARNA.hijau}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="24" cy="24" r="19" />
        <path d="M15 24.5l6.5 6.5L33 19" />
      </svg>
      <div style={{ fontSize: 112, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>
        Tidak ada arahan aktif
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 400,
          color: WARNA.redup,
          textAlign: "center",
          maxWidth: 1800,
          textWrap: "pretty",
        }}
      >
        Semua arahan Dewan sudah rampung. Arahan baru akan muncul di papan ini begitu
        dimasukkan lewat form.
      </div>
    </div>
  );
}

function Footer({ hint, clock, total }: { hint: string; clock: string; total: number }) {
  return (
    <div
      style={{
        height: 124,
        flex: "none",
        boxSizing: "border-box",
        background: WARNA.panel,
        borderRadius: 32,
        padding: "0 56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 400, color: WARNA.redup }}>{hint}</div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 400,
          color: WARNA.samar,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {total} arahan aktif · sinkron terakhir {clock}
      </div>
    </div>
  );
}

function ProgramHeadRow({ label }: { label: string }) {
  const cell = { padding: "0 40px" } as const;
  return (
    <div
      style={{
        height: 88,
        boxSizing: "border-box",
        background: WARNA.panel,
        borderRadius: 24,
        display: "grid",
        gridTemplateColumns: KOLOM_PROGRAM,
        alignItems: "center",
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: WARNA.redup,
      }}
    >
      <div />
      <div style={cell}>Program</div>
      <div style={cell}>{label}</div>
    </div>
  );
}

function ProgramRow({
  nomor,
  task,
  index,
  height,
}: {
  nomor: number;
  task: ProgramTask;
  index: number;
  height: number;
}) {
  return (
    <div
      style={{
        height,
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: KOLOM_PROGRAM,
        alignItems: "center",
        borderBottom: `2px solid ${WARNA.garis}`,
        background: index % 2 === 0 ? WARNA.baris : "transparent",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: 84,
            height: 84,
            boxSizing: "border-box",
            borderRadius: 999,
            background: WARNA.panel,
            border: `2px solid ${WARNA.garis}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 42,
            fontWeight: 700,
            color: WARNA.hijau,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {nomor}
        </div>
      </div>
      <div
        style={{
          padding: "0 40px",
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: "-0.015em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {task.program}
      </div>
      <div
        style={{
          padding: "0 40px",
          fontSize: 58,
          fontWeight: 500,
          lineHeight: 1.1,
          textWrap: "pretty",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflow: "hidden",
        }}
      >
        {task.task}
      </div>
    </div>
  );
}
