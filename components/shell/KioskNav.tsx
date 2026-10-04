"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, type LucideIcon } from "lucide-react";
import { LAYAR_NAV, SECTION_ICON, navLabel } from "./sections";

/**
 * Jalan pulang untuk layar dinding (/tv, /arahan, /countdown).
 *
 * Halaman-halaman itu tidak memakai AppShell — memang tidak boleh: rail gelap
 * dan topbar akan merusak papan 4K yang diskalakan penuh, dan /tv bahkan dibuka
 * tanpa sesi sama sekali. Tapi tanpa apa pun, satu-satunya cara keluar adalah
 * mengetik URL, dan itu yang membuat orang menutup tab lalu login ulang.
 *
 * Jadi: satu pil kecil di pojok kiri atas yang praktis tidak terlihat di TV
 * (opacity 6%, tanpa label) dan baru menyala penuh saat disentuh kursor atau
 * di-Tab. Di perangkat tanpa hover — HP, tablet — pil-nya ditampilkan cukup
 * jelas untuk ditekan, karena di sana tidak ada kursor yang bisa memanggilnya.
 *
 * `prefers-reduced-motion` tidak perlu diurus khusus: transisinya hanya opacity.
 */
export function KioskNav({
  /** Tujuan "pulang". Default ke root, yang meneruskan ke program pengguna
   *  (atau /login kalau layarnya memang sedang anonim di dinding). */
  home = "/",
  className = "",
  current,
}: {
  home?: string;
  className?: string;
  /** Href of this screen when the path alone is ambiguous (/arahan vs
   *  /arahan?mode=rotasi). Defaults to the pathname. */
  current?: string;
}) {
  const pathname = usePathname() ?? "";
  const here = current ?? pathname;
  const siblings = LAYAR_NAV.filter((item) => item.href !== here);

  return (
    <nav
      aria-label="Navigasi layar"
      className={[
        "group fixed left-3 top-3 z-50 flex items-center gap-0.5 rounded-full",
        "bg-rail/85 p-1 text-rail-fg ring-1 ring-brand-gold/25 backdrop-blur-sm",
        "opacity-[0.06] transition-opacity duration-200",
        "hover:opacity-100 focus-within:opacity-100",
        "[@media(hover:none)]:opacity-70",
        "print:hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <KioskLink href={home} label="Dashboard" Icon={House} />
      <span aria-hidden className="mx-0.5 h-5 w-px flex-none bg-rail-border" />
      {siblings.map((item) => (
        <KioskLink
          key={item.href}
          href={item.href}
          label={navLabel(item)}
          Icon={SECTION_ICON[item.key]}
        />
      ))}
    </nav>
  );
}

function KioskLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] leading-none text-rail-fg transition-colors hover:bg-rail-active hover:text-rail-fg-active focus-visible:bg-rail-active focus-visible:text-rail-fg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/80"
    >
      <Icon className="size-[17px] flex-none" strokeWidth={1.8} />
      {/* Label baru muncul bersama pil-nya — di TV yang terlihat cuma ikon samar. */}
      <span className="hidden whitespace-nowrap group-hover:inline group-focus-within:inline">
        {label}
      </span>
    </Link>
  );
}
