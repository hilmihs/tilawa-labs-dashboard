"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AR_IZIN } from "@/lib/kantor/teks-ar";
import { batalIzin } from "../actions";

export function TombolBatal({ token, id }: { token: string; id: string }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);
  return (
    <button
      type="button"
      disabled={sibuk}
      onClick={async () => {
        setSibuk(true);
        try {
          await batalIzin(token, id);
          router.refresh();
        } finally {
          setSibuk(false);
        }
      }}
      className="h-12 w-full text-[15px] text-[#7A4A1E] disabled:opacity-60"
    >
      {AR_IZIN.batalkan}
    </button>
  );
}
