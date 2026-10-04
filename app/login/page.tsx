import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";
// Static imports, not "/brand/*.png" strings: the auth middleware matches every
// path except /_next/static, so a logged-out visitor asking for /brand/… is
// redirected to /login and the logo breaks. Imported images are emitted under
// /_next/static/media, which the matcher already lets through.
import lockupGold from "@/public/brand/lockup-gold.png";
import markGold from "@/public/brand/mark-gold.png";

export const metadata = {
  title: { absolute: "Masuk — Dashboard Administrasi Pendidikan" },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-surface-app text-foreground lg:flex-row">
      {/*
        Brand panel. Phones: a compact forest band — lockup on the left, label +
        tagline beside it (grid). lg+: the full-height 540px logo panel from the
        design — label top, lockup centred, tagline bottom (flex column; the grid
        placement classes are inert there).
      */}
      <header className="relative grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 overflow-hidden bg-brand-forest px-4 py-5 sm:px-6 lg:flex lg:w-[540px] lg:flex-none lg:flex-col lg:items-stretch lg:justify-between lg:gap-0 lg:p-12">
        <Image
          src={markGold}
          alt=""
          aria-hidden
          unoptimized
          className="pointer-events-none absolute -right-20 -bottom-16 h-auto w-72 max-w-none opacity-[0.08] select-none lg:right-auto lg:-bottom-[150px] lg:-left-[120px] lg:w-[720px]"
        />
        <span className="relative col-start-2 row-start-1 self-end text-11 font-bold uppercase tracking-[0.12em] text-brand-gold lg:self-auto">
          Dashboard Administrasi
        </span>
        <Image
          src={lockupGold}
          alt="Tilawa Labs"
          unoptimized
          preload
          className="relative col-start-1 row-span-2 row-start-1 h-auto w-20 lg:w-[300px] lg:self-center"
        />
        <p className="relative col-start-2 row-start-2 self-start text-12 leading-relaxed text-white/75 lg:max-w-[360px] lg:self-auto">
          Administrasi kehadiran halaqah &amp; tilawah — Pendidikan.
        </p>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:px-6 lg:py-6">
        <div className="flex w-full max-w-[360px] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-20 font-extrabold leading-tight tracking-[-0.02em] sm:text-2xl">
              Dashboard Administrasi Pendidikan
            </h1>
            <p className="text-14 text-ink-muted">Masuk pakai akun yang sudah dibuatkan.</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
