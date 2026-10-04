import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import {
  navLabel,
  LAYAR_NAV,
  SECTION_HINT,
  SECTION_ICON,
} from "@/components/shell/sections";
import type { OrgNode } from "@/lib/org/structure";
import { Card } from "@/components/ui/card";

/**
 * Kartu turunan satu node organisasi: grid unit/program, lalu (di akar saja)
 * kartu Layar, lalu placeholder "Segera hadir". Dipakai /overview dan Beranda
 * (sejak 23 Sep 2026, Beranda memuat isi akar Organisasi di bawah tiga angka).
 * Server component — jangan beri 'use client', lihat catatan client-module 500.
 */
export function OrgCards({
  nodes,
  basePath,
  root,
}: {
  nodes: OrgNode[];
  basePath: string[];
  root: boolean;
}) {
  // Placeholders drop out of the card grid so they stop stretching to the
  // height of the data cards; they render as a muted footnote row instead.
  const live = nodes.filter((c) => !c.comingSoon);
  const soon = nodes.filter((c) => c.comingSoon);
  return (
    <>
      {nodes.length === 0 ? (
        <p className="text-sm text-neutral-500">Belum ada turunan.</p>
      ) : (
        <>
          {live.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((child) => (
                <ChildCard key={child.id} child={child} basePath={basePath} kind={root ? "divisi" : "program"} />
              ))}
            </div>
          )}

          {/*
           * Wall boards + the phone form that feeds one of them. They are not
           * program dashboards, so they get their own heading at the root
           * rather than a card in the grid — matching where the rail puts
           * them. Only at the root: a division page is about its own unit.
           */}
          {root && (
            <section className="pt-1">
              <h2 className="cap text-[10px] font-semibold text-neutral-400">
                Layar
              </h2>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {KARTU_LAYAR.map((item) => {
                  const Icon = SECTION_ICON[item.key];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Card className="h-full p-4 transition-colors group-hover:border-blue-500">
                        <div className="flex items-center gap-2">
                          <Icon
                            className="size-4 shrink-0 text-neutral-400"
                            strokeWidth={1.8}
                          />
                          <span className="text-sm font-medium">
                            {navLabel(item)}
                          </span>
                        </div>
                        {SECTION_HINT[item.key] && (
                          <p className="mt-1.5 text-xs leading-snug text-neutral-500">
                            {SECTION_HINT[item.key]}
                          </p>
                        )}
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {soon.length > 0 && (
            <section className="pt-1">
              <h2 className="cap text-[10px] font-semibold text-neutral-400">
                Segera hadir
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {soon.map((child) => (
                  <span
                    key={child.id}
                    title={child.hint}
                    className="rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-neutral-500"
                  >
                    {child.label}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

/** Card frame shared by both card kinds so a mixed row lines up exactly. */
/**
 * Kartu "Layar" di ikhtisar sengaja lebih sedikit daripada LAYAR_NAV: cara
 * mengisi arahan sudah ada di papannya sendiri, dan rotasi tidak dipakai untuk
 * sekarang (permintaan pemilik 22 Sep 2026). Rutenya TIDAK dimatikan — LAYAR_NAV
 * tetap utuh karena ia juga memasok rail dan tautan saudara di /arahan/isi.
 */
const KARTU_LAYAR_SEMBUNYI = new Set(["arahanIsi", "arahanRotasi"]);
const KARTU_LAYAR = LAYAR_NAV.filter(
  (item) => !KARTU_LAYAR_SEMBUNYI.has(item.key),
);

function CardFrame({
  href,
  kind,
  label,
  icon,
  children,
}: {
  href: string;
  kind: string;
  label: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-blue-500">
        {/* Title block keeps a two-line slot so metric rows line up across a row. */}
        <div className="flex items-start gap-2 p-4">
          <div className="min-w-0 flex-1">
            <div className="cap text-[10px] font-semibold text-neutral-400">
              {kind}
            </div>
            <div className="mt-1 line-clamp-2 min-h-[2.6em] text-base font-semibold leading-snug">
              {label}
            </div>
          </div>
          {icon}
        </div>
        {children}
      </Card>
    </Link>
  );
}

/**
 * Satu label untuk semua kartu satu tingkat (permintaan pemilik 28 Sep 2026):
 * di akar semuanya "divisi", di dalam divisi semuanya "program" — tanpa
 * membedakan unit/fitur/program dan tanpa jumlah turunan. Bentuk node tetap
 * menentukan ke mana kartu menaut, bukan labelnya.
 */
function ChildCard({
  child,
  basePath,
  kind,
}: {
  child: OrgNode;
  basePath: string[];
  kind: string;
}) {
  // Program leaf — link to its dashboard.
  if (child.programSlug) {
    // Kartu program cukup nama + tautan. Angka peserta/halaqah/hadir sudah ada
    // di dashboard program dan di ringkasan atas halaman ini; di tiap kartu
    // angka itu hanya jadi deretan yang tak dibaca.
    return (
      <CardFrame
        href={`/${child.programSlug}/dashboard`}
        kind={kind}
        label={child.label}
        icon={
          <ArrowUpRight className="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-blue-500" />
        }
      />
    );
  }

  // Feature leaf — a module that is not a program dashboard (e.g. /acara). No
  // program stats to show, so the hint fills the metric row's slot.
  if (child.href) {
    return (
      <CardFrame
        href={child.href}
        kind={kind}
        label={child.label}
        icon={
          <ArrowUpRight className="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-blue-500" />
        }
      >
        {child.hint && (
          <p className="mt-auto border-t border-border px-4 py-3 text-xs leading-snug text-neutral-500">
            {child.hint}
          </p>
        )}
      </CardFrame>
    );
  }

  // Grouping unit — drill deeper. Tanpa pratinjau turunan: deret chip membuat
  // kartu unit dan kartu program tampak beda bentuk, padahal sebarisan, dan
  // sebagian unit memang tidak punya turunan untuk ditampilkan (permintaan
  // pemilik 22 Sep 2026: "disamain, mending kosongin semua aja").
  return (
    <CardFrame
      href={`/overview/${[...basePath, child.id].join("/")}`}
      kind={kind}
      label={child.label}
      icon={
        <ChevronRight className="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-blue-500" />
      }
    />
  );
}
