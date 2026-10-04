"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudDownload } from "lucide-react";
import { isian, tombolGaris } from "@/components/lintas/brand";
import { tarikDariNawa, tarikSemuaDariNawa, type TarikNawaHasil, type TarikSemuaNawaHasil } from "./actions";

/**
 * Tarik semua program NAWA sekaligus (/api/export/semua). Program baru muncul
 * sendiri sebagai acara `nawa-<slug>`; tarikan satu program ada di bawahnya.
 */
export function TarikSemuaNawa({ slugAwal }: { slugAwal: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hasil, setHasil] = useState<TarikSemuaNawaHasil | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setHasil(null);
              const h = await tarikSemuaDariNawa();
              setHasil(h);
              if (h.ok) router.refresh();
            })
          }
          className={`${tombolGaris} self-start disabled:opacity-50`}
        >
          <CloudDownload className="size-4" /> {pending ? "Menarik semua program…" : "Tarik semua program NAWA"}
        </button>
        {hasil && !hasil.ok && (
          <p className="text-12 text-red-600" role="alert">
            {hasil.error}
          </p>
        )}
        {hasil?.ok && (
          <div className="text-12" role="status">
            <p className="text-emerald-700 dark:text-emerald-400">
              {hasil.program.length === 0 ? "NAWA tidak punya program aktif atau selesai." : `${hasil.program.filter((p) => p.ok).length} dari ${hasil.program.length} program ditarik.`}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {hasil.program.map((p) => (
                <li key={p.nawaSlug} className="min-w-0 break-words">
                  {p.ok ? (
                    <>
                      <Link href={`/acara/${p.acaraSlug}/pendaftaran`} className="font-medium underline">
                        {p.nama}
                      </Link>
                      {p.acaraBaru && <span className="ml-1 text-ink-muted">(baru)</span>}: {p.pendaftaran} pendaftar, {p.hadir} hadir, {p.orangBaru} orang baru
                    </>
                  ) : (
                    <span className="text-red-600">
                      {p.nama}: {p.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <details className="text-12">
        <summary className="cursor-pointer text-ink-muted">Satu program saja (lewat slug)</summary>
        <div className="mt-2">
          <TarikNawa slugAwal={slugAwal} />
        </div>
      </details>
    </div>
  );
}

/**
 * Tombol tarik satu program NAWA. `tetap` = slug NAWA sudah diketahui (halaman
 * acara nawa-*), jadi tanpa isian; selain itu isian slug dengan nilai awal dari NAWA_ACARA_SLUG.
 */
export function TarikNawa({ slugAwal, tetap = false }: { slugAwal: string; tetap?: boolean }) {
  const router = useRouter();
  const [slug, setSlug] = useState(slugAwal);
  const [pending, start] = useTransition();
  const [hasil, setHasil] = useState<TarikNawaHasil | null>(null);

  const tarik = () =>
    start(async () => {
      setHasil(null);
      const h = await tarikDariNawa(slug);
      setHasil(h);
      if (h.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          tarik();
        }}
      >
        {!tetap && (
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-12 font-medium text-neutral-700 dark:text-neutral-300">
            Slug program NAWA
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.trim().toLowerCase())}
              placeholder="open-lecture-4"
              pattern="[a-z0-9-]{1,60}"
              required
              className={isian}
            />
          </label>
        )}
        <button type="submit" disabled={pending || !slug} className={`${tombolGaris} disabled:opacity-50`}>
          <CloudDownload className="size-4" /> {pending ? "Menarik…" : tetap ? "Tarik ulang dari NAWA" : "Tarik dari NAWA"}
        </button>
      </form>
      {hasil &&
        (hasil.ok ? (
          <p className="text-12 text-emerald-700 dark:text-emerald-400" role="status">
            Selesai: {hasil.pendaftaran} pendaftar ({hasil.orangBaru} orang baru, {hasil.cocok} cocok ke orang yang sudah ada), {hasil.hadir} hadir
            {hasil.dicabut > 0 && `, ${hasil.dicabut} baris dicabut karena hilang dari NAWA`}
            {hasil.dilewati > 0 && `, ${hasil.dilewati} peserta nonaktif dilewati`}.{" "}
            {!tetap && (
              <Link href={`/acara/${hasil.acaraSlug}/pendaftaran`} className="underline">
                Buka acaranya
              </Link>
            )}
          </p>
        ) : (
          <p className="text-12 text-red-600" role="alert">
            {hasil.error}
          </p>
        ))}
    </div>
  );
}
