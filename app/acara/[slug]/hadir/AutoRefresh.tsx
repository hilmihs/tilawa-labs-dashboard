"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Segarkan halaman force-dynamic tiap `detik` — angka hari-H harus bergerak tanpa reload manual. */
export function AutoRefresh({ detik }: { detik: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, detik * 1000);
    return () => clearInterval(t);
  }, [router, detik]);
  return null;
}
