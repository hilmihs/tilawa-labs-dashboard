"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TvSnapshot } from "@/lib/tv/snapshot";
import type { TvProgramToday } from "@/lib/tv/queries";
import { EYEBROW, QUOTE_FALLBACK, REFRESH_SECONDS, VISI } from "./config";
import { angka, persen, tanggalPanjang } from "./format";

/**
 * The board — a single blue console frame (redesign "data-console" language):
 * masthead + KPI band + a wall of program cards + a kabar ticker. No rotation:
 * everything the majelis needs is on one sheet, refreshed in place.
 *
 * The wall is program-level (one card per program) because that is the finest
 * grain the TV snapshot carries; the kabar pipeline (/berita → curation) lives
 * on as the ticker, so approving a kabar still lights up the wall in seconds.
 */

type UnitStatus = { label: string; tone: "selesai" | "berjalan" | "belum" | "idle" };

function statusOf(p: TvProgramToday): UnitStatus {
  // A paused sync has nothing to say about the day; "Tidak ada kelas" would be a guess.
  if (!p.adaKelas && p.syncPaused) return { label: "Data belum masuk", tone: "idle" };
  if (!p.adaKelas) return { label: "Tidak ada kelas", tone: "idle" };
  if (p.meetingsHeld === 0) return { label: "Belum", tone: "belum" };
  if (p.meetingsHeld < p.meetingsScheduled) return { label: "Berjalan", tone: "berjalan" };
  return { label: "Selesai", tone: "selesai" };
}

function urut(programs: TvProgramToday[]): TvProgramToday[] {
  const aktif = programs.filter((p) => p.adaKelas).sort((a, b) => b.terjadwal - a.terjadwal);
  const diam = programs.filter((p) => !p.adaKelas).sort((a, b) => a.label.localeCompare(b.label, "id"));
  return [...aktif, ...diam];
}

export function Board({
  snapshot,
  kemarin = false,
}: {
  snapshot: TvSnapshot;
  /** Board built as of yesterday (?hari=kemarin); only the wording changes. */
  kemarin?: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState<string>("");

  // Live wall clock (HH:MM), updated each second. Set on the client only so the
  // server render carries no time and can never hydrate-mismatch.
  useEffect(() => {
    const paint = () =>
      setNow(
        new Intl.DateTimeFormat("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Jakarta",
        }).format(new Date()),
      );
    paint();
    const id = setInterval(paint, 1000);
    return () => clearInterval(id);
  }, []);

  // Re-fetch periodically; skip while the tab is hidden so a backgrounded TV
  // stick doesn't keep hitting the server.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [router]);

  const { today: t, news, meta } = snapshot;
  const rows = urut(t.programs);
  const hadirPct = t.totalTerjadwal > 0 ? (t.totalHadir / t.totalTerjadwal) * 100 : null;
  const perluPerhatian = t.programs.filter(
    (p) => p.adaKelas && p.terjadwal > 0 && p.hadir / p.terjadwal < 0.7,
  ).length;

  const tickerItems =
    news.items.length > 0
      ? news.items.map((i) => (i.body ? `${i.title} — ${i.body}` : i.title))
      : [snapshot.quotes[0]?.text ?? QUOTE_FALLBACK.text];
  // Duplicate so the marquee loops seamlessly.
  const ticker = [...tickerItems, ...tickerItems];

  const kpis: Array<{ label: string; value: React.ReactNode; sub: string; tone?: string }> = [
    {
      label: kemarin ? "Hadir kemarin" : "Hadir malam ini",
      value: (
        <>
          {angka(t.totalHadir)}
          <span className="kpi-den">/{angka(t.totalTerjadwal)}</span>
        </>
      ),
      sub: hadirPct != null ? `${persen(hadirPct)} kehadiran` : "belum ada kelas",
      tone: "hadir",
    },
    {
      label: "Program berjalan",
      value: (
        <>
          {angka(t.programAktif)}
          <span className="kpi-den">/{angka(t.programs.length)}</span>
        </>
      ),
      sub: `${angka(Math.max(0, t.programs.length - t.programAktif))} idle ${kemarin ? "kemarin" : "hari ini"}`,
    },
    {
      label: "Belum diisi",
      value: angka(t.totalBelumDiisi),
      sub: "pertemuan",
      tone: t.totalBelumDiisi > 0 ? "alert" : undefined,
    },
    {
      label: "Perlu perhatian",
      value: angka(perluPerhatian),
      sub: "program < 70%",
      tone: perluPerhatian > 0 ? "danger" : undefined,
    },
  ];

  return (
    <div className="tv">
      <div className="board">
        <header className="tv-head">
          <div className="brandmark">م</div>
          <div className="head-titles">
            <h1 className="head-title">{EYEBROW} — Papan Kehadiran</h1>
            <div className="head-sub">{VISI}</div>
          </div>
          <div className="head-clock">
            <div className="clock-time">{now || "—"}</div>
            <div className="clock-date">{tanggalPanjang(t.date)}</div>
          </div>
          <div className={`live${meta.stale || meta.syncFailed ? " live-warn" : ""}`}>
            <span className="live-dot" />
            {meta.lastSyncWib ? `LIVE · sync ${meta.lastSyncWib}` : "LIVE"}
          </div>
        </header>

        <div className="kpi-band">
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <div className="kpi-label">{k.label}</div>
              <div className={`kpi-val${k.tone ? ` kpi-${k.tone}` : ""}`}>{k.value}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="wall-wrap">
          <div className="wall-head">
            <span>Status program — pertemuan {kemarin ? "kemarin" : "hari ini"}</span>
            <span className="wall-legend">
              <i className="dot-selesai" /> Selesai
              <i className="dot-berjalan" /> Berjalan
              <i className="dot-belum" /> Belum
            </span>
          </div>
          <div className="wall" style={{ "--n": rows.length } as React.CSSProperties}>
            {rows.map((p) => {
              const st = statusOf(p);
              const pct = p.terjadwal > 0 ? (p.hadir / p.terjadwal) * 100 : null;
              return (
                <div className={`unit unit-${st.tone}`} key={p.key}>
                  <div className="unit-top">
                    <div>
                      <div className="unit-name">{p.label}</div>
                      <div className="unit-meta">
                        {p.syncPaused ? "sync jeda" : `${angka(p.meetingsHeld)}/${angka(p.meetingsScheduled)} pertemuan`}
                      </div>
                    </div>
                    <span className="unit-pill">{st.label}</span>
                  </div>
                  <div className="unit-bottom">
                    {p.adaKelas ? (
                      <>
                        <span className="unit-num">
                          {angka(p.hadir)}
                          <span className="unit-den">/{angka(p.terjadwal)}</span>
                        </span>
                        <span className="unit-pct">{pct != null ? persen(pct) : ""}</span>
                      </>
                    ) : (
                      <span className="unit-idle">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ticker">
          <div className="ticker-tag">Info</div>
          <div className="ticker-view">
            <div className="ticker-track">
              {ticker.map((text, i) => (
                <span className="ticker-item" key={i}>
                  {text}
                  <span className="ticker-sep">•</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
